import { useState, useEffect, useCallback, useRef, useMemo, memo } from 'react';
import { Search, Plus, Trash2, Edit, AlertTriangle, AlertCircle, CheckCircle2, XCircle, MinusCircle, Printer, X } from 'lucide-react';
import { useApp } from './context/AppContext';
import { formatCurrency } from './utils';
import { useBarcodeScanner } from './hooks/useBarcodeScanner';
import JsBarcode from 'jsbarcode';
import { logoBase64 } from './logoBase64';

const formatPriceInput = (val) => {
  if (val === null || val === undefined) return '';
  let str = String(val).replace(/[^\d.]/g, '');
  if (!str) return '';
  const parts = str.split('.');
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return parts.join('.');
};

const EMPTY_FORM = {
  name: '',
  barcode: '',
  buy_price: '',
  sell_price: '',
  stock: '',
  unit: 'dona',
  discount: '',
};

export default memo(function Warehouse({ isActive }) {
  const { 
    t, lang, globalProducts, fetchGlobalProducts, productsLoaded, currentUser, storeName,
  } = useApp();
  const [formData, setFormData] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState(null);
  const [search, setSearch] = useState('');
  const [visibleCount, setVisibleCount] = useState(50);
  const [status, setStatus] = useState(null); // { type: 'error'|'success', message }
  const [loading, setLoading] = useState(false);
  const [deletingId, setDeletingId] = useState(null); // tracks which row is being deleted
  const [productToDelete, setProductToDelete] = useState(null); // For custom delete modal
  const [existingProductId, setExistingProductId] = useState(null);
  const stockInputRef = useRef(null);

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
    if (name === 'buy_price' || name === 'sell_price') {
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
              <img class="logo-img" src="${logoBase64}" />
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
        stock: '' // Clear stock so they can type the incoming quantity
      }));
      setExistingProductId(existing.id);
      
      // Auto-focus the quantity input
      setTimeout(() => {
        if (stockInputRef.current) stockInputRef.current.focus();
      }, 50);
    } else {
      // If it doesn't exist, just clear the existing product tracking
      if (existingProductId) {
        setExistingProductId(null);
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

      const productData = {
        name: formattedName,
        barcode: formData.barcode,
        buy_price: parseFloat(String(formData.buy_price).replace(/\s/g, '')) || 0,
        sell_price: parseFloat(String(formData.sell_price).replace(/\s/g, '')) || 0,
        stock: parseFloat(formData.stock) || 0,
        unit: formData.unit,
        discount: parseFloat(formData.discount) || 0,
        userName: currentUser?.name || 'Ombor',
      };

      let result;
      if (editingId) {
        result = await window.api.updateProduct({ id: editingId, data: productData });
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
    setFormData({
      name: product.name,
      barcode: product.barcode || '',
      buy_price: formatPriceInput(product.buy_price),
      sell_price: formatPriceInput(product.sell_price),
      stock: '', // Clear stock so they can type the incoming quantity to add
      unit: product.unit,
      discount: product.discount !== undefined ? String(product.discount) : '',
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setExistingProductId(null);
    setFormData(EMPTY_FORM);
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

  const filteredProducts = useMemo(() => {
    if (!search.trim()) return globalProducts;
    const s = search.toLowerCase();
    return globalProducts.filter(p => 
      p.name.toLowerCase().includes(s) || 
      (p.barcode && p.barcode.includes(s))
    );
  }, [globalProducts, search]);

  // Shared input class with Dark Mode support
  const inputCls =
    'w-full border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100';

  return (
    <div className="h-full flex flex-col gap-6 transition-colors">
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
                      <img src={logoBase64} className="w-[30px] h-[30px] object-contain ml-[4px] shrink-0" />
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


      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-gray-800 dark:text-white">{t('warehouseTitle')}</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{t('warehouseSubtitle')}</p>
      </div>

      {/* ── Add/Edit product card ── */}
      <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 transition-colors">
        <h3 className="text-base font-semibold text-gray-700 dark:text-gray-200 flex items-center gap-2 mb-4">
          <Plus size={18} className="text-blue-600 dark:text-blue-400" /> 
          {editingId ? 'Редактировать товар' : t('addProductTitle')}
        </h3>

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
          {/* Название — 2 cols */}
          <div className="col-span-2">
            <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-1.5">
              {t('productName')} <span className="text-red-500">*</span>
            </label>
            <input
              required name="name" value={formData.name} onChange={handleInputChange}
              type="text" placeholder="Напр. Кока-кола 1л" className={inputCls}
            />
          </div>

          {/* Штрихкод — optional */}
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
                {t('generateBarcode') || 'Сгенерировать'}
              </button>
            </div>
          </div>

          {/* Единица измерения */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-1.5">
              {t('unitLabel')} <span className="text-red-500">*</span>
            </label>
            <select
              required name="unit" value={formData.unit} onChange={handleInputChange}
              className={inputCls + ' cursor-pointer'}
            >
              <option value="dona">{t('units')?.['dona'] || 'шт'}</option>
              <option value="kg">{t('units')?.['kg'] || 'кг'}</option>
              <option value="metr">{t('units')?.['metr'] || 'метр'}</option>
              <option value="litr">{t('units')?.['litr'] || 'литr'}</option>
              <option value="qop">{t('units')?.['qop'] || 'qop'}</option>
            </select>
          </div>

          {/* Закуп */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-1.5">
              {t('buyPrice')} <span className="text-red-500">*</span>
            </label>
            <input
              required name="buy_price" value={formData.buy_price} onChange={handleInputChange}
              type="text" inputMode="decimal" placeholder="0.00" className={inputCls}
            />
          </div>

          {/* Продажа */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-1.5">
              {t('sellPrice')} <span className="text-red-500">*</span>
            </label>
            <input
              required name="sell_price" value={formData.sell_price} onChange={handleInputChange}
              type="text" inputMode="decimal" placeholder="0.00" className={inputCls}
            />
          </div>

          {/* Kol-vo */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-1.5">
              {(existingProductId || editingId) ? "Qo'shilayotgan soni" : t('quantity')} <span className="text-red-500">*</span>
            </label>
            <input
              ref={stockInputRef}
              required name="stock" value={formData.stock} onChange={handleInputChange}
              type="number" step="0.001" min="0" placeholder="0" className={inputCls}
            />
          </div>

          {/* Chegirma */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-1.5">
              Chegirma (%)
            </label>
            <input
              name="discount" value={formData.discount} onChange={handleInputChange}
              type="number" min="0" max="100" placeholder="0" className={inputCls}
            />
          </div>

          {/* Submit */}
          <div className="col-span-2 md:col-span-4 flex justify-end gap-2 mt-2">
            {(editingId || existingProductId || formData.barcode) && (
              <button
                type="button"
                onClick={handleCancelEdit}
                className="flex items-center gap-1.5 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 font-semibold py-2 px-4 rounded-md transition-colors text-sm border border-gray-300 dark:border-gray-600"
              >
                <X size={15} />
                Otmena
              </button>
            )}
            <button
              type="submit"
              disabled={loading}
              className="bg-blue-600 hover:bg-blue-700 dark:bg-blue-600 dark:hover:bg-blue-700 disabled:opacity-60 text-white font-medium py-2 px-6 rounded-md transition-colors text-sm shadow-sm"
            >
              {loading
                ? (editingId ? 'Saqlanmoqda...' : "Qo'shilmoqda...")
                : (editingId ? "O'zgarishlarni saqlash" : t('addBtn'))}
            </button>
          </div>
        </form>
      </div>

      {/* ── Products table ── */}
      <div className="flex-1 flex flex-col bg-white dark:bg-gray-800 shadow-sm rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700 min-h-0 transition-colors">
        {/* Table header */}
        <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center shrink-0">
          <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">
            {t('productList')} ({filteredProducts.length})
          </span>
          <div className="relative w-72">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500" />
            <input
              type="text"
              placeholder={t('searchProducts')}
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-800 dark:text-gray-100 transition"
            />
          </div>
        </div>

        {/* Scrollable table */}
        <div className="overflow-auto flex-1 custom-scrollbar">
          <table className="w-full text-left border-collapse">
            <thead className="bg-gray-50 dark:bg-gray-700/50 border-b border-gray-200 dark:border-gray-700 sticky top-0 z-10 transition-colors">
              <tr>
                <th className="py-3 px-4 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">ID</th>
                <th className="py-3 px-4 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">{t('productName')}</th>
                <th className="py-3 px-4 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">{t('barcode')}</th>
                <th className="py-3 px-4 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">{t('unitLabel')}</th>
                <th className="py-3 px-4 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">{t('buyPrice')}</th>
                <th className="py-3 px-4 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">{t('sellPrice')}</th>
                <th className="py-3 px-4 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Остаток</th>
                <th className="py-3 px-4 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider text-right">Действия</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
              {filteredProducts.length === 0 ? (
                <tr>
                  <td colSpan="8" className="py-12 text-center text-sm text-gray-400 dark:text-gray-500">
                    {t('noProductsFound')}
                  </td>
                </tr>
              ) : (
                <>
                  {filteredProducts.slice(0, visibleCount).map((product, index) => {
                    const lowStock = product.stock <= 3;
                    const unitLabel = t('units')?.[product.unit] || product.unit || 'шт';
                  return (
                    <tr
                      key={product.id}
                      className={`group transition-colors hover:bg-gray-50 dark:hover:bg-gray-700/50 ${lowStock ? 'bg-red-50/40 dark:bg-red-900/10 hover:bg-red-50/70 dark:hover:bg-red-900/20' : ''}`}
                    >
                      <td className="py-3 px-4 text-sm text-gray-400 dark:text-gray-500">{index + 1}</td>
                      <td className="py-3 px-4 text-sm font-medium text-gray-900 dark:text-gray-200">
                        <div className="flex items-center gap-2">
                          <span>{product.name}</span>
                          {product.discount > 0 && (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400">
                              -{product.discount}%
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-sm text-gray-500 dark:text-gray-400 font-mono">
                        {product.barcode || <span className="text-gray-300 dark:text-gray-600">—</span>}
                      </td>
                      <td className="py-3 px-4 text-sm text-gray-600 dark:text-gray-400">
                        {unitLabel}
                      </td>
                      <td className="py-3 px-4 text-sm text-gray-500 dark:text-gray-400">{formatCurrency(product.buy_price, lang)}</td>
                      <td className="py-3 px-4 text-sm font-semibold text-gray-800 dark:text-gray-200">{formatCurrency(product.sell_price, lang)}</td>
                      <td className="py-3 px-4 text-sm">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${
                            lowStock ? 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-400' : 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400'
                          }`}
                        >
                          {lowStock && <AlertTriangle size={11} />}
                          {product.stock} {unitLabel}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={() => handlePrintLabelClick(product)}
                            disabled={deletingId !== null}
                            title={t('printLabelTitle') || 'Stiker chop etish'}
                            className="text-gray-400 dark:text-gray-500 hover:text-emerald-500 dark:hover:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/30 p-1.5 rounded-md transition-colors disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                          >
                            <Printer size={15} />
                          </button>
                          <button
                            onClick={() => { setWriteOffTarget(product); setWriteOffQty(''); setWriteOffError(null); }}
                            disabled={deletingId !== null}
                            title="Hisobdan chiqarish"
                            className="text-gray-400 dark:text-gray-500 hover:text-orange-500 dark:hover:text-orange-400 hover:bg-orange-50 dark:hover:bg-orange-900/30 p-1.5 rounded-md transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                          >
                            <MinusCircle size={15} />
                          </button>
                          <button
                            onClick={() => handleEditClick(product)}
                            disabled={deletingId !== null}
                            title="Tahrirlash"
                            className="text-gray-400 dark:text-gray-500 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/30 p-1.5 rounded-md transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                          >
                            <Edit size={15} />
                          </button>
                          <button
                            onClick={() => confirmDelete(product.id, product.name)}
                            disabled={deletingId !== null}
                            title="Удалить"
                            className="text-gray-400 dark:text-gray-500 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 p-1.5 rounded-md transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                          >
                            {deletingId === product.id
                              ? <span className="inline-block w-[15px] h-[15px] border-2 border-red-400 border-t-transparent rounded-full animate-spin" />
                              : <Trash2 size={15} />}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {filteredProducts.length > visibleCount && (
                  <tr>
                    <td colSpan="8" className="py-4 text-center bg-gray-50 dark:bg-gray-800/50">
                      <button
                        onClick={() => setVisibleCount(prev => prev + 50)}
                        className="px-4 py-2 bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 font-semibold rounded hover:bg-blue-200 dark:hover:bg-blue-800/60 transition-colors text-sm"
                      >
                        Yana 50 ta tovarni ko'rish
                      </button>
                      <p className="text-xs text-gray-500 mt-2">
                        Jami: {filteredProducts.length} ta tovar. Aniqroq qidirish tavsiya etiladi.
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
