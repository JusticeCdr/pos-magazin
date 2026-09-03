import { useState, useEffect, useCallback, useRef, useMemo, memo } from 'react';
import { Search, Plus, Trash2, Edit, AlertTriangle, AlertCircle, CheckCircle2, XCircle, MinusCircle, Printer, X, Package, UtensilsCrossed, Ban, Play, Sparkles } from 'lucide-react';
import { useApp } from './context/AppContext';
import { formatCurrency, formatThousands } from './utils';
import { useBarcodeScanner } from './hooks/useBarcodeScanner';
import JsBarcode from 'jsbarcode';
import { logoBase64 } from './logoBase64';

const formatPriceInput = (val) => {
  if (val === null || val === undefined) return '';
  let str = String(val).replace(/\D/g, '');
  if (!str) return '';
  return str.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
};

const EMPTY_FORM = {
  name: '',
  barcode: '',
  buy_price: '',
  sell_price: '',
  stock: '',
  unit: 'dona',
  discount: '',
  category: 'Boshqa',
  type: 'ready_dish',
  printer_destination: 'none',
  note: '',
};

export default memo(function Warehouse({ isActive }) {
  const { 
    t, lang, globalProducts, fetchGlobalProducts, productsLoaded, currentUser, storeName, shopLogo, businessType, usdRate, setUsdRate
  } = useApp();
  const [formData, setFormData] = useState(EMPTY_FORM);
  const [buyPriceCurrency, setBuyPriceCurrency] = useState('UZS');
  const [editingId, setEditingId] = useState(null);
  const [search, setSearch] = useState('');
  const [visibleCount, setVisibleCount] = useState(50);
  const [status, setStatus] = useState(null); // { type: 'error'|'success', message }
  const [loading, setLoading] = useState(false);
  const [deletingId, setDeletingId] = useState(null); // tracks which row is being deleted
  const [productToDelete, setProductToDelete] = useState(null); // For custom delete modal
  const [existingProductId, setExistingProductId] = useState(null);
  const stockInputRef = useRef(null);

  // ── Cafe/Restaurant 2-Warehouse Tabs & Dish Mode ──
  const [restaurantTab, setRestaurantTab] = useState('raw_materials'); // 'raw_materials' (1-Ombor) | 'dishes' (2-Ombor) | 'stop_list'
  const [dishMode, setDishMode] = useState('recipe'); // 'recipe' (Retseptli) | 'piece' (Donabay)

  const handleCurrencySwitch = (newCurrency) => {
    if (newCurrency === buyPriceCurrency) return;
    setBuyPriceCurrency(newCurrency);
    const currentPriceStr = String(formData.buy_price).replace(/\s/g, '');
    if (!currentPriceStr) return;

    if (newCurrency === 'USD') {
      // UZS to USD
      const uzsVal = parseFloat(currentPriceStr) || 0;
      const usdVal = uzsVal > 0 ? (uzsVal / usdRate).toFixed(2) : '';
      setFormData(prev => ({ ...prev, buy_price: String(usdVal) }));
    } else {
      // USD to UZS
      const usdVal = parseFloat(currentPriceStr.replace(/,/g, '.')) || 0;
      const uzsVal = usdVal > 0 ? Math.round(usdVal * usdRate) : 0;
      setFormData(prev => ({ ...prev, buy_price: formatPriceInput(String(uzsVal)) }));
    }
  };

  // ── Recipe / Composition state ─────────────────────────────────────────────
  const [recipeIngredients, setRecipeIngredients] = useState([]);
  const [selectedIngId, setSelectedIngId] = useState('');
  const [ingQty, setIngQty] = useState('');

  const rawMaterials = useMemo(() => {
    return globalProducts.filter(p => p.type === 'raw_material');
  }, [globalProducts]);

  const projectedCostPrice = useMemo(() => {
    return recipeIngredients.reduce((sum, ing) => {
      const rawProd = rawMaterials.find(p => p.id === ing.ingredient_product_id);
      const buyPrice = rawProd ? (parseFloat(rawProd.buy_price) || 0) : 0;
      return sum + (buyPrice * (parseFloat(ing.quantity) || 0));
    }, 0);
  }, [recipeIngredients, rawMaterials]);

  const handleAddIngredient = () => {
    if (!selectedIngId || !ingQty) return;
    const qty = parseFloat(ingQty);
    if (isNaN(qty) || qty <= 0) return;

    const ingProduct = rawMaterials.find(p => p.id === parseInt(selectedIngId));
    if (!ingProduct) return;

    setRecipeIngredients(prev => {
      const exists = prev.find(item => item.ingredient_product_id === ingProduct.id);
      if (exists) {
        return prev.map(item => item.ingredient_product_id === ingProduct.id
          ? { ...item, quantity: qty }
          : item
        );
      }
      return [...prev, {
        ingredient_product_id: ingProduct.id,
        quantity: qty,
        name: ingProduct.name,
        unit: ingProduct.unit || 'dona'
      }];
    });

    setSelectedIngId('');
    setIngQty('');
  };

  const handleRemoveIngredient = (id) => {
    setRecipeIngredients(prev => prev.filter(item => item.ingredient_product_id !== id));
  };

  // ── Toast Alert State & Ref ───────────────────────────────────────────────
  const [toast, setToast] = useState(null); // { message, type }
  const toastTimeoutRef = useRef(null);

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    toastTimeoutRef.current = setTimeout(() => {
      setToast(null);
    }, 5000);
  };

  useEffect(() => {
    return () => {
      if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    };
  }, []);

  // ── Label/Sticker Printer State ──────────────────────────────────────────
  const [printLabelTarget, setPrintLabelTarget] = useState(null);
  const [labelQty, setLabelQty] = useState('1');
  const [printLoading, setPrintLoading] = useState(false);
  const barcodeRef = useRef(null);

  // ── Price-change confirmation state ────────────────────────────────────────
  const [pendingStockData, setPendingStockData] = useState(null); // { id, productData, newSellPrice }

  // ── Write-off modal state ──────────────────────────────────────────────────
  const [writeOffTarget, setWriteOffTarget] = useState(null); // product object
  const [writeOffQty, setWriteOffQty] = useState('');
  const [writeOffReason, setWriteOffReason] = useState('Muddati o\'tgan');
  const [writeOffLoading, setWriteOffLoading] = useState(false);
  const [writeOffError, setWriteOffError] = useState(null);

  // ── No local fetch products needed, we use fetchGlobalProducts when adding/editing


  const handleInputChange = (e) => {
    const { name, value } = e.target;
    if (name === 'buy_price' && buyPriceCurrency === 'USD') {
      // Keep only digits and first dot or comma
      let clean = value.replace(/[^0-9.,]/g, '');
      // Replace commas with dots
      clean = clean.replace(/,/g, '.');
      // Ensure only one dot exists
      const parts = clean.split('.');
      if (parts.length > 2) {
        clean = parts[0] + '.' + parts.slice(1).join('');
      }
      // If starts with 0 and followed by a digit, place dot after 0 (e.g. 05 -> 0.5)
      if (clean.startsWith('0') && clean.length > 1 && clean[1] !== '.') {
        clean = '0.' + clean.slice(1);
      }
      setFormData(prev => ({ ...prev, buy_price: clean }));
    } else if (name === 'buy_price' || name === 'sell_price') {
      const input = e.target;
      const rawValue = value;
      const selectionStart = input.selectionStart;

      // Count non-spaces before selectionStart
      let nonSpacesBefore = 0;
      for (let i = 0; i < selectionStart; i++) {
        if (rawValue[i] !== ' ') {
          nonSpacesBefore++;
        }
      }

      const formatted = formatPriceInput(rawValue);
      setFormData(prev => ({ ...prev, [name]: formatted }));

      // Restore cursor position after DOM re-render
      setTimeout(() => {
        let newCursorPos = 0;
        let nonSpacesSeen = 0;
        for (let i = 0; i < formatted.length; i++) {
          if (formatted[i] !== ' ') {
            nonSpacesSeen++;
          }
          if (nonSpacesSeen === nonSpacesBefore) {
            newCursorPos = i + 1;
            break;
          }
        }
        if (selectionStart === rawValue.length) {
          newCursorPos = formatted.length;
        }
        input.setSelectionRange(newCursorPos, newCursorPos);
      }, 0);
    } else {
      setFormData(prev => ({ ...prev, [name]: value }));
    }
  };

  useEffect(() => {
    setVisibleCount(50);
  }, [search]);

  // ── Global Barcode Scanner ────────────────────────────────────────────────
  // useCallback ensures the function reference is stable across re-renders
  // so useBarcodeScanner's effect is not re-created after every state change
  const handleBarcodeScan = useCallback((scannedBarcode) => {
    setFormData(prev => ({ ...prev, barcode: scannedBarcode }));
  }, []); // no deps — setFormData is stable

  useBarcodeScanner(handleBarcodeScan, isActive);

  const handleGenerateBarcodeClick = () => {
    // Only generate if the barcode field is empty
    if (formData.barcode && formData.barcode.trim() !== '') {
      return;
    }

    // Find all barcodes starting with '75' and having length of 8 digits
    const internalBarcodes = globalProducts
      .map(p => p.barcode)
      .filter(b => b && b.startsWith('75') && b.length === 8 && /^\d+$/.test(b));

    let maxNum = 0;
    for (const barcode of internalBarcodes) {
      const numPart = parseInt(barcode.substring(2)); // extract part after '75'
      if (!isNaN(numPart) && numPart > maxNum) {
        maxNum = numPart;
      }
    }

    const nextNum = maxNum > 0 ? maxNum + 1 : 1;
    const paddedNum = String(nextNum).padStart(6, '0');
    const newBarcode = '75' + paddedNum;

    setFormData(prev => ({ ...prev, barcode: newBarcode }));
  };

  const handlePrintLabelClick = (product) => {
    setPrintLabelTarget(product);
    setLabelQty('1');
  };

  useEffect(() => {
    if (printLabelTarget && printLabelTarget.barcode && barcodeRef.current) {
      try {
        JsBarcode(barcodeRef.current, printLabelTarget.barcode, {
          format: "CODE128",
          width: 1.5,
          height: 15,
          displayValue: true,
          fontSize: 14,
          margin: 2,
          background: "transparent"
        });
        const svg = barcodeRef.current;
        const w = svg.getAttribute("width");
        const h = svg.getAttribute("height");
        if (w && h) {
          svg.setAttribute("viewBox", `0 0 ${w} ${parseInt(h) + 6}`);
        }
      } catch (err) {
      }
    }
  }, [printLabelTarget]);

  const handlePrintLabelSubmit = async () => {
    if (!window.api || !printLabelTarget || !printLabelTarget.barcode) return;
    setPrintLoading(true);
    try {
      const printerName = localStorage.getItem('labelPrinterName');

      if (!printerName) {
        showToast("Etiketka printeri sozlanmagan! Sozlamalar bo'limidan stiker printerini tanlang.", 'error');
        setPrintLoading(false);
        return;
      }

      // Generate offscreen SVG barcode
      const tempSvg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      JsBarcode(tempSvg, printLabelTarget.barcode, {
        format: "CODE128",
        width: 1.5,
        height: 15,
        displayValue: true,
        fontSize: 14,
        margin: 2,
        background: "transparent"
      });
      const svgWidth = tempSvg.getAttribute("width");
      const svgHeight = tempSvg.getAttribute("height");
      if (svgWidth && svgHeight) {
        tempSvg.setAttribute("viewBox", `0 0 ${svgWidth} ${parseInt(svgHeight) + 6}`);
      }
      const svgHTML = tempSvg.outerHTML;
      const labelW = localStorage.getItem('label_width') || '60';
      const labelH = localStorage.getItem('label_height') || '30';

      // Compile label HTML for thermal printer
      const labelHTML = `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            @page {
              size: ${labelW}mm ${labelH}mm;
              margin: 0;
            }
            html, body {
              margin: 0 !important;
              padding: 0 !important;
              width: ${labelW}mm;
              height: ${labelH}mm;
              overflow: hidden;
              background-color: white;
              font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
              display: flex;
              justify-content: center;
              align-items: center;
            }
            #printable-label {
              width: ${labelW}mm !important;
              height: ${labelH}mm !important;
              display: flex !important;
              flex-direction: column !important;
              align-items: center !important;
              justify-content: flex-start !important;
              padding: 1.0mm 2.5mm 1.5mm 2.5mm !important;
              box-sizing: border-box !important;
              background-color: white;
              color: black;
            }
            .header-row {
              display: flex !important;
              align-items: center !important;
              width: 100% !important;
              height: 7.5mm !important;
              margin-bottom: 0.5mm !important;
              box-sizing: border-box !important;
              flex-shrink: 0 !important;
            }
            .logo-img {
              width: 7.5mm !important;
              height: 7.5mm !important;
              object-fit: contain !important;
              margin-left: 4px !important; /* Move logo to the right by 4px */
              flex-shrink: 0 !important;
            }
            #printable-label .shop-name {
              font-size: 14px !important;
              font-weight: 800 !important;
              text-transform: uppercase !important;
              text-align: left !important;
              margin: 0 0 0 2.0mm !important;
              line-height: 7.5mm !important;
              white-space: nowrap !important;
              overflow: hidden !important;
              text-overflow: ellipsis !important;
              flex: 1 !important;
              flex-shrink: 0 !important;
            }
            #printable-label .product-name {
              font-size: 11px !important;
              font-weight: 700 !important;
              line-height: 1.1 !important;
              margin: 0 0 0.5mm 0 !important;
              max-height: 6mm !important;
              overflow: hidden !important;
              text-align: center !important;
              width: 100% !important;
              word-wrap: break-word !important;
              display: -webkit-box !important;
              -webkit-line-clamp: 2 !important;
              -webkit-box-orient: vertical !important;
              flex-shrink: 0 !important;
            }
            #printable-label .product-price {
              font-size: 16px !important;
              font-weight: 900 !important;
              margin: 0 0 0.5mm 0 !important;
              text-align: center !important;
              width: 100% !important;
              line-height: 1.0 !important;
              flex-shrink: 0 !important;
            }
            .barcode-container {
              display: flex !important;
              flex-direction: column !important;
              align-items: center !important;
              justify-content: center !important;
              width: 100% !important;
              margin-top: 0.8mm !important;
              flex-shrink: 0 !important;
            }
            #printable-label svg {
              display: block !important;
              width: auto !important;
              height: 7.5mm !important;
              margin: 0 auto !important;
              flex-shrink: 0 !important;
              overflow: visible !important;
            }
          </style>
        </head>
        <body>
          <div id="printable-label">
            <div class="header-row">
              <img class="logo-img" src="${shopLogo || logoBase64}" />
              <div class="shop-name">${(storeName || '750 AVTOTUNING').toUpperCase()}</div>
            </div>
            <div class="product-name">${printLabelTarget.name}</div>
            <div class="product-price">${formatCurrency(printLabelTarget.sell_price, lang)}</div>
            <div class="barcode-container">
              ${svgHTML}
            </div>
          </div>
        </body>
        </html>
      `;

      await window.api.printLabel({
        printerName,
        qty: parseInt(labelQty) || 1,
        labelHTML,
        width: parseInt(labelW),
        height: parseInt(labelH)
      });

      setPrintLabelTarget(null);
    } catch (err) {
      showToast('Shtrix-kod chop etishda xatolik: ' + (err.message || 'Noma\'lum xato'), 'error');
    } finally {
      setPrintLoading(false);
    }
  };

  // ── Smart Add (Auto-fill on barcode match) ───────────────────────────────
  useEffect(() => {
    if (!formData.barcode) return;
    
    // Only auto-fill if we are NOT currently editing a product manually
    if (editingId) return;

    const existing = globalProducts.find(p => p.barcode === formData.barcode);
    if (existing) {
      setFormData(prev => ({
        ...prev,
        name: existing.name,
        buy_price: formatPriceInput(existing.buy_price),
        sell_price: formatPriceInput(existing.sell_price),
        unit: existing.unit,
        discount: existing.discount !== undefined ? String(existing.discount) : '',
        category: existing.category || 'Boshqa',
        type: existing.type || 'ready_dish',
        stock: '' // Clear stock so they can type the incoming quantity
      }));
      setExistingProductId(existing.id);
      setBuyPriceCurrency('UZS');

      if (existing.type === 'ready_dish') {
        window.api.getProductRecipe(existing.id).then(res => {
          if (res && res.success) {
            setRecipeIngredients(res.data);
          } else {
            setRecipeIngredients([]);
          }
        });
      } else {
        setRecipeIngredients([]);
      }
      
      // Auto-focus the quantity input
      setTimeout(() => {
        if (stockInputRef.current) stockInputRef.current.focus();
      }, 50);
    } else {
      // If it doesn't exist, just clear the existing product tracking
      if (existingProductId) {
        setExistingProductId(null);
        setRecipeIngredients([]);
      }
    }
  }, [formData.barcode, globalProducts, editingId]);

  const handleAddProduct = async (e) => {
    e.preventDefault();
    if (!window.api) {
      setStatus({ type: 'error', message: 'Electron API недоступен (режим браузера).' });
      return;
    }

    setLoading(true);
    setStatus(null);

    try {
      let formattedName = '';
      const trimmedName = formData.name.trim();
      if (trimmedName.length > 0) {
        formattedName = trimmedName.charAt(0).toUpperCase() + trimmedName.slice(1).toLowerCase();
      }

      let finalType = formData.type || 'ready_dish';
      let isReadyWithRecipe = false;
      let finalSellPrice = parseInt(String(formData.sell_price).replace(/\D/g, '')) || 0;
      let finalStock = parseFloat(formData.stock) || 0;
      let finalCategory = formData.category || 'Boshqa';
      let finalDest = formData.printer_destination || 'none';

      if (businessType === 'restaurant') {
        if (restaurantTab === 'raw_materials') {
          finalType = 'raw_material';
          finalSellPrice = 0; // Raw materials are ingredients, not sold directly
          finalCategory = formData.category || 'Xom-ashyo';
          finalDest = 'none';
        } else {
          // 2-Ombor (Dishes / Sellable products)
          finalType = 'ready_dish';
          if (dishMode === 'recipe' && recipeIngredients.length > 0) {
            isReadyWithRecipe = true;
            finalStock = 0; // Dynamic from ingredients
          }
        }
      } else {
        isReadyWithRecipe = formData.type === 'ready_dish' && recipeIngredients.length > 0;
      }

      let rawBuyPrice = 0;
      if (businessType === 'restaurant' && isReadyWithRecipe) {
        rawBuyPrice = projectedCostPrice;
      } else if (buyPriceCurrency === 'USD') {
        rawBuyPrice = Math.round((parseFloat(String(formData.buy_price).replace(/,/g, '.')) || 0) * usdRate);
      } else {
        rawBuyPrice = parseInt(String(formData.buy_price).replace(/\D/g, '')) || 0;
      }

      // Format final note to include USD conversion info if USD mode was used
      let finalNote = formData.note ? formData.note.trim() : '';
      if (buyPriceCurrency === 'USD') {
        const usdDetail = `USD da: ${formData.buy_price}$, kurs: ${usdRate}`;
        finalNote = finalNote ? `${finalNote} (${usdDetail})` : usdDetail;
      }

      const isUsd = buyPriceCurrency === 'USD';
      const buyPriceUsd = isUsd ? (parseFloat(String(formData.buy_price).replace(/,/g, '.')) || 0) : 0;

      const productData = {
        name: formattedName,
        barcode: formData.barcode,
        buy_price: rawBuyPrice,
        sell_price: finalSellPrice,
        stock: isReadyWithRecipe ? 0 : finalStock,
        unit: formData.unit,
        discount: parseFloat(formData.discount) || 0,
        category: finalCategory,
        type: finalType,
        printer_destination: finalDest,
        userName: currentUser?.name || 'Ombor',
        note: finalNote,
        buy_price_usd: buyPriceUsd,
        usd_rate: isUsd ? usdRate : 0,
      };

      let result;
      if (editingId) {
        result = await window.api.updateProduct({ id: editingId, data: productData });
        if (result && result.success) {
          const recipeToSave = isReadyWithRecipe ? recipeIngredients : [];
          await window.api.saveProductRecipe(editingId, recipeToSave);
        }
      } else if (existingProductId) {
        result = await window.api.addStockToProduct({ id: existingProductId, data: productData });
        if (result && result.success && result.priceChanged) {
          setPendingStockData(null); // just completed — no pending needed
          
          if (result.sellPriceChanged && result.oldSellPrice > 0) {
            setStatus({ 
              type: 'warning', 
              message: "Diqqat: Narx o'zgardi!",
              details: `Ushbu tovarning sotuv narxi ${formatCurrency(result.oldSellPrice, lang)} so'mdan ${formatCurrency(result.newSellPrice, lang)} so'mga o'zgardi. Do'kondagi qog'oz narxnomalarni almashtirishni unutmang!`
            });
            setTimeout(() => setStatus(null), 7000); // Wait 7 seconds
          } else {
            showToast("Mahsulot muvaffaqiyatli qo'shildi!");
            setStatus({ type: 'success', message: `"${formattedName}" kiritildi va narxi yangilandi!` });
            setTimeout(() => setStatus(null), 3000);
          }

          handleCancelEdit();
          fetchGlobalProducts();
          setLoading(false);
          return;
        }
      } else {
        result = await window.api.addProduct(productData);
        if (result && result.success) {
          const recipeToSave = isReadyWithRecipe ? recipeIngredients : [];
          await window.api.saveProductRecipe(result.id, recipeToSave);
        }
      }

      if (result && result.success) {
        if (!editingId && !existingProductId) {
          showToast("Mahsulot muvaffaqiyatli qo'shildi!");
        } else {
          showToast(editingId ? "Mahsulot muvaffaqiyatli tahrirlandi!" : "Mahsulot muvaffaqiyatli yangilandi!");
        }
        setStatus({ type: 'success', message: `"${formattedName}" ${editingId ? 'tahrirlandi' : 'qo\'shildi'}!` });
        handleCancelEdit();
        fetchGlobalProducts();
      } else {
        const msg = result?.error || 'Noma\'lum xatolik';
        setStatus({ type: 'error', message: msg });
      }
    } catch (err) {
      setStatus({ type: 'error', message: 'IPC xatosi: ' + err.message });
    } finally {
      setLoading(false);
    }
  };

  const handleEditClick = (product) => {
    setEditingId(product.id);
    const isUsd = product.buy_price_usd > 0;
    setBuyPriceCurrency(isUsd ? 'USD' : 'UZS');

    if (businessType === 'restaurant') {
      if (product.type === 'raw_material') {
        setRestaurantTab('raw_materials');
      } else {
        setRestaurantTab('dishes');
      }
    }

    setFormData({
      name: product.name,
      barcode: product.barcode || '',
      buy_price: isUsd ? String(product.buy_price_usd) : formatPriceInput(product.buy_price),
      sell_price: formatPriceInput(product.sell_price),
      stock: '', // Clear stock so they can type the incoming quantity to add
      unit: product.unit || 'dona',
      discount: product.discount !== undefined ? String(product.discount) : '',
      category: product.category || (product.type === 'raw_material' ? 'Xom-ashyo' : 'Boshqa'),
      type: product.type || 'ready_dish',
      printer_destination: product.printer_destination || 'none',
      note: '',
    });

    if (product.type === 'ready_dish') {
      window.api.getProductRecipe(product.id).then(res => {
        if (res && res.success && res.data && res.data.length > 0) {
          setRecipeIngredients(res.data);
          setDishMode('recipe');
        } else {
          setRecipeIngredients([]);
          setDishMode('piece');
        }
      });
    } else {
      setRecipeIngredients([]);
    }

    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setExistingProductId(null);
    setBuyPriceCurrency('UZS');
    setFormData(EMPTY_FORM);
    setRecipeIngredients([]);
    setSelectedIngId('');
    setIngQty('');
  };

  const confirmDelete = (id, name) => {
    if (deletingId !== null) return;
    setProductToDelete({ id, name });
  };

  const handleDeleteProduct = async () => {
    if (!window.api || !productToDelete) return;

    const targetId = productToDelete.id;
    setDeletingId(targetId);
    setProductToDelete(null); // close modal immediately

    // If we're editing this product, cancel the edit to prevent stale form state
    if (editingId === targetId) handleCancelEdit();

    try {
      const result = await window.api.deleteProduct(targetId, currentUser?.name || '');
      if (result && result.success) {
        await fetchGlobalProducts();
        // Clear any stale status banner
        setStatus(null);
      } else {
        setStatus({ type: 'error', message: 'O\'chirishda xatolik: ' + (result?.error || '') });
      }
    } catch (err) {
      setStatus({ type: 'error', message: 'IPC xatosi: ' + err.message });
    } finally {
      // Always unblock the UI, regardless of success or failure
      setDeletingId(null);
    }
  };

  // ── Write-off handler ────────────────────────────────────────────────────────
  const handleWriteOff = async () => {
    if (!window.api || !writeOffTarget) return;
    const qty = parseFloat(writeOffQty);
    if (!qty || qty <= 0) { setWriteOffError('Miqdorni kiriting!'); return; }
    if (qty > writeOffTarget.stock) {
      setWriteOffError(`Omborda faqat ${writeOffTarget.stock} ${writeOffTarget.unit || 'dona'} bor!`);
      return;
    }
    setWriteOffLoading(true);
    setWriteOffError(null);
    try {
      const result = await window.api.writeOffProduct({
        productId: writeOffTarget.id,
        quantity: qty,
        reason: writeOffReason,
        userName: currentUser?.name || 'Ombor',
      });
      if (result && result.success) {
        setWriteOffTarget(null);
        setWriteOffQty('');
        setWriteOffReason('Muddati o\'tgan');
        setStatus({ type: 'success', message: `"${result.productName}" — ${qty} ${writeOffTarget.unit || 'dona'} hisobdan chiqarildi.` });
        fetchGlobalProducts();
      } else {
        setWriteOffError(result?.error || 'Xatolik yuz berdi');
      }
    } catch (err) {
      setWriteOffError('IPC xatosi: ' + err.message);
    } finally {
      setWriteOffLoading(false);
    }
  };

  const handleToggleStop = async (product, e) => {
    if (e) e.stopPropagation();
    if (!window.api) return;
    const newStatus = !product.is_stopped;
    try {
      const res = await window.api.toggleProductStop(product.id, newStatus);
      if (res && res.success) {
        showToast(
          newStatus ? `"${product.name}" stop-listga kiritildi!` : `"${product.name}" stop-listdan chiqarildi!`,
          newStatus ? 'error' : 'success'
        );
        fetchGlobalProducts();
      } else {
        showToast("Xatolik: " + (res?.error || "Stop holatini o'zgartirib bo'lmadi"), 'error');
      }
    } catch (err) {
      showToast("IPC xatosi: " + err.message, 'error');
    }
  };

  // ── Tab Counts ──
  const rawMaterialsCount = useMemo(() => {
    return (globalProducts || []).filter(p => p.type === 'raw_material').length;
  }, [globalProducts]);

  const dishesCount = useMemo(() => {
    return (globalProducts || []).filter(p => p.type !== 'raw_material').length;
  }, [globalProducts]);

  const stoppedCount = useMemo(() => {
    return (globalProducts || []).filter(p => p.is_stopped === 1 || !!p.stop_reason).length;
  }, [globalProducts]);

  const filteredProducts = useMemo(() => {
    let list = globalProducts || [];

    if (businessType === 'restaurant') {
      if (restaurantTab === 'raw_materials') {
        list = list.filter(p => p.type === 'raw_material');
      } else if (restaurantTab === 'dishes') {
        list = list.filter(p => p.type !== 'raw_material');
      } else if (restaurantTab === 'stop_list') {
        list = list.filter(p => p.is_stopped === 1 || !!p.stop_reason);
      }
    }

    if (!search.trim()) return list;
    const s = search.toLowerCase();
    return list.filter(p => 
      p.name.toLowerCase().includes(s) || 
      (p.barcode && p.barcode.includes(s)) ||
      (p.category && p.category.toLowerCase().includes(s))
    );
  }, [globalProducts, search, businessType, restaurantTab]);

  // Shared input class with Dark Mode support
  const inputCls =
    'w-full border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100';

  return (
    <div className="h-full flex flex-col gap-6 transition-colors overflow-y-auto pr-2 custom-scrollbar">
      {/* Floating Toast Alert */}
      {toast && (
        <div className="fixed top-6 right-6 z-[100] bg-emerald-600 dark:bg-emerald-500 text-white font-bold px-6 py-4 rounded-xl shadow-2xl flex items-center gap-3 animate-bounce border border-emerald-500 dark:border-emerald-400">
          <CheckCircle2 size={20} className="shrink-0" />
          <span>{toast.message}</span>
          <button onClick={() => setToast(null)} className="ml-2 hover:text-emerald-200 transition-colors">
            <X size={16} />
          </button>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {productToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-xl max-w-sm w-full mx-4 border border-gray-200 dark:border-gray-700">
            <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2">Tasdiqlash</h3>
            <p className="text-gray-600 dark:text-gray-300 mb-6">
              Haqiqatan ham "{productToDelete.name}" ni o'chirmoqchimisiz? Bu amalni ortga qaytarib bo'lmaydi.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setProductToDelete(null)}
                className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 rounded-md transition-colors"
              >
                Bekor qilish
              </button>
              <button
                onClick={handleDeleteProduct}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-md transition-colors shadow-sm"
              >
                O'chirish
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Write-off Modal ── */}
      {writeOffTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-2xl max-w-md w-full mx-4 border border-gray-200 dark:border-gray-700">
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2">
                <MinusCircle size={20} className="text-orange-500" />
                <h3 className="text-lg font-bold text-gray-900 dark:text-white">Hisobdan chiqarish</h3>
              </div>
              <button onClick={() => { setWriteOffTarget(null); setWriteOffError(null); setWriteOffQty(''); }}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors">
                <XCircle size={20} />
              </button>
            </div>

            <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Mahsulot:</p>
            <p className="font-semibold text-gray-900 dark:text-gray-100 mb-4">
              {writeOffTarget.name}
              <span className="ml-2 text-xs font-normal text-gray-400">
                (Omborda: {writeOffTarget.stock} {writeOffTarget.unit || 'dona'})
              </span>
            </p>

            {writeOffError && (
              <div className="mb-4 flex items-center gap-2 p-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700 rounded-lg text-sm text-red-700 dark:text-red-400">
                <AlertCircle size={15} className="shrink-0" />
                {writeOffError}
              </div>
            )}

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-1.5">Miqdor *</label>
                <input
                  type="number" min="0.001" step="0.001"
                  value={writeOffQty}
                  onChange={e => setWriteOffQty(e.target.value)}
                  placeholder={`0 (max ${writeOffTarget.stock})`}
                  className="w-full border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-orange-400"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-1.5">Sabab *</label>
                <select
                  value={writeOffReason}
                  onChange={e => setWriteOffReason(e.target.value)}
                  className="w-full border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-orange-400"
                >
                  <option value="Muddati o'tgan">Muddati o'tgan (Истек срок годности)</option>
                  <option value="Sindi">Sindi (Сломан/Разбит)</option>
                  <option value="Boshqa">Boshqa (Другое)</option>
                </select>
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => { setWriteOffTarget(null); setWriteOffError(null); setWriteOffQty(''); }}
                className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 rounded-md transition-colors"
              >
                Bekor qilish
              </button>
              <button
                onClick={handleWriteOff}
                disabled={writeOffLoading}
                className="px-5 py-2 text-sm font-bold text-white bg-orange-500 hover:bg-orange-600 disabled:opacity-60 rounded-md transition-colors shadow-sm flex items-center gap-2"
              >
                {writeOffLoading
                  ? <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  : <MinusCircle size={15} />}
                Hisobdan chiqarish
              </button>
            </div>
          </div>
        </div>
      )}
      {/* ── Sticker Print Modal ── */}
      {printLabelTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-2xl max-w-sm w-full mx-4 border border-gray-200 dark:border-gray-700">
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2">
                <Printer size={20} className="text-emerald-500" />
                <h3 className="text-lg font-bold text-gray-900 dark:text-white">
                  {t('printLabelTitle') || 'Stiker chop etish'}
                </h3>
              </div>
              <button 
                onClick={() => setPrintLabelTarget(null)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            <div className="space-y-4">
              {/* Product Info */}
              <div className="p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                <p className="text-xs text-gray-400 dark:text-gray-500 font-semibold uppercase">Tovar</p>
                <p className="text-sm font-bold text-gray-800 dark:text-gray-100">{printLabelTarget.name}</p>
                <p className="text-xs text-gray-500 mt-0.5">Shtrix-kod: {printLabelTarget.barcode || 'Mavjud emas'}</p>
              </div>

              {/* Quantity input */}
              <div>
                <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-1.5">
                  {t('labelQty') || 'Stikerlar soni (nusxa)'}
                </label>
                <input
                  type="number"
                  min="1"
                  value={labelQty}
                  onChange={(e) => setLabelQty(e.target.value)}
                  className="w-full border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              {/* Preview */}
              <div>
                <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-1.5">
                  {t('labelPreview') || 'Stiker ko\'rinishi (60x30mm)'}
                </label>
                <div className="border border-dashed border-gray-300 dark:border-gray-600 p-4 rounded-xl flex items-center justify-center bg-gray-50 dark:bg-gray-900">
                  <div 
                    id="sticker-preview-card"
                    className="w-[240px] h-[120px] bg-white text-black py-[4px] px-[10px] border border-gray-200 shadow-sm flex flex-col justify-start items-center rounded overflow-hidden select-none font-sans"
                  >
                    <div className="w-full h-[30px] flex items-center mb-[2px] box-border shrink-0">
                      <img src={shopLogo || logoBase64} className="w-[30px] h-[30px] object-contain ml-[4px] shrink-0" />
                      <div className="text-[14px] font-extrabold uppercase text-left ml-[10px] truncate flex-1 text-black leading-[30px] shrink-0">
                        {(storeName || '750 AVTOTUNING').toUpperCase()}
                      </div>
                    </div>
                    <div className="text-[11px] font-bold text-center w-full break-words line-clamp-2 leading-tight px-0.5 mb-[2px] text-black shrink-0 max-h-[24px]">
                      {printLabelTarget.name}
                    </div>
                    <div className="w-full h-[1px] bg-black mb-[2px] shrink-0"></div>
                    <div className="text-[16px] font-black text-center w-full truncate tracking-wide leading-none mb-[2px] text-black shrink-0">
                      {formatCurrency(printLabelTarget.sell_price, lang)}
                    </div>
                    <div className="flex flex-col items-center justify-center mt-[3px] w-full shrink-0">
                      {printLabelTarget.barcode ? (
                        <>
                          <svg ref={barcodeRef} style={{ width: 'auto', height: '30px' }} className="max-w-full shrink-0 overflow-visible mx-auto"></svg>
                        </>
                      ) : (
                        <div className="text-[10px] text-red-500 font-bold uppercase my-1 shrink-0">
                          Shtrix-kod yo'q
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-2 mt-6">
              <button
                type="button"
                onClick={() => setPrintLabelTarget(null)}
                className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 rounded-md transition-colors"
              >
                Bekor qilish
              </button>
              <button
                type="button"
                onClick={handlePrintLabelSubmit}
                disabled={!printLabelTarget.barcode || printLoading}
                className="px-5 py-2 text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 rounded-md transition-colors shadow-sm flex items-center gap-2 cursor-pointer"
              >
                {printLoading
                  ? <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  : <Printer size={15} />}
                {t('printBtn') || 'Chop etish'}
              </button>
            </div>
          </div>
        </div>
      )}


      {/* Header & Cafe 2-Warehouse Tabs */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-800 dark:text-white">{t('warehouseTitle')}</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{t('warehouseSubtitle')}</p>
        </div>

        {businessType === 'restaurant' && (
          <div className="flex flex-wrap items-center gap-2 p-1.5 bg-gray-100 dark:bg-gray-800/90 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-inner">
            <button
              type="button"
              onClick={() => { setRestaurantTab('raw_materials'); handleCancelEdit(); }}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-xl font-bold text-xs transition-all cursor-pointer ${
                restaurantTab === 'raw_materials'
                  ? 'bg-amber-600 text-white shadow-md shadow-amber-600/30'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-white/60 dark:hover:bg-gray-700/60'
              }`}
            >
              <Package size={15} />
              <span>1-Ombor: Xom-ashyo (Ingrediyentlar)</span>
              <span className={`px-2 py-0.5 rounded-full text-[10px] ${
                restaurantTab === 'raw_materials' ? 'bg-white/20 text-white' : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
              }`}>
                {rawMaterialsCount}
              </span>
            </button>

            <button
              type="button"
              onClick={() => { setRestaurantTab('dishes'); handleCancelEdit(); }}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-xl font-bold text-xs transition-all cursor-pointer ${
                restaurantTab === 'dishes'
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-white/60 dark:hover:bg-gray-700/60'
              }`}
            >
              <UtensilsCrossed size={15} />
              <span>2-Ombor: Sotiladigan Taomlar & Tovarlar</span>
              <span className={`px-2 py-0.5 rounded-full text-[10px] ${
                restaurantTab === 'dishes' ? 'bg-white/20 text-white' : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
              }`}>
                {dishesCount}
              </span>
            </button>

            <button
              type="button"
              onClick={() => { setRestaurantTab('stop_list'); handleCancelEdit(); }}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-xl font-bold text-xs transition-all cursor-pointer ${
                restaurantTab === 'stop_list'
                  ? 'bg-red-600 text-white shadow-md shadow-red-600/30'
                  : 'text-gray-600 dark:text-gray-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-white/60 dark:hover:bg-gray-700/60'
              }`}
            >
              <Ban size={15} />
              <span>Stop-List</span>
              {stoppedCount > 0 && (
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                  restaurantTab === 'stop_list' ? 'bg-white text-red-700' : 'bg-red-100 text-red-700 dark:bg-red-900/60 dark:text-red-300 animate-pulse'
                }`}>
                  {stoppedCount}
                </span>
              )}
            </button>
          </div>
        )}
      </div>

      {/* ── Add/Edit product card ── */}
      {businessType === 'restaurant' && restaurantTab === 'stop_list' ? (
        <div className="bg-red-50/70 dark:bg-red-950/20 p-5 rounded-2xl border border-red-200 dark:border-red-900/40 shadow-sm flex items-start gap-3.5">
          <div className="p-2.5 bg-red-100 dark:bg-red-900/40 rounded-xl text-red-600 dark:text-red-400 shrink-0 mt-0.5">
            <Ban size={22} />
          </div>
          <div className="flex-1">
            <h3 className="text-sm font-bold text-red-900 dark:text-red-300 mb-1 flex items-center gap-2">
              Stop-List Boshqaruvi
              <span className="text-xs px-2 py-0.5 bg-red-200 dark:bg-red-900/60 text-red-800 dark:text-red-200 rounded-full font-bold">
                {stoppedCount} ta mahsulot to'xtatilgan
              </span>
            </h3>
            <p className="text-xs text-red-700 dark:text-red-400 leading-relaxed">
              Stop-listga kiritilgan mahsulotlarni <b>kassir ham, ofitsiantlar ham sota olmaydi</b> (menyuda bloklanadi). Agar 1-ombordagi xom-ashyo to'xtatilsa, unga bog'langan taomlar ham avtomatik to'xtatiladi. Qayta sotuvga chiqarish uchun jadvaldagi <b>"Stopdan chiqarish"</b> tugmasini bosing.
            </p>
          </div>
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 transition-colors">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-semibold text-gray-700 dark:text-gray-200 flex items-center gap-2">
              <Plus size={18} className="text-blue-600 dark:text-blue-400" /> 
              {editingId ? (
                'Mahsulotni tahrirlash'
              ) : businessType === 'restaurant' ? (
                restaurantTab === 'raw_materials' 
                  ? '1-Ombor: Yangi Xom-ashyo (Ingrediyent) kiritish' 
                  : '2-Ombor: Yangi Taom yoki Donabay tovar qo\'shish'
              ) : (
                t('addProductTitle')
              )}
            </h3>

            {businessType === 'restaurant' && restaurantTab === 'dishes' && !editingId && (
              <div className="flex items-center gap-2 p-1 bg-gray-100 dark:bg-gray-700/60 rounded-xl border border-gray-200 dark:border-gray-600">
                <button
                  type="button"
                  onClick={() => setDishMode('recipe')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                    dishMode === 'recipe'
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'text-gray-600 dark:text-gray-300 hover:text-gray-900'
                  }`}
                >
                  <span>🥘 Retseptli taom (Tarkibli)</span>
                </button>
                <button
                  type="button"
                  onClick={() => setDishMode('piece')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                    dishMode === 'piece'
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'text-gray-600 dark:text-gray-300 hover:text-gray-900'
                  }`}
                >
                  <span>🥤 Donabay tovar (Ichimliklar/suv)</span>
                </button>
              </div>
            )}
          </div>

          {/* Status banner */}
          {status && (
            <div
              className={`mb-4 flex items-start gap-3 p-4 rounded-xl text-sm border-2 ${
                status.type === 'error'
                  ? 'bg-red-50 dark:bg-red-900/30 border-red-200 dark:border-red-800 text-red-700 dark:text-red-400'
                  : status.type === 'warning'
                  ? 'bg-orange-50 dark:bg-orange-900/30 border-orange-400 text-orange-800 dark:text-orange-300 shadow-sm'
                  : 'bg-green-50 dark:bg-green-900/30 border-green-200 dark:border-green-800 text-green-700 dark:text-green-400'
              }`}
            >
              {status.type === 'error' ? (
                <AlertCircle size={20} className="mt-0.5 shrink-0 text-red-500" />
              ) : status.type === 'warning' ? (
                <AlertTriangle size={28} className="mt-0.5 shrink-0 text-orange-500 animate-pulse" />
              ) : (
                <CheckCircle2 size={20} className="mt-0.5 shrink-0 text-green-500" />
              )}
              <div>
                <span className={status.type === 'warning' ? 'text-lg font-bold block mb-1' : 'font-medium'}>
                  {status.message}
                </span>
                {status.details && <p className="text-sm font-medium">{status.details}</p>}
              </div>
            </div>
          )}

          <form onSubmit={handleAddProduct} className="grid grid-cols-2 md:grid-cols-4 gap-4 items-end">
            {/* Nomi */}
            <div className="col-span-2">
              <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-1.5">
                {businessType === 'restaurant' && restaurantTab === 'raw_materials' 
                  ? 'Xom-ashyo / Masalliq nomi' 
                  : (businessType === 'restaurant' && dishMode === 'recipe' ? 'Taom nomi' : t('productName'))} <span className="text-red-500">*</span>
              </label>
              <input
                required name="name" value={formData.name} onChange={handleInputChange}
                type="text" 
                placeholder={
                  businessType === 'restaurant' && restaurantTab === 'raw_materials'
                    ? "Masalan: Mol go'shti, Piyoz, Un, Yog'..."
                    : (businessType === 'restaurant' && dishMode === 'recipe' ? "Masalan: Lavash Standart, Osh, Shashlik..." : "Masalan: Pepsi 1.5L, Suv 0.5L...")
                } 
                className={inputCls}
              />
            </div>

            {/* Shtrixkod — Faqat donabay tovarlar va retail uchun */}
            {!(businessType === 'restaurant' && (restaurantTab === 'raw_materials' || dishMode === 'recipe')) && (
              <div>
                <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-1.5">
                  {t('barcode')} <span className="text-gray-400 dark:text-gray-500 font-normal normal-case">{t('barcodeOpt')}</span>
                </label>
                <div className="flex gap-2">
                  <input
                    name="barcode" value={formData.barcode} onChange={handleInputChange}
                    type="text" placeholder="123456789" className={inputCls + ' flex-1'}
                  />
                  <button
                    type="button"
                    onClick={handleGenerateBarcodeClick}
                    className="bg-blue-50 hover:bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400 px-3 py-2 rounded-lg font-bold transition-all text-xs cursor-pointer border border-blue-200 dark:border-blue-800/50 shrink-0"
                  >
                    {t('generateBarcode') || 'Auto'}
                  </button>
                </div>
              </div>
            )}

            {/* Kategoriya */}
            {businessType === 'restaurant' && (
              <div>
                <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-1.5">
                  {lang === 'uz' ? 'Kategoriya' : 'Категория'} <span className="text-red-500">*</span>
                </label>
                <input
                  required={businessType === 'restaurant'} name="category" value={formData.category} onChange={handleInputChange}
                  type="text" 
                  placeholder={restaurantTab === 'raw_materials' ? "Masalan: Go'shtlar, Sabzavotlar..." : "Masalan: Taomlar, Ichimliklar, Fast-food..."} 
                  className={inputCls}
                />
              </div>
            )}

            {/* Birligi */}
            <div>
              <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-1.5">
                {t('unitLabel')} <span className="text-red-500">*</span>
              </label>
              <select
                required name="unit" value={formData.unit} onChange={handleInputChange}
                className={inputCls + ' cursor-pointer'}
              >
                <option value="dona">{t('units')?.['dona'] || 'dona (шт)'}</option>
                <option value="kg">{t('units')?.['kg'] || 'kg (кг)'}</option>
                <option value="litr">{t('units')?.['litr'] || 'litr (литр)'}</option>
                <option value="metr">{t('units')?.['metr'] || 'metr (метр)'}</option>
                <option value="qop">{t('units')?.['qop'] || 'qop (мешок)'}</option>
              </select>
            </div>

            {/* Chop etish bo'limi (Faqat 2-ombor taomlar/tovarlar uchun) */}
            {businessType === 'restaurant' && restaurantTab === 'dishes' && (
              <div>
                <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-1.5">
                  {lang === 'uz' ? 'Chop etish bo\'limi' : 'Отдел печати'}
                </label>
                <select
                  name="printer_destination"
                  value={formData.printer_destination || 'none'}
                  onChange={handleInputChange}
                  className={inputCls + ' cursor-pointer'}
                >
                  <option value="none">-- {lang === 'uz' ? 'Chop etilmasin' : 'Не печатать'} --</option>
                  <option value="oshxona-1">{lang === 'uz' ? 'Oshxona-1' : 'Кухня-1'}</option>
                  <option value="oshxona-2">{lang === 'uz' ? 'Oshxona-2' : 'Кухня-2'}</option>
                  <option value="oshxona-3">{lang === 'uz' ? 'Oshxona-3' : 'Кухня-3'}</option>
                  <option value="bar-1">{lang === 'uz' ? 'Bar-1' : 'Бар-1'}</option>
                  <option value="bar-2">{lang === 'uz' ? 'Bar-2' : 'Бар-2'}</option>
                  <option value="bar-3">{lang === 'uz' ? 'Bar-3' : 'Бар-3'}</option>
                  <option value="xolodniy-1">{lang === 'uz' ? 'Xolodniy-1' : 'Холодный-1'}</option>
                  <option value="xolodniy-2">{lang === 'uz' ? 'Xolodniy-2' : 'Холодный-2'}</option>
                  <option value="xolodniy-3">{lang === 'uz' ? 'Xolodniy-3' : 'Холодный-3'}</option>
                </select>
              </div>
            )}

            {/* Olish narxi / Tannarx */}
            {!(businessType === 'restaurant' && restaurantTab === 'dishes' && dishMode === 'recipe') && (
              <div>
                <div className="flex justify-between items-center mb-1.5">
                  <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">
                    {t('buyPrice')} <span className="text-red-500">*</span>
                  </label>
                  <div className="flex gap-1 text-[10px] font-bold">
                    <button
                      type="button"
                      onClick={() => handleCurrencySwitch('UZS')}
                      className={`px-1.5 py-0.5 rounded border transition-colors cursor-pointer ${
                        buyPriceCurrency === 'UZS'
                          ? 'bg-blue-600 border-blue-600 text-white'
                          : 'bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300'
                      }`}
                    >
                      so'm
                    </button>
                    <button
                      type="button"
                      onClick={() => handleCurrencySwitch('USD')}
                      className={`px-1.5 py-0.5 rounded border transition-colors cursor-pointer ${
                        buyPriceCurrency === 'USD'
                          ? 'bg-blue-600 border-blue-600 text-white'
                          : 'bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300'
                      }`}
                    >
                      USD ($)
                    </button>
                  </div>
                </div>
                <input
                  required name="buy_price" value={formData.buy_price} onChange={handleInputChange}
                  type="text" inputMode="decimal" placeholder={buyPriceCurrency === 'USD' ? "0.00" : "0"} className={inputCls}
                />
                {buyPriceCurrency === 'USD' && (
                  <div className="text-[10px] text-gray-500 dark:text-gray-400 mt-1.5 flex flex-col gap-1">
                    <div>
                      Konvertatsiya: ~ {formatPriceInput(Math.round((parseFloat(String(formData.buy_price).replace(/,/g, '.')) || 0) * usdRate))} so'm
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Sotish narxi (Faqat 2-ombor taomlar/tovarlar va retail uchun) */}
            {!(businessType === 'restaurant' && restaurantTab === 'raw_materials') && (
              <div>
                <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-1.5">
                  {t('sellPrice')} <span className="text-red-500">*</span>
                </label>
                <input
                  required name="sell_price" value={formData.sell_price} onChange={handleInputChange}
                  type="text" inputMode="decimal" placeholder="0" className={inputCls}
                />
              </div>
            )}

            {/* Qoldiq / Kirim miqdori (1-ombor xom-ashyolari va 2-ombor donabay tovarlar uchun) */}
            {!(businessType === 'restaurant' && restaurantTab === 'dishes' && dishMode === 'recipe') && (
              <div>
                <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-1.5">
                  {(existingProductId || editingId) ? "Kirim miqdori" : (restaurantTab === 'raw_materials' ? "Ombordagi qoldiq" : t('quantity'))} <span className="text-red-500">*</span>
                </label>
                <input
                  ref={stockInputRef}
                  required
                  name="stock"
                  value={formData.stock}
                  onChange={handleInputChange}
                  type="number"
                  step="0.001"
                  min="0"
                  placeholder="0"
                  className={inputCls}
                />
              </div>
            )}

            {/* Chegirma (Faqat sotiladigan mahsulotlar uchun) */}
            {!(businessType === 'restaurant' && restaurantTab === 'raw_materials') && (
              <div>
                <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-1.5">
                  Chegirma (%)
                </label>
                <input
                  name="discount" value={formData.discount} onChange={handleInputChange}
                  type="number" min="0" max="100" placeholder="0" className={inputCls}
                />
              </div>
            )}

            {/* ── Retsept / Masalliqlar tarkibi (2-ombor retseptli taomlar uchun) ── */}
            {businessType === 'restaurant' && restaurantTab === 'dishes' && dishMode === 'recipe' && (
              <div className="col-span-2 md:col-span-4 bg-gradient-to-br from-amber-50/50 to-orange-50/50 dark:from-gray-800/80 dark:to-gray-800/40 p-5 rounded-2xl border border-amber-200/80 dark:border-amber-900/40 mt-3 shadow-inner">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-sm font-bold text-amber-900 dark:text-amber-300 flex items-center gap-2">
                    🍳 1-Ombordagi Masalliqlardan Taom Retseptini Tuzish
                  </h4>
                  <span className="text-xs font-bold text-amber-800 dark:text-amber-400">
                    Hisoblangan Tannarx: <span className="text-base text-gray-900 dark:text-white font-extrabold">{formatCurrency(projectedCostPrice, lang)}</span>
                  </span>
                </div>
                
                {recipeIngredients.length > 0 ? (
                  <div className="space-y-2 mb-4">
                    {recipeIngredients.map((ing) => (
                      <div key={ing.ingredient_product_id} className="flex items-center justify-between bg-white dark:bg-gray-800 px-3.5 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 text-sm shadow-sm">
                        <span className="font-bold text-gray-800 dark:text-gray-200 flex items-center gap-2">
                          <Package size={15} className="text-amber-600" />
                          {ing.name}
                        </span>
                        <div className="flex items-center gap-3">
                          <div className="flex items-center gap-1.5 bg-gray-50 dark:bg-gray-700/60 px-2 py-1 rounded-lg border border-gray-200 dark:border-gray-600">
                            <input
                              type="number"
                              step="0.001"
                              min="0.001"
                              value={ing.quantity}
                              onChange={(e) => {
                                const newQty = parseFloat(e.target.value) || 0;
                                setRecipeIngredients(prev => prev.map(item =>
                                  item.ingredient_product_id === ing.ingredient_product_id
                                    ? { ...item, quantity: newQty }
                                    : item
                                ));
                              }}
                              className="w-20 px-1 text-center font-bold bg-transparent text-gray-900 dark:text-gray-100 focus:outline-none"
                            />
                            <span className="text-gray-500 font-semibold text-xs">{ing.unit}</span>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleRemoveIngredient(ing.ingredient_product_id)}
                            className="text-red-500 hover:text-red-700 dark:hover:text-red-400 p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors cursor-pointer"
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </div>
                    ))}
                    
                    <div className="text-xs text-amber-700 dark:text-amber-400 bg-amber-100/60 dark:bg-amber-950/40 p-2.5 rounded-xl border border-amber-300 dark:border-amber-900/60 mt-2 font-medium">
                      💡 <b>Eslatma:</b> Ushbu taom sotilganda, uning 1-ombordagi har bir ingrediyenti yuqorida ko'rsatilgan miqdorda avtomatik tarzda kamayadi. Agar biror ingrediyent stopga qo'yilsa, ushbu taom ham avtomatik Stop-listga tushadi.
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-amber-800/80 dark:text-amber-400/80 mb-4 italic">
                    Hozircha xom-ashyolar tanlanmagan. Quyidagi ro'yxatdan 1-ombordagi masalliqni tanlang va qo'shing.
                  </p>
                )}
                
                {/* Add ingredient row */}
                <div className="flex flex-col sm:flex-row gap-3 items-end bg-white dark:bg-gray-800 p-3.5 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm">
                  <div className="flex-1 w-full">
                    <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-1">
                      1-Ombordagi Xom-ashyoni tanlang
                    </label>
                    <select
                      value={selectedIngId}
                      onChange={(e) => setSelectedIngId(e.target.value)}
                      className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none cursor-pointer"
                    >
                      <option value="">-- Masalliqni tanlang --</option>
                      {rawMaterials.map(rm => (
                        <option key={rm.id} value={rm.id}>
                          {rm.name} (Qoldiq: {rm.stock} {rm.unit || 'dona'}) - {formatCurrency(rm.buy_price, lang)}
                        </option>
                      ))}
                    </select>
                  </div>
                  
                  <div className="w-full sm:w-36">
                    <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-1">
                      1 porsiyaga miqdor
                    </label>
                    <input
                      type="number"
                      step="0.001"
                      min="0.001"
                      value={ingQty}
                      onChange={(e) => setIngQty(e.target.value)}
                      placeholder="0.150"
                      className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none font-bold"
                    />
                  </div>
                  
                  <button
                    type="button"
                    onClick={handleAddIngredient}
                    disabled={!selectedIngId || !ingQty}
                    className="bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white text-xs font-bold px-5 py-2.5 rounded-lg transition-colors h-10 shrink-0 flex items-center justify-center gap-1.5 w-full sm:w-auto cursor-pointer shadow-sm"
                  >
                    <Plus size={15} /> Qo'shish
                  </button>
                </div>
              </div>
            )}

            {/* Harakat izohi */}
            <div className="col-span-2 md:col-span-4 mt-2">
              <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-1.5">
                Izoh (Ixtiyoriy)
              </label>
              <input
                name="note"
                value={formData.note || ''}
                onChange={handleInputChange}
                type="text"
                placeholder="Masalan: Yangi partiya keldi, narxlar yangilandi..."
                className={inputCls}
              />
            </div>

            {/* Submit tugmalari */}
            <div className="col-span-2 md:col-span-4 flex justify-end gap-2 mt-4">
              {(editingId || existingProductId || formData.barcode) && (
                <button
                  type="button"
                  onClick={handleCancelEdit}
                  className="flex items-center gap-1.5 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 font-semibold py-2.5 px-4 rounded-xl transition-colors text-sm border border-gray-300 dark:border-gray-600 cursor-pointer"
                >
                  <X size={15} />
                  Bekor qilish
                </button>
              )}
              <button
                type="submit"
                disabled={loading}
                className="bg-blue-600 hover:bg-blue-700 dark:bg-blue-600 dark:hover:bg-blue-700 disabled:opacity-60 text-white font-bold py-2.5 px-7 rounded-xl transition-all text-sm shadow-md cursor-pointer flex items-center gap-2"
              >
                {loading ? (
                  <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <Plus size={16} />
                )}
                {editingId ? "O'zgarishlarni saqlash" : (restaurantTab === 'raw_materials' ? "Xom-ashyoni kiritish" : t('addBtn'))}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ── Products table ── */}
      <div className="flex flex-col bg-white dark:bg-gray-800 shadow-sm rounded-xl border border-gray-200 dark:border-gray-700 min-h-[500px] transition-colors">
        {/* Table header */}
        <div className="px-5 py-4 border-b border-gray-200 dark:border-gray-700 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 shrink-0">
          <div className="flex items-center gap-2.5">
            <span className="text-base font-bold text-gray-800 dark:text-gray-100">
              {businessType === 'restaurant' ? (
                restaurantTab === 'raw_materials'
                  ? '📦 1-Ombor: Xom-ashyolar ro\'yxati'
                  : restaurantTab === 'dishes'
                  ? '🍽️ 2-Ombor: Sotiladigan taomlar & tovarlar'
                  : '🚫 Stop-Listdagi Mahsulotlar'
              ) : (
                t('productList')
              )}
            </span>
            <span className="px-2.5 py-0.5 bg-blue-100 dark:bg-blue-900/40 text-blue-800 dark:text-blue-300 font-bold text-xs rounded-full">
              {filteredProducts.length} ta
            </span>
          </div>

          <div className="relative w-full sm:w-72">
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500" />
            <input
              type="text"
              placeholder={t('searchProducts')}
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-10 pr-3.5 py-2 border border-gray-300 dark:border-gray-600 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-800 dark:text-gray-100 transition"
            />
          </div>
        </div>

        {/* Scrollable table */}
        <div className="overflow-auto flex-1 custom-scrollbar">
          <table className="w-full text-left border-collapse">
            <thead className="bg-gray-50 dark:bg-gray-700/50 border-b border-gray-200 dark:border-gray-700 sticky top-0 z-10 transition-colors">
              <tr>
                <th className="py-3 px-4 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">#</th>
                <th className="py-3 px-4 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">{t('productName')}</th>
                {businessType === 'restaurant' && (
                  <th className="py-3 px-4 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Turi / Ombor</th>
                )}
                <th className="py-3 px-4 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Kategoriya</th>
                {!(businessType === 'restaurant' && restaurantTab === 'dishes') && (
                  <th className="py-3 px-4 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Birligi</th>
                )}
                {!(businessType === 'restaurant' && restaurantTab === 'dishes' && dishMode === 'recipe') && (
                  <th className="py-3 px-4 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">{t('buyPrice')}</th>
                )}
                {!(businessType === 'restaurant' && restaurantTab === 'raw_materials') && (
                  <th className="py-3 px-4 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">{t('sellPrice')}</th>
                )}
                <th className="py-3 px-4 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  {businessType === 'restaurant' && restaurantTab === 'dishes' ? 'Qoldiq / Portsiya' : 'Qoldiq'}
                </th>
                <th className="py-3 px-4 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider text-center">Stop-List</th>
                <th className="py-3 px-4 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider text-right">Amallar</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
              {filteredProducts.length === 0 ? (
                <tr>
                  <td colSpan="10" className="py-14 text-center text-sm text-gray-400 dark:text-gray-500">
                    <Package size={36} className="mx-auto text-gray-300 dark:text-gray-600 mb-2 opacity-60" />
                    {restaurantTab === 'stop_list' ? "Hozirda stop-listda hech qanday mahsulot yo'q." : t('noProductsFound')}
                  </td>
                </tr>
              ) : (
                <>
                  {filteredProducts.slice(0, visibleCount).map((product, index) => {
                    const isStopped = product.is_stopped === 1 || !!product.stop_reason;
                    const lowStock = product.stock <= 3;
                    const unitLabel = t('units')?.[product.unit] || product.unit || 'dona';

                    return (
                      <tr
                        key={product.id}
                        className={`group transition-colors hover:bg-gray-50 dark:hover:bg-gray-700/50 ${
                          isStopped 
                            ? 'bg-red-50/40 dark:bg-red-950/20' 
                            : (lowStock ? 'bg-amber-50/30 dark:bg-amber-950/10' : '')
                        }`}
                      >
                        <td className="py-3.5 px-4 text-sm text-gray-400 dark:text-gray-500 font-mono">{index + 1}</td>
                        <td className="py-3.5 px-4 text-sm font-medium text-gray-900 dark:text-gray-100">
                          <div className="flex flex-col gap-0.5">
                            <div className="flex items-center gap-2">
                              <span className={`font-bold ${isStopped ? 'text-red-600 dark:text-red-400' : ''}`}>
                                {product.name}
                              </span>
                              {product.discount > 0 && (
                                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400">
                                  -{product.discount}%
                                </span>
                              )}
                            </div>
                            {product.stop_reason && (
                              <span className="text-[11px] font-semibold text-red-600 dark:text-red-400 flex items-center gap-1 mt-0.5">
                                <Ban size={12} className="shrink-0" />
                                {product.stop_reason}
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Turi / Ombor */}
                        {businessType === 'restaurant' && (
                          <td className="py-3.5 px-4 text-sm">
                            <span className={`inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full font-bold ${
                              product.type === 'raw_material'
                                ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300'
                                : 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300'
                            }`}>
                              {product.type === 'raw_material' ? '📦 1-Ombor (Xom-ashyo)' : '🍽️ 2-Ombor (Taom/Tovar)'}
                            </span>
                          </td>
                        )}

                        {/* Kategoriya */}
                        <td className="py-3.5 px-4 text-sm text-gray-600 dark:text-gray-300">
                          <span className="px-2 py-0.5 bg-gray-100 dark:bg-gray-700/60 rounded text-xs font-semibold text-gray-700 dark:text-gray-300">
                            {product.category || 'Boshqa'}
                          </span>
                        </td>

                        {/* Birligi */}
                        {!(businessType === 'restaurant' && restaurantTab === 'dishes') && (
                          <td className="py-3.5 px-4 text-sm text-gray-600 dark:text-gray-400">
                            {unitLabel}
                          </td>
                        )}

                        {/* Olish narxi */}
                        {!(businessType === 'restaurant' && restaurantTab === 'dishes' && dishMode === 'recipe') && (
                          <td className="py-3.5 px-4 text-sm text-gray-600 dark:text-gray-300 font-medium">
                            {formatCurrency(product.buy_price, lang)}
                            {product.buy_price_usd > 0 && (
                              <span className="text-[10px] text-amber-600 dark:text-amber-400 block font-semibold mt-0.5">
                                {product.buy_price_usd} $ (kurs: {formatThousands(product.usd_rate || 0)})
                              </span>
                            )}
                          </td>
                        )}

                        {/* Sotish narxi */}
                        {!(businessType === 'restaurant' && restaurantTab === 'raw_materials') && (
                          <td className="py-3.5 px-4 text-sm font-bold text-gray-900 dark:text-white">
                            {formatCurrency(product.sell_price, lang)}
                          </td>
                        )}

                        {/* Qoldiq */}
                        <td className="py-3.5 px-4 text-sm">
                          <span
                            className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold ${
                              product.stock <= 0
                                ? 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-400'
                                : lowStock
                                ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300'
                                : 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400'
                            }`}
                          >
                            {product.stock <= 0 && <AlertCircle size={11} />}
                            {lowStock && product.stock > 0 && <AlertTriangle size={11} />}
                            {product.stock} {unitLabel}
                          </span>
                        </td>

                        {/* Stop-List Switch */}
                        <td className="py-3.5 px-4 text-center">
                          <button
                            type="button"
                            onClick={(e) => handleToggleStop(product, e)}
                            className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-extrabold transition-all cursor-pointer shadow-sm ${
                              product.is_stopped
                                ? 'bg-red-600 text-white hover:bg-red-700 ring-2 ring-red-400/50'
                                : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 hover:bg-emerald-200 border border-emerald-300 dark:border-emerald-700'
                            }`}
                            title={product.is_stopped ? "Stop-listda (Sotish bloklangan)" : "Sotuvda faol (Bosib to'xtatish mumkin)"}
                          >
                            {product.is_stopped ? (
                              <>
                                <span className="w-2 h-2 rounded-full bg-white shrink-0 animate-ping" />
                                <span>STOPDA</span>
                              </>
                            ) : (
                              <>
                                <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                                <span>FAOL</span>
                              </>
                            )}
                          </button>
                        </td>

                        {/* Actions */}
                        <td className="py-3.5 px-4 text-right">
                          <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            {restaurantTab === 'stop_list' ? (
                              <button
                                onClick={(e) => handleToggleStop(product, e)}
                                title="Stopdan chiqarish"
                                className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg transition-colors flex items-center gap-1 cursor-pointer shadow-sm"
                              >
                                <Play size={12} /> Stopdan chiqarish
                              </button>
                            ) : (
                              <>
                                <button
                                  onClick={() => handlePrintLabelClick(product)}
                                  disabled={deletingId !== null}
                                  title={t('printLabelTitle') || 'Stiker chop etish'}
                                  className="text-gray-400 dark:text-gray-500 hover:text-emerald-500 dark:hover:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/30 p-1.5 rounded-lg transition-colors cursor-pointer"
                                >
                                  <Printer size={15} />
                                </button>
                                {product.type === 'raw_material' && (
                                  <button
                                    onClick={() => { setWriteOffTarget(product); setWriteOffQty(''); setWriteOffError(null); }}
                                    disabled={deletingId !== null}
                                    title="Hisobdan chiqarish"
                                    className="text-gray-400 dark:text-gray-500 hover:text-orange-500 dark:hover:text-orange-400 hover:bg-orange-50 dark:hover:bg-orange-900/30 p-1.5 rounded-lg transition-colors cursor-pointer"
                                  >
                                    <MinusCircle size={15} />
                                  </button>
                                )}
                                <button
                                  onClick={() => handleEditClick(product)}
                                  disabled={deletingId !== null}
                                  title="Tahrirlash"
                                  className="text-gray-400 dark:text-gray-500 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/30 p-1.5 rounded-lg transition-colors cursor-pointer"
                                >
                                  <Edit size={15} />
                                </button>
                                <button
                                  onClick={() => confirmDelete(product.id, product.name)}
                                  disabled={deletingId !== null}
                                  title="O'chirish"
                                  className="text-gray-400 dark:text-gray-500 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 p-1.5 rounded-lg transition-colors cursor-pointer"
                                >
                                  {deletingId === product.id ? (
                                    <span className="inline-block w-[15px] h-[15px] border-2 border-red-400 border-t-transparent rounded-full animate-spin" />
                                  ) : (
                                    <Trash2 size={15} />
                                  )}
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {filteredProducts.length > visibleCount && (
                    <tr>
                      <td colSpan="10" className="py-4 text-center bg-gray-50 dark:bg-gray-800/50">
                        <button
                          onClick={() => setVisibleCount(prev => prev + 50)}
                          className="px-4 py-2 bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 font-semibold rounded-lg hover:bg-blue-200 dark:hover:bg-blue-800/60 transition-colors text-sm cursor-pointer"
                        >
                          Yana 50 ta tovarni ko'rish
                        </button>
                        <p className="text-xs text-gray-500 mt-2">
                          Jami: {filteredProducts.length} ta mahsulot. Aniqroq qidirish tavsiya etiladi.
                        </p>
                      </td>
                    </tr>
                  )}
                </>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
});
