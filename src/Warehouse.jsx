import { useState, useEffect, useCallback, useRef, useMemo, memo } from 'react';
import { Search, Plus, Trash2, Edit, AlertTriangle, AlertCircle, CheckCircle2, XCircle, MinusCircle, Printer, X, Package, UtensilsCrossed, Ban, Play, Sparkles, ChefHat, Image as ImageIcon, Upload, ClipboardCheck, Truck, FileText, DollarSign, UserPlus } from 'lucide-react';
import { useApp } from './context/AppContext';
import { formatCurrency, formatThousands, getProductImageUrl, parseSQLiteDate } from './utils';
import { useBarcodeScanner } from './hooks/useBarcodeScanner';
import JsBarcode from 'jsbarcode';
import { logoBase64 } from './logoBase64';
import StopListModal from './components/StopListModal';

const formatPriceInput = (val) => {
  if (val === null || val === undefined) return '';
  let str = String(val).replace(/\D/g, '');
  if (!str) return '';
  return str.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
};

const RESTAURANT_DISH_CATEGORIES = [
  'Milliy taomlar',
  'Salatlar',
  'Ichimliklar',
  'Sho\'rvalar',
  'Fast food',
  'Kabob & Shashlik',
  'Issiq taomlar',
  'Shirinliklar',
  'Non mahsulotlari',
  'Qo\'shimchalar & Souslar',
];

const RESTAURANT_RAW_CATEGORIES = [
  'Go\'sht mahsulotlari',
  'Sabzavotlar',
  'Meva & Ko\'katlar',
  'Sut mahsulotlari',
  'Un va don mahsulotlari',
  'Ziravorlar',
  'Yog\' va souslar',
  'Ichimlik xom-ashyosi',
  'Qadoqlash anjomlari',
];

const EMPTY_FORM = {
  name: '',
  barcode: '',
  buy_price: '',
  sell_price: '',
  stock: '',
  unit: 'dona',
  discount: '',
  category: '',
  type: 'ready_dish',
  printer_destination: 'none',
  note: '',
  is_unlimited: false,
  image: null,
};

export default memo(function Warehouse({ isActive, onOpenAudit }) {
  const { 
    t, lang, globalProducts, fetchGlobalProducts, productsLoaded, currentUser, storeName, shopLogo, businessType, usdRate, setUsdRate
  } = useApp();
  const [formData, setFormData] = useState(EMPTY_FORM);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [showStopListModal, setShowStopListModal] = useState(false);
  const fileInputRef = useRef(null);
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

  // ── Spisanie (Hisobdan chiqarish) state ──
  const [showWriteOffModal, setShowWriteOffModal] = useState(false);
  const [writeOffForm, setWriteOffForm] = useState({
    productId: '',
    quantity: '',
    reason: 'Brak / Yaroqsiz',
    note: '',
  });
  const [writeOffHistory, setWriteOffHistory] = useState([]);
  const [showWriteOffHistory, setShowWriteOffHistory] = useState(false);

  const handleSaveWriteOff = async (e) => {
    e.preventDefault();
    if (!writeOffForm.productId || !writeOffForm.quantity) return;
    const qty = parseFloat(writeOffForm.quantity);
    if (isNaN(qty) || qty <= 0) {
      setStatus({ type: 'error', message: 'Noto\'g\'ri miqdor kiritildi!' });
      return;
    }

    setLoading(true);
    try {
      const res = await window.api.writeOffProduct({
        productId: Number(writeOffForm.productId),
        quantity: qty,
        reason: writeOffForm.reason,
        note: writeOffForm.note,
        userName: currentUser?.name || 'Admin',
      });

      if (res && res.success) {
        setStatus({ type: 'success', message: 'Mahsulot ombordan hisobdan chiqarildi!' });
        setShowWriteOffModal(false);
        setWriteOffForm({ productId: '', quantity: '', reason: 'Brak / Yaroqsiz', note: '' });
        await fetchGlobalProducts();
      } else {
        setStatus({ type: 'error', message: res?.error || 'Xatolik yuz berdi' });
      }
    } catch (err) {
      setStatus({ type: 'error', message: err.message });
    } finally {
      setLoading(false);
    }
  };

  const handleFetchWriteOffHistory = async () => {
    try {
      const res = await window.api.getWriteOffs({});
      if (res && res.success) {
        setWriteOffHistory(res.data || []);
        setShowWriteOffHistory(true);
      }
    } catch (err) {
      console.error('getWriteOffs error:', err);
    }
  };

  // ── Suppliers & Supplier Invoices state ──
  const [showSuppliersModal, setShowSuppliersModal] = useState(false);
  const [suppliersList, setSuppliersList] = useState([]);
  const [supplierForm, setSupplierForm] = useState({ id: null, name: '', phone: '', company: '', note: '' });
  const [showAddSupplierForm, setShowAddSupplierForm] = useState(false);
  const [payDebtModal, setPayDebtModal] = useState({ isOpen: false, supplier: null, amount: '', paymentMethod: 'cash', note: '' });

  const [showInvoiceModal, setShowInvoiceModal] = useState(false);
  const [invoiceForm, setInvoiceForm] = useState({ supplierId: '', paymentMethod: 'cash', paidAmount: '', note: '' });
  const [invoiceItems, setInvoiceItems] = useState([]);
  const [invoiceIngId, setInvoiceIngId] = useState('');
  const [invoiceIngQty, setInvoiceIngQty] = useState('');
  const [invoiceIngPrice, setInvoiceIngPrice] = useState('');

  const fetchSuppliers = async () => {
    try {
      const res = await window.api.getSuppliers();
      if (res && res.success) {
        setSuppliersList(res.data || []);
      }
    } catch (err) {
      console.error('getSuppliers error:', err);
    }
  };

  useEffect(() => {
    if (businessType === 'restaurant') {
      fetchSuppliers();
    }
  }, [businessType]);

  const handleSaveSupplier = async (e) => {
    e.preventDefault();
    if (!supplierForm.name.trim()) return;
    try {
      if (supplierForm.id) {
        await window.api.updateSupplier(supplierForm);
      } else {
        await window.api.addSupplier(supplierForm);
      }
      setSupplierForm({ id: null, name: '', phone: '', company: '', note: '' });
      setShowAddSupplierForm(false);
      await fetchSuppliers();
    } catch (err) {
      setStatus({ type: 'error', message: err.message });
    }
  };

  const handleDeleteSupplier = async (id) => {
    if (!window.confirm("Yetkazib beruvchini o'chirmoqchimisiz?")) return;
    try {
      await window.api.deleteSupplier(id);
      await fetchSuppliers();
    } catch (err) {
      setStatus({ type: 'error', message: err.message });
    }
  };

  const handlePaySupplierDebtSubmit = async (e) => {
    e.preventDefault();
    if (!payDebtModal.supplier || !payDebtModal.amount) return;
    const amt = parseFloat(payDebtModal.amount);
    if (isNaN(amt) || amt <= 0) return;

    try {
      const res = await window.api.paySupplierDebt({
        supplierId: payDebtModal.supplier.id,
        amount: amt,
        paymentMethod: payDebtModal.paymentMethod,
        note: payDebtModal.note,
        userName: currentUser?.name || 'Admin',
      });
      if (res && res.success) {
        setStatus({ type: 'success', message: 'Yetkazib beruvchiga to\'lov saqlandi!' });
        setPayDebtModal({ isOpen: false, supplier: null, amount: '', paymentMethod: 'cash', note: '' });
        await fetchSuppliers();
      } else {
        setStatus({ type: 'error', message: res?.error || 'Xatolik' });
      }
    } catch (err) {
      setStatus({ type: 'error', message: err.message });
    }
  };

  const handleAddInvoiceItem = () => {
    if (!invoiceIngId || !invoiceIngQty) return;
    const qty = parseFloat(invoiceIngQty);
    const buyPrice = parseFloat(invoiceIngPrice) || 0;
    if (isNaN(qty) || qty <= 0) return;

    const prod = globalProducts.find(p => p.id === Number(invoiceIngId));
    if (!prod) return;

    setInvoiceItems(prev => {
      const idx = prev.findIndex(item => item.product_id === prod.id);
      if (idx >= 0) {
        const updated = [...prev];
        updated[idx] = { ...updated[idx], quantity: qty, buy_price: buyPrice };
        return updated;
      }
      return [...prev, { product_id: prod.id, product_name: prod.name, quantity: qty, buy_price: buyPrice, unit: prod.unit || 'dona' }];
    });

    setInvoiceIngId('');
    setInvoiceIngQty('');
    setInvoiceIngPrice('');
  };

  const handleRemoveInvoiceItem = (prodId) => {
    setInvoiceItems(prev => prev.filter(item => item.product_id !== prodId));
  };

  const handleSaveSupplierInvoice = async (e) => {
    e.preventDefault();
    if (invoiceItems.length === 0) {
      setStatus({ type: 'error', message: 'Fakturaga kamida 1 ta mahsulot qo\'shing!' });
      return;
    }

    setLoading(true);
    try {
      const res = await window.api.addSupplierInvoice({
        supplierId: invoiceForm.supplierId ? Number(invoiceForm.supplierId) : null,
        items: invoiceItems,
        paymentMethod: invoiceForm.paymentMethod,
        paidAmount: parseFloat(invoiceForm.paidAmount) || 0,
        note: invoiceForm.note,
        userName: currentUser?.name || 'Admin',
      });

      if (res && res.success) {
        setStatus({ type: 'success', message: 'Kirim fakturasi muvaffaqiyatli saqlandi!' });
        setShowInvoiceModal(false);
        setInvoiceItems([]);
        setInvoiceForm({ supplierId: '', paymentMethod: 'cash', paidAmount: '', note: '' });
        await fetchGlobalProducts();
        await fetchSuppliers();
      } else {
        setStatus({ type: 'error', message: res?.error || 'Xatolik yuz berdi' });
      }
    } catch (err) {
      setStatus({ type: 'error', message: err.message });
    } finally {
      setLoading(false);
    }
  };

  // ── Omborlararo Ko'chirish (Stock Transfer) state & handlers ─────────────
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [subWarehouses, setSubWarehouses] = useState([]);
  const [transferForm, setTransferForm] = useState({
    sourceWarehouse: 'Bosh Ombor (Markaziy)',
    targetWarehouse: 'Oshxona (Issiq cex)',
    note: ''
  });
  const [transferItems, setTransferItems] = useState([]);
  const [transferSelectedProductId, setTransferSelectedProductId] = useState('');
  const [transferSelectedQty, setTransferSelectedQty] = useState('');
  const [showTransferHistory, setShowTransferHistory] = useState(false);
  const [transferHistoryList, setTransferHistoryList] = useState([]);

  const fetchSubWarehouses = async () => {
    try {
      if (window.api && window.api.getSubWarehouses) {
        const res = await window.api.getSubWarehouses();
        if (res && res.success) {
          setSubWarehouses(res.data || []);
        }
      }
    } catch (_) {}
  };

  const handleFetchTransferHistory = async () => {
    try {
      if (window.api && window.api.getStockTransfers) {
        const res = await window.api.getStockTransfers();
        if (res && res.success) {
          setTransferHistoryList(res.data || []);
          setShowTransferHistory(true);
        }
      }
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const handleAddTransferItem = () => {
    if (!transferSelectedProductId || !transferSelectedQty) return;
    const qty = parseFloat(transferSelectedQty);
    if (isNaN(qty) || qty <= 0) return;
    const prod = globalProducts.find(p => p.id === Number(transferSelectedProductId));
    if (!prod) return;

    setTransferItems(prev => {
      const exists = prev.find(item => item.productId === prod.id);
      if (exists) {
        return prev.map(item => item.productId === prod.id ? { ...item, quantity: qty } : item);
      }
      return [...prev, { productId: prod.id, name: prod.name, unit: prod.unit || 'dona', quantity: qty }];
    });

    setTransferSelectedProductId('');
    setTransferSelectedQty('');
  };

  const handleRemoveTransferItem = (prodId) => {
    setTransferItems(prev => prev.filter(i => i.productId !== prodId));
  };

  const handleSaveTransfer = async (e) => {
    e.preventDefault();
    if (transferItems.length === 0) {
      setStatus({ type: 'error', message: 'Kamida 1 ta tovar tanlang!' });
      return;
    }

    setLoading(true);
    try {
      const res = await window.api.createStockTransfer({
        sourceWarehouse: transferForm.sourceWarehouse,
        targetWarehouse: transferForm.targetWarehouse,
        items: transferItems,
        note: transferForm.note,
        userName: currentUser?.name || 'Admin'
      });

      if (res && res.success) {
        showToast(`Omborlararo ko'chirish hujjati (#${res.transferNumber}) saqlandi!`, 'success');
        setShowTransferModal(false);
        setTransferItems([]);
        setTransferForm({ sourceWarehouse: 'Bosh Ombor (Markaziy)', targetWarehouse: 'Oshxona (Issiq cex)', note: '' });
        await fetchGlobalProducts();
      } else {
        setStatus({ type: 'error', message: res?.error || 'Xatolik yuz berdi' });
      }
    } catch (err) {
      setStatus({ type: 'error', message: err.message });
    } finally {
      setLoading(false);
    }
  };

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

  // ── Recipe / Composition & Semi-Finished Goods state ─────────────────────
  const [recipeIngredients, setRecipeIngredients] = useState([]);
  const [selectedIngId, setSelectedIngId] = useState('');
  const [ingQty, setIngQty] = useState('');
  const [ingWastePct, setIngWastePct] = useState('');

  // ── Polufabrikat Tayyorlash (Production) modal state ─────────────────────
  const [produceModal, setProduceModal] = useState({
    isOpen: false,
    product: null,
    qty: '1',
    recipe: [],
    loading: false,
    error: null,
  });

  const handleOpenProduceModal = async (product) => {
    setProduceModal({ isOpen: true, product, qty: '1', recipe: [], loading: true, error: null });
    try {
      const res = await window.api.getProductRecipe(product.id);
      if (res && res.success) {
        setProduceModal(prev => ({ ...prev, recipe: res.data || [], loading: false }));
      } else {
        setProduceModal(prev => ({ ...prev, recipe: [], loading: false, error: res?.error || 'Retsept yuklanmadi' }));
      }
    } catch (err) {
      setProduceModal(prev => ({ ...prev, recipe: [], loading: false, error: err.message }));
    }
  };

  const handleConfirmProduce = async (e) => {
    e.preventDefault();
    if (!produceModal.product || !produceModal.qty) return;
    const qty = parseFloat(produceModal.qty);
    if (isNaN(qty) || qty <= 0) {
      setProduceModal(prev => ({ ...prev, error: 'Noto\'g\'ri miqdor kiritildi!' }));
      return;
    }

    setProduceModal(prev => ({ ...prev, loading: true, error: null }));
    try {
      const res = await window.api.produceSemiFinished(
        produceModal.product.id,
        qty,
        currentUser?.name || 'Oshpaz'
      );
      if (res && res.success) {
        showToast(`"${res.productName}" ${res.qtyProduced} ${produceModal.product.unit || 'kg'} tayyorlandi va omborga qo'shildi!`, 'success');
        setProduceModal({ isOpen: false, product: null, qty: '', recipe: [], loading: false, error: null });
        await fetchGlobalProducts();
      } else {
        setProduceModal(prev => ({ ...prev, loading: false, error: res?.error || 'Tayyorlashda xatolik!' }));
      }
    } catch (err) {
      setProduceModal(prev => ({ ...prev, loading: false, error: err.message }));
    }
  };

  const rawMaterials = useMemo(() => {
    return globalProducts.filter(p => p.type === 'raw_material' || p.type === 'semi_finished');
  }, [globalProducts]);

  const projectedCostPrice = useMemo(() => {
    return recipeIngredients.reduce((sum, ing) => {
      const rawProd = globalProducts.find(p => p.id === ing.ingredient_product_id);
      const buyPrice = rawProd ? (parseFloat(rawProd.buy_price) || 0) : 0;
      const qty = parseFloat(ing.quantity) || 0;
      const wastePct = parseFloat(ing.waste_percentage) || 0;
      const effectiveQty = qty * (1 + wastePct / 100);
      return sum + (buyPrice * effectiveQty);
    }, 0);
  }, [recipeIngredients, globalProducts]);

  const handleAddIngredient = () => {
    if (!selectedIngId || !ingQty) return;
    const qty = parseFloat(ingQty);
    const wastePct = parseFloat(ingWastePct) || 0;
    if (isNaN(qty) || qty <= 0) return;

    const ingProduct = rawMaterials.find(p => p.id === parseInt(selectedIngId));
    if (!ingProduct) return;

    setRecipeIngredients(prev => {
      const exists = prev.find(item => item.ingredient_product_id === ingProduct.id);
      if (exists) {
        return prev.map(item => item.ingredient_product_id === ingProduct.id
          ? { ...item, quantity: qty, waste_percentage: wastePct }
          : item
        );
      }
      return [...prev, {
        ingredient_product_id: ingProduct.id,
        quantity: qty,
        waste_percentage: wastePct,
        name: ingProduct.name,
        unit: ingProduct.unit || 'dona'
      }];
    });

    setSelectedIngId('');
    setIngQty('');
    setIngWastePct('');
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

  const uploadImageFile = async (file) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      showToast("Faqat rasm fayllari qabul qilinadi!", "error");
      return;
    }
    setUploadingImage(true);
    try {
      const uploadFormData = new FormData();
      uploadFormData.append('image', file);

      const host = window.location.hostname || 'localhost';
      const port = 4000;
      let resData = null;
      try {
        const uploadHeaders = {};
        if (currentUser?.pin) {
          uploadHeaders['Authorization'] = currentUser.pin;
        }
        const res = await fetch(`http://${host}:${port}/api/products/upload-image`, {
          method: 'POST',
          headers: uploadHeaders,
          body: uploadFormData
        });
        resData = await res.json();
      } catch (httpErr) {
        // Fallback to IPC uploadProductImage
        if (window.api && window.api.uploadProductImage) {
          const reader = new FileReader();
          const base64Promise = new Promise((resolve, reject) => {
            reader.onload = () => resolve(reader.result);
            reader.onerror = reject;
          });
          reader.readAsDataURL(file);
          const base64 = await base64Promise;
          const ext = file.name ? file.name.substring(file.name.lastIndexOf('.')) : '.jpg';
          resData = await window.api.uploadProductImage({ base64, ext });
        }
      }

      if (resData && resData.success && resData.fileName) {
        setFormData(prev => ({ ...prev, image: resData.fileName }));
        showToast("Rasm muvaffaqiyatli yuklandi!");
      } else {
        showToast(resData?.error || "Rasmni yuklashda xatolik yuz berdi", "error");
      }
    } catch (err) {
      showToast("Xatolik: " + err.message, "error");
    } finally {
      setUploadingImage(false);
    }
  };

  const handleImageFileChange = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      uploadImageFile(file);
    }
    e.target.value = '';
  };

  const handleRemoveImage = () => {
    if (formData.image) {
      if (window.api && window.api.deleteProductImage) {
        window.api.deleteProductImage(formData.image);
      }
      setFormData(prev => ({ ...prev, image: null }));
      showToast("Rasm olib tashlandi");
    }
  };

  const handlePaste = useCallback((e) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf('image') !== -1) {
        const file = items[i].getAsFile();
        if (file) {
          e.preventDefault();
          uploadImageFile(file);
          break;
        }
      }
    }
  }, []);

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
      let finalCategory = formData.category ? formData.category.trim() : (restaurantTab === 'raw_materials' ? 'Sabzavotlar' : 'Milliy taomlar');
      let finalDest = formData.printer_destination || 'none';
      const isUnlimited = (businessType === 'restaurant' && dishMode === 'piece' && formData.is_unlimited) ? 1 : 0;

      if (businessType === 'restaurant') {
        if (restaurantTab === 'raw_materials') {
          finalType = 'raw_material';
          // Raw materials can have a sell_price if sold directly (e.g. pomidor, qalampir)
          finalSellPrice = parseInt(String(formData.sell_price).replace(/\D/g, '')) || 0;
          finalCategory = formData.category ? formData.category.trim() : 'Sabzavotlar';
          finalDest = 'none';
        } else {
          // 2-Ombor (Dishes / Sellable products)
          finalType = 'ready_dish';
          if (dishMode === 'recipe' && recipeIngredients.length > 0) {
            isReadyWithRecipe = true;
            finalStock = 0; // Dynamic from ingredients
          } else if (isUnlimited) {
            finalStock = 0; // Unlimited
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
        stock: (isReadyWithRecipe || isUnlimited) ? 0 : finalStock,
        unit: formData.unit,
        discount: parseFloat(formData.discount) || 0,
        category: finalCategory,
        type: finalType,
        printer_destination: finalDest,
        userName: currentUser?.name || 'Ombor',
        note: finalNote,
        buy_price_usd: buyPriceUsd,
        usd_rate: isUsd ? usdRate : 0,
        is_unlimited: isUnlimited,
        image: formData.image || null,
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
      category: product.category || (product.type === 'raw_material' ? 'Sabzavotlar' : 'Milliy taomlar'),
      type: product.type || 'ready_dish',
      printer_destination: product.printer_destination || 'none',
      note: '',
      is_unlimited: product.is_unlimited === 1,
      image: product.image || null,
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
      const res = await window.api.setProductStopWithLimit({
        productId: product.id,
        isStopped: newStatus,
        limit: null,
        reason: newStatus ? "Ombordan to'xtatildi" : '',
        userName: currentUser?.name || 'Ombor'
      });
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

  const handleQuickClearLimit = async (product, e) => {
    if (e) e.stopPropagation();
    if (!window.api) return;
    try {
      const res = await window.api.setProductStopWithLimit({
        productId: product.id,
        isStopped: false,
        limit: null,
        reason: '',
        userName: currentUser?.name || 'Ombor'
      });
      if (res && res.success) {
        showToast(`"${product.name}" limiti olib tashlandi!`, 'success');
        fetchGlobalProducts();
      }
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const handleOpenLimitPrompt = async (product, e) => {
    if (e) e.stopPropagation();
    const input = window.prompt(`"${product.name}" uchun qoldiq limitini kiriting (masalan: 5):`, product.stop_limit || '5');
    if (input === null) return;
    const num = parseFloat(input);
    if (isNaN(num) || num <= 0) {
      showToast("Noto'g'ri miqdor kiritildi! Musbat son kiriting.", 'error');
      return;
    }
    if (!window.api) return;
    try {
      const res = await window.api.setProductStopWithLimit({
        productId: product.id,
        isStopped: false,
        limit: num,
        reason: `Limit: ${num} ${product.unit || 'dona'}`,
        userName: currentUser?.name || 'Ombor'
      });
      if (res && res.success) {
        showToast(`"${product.name}" uchun limit (${num} ${product.unit || 'dona'}) belgilandi!`, 'success');
        fetchGlobalProducts();
      }
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  // ── Tab Counts ──
  const rawMaterialsCount = useMemo(() => {
    return (globalProducts || []).filter(p => p.type === 'raw_material' || p.type === 'semi_finished').length;
  }, [globalProducts]);

  const dishesCount = useMemo(() => {
    return (globalProducts || []).filter(p => p.type !== 'raw_material' && p.type !== 'semi_finished').length;
  }, [globalProducts]);

  const stoppedCount = useMemo(() => {
    return (globalProducts || []).filter(p => p.is_stopped === 1 || !!p.stop_reason).length;
  }, [globalProducts]);

  const filteredProducts = useMemo(() => {
    let list = globalProducts || [];

    if (businessType === 'restaurant') {
      if (restaurantTab === 'raw_materials') {
        list = list.filter(p => p.type === 'raw_material' || p.type === 'semi_finished');
      } else if (restaurantTab === 'dishes') {
        list = list.filter(p => p.type !== 'raw_material' && p.type !== 'semi_finished');
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

        <div className="flex flex-wrap items-center gap-3">
          {businessType === 'restaurant' && onOpenAudit && (
            <button
              type="button"
              onClick={onOpenAudit}
              className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-xl font-bold text-xs shadow-md shadow-indigo-500/20 transition-all cursor-pointer hover:scale-105 active:scale-95"
            >
              <ClipboardCheck size={16} />
              <span>{t('audit') || 'Inventarizatsiya (Reviziya)'}</span>
            </button>
          )}

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
                <span>1-Ombor: Xom-ashyo & Polufabrikati</span>
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
                onClick={() => { setRestaurantTab('stop_list'); handleCancelEdit(); setShowStopListModal(true); }}
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

              <button
                type="button"
                onClick={() => setShowWriteOffModal(true)}
                className="flex items-center gap-2 px-3.5 py-2 rounded-xl font-bold text-xs transition-all cursor-pointer bg-purple-600 hover:bg-purple-700 text-white shadow-md shadow-purple-600/30 active:scale-95 ml-1"
              >
                <Trash2 size={15} />
                <span>Hisobdan chiqarish (Spisanie)</span>
              </button>

              <button
                type="button"
                onClick={handleFetchWriteOffHistory}
                className="flex items-center gap-2 px-3 py-2 rounded-xl font-bold text-xs transition-all cursor-pointer bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 active:scale-95"
                title="Hisobdan chiqarilganlar tarixi"
              >
                <ClipboardCheck size={15} />
                <span>Chiqitlar tarixi</span>
              </button>

              <button
                type="button"
                onClick={() => { fetchSuppliers(); setShowSuppliersModal(true); }}
                className="flex items-center gap-2 px-3.5 py-2 rounded-xl font-bold text-xs transition-all cursor-pointer bg-teal-600 hover:bg-teal-700 text-white shadow-md shadow-teal-600/30 active:scale-95"
              >
                <Truck size={15} />
                <span>Yetkazib Beruvchilar (Postavshiklar)</span>
                {suppliersList.filter(s => (s.balance || 0) > 0).length > 0 && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] bg-red-500 text-white font-black animate-pulse">
                    {suppliersList.filter(s => (s.balance || 0) > 0).length} qarz
                  </span>
                )}
              </button>

              <button
                type="button"
                onClick={() => { fetchSuppliers(); setShowInvoiceModal(true); }}
                className="flex items-center gap-2 px-3.5 py-2 rounded-xl font-bold text-xs transition-all cursor-pointer bg-emerald-600 hover:bg-emerald-700 text-white shadow-md shadow-emerald-600/30 active:scale-95"
              >
                <FileText size={15} />
                <span>Kirim Fakturasi (Prikhod)</span>
              </button>

              <button
                type="button"
                onClick={() => { fetchSubWarehouses(); setShowTransferModal(true); }}
                className="flex items-center gap-2 px-3.5 py-2 rounded-xl font-bold text-xs transition-all cursor-pointer bg-blue-600 hover:bg-blue-700 text-white shadow-md shadow-blue-600/30 active:scale-95"
              >
                <Truck size={15} />
                <span>Omborlararo Ko'chirish</span>
              </button>
            </div>
          )}
        </div>
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
            <div className="mt-3.5 flex items-center gap-3">
              <button
                type="button"
                onClick={() => setShowStopListModal(true)}
                className="flex items-center gap-2 px-4 py-2.5 bg-red-600 hover:bg-red-700 active:scale-95 text-white font-black text-xs rounded-xl shadow-md transition-all cursor-pointer"
              >
                <Plus size={16} />
                <span>Mahsulotlarni Stop-Listga qo'yish & Limitlash</span>
              </button>
            </div>
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

          <form onSubmit={handleAddProduct} onPaste={handlePaste} className="grid grid-cols-2 md:grid-cols-4 gap-4 items-end">
            {/* Mahsulot turi tanlovi (Faqat 1-ombor uchun: Xom-ashyo vs Polufabrikat) */}
            {businessType === 'restaurant' && restaurantTab === 'raw_materials' && (
              <div className="col-span-2 md:col-span-4 bg-gray-50 dark:bg-gray-800/80 p-3 rounded-xl border border-gray-200 dark:border-gray-700 flex items-center gap-4">
                <span className="text-xs font-bold text-gray-600 dark:text-gray-400 uppercase tracking-wider">Turi:</span>
                <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-gray-800 dark:text-gray-200 select-none">
                  <input
                    type="radio"
                    name="type"
                    value="raw_material"
                    checked={formData.type !== 'semi_finished'}
                    onChange={() => setFormData(prev => ({ ...prev, type: 'raw_material' }))}
                    className="w-4 h-4 text-blue-600 cursor-pointer"
                  />
                  <span>🥩 Oddiy Xom-ashyo / Masalliq</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-purple-700 dark:text-purple-400 select-none">
                  <input
                    type="radio"
                    name="type"
                    value="semi_finished"
                    checked={formData.type === 'semi_finished'}
                    onChange={() => setFormData(prev => ({ ...prev, type: 'semi_finished' }))}
                    className="w-4 h-4 text-purple-600 cursor-pointer"
                  />
                  <span>👨‍🍳 Yarim Tayyor Mahsulot (Polufabrikat)</span>
                </label>
              </div>
            )}

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
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">
                  {lang === 'uz' ? 'Kategoriya' : 'Категория'} <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <input
                    required={businessType === 'restaurant'}
                    name="category"
                    list="restaurant-category-list"
                    value={formData.category}
                    onChange={handleInputChange}
                    type="text" 
                    placeholder={restaurantTab === 'raw_materials' ? "Masalan: Sabzavotlar, Go'shtlar..." : "Masalan: Salatlar, Milliy taomlar, Ichimliklar..."} 
                    className={inputCls}
                  />
                  <datalist id="restaurant-category-list">
                    {(restaurantTab === 'raw_materials' ? RESTAURANT_RAW_CATEGORIES : RESTAURANT_DISH_CATEGORIES).map(c => (
                      <option key={c} value={c} />
                    ))}
                  </datalist>
                </div>

                {/* Quick selection pills */}
                <div className="flex gap-1.5 overflow-x-auto pb-1 custom-scrollbar pt-1">
                  {(restaurantTab === 'raw_materials' ? RESTAURANT_RAW_CATEGORIES : RESTAURANT_DISH_CATEGORIES).map(catName => (
                    <button
                      key={catName}
                      type="button"
                      onClick={() => setFormData(prev => ({ ...prev, category: catName }))}
                      className={`text-[11px] font-bold px-2 py-0.5 rounded-lg border transition-all cursor-pointer whitespace-nowrap ${
                        formData.category === catName
                          ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                          : 'bg-gray-100 dark:bg-gray-700/60 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-600 hover:bg-gray-200 dark:hover:bg-gray-600'
                      }`}
                    >
                      {catName}
                    </button>
                  ))}
                </div>
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

            {/* Sotish narxi */}
            {businessType === 'restaurant' && restaurantTab === 'raw_materials' ? (
              <div>
                <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-1.5">
                  Sotish narxi <span className="text-[10px] text-blue-600 dark:text-blue-400 font-normal lowercase">(ixtiyoriy, agar mijozlarga to'g'ridan-to'g'ri sotilsa)</span>
                </label>
                <input
                  name="sell_price"
                  value={formData.sell_price}
                  onChange={handleInputChange}
                  type="text"
                  inputMode="decimal"
                  placeholder="0 (faqat sotilsa kiriting)"
                  className={inputCls}
                />
              </div>
            ) : (
              <div>
                <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-1.5">
                  {t('sellPrice')} <span className="text-red-500">*</span>
                </label>
                <input
                  required
                  name="sell_price"
                  value={formData.sell_price}
                  onChange={handleInputChange}
                  type="text"
                  inputMode="decimal"
                  placeholder="0"
                  className={inputCls}
                />
              </div>
            )}

            {/* Qoldiq / Kirim miqdori */}
            {!(businessType === 'restaurant' && restaurantTab === 'dishes' && dishMode === 'recipe') && (
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">
                    {(existingProductId || editingId) ? "Kirim miqdori" : (restaurantTab === 'raw_materials' ? "Ombordagi qoldiq" : t('quantity'))} {!formData.is_unlimited && <span className="text-red-500">*</span>}
                  </label>
                  
                  {/* Cheksiz miqdor tanlovi (faqat 2-ombor donabay mahsulotlar uchun) */}
                  {businessType === 'restaurant' && restaurantTab === 'dishes' && dishMode === 'piece' && (
                    <label className="flex items-center gap-1.5 cursor-pointer text-xs font-bold text-blue-600 dark:text-blue-400 select-none">
                      <input
                        type="checkbox"
                        name="is_unlimited"
                        checked={!!formData.is_unlimited}
                        onChange={e => setFormData(prev => ({ ...prev, is_unlimited: e.target.checked }))}
                        className="w-3.5 h-3.5 rounded text-blue-600 cursor-pointer"
                      />
                      <span>∞ Cheksiz miqdor</span>
                    </label>
                  )}
                </div>

                <input
                  ref={stockInputRef}
                  required={!formData.is_unlimited}
                  disabled={!!formData.is_unlimited}
                  name="stock"
                  value={formData.is_unlimited ? '' : formData.stock}
                  onChange={handleInputChange}
                  type="number"
                  step="0.001"
                  min="0"
                  placeholder={formData.is_unlimited ? "∞ Cheksiz miqdor (ombor tannarxiga hisoblanmaydi)" : "0"}
                  className={`${inputCls} ${formData.is_unlimited ? 'opacity-60 bg-gray-100 dark:bg-gray-800' : ''}`}
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

            {/* ── Retsept / Masalliqlar tarkibi (2-ombor taomlar hamda 1-ombordagi polufabrikatlar uchun) ── */}
            {businessType === 'restaurant' && ((restaurantTab === 'dishes' && dishMode === 'recipe') || (restaurantTab === 'raw_materials' && formData.type === 'semi_finished')) && (
              <div className="col-span-2 md:col-span-4 bg-gradient-to-br from-amber-50/50 to-orange-50/50 dark:from-gray-800/80 dark:to-gray-800/40 p-5 rounded-2xl border border-amber-200/80 dark:border-amber-900/40 mt-3 shadow-inner">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-sm font-bold text-amber-900 dark:text-amber-300 flex items-center gap-2">
                    🍳 {formData.type === 'semi_finished' ? 'Yarim Tayyor Mahsulot (Polufabrikat) Retsepti / Kalkulyatsiyasi' : '1-Ombordagi Masalliqlardan Taom Retseptini Tuzish'}
                  </h4>
                  <span className="text-xs font-bold text-amber-800 dark:text-amber-400">
                    Hisoblangan Tannarx: <span className="text-base text-gray-900 dark:text-white font-extrabold">{formatCurrency(projectedCostPrice, lang)}</span>
                  </span>
                </div>
                
                {recipeIngredients.length > 0 ? (
                  <div className="space-y-2.5 mb-4">
                    {recipeIngredients.map((ing) => {
                      const wastePct = parseFloat(ing.waste_percentage) || 0;
                      const effectiveQty = (parseFloat(ing.quantity) || 0) * (1 + wastePct / 100);
                      const rawProd = globalProducts.find(p => p.id === ing.ingredient_product_id);
                      const itemBuyPrice = rawProd ? (parseFloat(rawProd.buy_price) || 0) : 0;
                      const itemCost = itemBuyPrice * effectiveQty;

                      return (
                        <div key={ing.ingredient_product_id} className="flex flex-col sm:flex-row sm:items-center justify-between bg-white dark:bg-gray-800 px-3.5 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 text-sm shadow-sm gap-2">
                          <div className="flex items-center gap-2">
                            <Package size={15} className="text-amber-600 shrink-0" />
                            <div>
                              <span className="font-bold text-gray-800 dark:text-gray-200">
                                {ing.name}
                              </span>
                              <span className="text-[11px] text-gray-500 dark:text-gray-400 block">
                                Brutto sarf: {effectiveQty.toFixed(3)} {ing.unit} (tannarx: {formatCurrency(itemCost, lang)})
                              </span>
                            </div>
                          </div>

                          <div className="flex items-center gap-2.5">
                            {/* Quantity input */}
                            <div className="flex items-center gap-1 bg-gray-50 dark:bg-gray-700/60 px-2 py-1 rounded-lg border border-gray-200 dark:border-gray-600">
                              <span className="text-[10px] font-bold text-gray-500 uppercase">Miqdor:</span>
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
                                className="w-16 px-1 text-center font-bold bg-transparent text-gray-900 dark:text-gray-100 focus:outline-none text-xs"
                              />
                              <span className="text-gray-500 font-semibold text-xs">{ing.unit}</span>
                            </div>

                            {/* Waste percentage input (Phase 4) */}
                            <div className="flex items-center gap-1 bg-amber-50 dark:bg-amber-950/40 px-2 py-1 rounded-lg border border-amber-200 dark:border-amber-900/60">
                              <span className="text-[10px] font-bold text-amber-700 dark:text-amber-400 uppercase">Chiqit %:</span>
                              <input
                                type="number"
                                step="1"
                                min="0"
                                max="100"
                                value={ing.waste_percentage !== undefined ? ing.waste_percentage : ''}
                                onChange={(e) => {
                                  const newWaste = parseFloat(e.target.value) || 0;
                                  setRecipeIngredients(prev => prev.map(item =>
                                    item.ingredient_product_id === ing.ingredient_product_id
                                      ? { ...item, waste_percentage: newWaste }
                                      : item
                                  ));
                                }}
                                placeholder="0"
                                className="w-12 px-1 text-center font-bold bg-transparent text-amber-900 dark:text-amber-300 focus:outline-none text-xs"
                              />
                              <span className="text-amber-700 dark:text-amber-400 font-bold text-xs">%</span>
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
                      );
                    })}
                    
                    <div className="text-xs text-amber-700 dark:text-amber-400 bg-amber-100/60 dark:bg-amber-950/40 p-2.5 rounded-xl border border-amber-300 dark:border-amber-900/60 mt-2 font-medium">
                      💡 <b>Eslatma:</b> Chiqit/Yo'qotish foizi (%) xom-ashyoni tozalashdagi po'stloq yoki pishirishdagi kamayishni hisobga oladi (Brutto = Netto × (1 + Chiqit%)).
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-amber-800/80 dark:text-amber-400/80 mb-4 italic">
                    Hozircha xom-ashyolar tanlanmagan. Quyidagi ro'yxatdan masalliqni tanlang va miqdorini kiritib qo'shing.
                  </p>
                )}
                
                {/* Add ingredient row */}
                <div className="flex flex-col sm:flex-row gap-3 items-end bg-white dark:bg-gray-800 p-3.5 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm">
                  <div className="flex-1 w-full">
                    <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-1">
                      Xom-ashyo yoki Polufabrikatni tanlang
                    </label>
                    <select
                      value={selectedIngId}
                      onChange={(e) => setSelectedIngId(e.target.value)}
                      className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none cursor-pointer"
                    >
                      <option value="">-- Masalliqni tanlang --</option>
                      {rawMaterials
                        .filter(rm => rm.id !== editingId)
                        .map(rm => (
                          <option key={rm.id} value={rm.id}>
                            {rm.type === 'semi_finished' ? '👨‍🍳 [Polufabrikat] ' : ''}{rm.name} (Qoldiq: {rm.stock} {rm.unit || 'dona'}) - {formatCurrency(rm.buy_price, lang)}
                          </option>
                        ))}
                    </select>
                  </div>
                  
                  <div className="w-full sm:w-28">
                    <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-1">
                      Miqdor (Netto)
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

                  <div className="w-full sm:w-24">
                    <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-1">
                      Chiqit (%)
                    </label>
                    <input
                      type="number"
                      step="1"
                      min="0"
                      max="100"
                      value={ingWastePct}
                      onChange={(e) => setIngWastePct(e.target.value)}
                      placeholder="0%"
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

            {/* Mahsulot rasmi bloki */}
            <div className="col-span-2 md:col-span-4 bg-gray-50/80 dark:bg-gray-800/60 p-4 rounded-2xl border border-gray-200 dark:border-gray-700/80 mt-1">
              <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-2">
                Mahsulot rasmi <span className="text-gray-400 font-normal normal-case">(Ctrl+V orqali nusxalab qo'yish mumkin)</span>
              </label>
              <div className="flex flex-col sm:flex-row items-center gap-4">
                {/* Preview 150x150 */}
                <div className="relative w-[150px] h-[150px] rounded-2xl overflow-hidden border-2 border-dashed border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 flex items-center justify-center shrink-0 shadow-inner group">
                  {formData.image ? (
                    <>
                      <img
                        src={getProductImageUrl(formData.image)}
                        alt="Preview"
                        className="w-full h-full object-cover"
                      />
                      <button
                        type="button"
                        onClick={handleRemoveImage}
                        className="absolute top-2 right-2 bg-red-600 hover:bg-red-700 text-white p-1.5 rounded-full shadow-lg transition-transform hover:scale-110 cursor-pointer"
                        title="Rasmni o'chirish"
                      >
                        <X size={14} />
                      </button>
                    </>
                  ) : (
                    <div className="flex flex-col items-center justify-center p-3 text-center text-gray-400 dark:text-gray-500">
                      <ImageIcon size={36} className="mb-1 opacity-50" />
                      <span className="text-[11px] font-semibold">Rasm yo'q</span>
                      <span className="text-[9px] text-gray-400 mt-0.5">150 × 150 px</span>
                    </div>
                  )}
                  {uploadingImage && (
                    <div className="absolute inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center">
                      <span className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    </div>
                  )}
                </div>

                {/* Buttons & Info */}
                <div className="flex-1 space-y-2 text-center sm:text-left">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleImageFileChange}
                    className="hidden"
                  />
                  <div className="flex items-center gap-2 flex-wrap justify-center sm:justify-start">
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploadingImage}
                      className="flex items-center gap-1.5 bg-blue-50 hover:bg-blue-100 dark:bg-blue-900/30 dark:hover:bg-blue-900/50 text-blue-600 dark:text-blue-400 font-bold px-4 py-2.5 rounded-xl text-xs border border-blue-200 dark:border-blue-800 transition-all cursor-pointer shadow-sm active:scale-95"
                    >
                      <Upload size={14} />
                      <span>{formData.image ? "Rasmni almashtirish" : "Rasm yuklash"}</span>
                    </button>

                    {formData.image && (
                      <button
                        type="button"
                        onClick={handleRemoveImage}
                        className="flex items-center gap-1 bg-red-50 hover:bg-red-100 dark:bg-red-950/40 text-red-600 dark:text-red-400 font-bold px-3 py-2.5 rounded-xl text-xs border border-red-200 dark:border-red-900/50 transition-all cursor-pointer active:scale-95"
                      >
                        <Trash2 size={13} />
                        <span>O'chirish</span>
                      </button>
                    )}
                  </div>
                  <p className="text-xs text-gray-400 dark:text-gray-500">
                    JPG, PNG yoki WEBP formatdagi rasm. Brauzerdan rasm nusxalab olingan bo'lsa, ushbu sahifada <kbd className="px-1.5 py-0.5 bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded text-[10px] font-mono font-bold">Ctrl+V</kbd> tugmasini bosib to'g'ridan-to'g'ri joylashingiz mumkin.
                  </p>
                </div>
              </div>
            </div>

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
                <th className="py-3 px-4 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">{t('sellPrice')}</th>
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
                    {restaurantTab === 'stop_list' ? (
                      <div className="flex flex-col items-center justify-center gap-2">
                        <Ban size={36} className="mx-auto text-red-400 dark:text-red-500 mb-1 opacity-70" />
                        <p className="font-bold text-gray-700 dark:text-gray-300">Hozirda stop-listda hech qanday mahsulot yo'q.</p>
                        <button
                          type="button"
                          onClick={() => setShowStopListModal(true)}
                          className="mt-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-bold text-xs rounded-xl shadow cursor-pointer transition-all active:scale-95 flex items-center gap-1.5"
                        >
                          <Plus size={15} />
                          <span>Mahsulotlarni Stop-Listga qo'yish & Limitlash</span>
                        </button>
                      </div>
                    ) : (
                      <>
                        <Package size={36} className="mx-auto text-gray-300 dark:text-gray-600 mb-2 opacity-60" />
                        {t('noProductsFound')}
                      </>
                    )}
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
                        <td className="py-3 px-4 text-sm font-medium text-gray-900 dark:text-gray-100">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl overflow-hidden bg-gray-100 dark:bg-gray-700/80 shrink-0 border border-gray-200 dark:border-gray-600 flex items-center justify-center shadow-xs">
                              {product.image ? (
                                <img
                                  src={getProductImageUrl(product.image)}
                                  alt=""
                                  className="w-full h-full object-cover"
                                  onError={(e) => { e.target.style.display = 'none'; }}
                                />
                              ) : (
                                <span className="text-xs font-black text-gray-400 dark:text-gray-500 uppercase">
                                  {product.name ? product.name.charAt(0) : '?'}
                                </span>
                              )}
                            </div>
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
                          </div>
                        </td>

                        {/* Turi / Ombor */}
                        {businessType === 'restaurant' && (
                          <td className="py-3.5 px-4 text-sm">
                            <span className={`inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full font-bold ${
                              product.type === 'raw_material'
                                ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300'
                                : product.type === 'semi_finished'
                                ? 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300'
                                : 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300'
                            }`}>
                              {product.type === 'raw_material' ? '🥩 Xom-ashyo' : product.type === 'semi_finished' ? '👨‍🍳 Polufabrikat' : '🍽️ 2-Ombor (Taom/Tovar)'}
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
                        <td className="py-3.5 px-4 text-sm font-bold text-gray-900 dark:text-white">
                          {product.sell_price > 0 ? formatCurrency(product.sell_price, lang) : (
                            <span className="text-gray-300 dark:text-gray-600 font-normal">—</span>
                          )}
                        </td>

                        {/* Qoldiq */}
                        <td className="py-3.5 px-4 text-sm">
                          {product.is_unlimited === 1 ? (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300">
                              ∞ Cheksiz
                            </span>
                          ) : product.has_recipe === 1 ? (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300">
                              <ChefHat size={11} />
                              {product.recipe_available_portions ?? 0} porsiya
                            </span>
                          ) : product.stop_limit !== null && product.stop_limit !== undefined ? (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300">
                              Limit: {product.stop_limit} {unitLabel}
                            </span>
                          ) : (
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
                          )}
                        </td>

                        {/* Stop-List Switch & Limit */}
                        <td className="py-3.5 px-4 text-center">
                          <div className="flex flex-col items-center gap-1">
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

                            {/* Limit info & quick action for non-recipe dishes */}
                            {product.type !== 'raw_material' && product.has_recipe !== 1 && (
                              product.stop_limit !== null && product.stop_limit !== undefined ? (
                                <div className="flex items-center gap-1 mt-0.5">
                                  <span className="text-[10px] font-black text-purple-700 dark:text-purple-300 bg-purple-100 dark:bg-purple-900/40 px-1.5 py-0.5 rounded">
                                    Limit: {product.stop_limit} {unitLabel}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={(e) => handleQuickClearLimit(product, e)}
                                    className="text-[10px] font-black text-red-500 hover:text-red-700 hover:underline cursor-pointer"
                                    title="Limitni bekor qilish"
                                  >
                                    ✕
                                  </button>
                                </div>
                              ) : (
                                <button
                                  type="button"
                                  onClick={(e) => handleOpenLimitPrompt(product, e)}
                                  className="text-[10px] font-bold text-amber-600 dark:text-amber-400 hover:text-amber-700 bg-amber-50 dark:bg-amber-950/40 hover:bg-amber-100 dark:hover:bg-amber-900/50 border border-amber-200 dark:border-amber-800 px-2 py-0.5 rounded mt-0.5 cursor-pointer transition-colors"
                                  title="Qoldiq limitini kiritish"
                                >
                                  + Limit
                                </button>
                              )
                            )}
                          </div>
                        </td>

                        {/* Actions */}
                        <td className="py-3.5 px-4 text-right">
                          <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            {restaurantTab === 'stop_list' ? (
                              <div className="flex items-center gap-1.5">
                                {product.stop_limit !== null && product.stop_limit !== undefined && (
                                  <button
                                    onClick={(e) => handleQuickClearLimit(product, e)}
                                    title="Limitni bekor qilish"
                                    className="px-2 py-1 bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold rounded-lg transition-colors cursor-pointer"
                                  >
                                    Limitni tozalash
                                  </button>
                                )}
                                <button
                                  onClick={(e) => handleToggleStop(product, e)}
                                  title="Stopdan chiqarish"
                                  className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg transition-colors flex items-center gap-1 cursor-pointer shadow-sm"
                                >
                                  <Play size={12} /> Stopdan chiqarish
                                </button>
                              </div>
                            ) : (
                              <>
                                {product.type === 'semi_finished' && (
                                  <button
                                    type="button"
                                    onClick={() => handleOpenProduceModal(product)}
                                    title="Polufabrikat tayyorlash (Ishlab chiqarish)"
                                    className="px-2 py-1 text-xs font-bold text-white bg-purple-600 hover:bg-purple-700 rounded-lg shadow-sm transition-all flex items-center gap-1 cursor-pointer active:scale-95 mr-1"
                                  >
                                    <ChefHat size={13} />
                                    <span>Tayyorlash</span>
                                  </button>
                                )}
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

      {/* ── Spisanie Modal ── */}
      {showWriteOffModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col border border-gray-100 dark:border-gray-700 animate-in zoom-in-95 duration-200">
            <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between bg-purple-50/50 dark:bg-purple-950/20">
              <h3 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <Trash2 className="text-purple-600 dark:text-purple-400" size={20} />
                Spisanie — Ombordan hisobdan chiqarish
              </h3>
              <button onClick={() => setShowWriteOffModal(false)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSaveWriteOff} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1.5 uppercase tracking-wider">
                  Mahsulot / Xom-ashyo <span className="text-red-500">*</span>
                </label>
                <select
                  required
                  value={writeOffForm.productId}
                  onChange={(e) => setWriteOffForm({ ...writeOffForm, productId: e.target.value })}
                  className="w-full bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600 rounded-xl px-3.5 py-2.5 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                >
                  <option value="">-- Mahsulotni tanlang --</option>
                  {globalProducts.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.stock} {p.unit || 'dona'} qolgan)
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1.5 uppercase tracking-wider">
                  Chiqariladigan Miqdor <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  step="any"
                  min="0.001"
                  required
                  placeholder="0.00"
                  value={writeOffForm.quantity}
                  onChange={(e) => setWriteOffForm({ ...writeOffForm, quantity: e.target.value })}
                  className="w-full bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600 rounded-xl px-3.5 py-2.5 text-sm font-bold text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1.5 uppercase tracking-wider">
                  Chiqarish Sababi <span className="text-red-500">*</span>
                </label>
                <select
                  value={writeOffForm.reason}
                  onChange={(e) => setWriteOffForm({ ...writeOffForm, reason: e.target.value })}
                  className="w-full bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600 rounded-xl px-3.5 py-2.5 text-sm font-semibold text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                >
                  <option value="Brak / Yaroqsiz">Brak / Yaroqsiz (Buzilgan/Chiqit)</option>
                  <option value="Xodimlar tushligi">Xodimlar tushligi (Питание)</option>
                  <option value="Siylov / Mehmon">Siylov / Mehmon uchun (Угощение)</option>
                  <option value="Boshqa">Boshqa sabab</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1.5 uppercase tracking-wider">
                  Izoh / Qo'shimcha ma'lumot
                </label>
                <input
                  type="text"
                  placeholder="Masalan: Muddati o'tgan, singan..."
                  value={writeOffForm.note}
                  onChange={(e) => setWriteOffForm({ ...writeOffForm, note: e.target.value })}
                  className="w-full bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600 rounded-xl px-3.5 py-2.5 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>

              <div className="pt-2 flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowWriteOffModal(false)}
                  className="flex-1 py-2.5 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 rounded-xl font-bold text-sm transition-all"
                >
                  Bekor qilish
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 py-2.5 bg-purple-600 hover:bg-purple-700 text-white rounded-xl font-bold text-sm shadow-md shadow-purple-600/30 transition-all active:scale-95 disabled:opacity-50"
                >
                  {loading ? 'Saqlanmoqda...' : 'Hisobdan chiqarish'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Spisanie History Modal ── */}
      {showWriteOffHistory && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-3xl overflow-hidden flex flex-col border border-gray-100 dark:border-gray-700 max-h-[85vh] animate-in zoom-in-95 duration-200">
            <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between bg-purple-50/50 dark:bg-purple-950/20">
              <h3 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <ClipboardCheck className="text-purple-600 dark:text-purple-400" size={20} />
                Hisobdan chiqarilgan tovarlar tarixi (Spisaniya)
              </h3>
              <button onClick={() => setShowWriteOffHistory(false)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
                <X size={20} />
              </button>
            </div>

            <div className="p-6 overflow-y-auto flex-1 custom-scrollbar">
              {writeOffHistory.length === 0 ? (
                <div className="text-center py-12 text-gray-400 font-medium">
                  Hozircha hisobdan chiqarilgan mahsulotlar mavjud emas.
                </div>
              ) : (
                <table className="w-full text-left text-sm text-gray-500 dark:text-gray-400">
                  <thead className="bg-gray-50 dark:bg-gray-700 text-xs uppercase font-bold text-gray-700 dark:text-gray-300 sticky top-0">
                    <tr>
                      <th className="px-4 py-3 rounded-l-lg">Sana / Vaqt</th>
                      <th className="px-4 py-3">Mahsulot</th>
                      <th className="px-4 py-3 text-center">Miqdor</th>
                      <th className="px-4 py-3">Sabab</th>
                      <th className="px-4 py-3 text-right">Zarar summasi</th>
                      <th className="px-4 py-3 rounded-r-lg">Mas'ul</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                    {writeOffHistory.map(w => (
                      <tr key={w.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/40 transition-colors">
                        <td className="px-4 py-3 whitespace-nowrap text-xs text-gray-600 dark:text-gray-400">
                          {parseSQLiteDate(w.created_at).toLocaleString('ru-RU', { timeZone: 'Asia/Tashkent' })}
                        </td>
                        <td className="px-4 py-3 font-semibold text-gray-900 dark:text-white">
                          {w.product_name}
                        </td>
                        <td className="px-4 py-3 text-center font-bold text-purple-600 dark:text-purple-400">
                          {w.quantity} {w.unit || 'dona'}
                        </td>
                        <td className="px-4 py-3">
                          <span className="px-2.5 py-1 text-xs font-semibold rounded-full bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300">
                            {w.reason || 'Brak'}
                          </span>
                          {w.note && <p className="text-[11px] text-gray-400 mt-0.5">{w.note}</p>}
                        </td>
                        <td className="px-4 py-3 text-right font-bold text-red-600 dark:text-red-400">
                          {formatCurrency(w.total_loss_amount || 0, lang)}
                        </td>
                        <td className="px-4 py-3 text-xs font-medium text-gray-600 dark:text-gray-400">
                          {w.user_name || 'Admin'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Suppliers Modal ── */}
      {showSuppliersModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-3xl overflow-hidden flex flex-col border border-gray-100 dark:border-gray-700 max-h-[85vh] animate-in zoom-in-95 duration-200">
            <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between bg-teal-50/50 dark:bg-teal-950/20">
              <h3 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <Truck className="text-teal-600 dark:text-teal-400" size={20} />
                Yetkazib Beruvchilar (Postavshiklar) Boshqaruvi
              </h3>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    setSupplierForm({ id: null, name: '', phone: '', company: '', note: '' });
                    setShowAddSupplierForm(prev => !prev);
                  }}
                  className="px-3 py-1.5 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1 cursor-pointer"
                >
                  <UserPlus size={15} />
                  <span>{showAddSupplierForm ? 'Yopish' : 'Yangi Postavshik'}</span>
                </button>
                <button onClick={() => setShowSuppliersModal(false)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
                  <X size={20} />
                </button>
              </div>
            </div>

            {/* Inline Add/Edit Supplier Form */}
            {showAddSupplierForm && (
              <form onSubmit={handleSaveSupplier} className="p-4 bg-teal-50/40 dark:bg-teal-950/20 border-b border-teal-100 dark:border-teal-900/40 grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
                <div>
                  <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">Ismi / Mas'ul shaxs <span className="text-red-500">*</span></label>
                  <input
                    type="text"
                    required
                    placeholder="Masalan: Alisher aka"
                    value={supplierForm.name}
                    onChange={(e) => setSupplierForm({ ...supplierForm, name: e.target.value })}
                    className="w-full bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-1.5 text-xs text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-teal-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">Telefon</label>
                  <input
                    type="text"
                    placeholder="+998 90 123 45 67"
                    value={supplierForm.phone}
                    onChange={(e) => setSupplierForm({ ...supplierForm, phone: e.target.value })}
                    className="w-full bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-1.5 text-xs text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-teal-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">Kompaniya / Firma</label>
                  <input
                    type="text"
                    placeholder="Masalan: Elita Go'sht MCHJ"
                    value={supplierForm.company}
                    onChange={(e) => setSupplierForm({ ...supplierForm, company: e.target.value })}
                    className="w-full bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-1.5 text-xs text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-teal-500"
                  />
                </div>
                <div>
                  <button
                    type="submit"
                    className="w-full py-1.5 bg-teal-600 hover:bg-teal-700 text-white rounded-lg text-xs font-bold transition-all shadow-sm"
                  >
                    {supplierForm.id ? 'Tahrirni saqlash' : 'Qo\'shish'}
                  </button>
                </div>
              </form>
            )}

            {/* Suppliers List */}
            <div className="p-6 overflow-y-auto flex-1 custom-scrollbar">
              {suppliersList.length === 0 ? (
                <div className="text-center py-12 text-gray-400 font-medium">
                  Hozircha yetkazib beruvchilar kiritilmagan.
                </div>
              ) : (
                <table className="w-full text-left text-sm text-gray-500 dark:text-gray-400">
                  <thead className="bg-gray-50 dark:bg-gray-700 text-xs uppercase font-bold text-gray-700 dark:text-gray-300 sticky top-0">
                    <tr>
                      <th className="px-4 py-3 rounded-l-lg">Postavshik</th>
                      <th className="px-4 py-3">Firma / Telefon</th>
                      <th className="px-4 py-3 text-right">Balans (Qarzimiz)</th>
                      <th className="px-4 py-3 rounded-r-lg text-right">Amallar</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                    {suppliersList.map(s => (
                      <tr key={s.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/40 transition-colors">
                        <td className="px-4 py-3 font-semibold text-gray-900 dark:text-white">
                          {s.name}
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-600 dark:text-gray-400">
                          {s.company ? <span className="font-bold block">{s.company}</span> : null}
                          {s.phone || '-'}
                        </td>
                        <td className="px-4 py-3 text-right font-black">
                          {s.balance > 0 ? (
                            <span className="text-red-600 dark:text-red-400 font-bold">
                              {formatCurrency(s.balance, lang)} qarz
                            </span>
                          ) : (
                            <span className="text-emerald-600 dark:text-emerald-400 font-bold">
                              0 (Qarz yo'q)
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right space-x-2">
                          {s.balance > 0 && (
                            <button
                              onClick={() => setPayDebtModal({ isOpen: true, supplier: s, amount: '', paymentMethod: 'cash', note: '' })}
                              className="px-2.5 py-1 bg-red-50 hover:bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400 text-xs font-bold rounded-lg transition-all"
                            >
                              Qarzni uzish
                            </button>
                          )}
                          <button
                            onClick={() => {
                              setSupplierForm(s);
                              setShowAddSupplierForm(true);
                            }}
                            className="p-1 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded-md"
                          >
                            <Edit size={16} />
                          </button>
                          <button
                            onClick={() => handleDeleteSupplier(s.id)}
                            className="p-1 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-md"
                          >
                            <Trash2 size={16} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Supplier Invoice Modal (Kirim Fakturasi / Prikhod) ── */}
      {showInvoiceModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-4xl overflow-hidden flex flex-col border border-gray-100 dark:border-gray-700 max-h-[90vh] animate-in zoom-in-95 duration-200">
            <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between bg-emerald-50/50 dark:bg-emerald-950/20">
              <h3 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <FileText className="text-emerald-600 dark:text-emerald-400" size={20} />
                Prikhodnaya Nakladnaya — Omborga Kirim Fakturasi
              </h3>
              <button onClick={() => setShowInvoiceModal(false)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSaveSupplierInvoice} className="p-6 overflow-y-auto flex-1 custom-scrollbar space-y-4">
              {/* Header Info: Supplier & Payment Method */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-emerald-50/30 dark:bg-emerald-950/10 p-4 rounded-xl border border-emerald-100 dark:border-emerald-900/30">
                <div>
                  <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1.5 uppercase tracking-wider">
                    Yetkazib Beruvchi (Postavshik)
                  </label>
                  <select
                    value={invoiceForm.supplierId}
                    onChange={(e) => setInvoiceForm({ ...invoiceForm, supplierId: e.target.value })}
                    className="w-full bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    <option value="">-- Noma'lum / Naqd xarid --</option>
                    {suppliersList.map(s => (
                      <option key={s.id} value={s.id}>
                        {s.name} {s.company ? `(${s.company})` : ''}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1.5 uppercase tracking-wider">
                    To'lov turi
                  </label>
                  <select
                    value={invoiceForm.paymentMethod}
                    onChange={(e) => setInvoiceForm({ ...invoiceForm, paymentMethod: e.target.value })}
                    className="w-full bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500 font-semibold"
                  >
                    <option value="cash">Naqd to'lov</option>
                    <option value="card">Plastik karta / Prazichisleniye</option>
                    <option value="debt">Nasiya (To'liq qarzga)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1.5 uppercase tracking-wider">
                    Izoh / Nakladnaya No
                  </label>
                  <input
                    type="text"
                    placeholder="Masalan: Nakladnaya #1042"
                    value={invoiceForm.note}
                    onChange={(e) => setInvoiceForm({ ...invoiceForm, note: e.target.value })}
                    className="w-full bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>

              {/* Add Product Item Row */}
              <div className="p-4 bg-gray-50 dark:bg-gray-700/40 rounded-xl border border-gray-200 dark:border-gray-600 space-y-2">
                <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                  Fakturaga mahsulot yoki xom-ashyo qo'shish:
                </label>
                <div className="grid grid-cols-1 md:grid-cols-12 gap-2 items-end">
                  <div className="md:col-span-5">
                    <select
                      value={invoiceIngId}
                      onChange={(e) => {
                        const val = e.target.value;
                        setInvoiceIngId(val);
                        const prod = globalProducts.find(p => p.id === Number(val));
                        if (prod) setInvoiceIngPrice(String(prod.buy_price || ''));
                      }}
                      className="w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-xl px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    >
                      <option value="">-- Mahsulot tanlang --</option>
                      {globalProducts.map(p => (
                        <option key={p.id} value={p.id}>
                          {p.name} ({p.stock} {p.unit || 'dona'})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="md:col-span-3">
                    <input
                      type="number"
                      step="any"
                      min="0.001"
                      placeholder="Miqdor"
                      value={invoiceIngQty}
                      onChange={(e) => setInvoiceIngQty(e.target.value)}
                      className="w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-xl px-3 py-2 text-sm font-bold text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                  <div className="md:col-span-3">
                    <input
                      type="number"
                      step="any"
                      min="0"
                      placeholder="Olish narxi (so'm)"
                      value={invoiceIngPrice}
                      onChange={(e) => setInvoiceIngPrice(e.target.value)}
                      className="w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-xl px-3 py-2 text-sm font-bold text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                  <div className="md:col-span-1">
                    <button
                      type="button"
                      onClick={handleAddInvoiceItem}
                      className="w-full py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-sm transition-all flex items-center justify-center cursor-pointer shadow-sm"
                    >
                      <Plus size={18} />
                    </button>
                  </div>
                </div>
              </div>

              {/* Invoice Items Table */}
              <div className="border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
                <table className="w-full text-left text-sm text-gray-500 dark:text-gray-400">
                  <thead className="bg-gray-100 dark:bg-gray-700/80 text-xs uppercase font-bold text-gray-700 dark:text-gray-300">
                    <tr>
                      <th className="px-4 py-2.5">Mahsulot nomi</th>
                      <th className="px-4 py-2.5 text-center">Kirim miqdori</th>
                      <th className="px-4 py-2.5 text-right">Olish narxi</th>
                      <th className="px-4 py-2.5 text-right">Jami сумма</th>
                      <th className="px-4 py-2.5 text-center">O'chirish</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                    {invoiceItems.length === 0 ? (
                      <tr>
                        <td colSpan="5" className="text-center py-8 text-gray-400">
                          Fakturaga mahsulotlar qo'shilmadi.
                        </td>
                      </tr>
                    ) : (
                      invoiceItems.map(item => (
                        <tr key={item.product_id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30">
                          <td className="px-4 py-2.5 font-semibold text-gray-900 dark:text-white">{item.product_name}</td>
                          <td className="px-4 py-2.5 text-center font-bold text-emerald-600 dark:text-emerald-400">
                            {item.quantity} {item.unit}
                          </td>
                          <td className="px-4 py-2.5 text-right font-medium">{formatCurrency(item.buy_price, lang)}</td>
                          <td className="px-4 py-2.5 text-right font-bold text-gray-900 dark:text-white">
                            {formatCurrency(Math.round(item.quantity * item.buy_price), lang)}
                          </td>
                          <td className="px-4 py-2.5 text-center">
                            <button
                              type="button"
                              onClick={() => handleRemoveInvoiceItem(item.product_id)}
                              className="text-red-500 hover:text-red-700 p-1 rounded-md"
                            >
                              <X size={16} />
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {/* Invoice Summary & Debt Calculations */}
              {invoiceItems.length > 0 && (() => {
                const invoiceTotal = invoiceItems.reduce((sum, i) => sum + Math.round(i.quantity * i.buy_price), 0);
                const paid = parseFloat(invoiceForm.paidAmount) || 0;
                const debt = Math.max(0, invoiceTotal - paid);

                return (
                  <div className="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-xl border border-gray-200 dark:border-gray-600 flex flex-col md:flex-row items-center justify-between gap-4">
                    <div className="flex items-center gap-6">
                      <div>
                        <span className="text-xs font-semibold text-gray-500 uppercase block">Faktura Summasi:</span>
                        <span className="text-xl font-black text-gray-900 dark:text-white">
                          {formatCurrency(invoiceTotal, lang)}
                        </span>
                      </div>
                      <div>
                        <span className="text-xs font-semibold text-gray-500 uppercase block">Qarzga qoladi:</span>
                        <span className={`text-xl font-black ${debt > 0 ? 'text-red-600 dark:text-red-400' : 'text-emerald-600'}`}>
                          {formatCurrency(debt, lang)}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 w-full md:w-auto">
                      <div className="flex-1 md:w-48">
                        <label className="block text-[11px] font-bold text-gray-600 dark:text-gray-300 mb-1">To'langan summa:</label>
                        <input
                          type="number"
                          step="any"
                          min="0"
                          placeholder="0.00"
                          value={invoiceForm.paidAmount}
                          onChange={(e) => setInvoiceForm({ ...invoiceForm, paidAmount: e.target.value })}
                          className="w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-xl px-3 py-1.5 text-sm font-bold text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                        />
                      </div>

                      <button
                        type="submit"
                        disabled={loading}
                        className="py-2.5 px-6 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm rounded-xl shadow-md transition-all active:scale-95 disabled:opacity-50 shrink-0"
                      >
                        {loading ? 'Saqlanmoqda...' : 'Fakturanisaqlash'}
                      </button>
                    </div>
                  </div>
                );
              })()}
            </form>
          </div>
        </div>
      )}

      {/* ── Pay Supplier Debt Modal ── */}
      {payDebtModal.isOpen && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden flex flex-col border border-gray-100 dark:border-gray-700 animate-in zoom-in-95 duration-200">
            <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between bg-red-50/50 dark:bg-red-950/20">
              <h3 className="text-base font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <DollarSign className="text-red-500" size={20} />
                Yetkazib beruvchiga qarzni uzish
              </h3>
              <button onClick={() => setPayDebtModal({ isOpen: false, supplier: null, amount: '', paymentMethod: 'cash', note: '' })} className="text-gray-400 hover:text-gray-600">
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handlePaySupplierDebtSubmit} className="p-6 space-y-4">
              <div>
                <p className="text-xs text-gray-500 uppercase font-semibold">Postavshik:</p>
                <p className="text-base font-bold text-gray-900 dark:text-white">{payDebtModal.supplier?.name}</p>
                <p className="text-xs text-red-600 font-bold mt-0.5">
                  Mavjud qarz: {formatCurrency(payDebtModal.supplier?.balance || 0, lang)}
                </p>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1.5 uppercase tracking-wider">
                  To'lanadigan Summa (so'm) <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  step="any"
                  min="1"
                  required
                  placeholder="0"
                  value={payDebtModal.amount}
                  onChange={(e) => setPayDebtModal({ ...payDebtModal, amount: e.target.value })}
                  className="w-full bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600 rounded-xl px-3.5 py-2.5 text-sm font-bold text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-red-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1.5 uppercase tracking-wider">
                  To'lov shakli
                </label>
                <select
                  value={payDebtModal.paymentMethod}
                  onChange={(e) => setPayDebtModal({ ...payDebtModal, paymentMethod: e.target.value })}
                  className="w-full bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600 rounded-xl px-3.5 py-2.5 text-sm font-semibold text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-red-500"
                >
                  <option value="cash">Naqd pul</option>
                  <option value="card">Plastik karta / Perechisleniye</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1.5 uppercase tracking-wider">
                  Izoh
                </label>
                <input
                  type="text"
                  placeholder="Masalan: Karta orqali o'tkazildi"
                  value={payDebtModal.note}
                  onChange={(e) => setPayDebtModal({ ...payDebtModal, note: e.target.value })}
                  className="w-full bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600 rounded-xl px-3.5 py-2.5 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-red-500"
                />
              </div>

              <div className="pt-2 flex gap-3">
                <button
                  type="button"
                  onClick={() => setPayDebtModal({ isOpen: false, supplier: null, amount: '', paymentMethod: 'cash', note: '' })}
                  className="flex-1 py-2.5 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 rounded-xl font-bold text-sm transition-all"
                >
                  Bekor qilish
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-xl font-bold text-sm shadow-md shadow-red-600/30 transition-all active:scale-95"
                >
                  To'lovni saqlash
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <StockTransferModal
        isOpen={showTransferModal}
        onClose={() => setShowTransferModal(false)}
        subWarehouses={subWarehouses}
        transferForm={transferForm}
        setTransferForm={setTransferForm}
        transferItems={transferItems}
        setTransferItems={setTransferItems}
        transferSelectedProductId={transferSelectedProductId}
        setTransferSelectedProductId={setTransferSelectedProductId}
        transferSelectedQty={transferSelectedQty}
        setTransferSelectedQty={setTransferSelectedQty}
        onAddTransferItem={handleAddTransferItem}
        onRemoveTransferItem={handleRemoveTransferItem}
        onSaveTransfer={handleSaveTransfer}
        onFetchHistory={handleFetchTransferHistory}
        products={globalProducts}
        lang={lang}
        loading={loading}
      />
      <StockTransferHistoryModal
        isOpen={showTransferHistory}
        onClose={() => setShowTransferHistory(false)}
        transfers={transferHistoryList}
        lang={lang}
      />
      <ProduceSemiFinishedModal modal={produceModal} setModal={setProduceModal} onConfirm={handleConfirmProduce} lang={lang} />
      <StopListModal isOpen={showStopListModal} onClose={() => setShowStopListModal(false)} />
    </div>
  );
});

/* ── Produce Semi Finished Goods Modal ── */
function ProduceSemiFinishedModal({ modal, setModal, onConfirm, lang }) {
  if (!modal.isOpen || !modal.product) return null;

  const qty = parseFloat(modal.qty) || 0;
  const recipe = modal.recipe || [];

  // Check if all ingredients have enough stock
  let hasStockError = false;
  const evaluatedIngredients = recipe.map(ing => {
    const wastePct = parseFloat(ing.waste_percentage) || 0;
    const effectivePerUnit = (parseFloat(ing.quantity) || 0) * (1 + wastePct / 100);
    const totalRequired = effectivePerUnit * qty;
    const currentStock = ing.stock || 0;
    const isInsufficient = currentStock < totalRequired;
    if (isInsufficient) hasStockError = true;
    return {
      ...ing,
      effectivePerUnit,
      totalRequired,
      currentStock,
      isInsufficient
    };
  });

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-xl border border-gray-200 dark:border-gray-700 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-5 border-b border-gray-150 dark:border-gray-700 flex items-center justify-between bg-gradient-to-r from-purple-900/10 to-indigo-900/10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-purple-100 dark:bg-purple-950/60 text-purple-600 dark:text-purple-300 flex items-center justify-center font-bold">
              <ChefHat size={22} />
            </div>
            <div>
              <h3 className="text-base font-black text-gray-900 dark:text-white">
                Yarim Tayyor Mahsulot Tayyorlash (Ishlab Chiqarish)
              </h3>
              <p className="text-xs text-purple-600 dark:text-purple-400 font-bold">
                {modal.product.name} (Hozirgi qoldiq: {modal.product.stock} {modal.product.unit || 'kg'})
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setModal({ isOpen: false, product: null, qty: '', recipe: [], loading: false, error: null })}
            className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition cursor-pointer"
          >
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={onConfirm} className="p-5 space-y-4 overflow-y-auto custom-scrollbar flex-1">
          {modal.error && (
            <div className="p-3 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 text-red-700 dark:text-red-300 rounded-xl text-xs font-bold flex items-center gap-2">
              <AlertCircle size={16} className="shrink-0" />
              <span>{modal.error}</span>
            </div>
          )}

          {/* Quantity to produce */}
          <div>
            <label className="block text-xs font-extrabold text-gray-700 dark:text-gray-300 uppercase mb-1.5">
              Tayyorlanadigan miqdor ({modal.product.unit || 'kg'}) <span className="text-red-500">*</span>
            </label>
            <input
              type="number"
              step="0.001"
              min="0.001"
              required
              autoFocus
              value={modal.qty}
              onChange={e => setModal(prev => ({ ...prev, qty: e.target.value, error: null }))}
              placeholder="Masalan: 5"
              className="w-full border-2 border-purple-300 dark:border-purple-600 rounded-xl px-4 py-2.5 text-base font-extrabold bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
          </div>

          {/* Recipe Breakdown */}
          <div>
            <h4 className="text-xs font-extrabold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2 flex items-center justify-between">
              <span>Talab qilinadigan Xom-ashyolar (Retsept bo'yicha):</span>
              {qty > 0 && <span className="text-purple-600 dark:text-purple-400 font-bold">× {qty} {modal.product.unit || 'kg'} uchun</span>}
            </h4>

            {modal.loading ? (
              <div className="py-6 text-center text-gray-400 text-xs animate-pulse font-bold">
                Retsept va qoldiqlar yuklanmoqda...
              </div>
            ) : recipe.length === 0 ? (
              <div className="p-4 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 rounded-xl text-amber-800 dark:text-amber-300 text-xs font-bold">
                ⚠️ Ushbu yarim tayyor mahsulot uchun retsept kiritilmagan! Avval mahsulotni tahrirlab retsept qo'shing.
              </div>
            ) : (
              <div className="space-y-2 max-h-60 overflow-y-auto pr-1 custom-scrollbar">
                {evaluatedIngredients.map(ing => (
                  <div
                    key={ing.ingredient_product_id}
                    className={`p-3 rounded-xl border flex items-center justify-between text-xs transition-colors ${
                      ing.isInsufficient
                        ? 'bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-900/60 text-red-900 dark:text-red-300'
                        : 'bg-gray-50 dark:bg-gray-700/50 border-gray-200 dark:border-gray-600 text-gray-800 dark:text-gray-200'
                    }`}
                  >
                    <div>
                      <span className="font-extrabold block text-sm">{ing.name}</span>
                      <span className="text-[11px] text-gray-500 dark:text-gray-400 font-medium">
                        1 unit porsiyada: {ing.quantity} {ing.unit || ''}
                        {ing.waste_percentage > 0 && (
                          <span className="text-amber-600 dark:text-amber-400 font-bold ml-1">
                            (+{ing.waste_percentage}% chiqit = {ing.effectivePerUnit.toFixed(3)} {ing.unit || ''})
                          </span>
                        )}
                      </span>
                    </div>

                    <div className="text-right">
                      <span className="font-extrabold text-sm block">
                        Kerak: <span className={ing.isInsufficient ? 'text-red-600 dark:text-red-400' : 'text-purple-600 dark:text-purple-400'}>
                          {ing.totalRequired.toFixed(3)} {ing.unit || ''}
                        </span>
                      </span>
                      <span className={`text-[11px] font-bold ${ing.isInsufficient ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                        Omborda: {ing.currentStock.toFixed(3)} {ing.unit || ''} {ing.isInsufficient && '(YETARLI EMAS!)'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Footer Actions */}
          <div className="pt-3 border-t border-gray-150 dark:border-gray-700 flex gap-3">
            <button
              type="button"
              onClick={() => setModal({ isOpen: false, product: null, qty: '', recipe: [], loading: false, error: null })}
              className="flex-1 py-2.5 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-xl font-bold hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
            >
              Bekor qilish
            </button>
            <button
              type="submit"
              disabled={modal.loading || recipe.length === 0 || hasStockError || qty <= 0}
              className="flex-1 py-2.5 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white rounded-xl font-black shadow-lg shadow-purple-600/30 transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-95"
            >
              {modal.loading ? (
                <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <>
                  <ChefHat size={18} />
                  <span>Tayyorlashni Tasdiqlash</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ── Stock Transfer Modal (Omborlararo Ko'chirish) ── */
function StockTransferModal({
  isOpen, onClose, subWarehouses, transferForm, setTransferForm, transferItems, setTransferItems,
  transferSelectedProductId, setTransferSelectedProductId, transferSelectedQty, setTransferSelectedQty,
  onAddTransferItem, onRemoveTransferItem, onSaveTransfer, onFetchHistory, products, lang, loading
}) {
  if (!isOpen) return null;

  const [newSWName, setNewSWName] = useState('');
  const [showAddSW, setShowAddSW] = useState(false);

  const handleAddNewSubWarehouse = async () => {
    if (!newSWName.trim()) return;
    try {
      if (window.api && window.api.addSubWarehouse) {
        const res = await window.api.addSubWarehouse(newSWName.trim());
        if (res && res.success) {
          setNewSWName('');
          setShowAddSW(false);
        }
      }
    } catch (_) {}
  };

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-2xl border border-gray-200 dark:border-gray-700 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-5 border-b border-gray-150 dark:border-gray-700 flex items-center justify-between bg-gradient-to-r from-blue-900/10 to-indigo-900/10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-100 dark:bg-blue-950/60 text-blue-600 dark:text-blue-300 flex items-center justify-center font-bold">
              <Truck size={22} />
            </div>
            <div>
              <h3 className="text-base font-black text-gray-900 dark:text-white">
                Omborlararo Ko'chirish Hujjati (Внутреннее перемещение)
              </h3>
              <p className="text-xs text-blue-600 dark:text-blue-400 font-bold">
                Restoran ichidagi omborlar o'rtasida tovar va masalliqlarni ko'chirish
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onFetchHistory}
              className="px-3 py-1.5 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 text-gray-700 dark:text-gray-200 text-xs font-bold rounded-lg transition cursor-pointer"
            >
              Hujjatlar tarixi
            </button>
            <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition cursor-pointer">
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Body */}
        <form onSubmit={onSaveTransfer} className="p-5 space-y-4 overflow-y-auto custom-scrollbar flex-1">
          {/* Source & Destination Warehouse Selection */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-gray-50 dark:bg-gray-700/40 p-4 rounded-xl border border-gray-200 dark:border-gray-600">
            <div>
              <label className="block text-xs font-extrabold text-gray-700 dark:text-gray-300 uppercase mb-1">
                Qayerdan (Manba ombor) <span className="text-red-500">*</span>
              </label>
              <select
                value={transferForm.sourceWarehouse}
                onChange={e => setTransferForm({ ...transferForm, sourceWarehouse: e.target.value })}
                className="w-full bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-xl px-3 py-2 text-sm font-bold text-gray-900 dark:text-white"
              >
                {subWarehouses.map(sw => (
                  <option key={sw.id} value={sw.name}>{sw.name}</option>
                ))}
              </select>
            </div>

            <div>
              <div className="flex justify-between items-center mb-1">
                <label className="block text-xs font-extrabold text-gray-700 dark:text-gray-300 uppercase">
                  Qayerga (Maqsad ombor) <span className="text-red-500">*</span>
                </label>
                <button
                  type="button"
                  onClick={() => setShowAddSW(!showAddSW)}
                  className="text-[10px] text-blue-600 dark:text-blue-400 font-bold hover:underline cursor-pointer"
                >
                  + Yangi bo'lim qo'shish
                </button>
              </div>
              <select
                value={transferForm.targetWarehouse}
                onChange={e => setTransferForm({ ...transferForm, targetWarehouse: e.target.value })}
                className="w-full bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-xl px-3 py-2 text-sm font-bold text-gray-900 dark:text-white"
              >
                {subWarehouses.map(sw => (
                  <option key={sw.id} value={sw.name}>{sw.name}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Quick Add New Sub-Warehouse */}
          {showAddSW && (
            <div className="flex gap-2 bg-blue-50 dark:bg-blue-950/40 p-3 rounded-xl border border-blue-200 dark:border-blue-900">
              <input
                type="text"
                placeholder="Bo'lim nomi (mas: Terrassa Bar)"
                value={newSWName}
                onChange={e => setNewSWName(e.target.value)}
                className="flex-1 px-3 py-1.5 text-xs font-bold border border-blue-300 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
              />
              <button
                type="button"
                onClick={handleAddNewSubWarehouse}
                className="px-3 py-1.5 bg-blue-600 text-white text-xs font-bold rounded-lg hover:bg-blue-700 cursor-pointer"
              >
                Qo'shish
              </button>
            </div>
          )}

          {/* Add Items Row */}
          <div className="flex flex-col sm:flex-row gap-2 items-end bg-white dark:bg-gray-800 p-3 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm">
            <div className="flex-1 w-full">
              <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Tovarni tanlang</label>
              <select
                value={transferSelectedProductId}
                onChange={e => setTransferSelectedProductId(e.target.value)}
                className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
              >
                <option value="">-- Tovar / Xom-ashyoni tanlang --</option>
                {products.map(p => (
                  <option key={p.id} value={p.id}>
                    {p.name} (Omborda: {p.stock} {p.unit || 'dona'})
                  </option>
                ))}
              </select>
            </div>

            <div className="w-full sm:w-28">
              <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Miqdor</label>
              <input
                type="number"
                step="0.001"
                min="0.001"
                value={transferSelectedQty}
                onChange={e => setTransferSelectedQty(e.target.value)}
                placeholder="1"
                className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 font-bold"
              />
            </div>

            <button
              type="button"
              onClick={onAddTransferItem}
              disabled={!transferSelectedProductId || !transferSelectedQty}
              className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-bold px-4 py-2.5 rounded-lg transition h-9 shrink-0 cursor-pointer"
            >
              + Qo'shish
            </button>
          </div>

          {/* Transfer Items List */}
          <div className="space-y-2 max-h-48 overflow-y-auto pr-1 custom-scrollbar">
            {transferItems.length === 0 ? (
              <div className="text-center py-6 text-xs text-gray-400 font-bold italic">
                Hozircha ko'chiriladigan tovarlar qo'shilmadi.
              </div>
            ) : (
              transferItems.map((item) => (
                <div key={item.productId} className="flex items-center justify-between bg-gray-50 dark:bg-gray-700/60 px-3.5 py-2 rounded-xl border border-gray-200 dark:border-gray-600 text-xs font-bold">
                  <span className="text-gray-800 dark:text-gray-200">{item.name}</span>
                  <div className="flex items-center gap-3">
                    <span className="text-blue-600 dark:text-blue-400 font-black">
                      {item.quantity} {item.unit}
                    </span>
                    <button type="button" onClick={() => onRemoveTransferItem(item.productId)} className="text-red-500 hover:text-red-700 p-1 cursor-pointer">
                      <X size={15} />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Izoh */}
          <div>
            <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 uppercase mb-1">Izoh</label>
            <input
              type="text"
              placeholder="Masalan: Bar uchun salqin ichimliklar topshirildi"
              value={transferForm.note}
              onChange={e => setTransferForm({ ...transferForm, note: e.target.value })}
              className="w-full bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-xl px-3 py-2 text-xs text-gray-900 dark:text-white"
            />
          </div>

          {/* Footer Actions */}
          <div className="pt-3 border-t border-gray-150 dark:border-gray-700 flex gap-3">
            <button type="button" onClick={onClose} className="flex-1 py-2.5 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-xl font-bold">
              Bekor qilish
            </button>
            <button
              type="submit"
              disabled={loading || transferItems.length === 0}
              className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl font-black shadow-lg shadow-blue-600/30 transition active:scale-95 cursor-pointer"
            >
              {loading ? 'Saqlanmoqda...' : 'Ko\'chirishni Tasdiqlash'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ── Stock Transfer History Modal ── */
function StockTransferHistoryModal({ isOpen, onClose, transfers, lang }) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[115] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-2xl border border-gray-200 dark:border-gray-700 overflow-hidden flex flex-col max-h-[85vh]">
        <div className="p-4 border-b border-gray-150 dark:border-gray-700 flex items-center justify-between bg-gray-50 dark:bg-gray-700/50">
          <h3 className="text-base font-black text-gray-900 dark:text-white flex items-center gap-2">
            <ClipboardCheck size={20} className="text-blue-500" />
            Omborlararo Ko'chirish Hujjatlari Tarixi
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 cursor-pointer"><X size={20} /></button>
        </div>

        <div className="p-4 overflow-y-auto custom-scrollbar flex-1 space-y-3">
          {transfers.length === 0 ? (
            <p className="text-center py-8 text-xs text-gray-400 font-bold">Hozircha omborlararo ko'chirishlar bajarilmagan.</p>
          ) : (
            transfers.map(tr => (
              <div key={tr.id} className="p-3.5 bg-gray-50 dark:bg-gray-700/40 rounded-xl border border-gray-200 dark:border-gray-600 text-xs">
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <span className="font-extrabold text-blue-600 dark:text-blue-400 text-sm block">#{tr.transfer_number}</span>
                    <span className="text-gray-500 text-[11px]">{new Date(tr.created_at).toLocaleString('ru-RU')} ({tr.user_name || 'Admin'})</span>
                  </div>
                  <span className="px-2 py-1 bg-blue-100 dark:bg-blue-950/60 text-blue-800 dark:text-blue-300 font-bold rounded-lg text-[11px]">
                    {tr.source_warehouse} ➔ {tr.target_warehouse}
                  </span>
                </div>
                {tr.note && <p className="text-[11px] italic text-gray-500 mb-2">Izoh: {tr.note}</p>}

                <div className="border-t border-gray-200 dark:border-gray-600 pt-2 space-y-1">
                  {tr.items?.map((it, idx) => (
                    <div key={idx} className="flex justify-between text-gray-800 dark:text-gray-200 font-bold">
                      <span>• {it.product_name}</span>
                      <span>{it.quantity} {it.unit || 'dona'}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
