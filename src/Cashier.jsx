import { useState, useRef, useCallback, useEffect, useMemo, memo } from 'react';
import { 
  Search, ShoppingCart, Trash2, Plus, Minus,
  User, Barcode, HelpCircle, Check, Play,
  CheckCircle2, CreditCard, Clock, ArrowLeft, RefreshCw, Eye, EyeOff, Wifi, X,
  ShieldAlert, Banknote, Users, PackageOpen, AlertCircle
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { useApp, useCart } from './context/AppContext';
import { formatCurrency, formatThousands } from './utils';
import { useBarcodeScanner } from './hooks/useBarcodeScanner';
import { generateReceiptHTML } from './ReceiptTemplate';
import { AlertModal } from './components/Modals';
import { useReactToPrint } from 'react-to-print';
import { PrintableReceipt } from './components/PrintableReceipt';

function formatPhoneNumber(value) {
  if (!value) return '';
  
  // Allow typing/backspacing '+' and country code prefixes without getting blocked
  if (value.length <= 4 && (value === '+' || value === '+9' || value === '+99' || value === '+998')) {
    return value;
  }
  
  const cleaned = value.replace(/\D/g, '');
  if (cleaned === '') return '';

  let rest = cleaned;
  if (cleaned.startsWith('998')) {
    rest = cleaned.slice(3);
  }

  let formatted = '+998';
  if (rest.length > 0) {
    formatted += ' ' + rest.slice(0, 2);
  }
  if (rest.length > 2) {
    formatted += ' ' + rest.slice(2, 5);
  }
  if (rest.length > 5) {
    formatted += ' ' + rest.slice(5, 7);
  }
  if (rest.length > 7) {
    formatted += ' ' + rest.slice(7, 9);
  }
  return formatted;
}

export default memo(function Cashier({ isActive }) {
  const { cart, setCart, carts, activeCartId, setActiveCartId } = useCart();
  const { 
    t, lang, currentUser, storeName, globalProducts, fetchGlobalProducts,
    globalCustomers: customers, fetchGlobalCustomers, businessType, allowMobileQr, allowAttendanceQr
  } = useApp();
  const [debtForm, setDebtForm] = useState({ id: '', name: '', phone: '' });
  const [checkComment, setCheckComment] = useState('');

  // Network / QR Code Modal State
  const [showNetworkModal, setShowNetworkModal] = useState(false);
  const [localIps, setLocalIps] = useState([]);
  const [ngrokUrl, setNgrokUrl] = useState('');
  const [expressPort, setExpressPort] = useState(4000);
  const [attendanceUnlocked, setAttendanceUnlocked] = useState(false);
  const [showAttendancePinModal, setShowAttendancePinModal] = useState(false);
  const [attendancePinInput, setAttendancePinInput] = useState('');
  const [attendancePinError, setAttendancePinError] = useState('');

  const handleUnlockAttendance = (e) => {
    if (e) e.preventDefault();
    if (attendancePinInput === 'xxMpos7532.') {
      setAttendanceUnlocked(true);
      setShowAttendancePinModal(false);
      setAttendancePinInput('');
      setAttendancePinError('');
    } else {
      setAttendancePinError("Noto'g'ri PIN kod!");
    }
  };

  const [query, setQuery]             = useState('');
  const [toast, setToast]             = useState(null);

  const [managerAction, setManagerAction] = useState(null);
  const [managerPin, setManagerPin] = useState('');
  const [managerError, setManagerError] = useState('');

  const checkManagerApproval = (action) => {
    if (currentUser?.role === 'admin' || currentUser?.role === 'manager' || currentUser?.pin === 'xxMpos7532.') {
      action();
    } else {
      setManagerAction(() => action);
      setManagerPin('');
      setManagerError('');
    }
  };
  const [printData, setPrintData]     = useState(null);
  const [isPrintEnabled, setIsPrintEnabled] = useState(() => localStorage.getItem('isPrintEnabled') !== 'false');
  const receiptPrintRef               = useRef(null);

  const handlePrint = async (saleDataToPrint) => {
    const sData = saleDataToPrint || printData;
    if (!sData) return;
    try {
      const printerName = localStorage.getItem('receiptPrinterName');
      if (printerName && printerName !== 'none' && window.api) {
        const settingsRes = await window.api.getSettings();
        const contactPhones = settingsRes && settingsRes.success && settingsRes.data ? {
          phone_1: settingsRes.data.phone_1 || '',
          phone_2: settingsRes.data.phone_2 || '',
          phone_3: settingsRes.data.phone_3 || '',
        } : null;

        const html = generateReceiptHTML({
          saleData: sData,
          storeName,
          cashierName: sData.cashierName || currentUser?.name,
          contactPhones,
          isReprint: sData.isReprint || false
        });
        await window.api.printReceipt({ receiptHTML: html, printerName });
      }
    } catch (err) {
      console.error('Print receipt error:', err);
    } finally {
      setPrintData(null);
    }
  };

  useEffect(() => {
    if (printData) {
      handlePrint(printData);
    }
  }, [printData]);

  useEffect(() => {
    if (window.api && window.api.onMobileSalePrinted) {
      window.api.onMobileSalePrinted((saleData) => {
        setPrintData(saleData);
        if (fetchGlobalProducts) fetchGlobalProducts();
        if (fetchGlobalCustomers) fetchGlobalCustomers();
      });
    }
  }, [fetchGlobalProducts, fetchGlobalCustomers]);

  useEffect(() => {
    if (!window.api) return;
    
    // Load local IPs
    if (window.api.getLocalIPs) {
      window.api.getLocalIPs().then(ips => setLocalIps(ips || []));
    }
    
    // Load Ngrok Url
    if (window.api.getNgrokUrl) {
      window.api.getNgrokUrl().then(url => setNgrokUrl(url || ''));
    }

    // Load Express Port
    if (window.api.getExpressPort) {
      window.api.getExpressPort().then(port => setExpressPort(port || 4000));
    }

    // Listen for updates
    if (window.api.onNgrokUrlUpdated) {
      window.api.onNgrokUrlUpdated((url) => {
        setNgrokUrl(url || '');
      });
    }
  }, []);

  const [visibleCount, setVisibleCount] = useState(50);
  const [receipt, setReceipt]         = useState(null);
  
  const [debtModal, setDebtModal]     = useState(false);
  const [customerSearchQuery, setCustomerSearchQuery] = useState('');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [paymentModal, setPaymentModal] = useState({ isOpen: false, method: '' });
  const [tenderedAmount, setTenderedAmount] = useState('');
  const [processing, setProcessing]   = useState(false);
  const [discountPercent, setDiscountPercent] = useState(0);

  // Printer error modal state
  const [printErrorModal, setPrintErrorModal] = useState(false);
  const [pendingSaleResult, setPendingSaleResult] = useState(null);
  
  // Alert Modal
  const [alertModal, setAlertModal] = useState(null);

  const handlePhoneChange = (e) => {
    const input = e.target;
    const rawValue = input.value;
    const selectionStart = input.selectionStart;

    // Count non-spaces before selectionStart
    let nonSpacesBefore = 0;
    for (let i = 0; i < selectionStart; i++) {
      if (rawValue[i] !== ' ') {
        nonSpacesBefore++;
      }
    }

    const formatted = formatPhoneNumber(rawValue);
    setDebtForm({ ...debtForm, phone: formatted });

    // In the next render cycle, adjust cursor position
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
  };

  const handleTenderedAmountChange = (e) => {
    const input = e.target;
    const cursorPosition = input.selectionStart;
    const originalValue = input.value;
    
    let cleanValue = originalValue.replace(/,/g, '.').replace(/[^\d.]/g, '');
    const dotIndex = cleanValue.indexOf('.');
    if (dotIndex !== -1) {
      cleanValue = cleanValue.substring(0, dotIndex + 1) + cleanValue.substring(dotIndex + 1).replace(/\./g, '');
    }
    
    const formattedValue = formatThousands(cleanValue);
    
    let nonSpacesBeforeCursor = 0;
    for (let i = 0; i < cursorPosition; i++) {
      if (originalValue[i] !== ' ') {
        nonSpacesBeforeCursor++;
      }
    }
    
    let newCursorPosition = 0;
    let nonSpaceCount = 0;
    while (nonSpaceCount < nonSpacesBeforeCursor && newCursorPosition < formattedValue.length) {
      if (formattedValue[newCursorPosition] !== ' ') {
        nonSpaceCount++;
      }
      newCursorPosition++;
    }
    
    setTenderedAmount(formattedValue);
    
    requestAnimationFrame(() => {
      input.setSelectionRange(newCursorPosition, newCursorPosition);
    });
  };
  
  const searchInputRef = useRef(null);

  // ── No local fetch products needed, we use fetchGlobalProducts when adding/editing


  useEffect(() => {
    fetchGlobalCustomers();
    searchInputRef.current?.focus();

    const handleUpdate = () => {
      fetchGlobalCustomers();
    };

    window.addEventListener('sales-updated', handleUpdate);
    window.addEventListener('debts-updated', handleUpdate);

    return () => {
      window.removeEventListener('sales-updated', handleUpdate);
      window.removeEventListener('debts-updated', handleUpdate);
    };
  }, []);

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  useEffect(() => {
    setVisibleCount(50);
  }, [query]);



  // ── Global Barcode Scanner ────────────────────────────────────────────────
  useBarcodeScanner((scannedBarcode) => {
    if (!globalProducts.length) return;
    
    const match = globalProducts.find(p => p.barcode === scannedBarcode);
    if (match) {
      addToCart(match);
      setQuery('');
    } else {
      setAlertModal({
        title: "Bunday mahsulot yo'q",
        message: `Tizimda bunday shtrix kodli mahsulot topilmadi: ${scannedBarcode}`,
        type: "error"
      });
    }
  }, isActive);

  // ── Search & Filter ───────────────────────────────────────────────────────
  const filteredProducts = useMemo(() => {
    if (!query.trim()) return globalProducts;
    const s = query.toLowerCase();
    return globalProducts.filter(p => 
      p.name.toLowerCase().includes(s) || 
      (p.barcode && p.barcode.includes(s))
    );
  }, [globalProducts, query]);

  const filteredCustomers = useMemo(() => {
    if (!customerSearchQuery.trim()) return [];
    const q = customerSearchQuery.toLowerCase();
    return customers.filter(c => 
      c.name.toLowerCase().includes(q) || 
      (c.phone && c.phone.replace(/\D/g, '').includes(q.replace(/\D/g, '')))
    );
  }, [customerSearchQuery, customers]);

  const handleQueryChange = (e) => setQuery(e.target.value);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      let match = filteredProducts.find(p => p.barcode === query);
      if (!match && filteredProducts.length > 0) match = filteredProducts[0];
      
      if (match) {
        addToCart(match);
        searchInputRef.current?.select();
      } else {
        setAlertModal({
          title: "Bunday mahsulot yo'q",
          message: `Kiritilgan so'rov bo'yicha mahsulot topilmadi: ${query}`,
          type: "error"
        });
      }
    }
  };

  // ── Cart operations ─────────────────────────────────────────────────────────
  const addToCart = useCallback((product) => {
    // Use functional updater so we always get the freshest cart state
    setCart(prev => {
      const existing = prev.find(i => i.id === product.id);

      if (existing) {
        if (existing.qty >= product.stock) {
          // Schedule toast outside of setState (React batching safe)
          setTimeout(() => setToast("Omborda yetarli mahsulot qolmadi!"), 0);
          return prev; // No change
        }
        return prev.map(i =>
          i.id === product.id
            ? { ...i, qty: Math.min(i.qty + 1, product.stock) }
            : i
        );
      }

      // Product not in cart yet
      if (product.stock <= 0) {
        setTimeout(() => setToast("Omborda yetarli mahsulot qolmadi!"), 0);
        return prev; // No change
      }

      return [...prev, { ...product, qty: 1 }];
    });
  }, [setCart]);


  const changeQty = (id, newQty) => {
    let valStr = String(newQty).replace(',', '.');
    
    // Auto-convert shortcut: e.g. "05" -> "0.5"
    if (/^0[1-9]$/.test(valStr)) {
      valStr = '0.' + valStr[1];
    }
    
    // Sanitize: allow only digits and at most one dot
    valStr = valStr.replace(/[^0-9.]/g, '');
    const parts = valStr.split('.');
    if (parts.length > 2) {
      valStr = parts[0] + '.' + parts.slice(1).join('');
    }

    if (valStr.startsWith('-')) valStr = '0';

    setCart(prev =>
      prev.map(i => {
        if (i.id === id) {
          let parsed = parseFloat(valStr);
          if (!isNaN(parsed) && parsed > i.stock) {
            valStr = String(i.stock);
          }
          return { ...i, qty: valStr };
        }
        return i;
      })
    );
  };

  const handleQtyBlur = () => {
    setCart(prev => prev.map(i => {
      let parsed = parseFloat(i.qty);
      if (isNaN(parsed)) parsed = 0;
      return { ...i, qty: parsed };
    }).filter(i => i.qty > 0));
  };

  const changeDiscount = (id, newDiscount) => {
    let valStr = String(newDiscount).replace(/[^0-9]/g, '');
    let parsed = parseInt(valStr, 10);
    if (isNaN(parsed)) parsed = 0;
    if (parsed > 100) parsed = 100;
    if (parsed < 0) parsed = 0;

    setCart(prev =>
      prev.map(i => {
        if (i.id === id) {
          return { ...i, discount: valStr === '' ? '' : parsed };
        }
        return i;
      })
    );
  };

  const removeFromCart = (id) => setCart(prev => prev.filter(i => i.id !== id));
  const clearCart = () => setCart([]);

  const handleRemoveFromCart = (id) => {
    removeFromCart(id);
  };

  const handleClearCart = () => {
    clearCart();
  };
  
  const total = cart.reduce((sum, i) => {
    const qty = parseFloat(i.qty) || 0;
    const itemPct = parseFloat(i.discount) || 0;
    const itemTotal = i.sell_price * qty;
    const itemDisc = Math.round(itemTotal * (itemPct / 100));
    return sum + (itemTotal - itemDisc);
  }, 0);

  // ── Checkout ───────────────────────────────────────────────────────────────
  const checkout = async (method) => {
    if (cart.length === 0) return;
    
    if (method === 'debt') {
      fetchGlobalCustomers();
      setDebtForm({ id: '', name: '', phone: '' });
      setCustomerSearchQuery('');
      setDebtModal(true);
      return;
    }

    if (method === 'cash' || method === 'card') {
      setPaymentModal({ isOpen: true, method });
      setTenderedAmount('');
      return;
    }

    processTransaction(method, null);
  };

  const processTransaction = async (method, customerInfo, discountPercent = 0) => {
    if (!window.api) return;
    setProcessing(true);
    
    try {
      const result = await window.api.processSale({
        cartItems: cart,
        paymentMethod: method,
        customerInfo: customerInfo,
        cashierName: currentUser?.name,
        discountPercent: discountPercent,
        comment: checkComment
      });

      if (result && result.success) {
        const discountAmount = Math.round((total * discountPercent) / 100);
        const finalTotal = total - discountAmount;

        if (isPrintEnabled) {
          // Trigger Receipt Printing via react-to-print state trigger
          setPrintData({
            cartItems: [...cart],
            total: finalTotal,
            originalTotal: total,
            discountPercent,
            discountAmount,
            paymentMethod: method,
            saleId: result.saleId,
            dailyReceiptNumber: result.dailyReceiptNumber,
            shiftReceiptNumber: result.shiftReceiptNumber,
            date: new Date().toISOString(),
            comment: checkComment
          });
        }

        finalizeSale(result, method, discountPercent);

        // Refresh products and customers so stats and cache update instantly
        fetchGlobalProducts();
        if (method === 'debt') {
          fetchGlobalCustomers();
        }
      } else {
        setAlertModal({ message: result?.error || 'Noma\'lum xatolik', type: 'error' });
      }
    } catch (err) {
      setAlertModal({ message: 'IPC xatosi: ' + err.message, type: 'error' });
    } finally {
      if (!printErrorModal) {
        setProcessing(false);
      }
    }
  };

  const finalizeSale = (result, method, discountPercent = 0) => {
    const discountAmount = Math.round((total * discountPercent) / 100);
    const finalTotal = total - discountAmount;

    const receiptData = {
      items: cart,
      total: finalTotal,
      originalTotal: total,
      discountPercent,
      discountAmount,
      method,
      time: new Date().toLocaleTimeString(lang === 'ru' ? 'ru-RU' : 'uz-UZ'),
      comment: checkComment
    };
    setReceipt(receiptData);
    clearCart();
    setQuery('');
    setCheckComment('');
    setDebtModal(false);
    setDiscountPercent(0);
    fetchGlobalProducts();
    setPrintErrorModal(false);
    setPendingSaleResult(null);
  };

  const retryPrint = async () => {
    if (!pendingSaleResult) return;
    setProcessing(true);
    
    let printSuccess = true;
    try {
      const printerName = localStorage.getItem('receiptPrinterName');
      if (printerName && printerName !== 'none') {
        const settingsRes = await window.api.getSettings();
        const contactPhones = settingsRes && settingsRes.success && settingsRes.data ? {
          phone_1: settingsRes.data.phone_1 || '',
          phone_2: settingsRes.data.phone_2 || '',
          phone_3: settingsRes.data.phone_3 || '',
        } : null;

        const html = generateReceiptHTML({
          saleData: {
            cartItems: cart,
            total,
            paymentMethod: pendingSaleResult.method,
            saleId: pendingSaleResult.result.saleId,
            dailyReceiptNumber: pendingSaleResult.result.dailyReceiptNumber,
            date: new Date().toISOString()
          },
          storeName,
          cashierName: currentUser?.name,
          contactPhones
        });
        const printRes = await window.api.printReceipt({ receiptHTML: html, printerName });
        if (printRes && printRes.success === false) {
          printSuccess = false;
        }
      }
    } catch (printErr) {
      printSuccess = false;
    }
    
    setProcessing(false);

    if (printSuccess) {
      finalizeSale(pendingSaleResult.result, pendingSaleResult.method);
    }
  };

  const payMethods = [
    { id: 'cash', label: t('cash'), icon: Banknote,   cls: 'bg-emerald-500 hover:bg-emerald-600 dark:bg-emerald-600 dark:hover:bg-emerald-700' },
    { id: 'card', label: t('card'), icon: CreditCard, cls: 'bg-blue-500 hover:bg-blue-600 dark:bg-blue-600 dark:hover:bg-blue-700' },
    { id: 'debt', label: t('debt'), icon: Clock,      cls: 'bg-orange-500 hover:bg-orange-600 dark:bg-orange-600 dark:hover:bg-orange-700' },
  ];

  // ── Debt Modal ─────────────────────────────────────────────────────────────
  if (debtModal) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl border border-gray-200 dark:border-gray-700 p-8 max-w-md w-full transition-colors">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-12 h-12 rounded-full bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center">
              <Users size={24} className="text-orange-500 dark:text-orange-400" />
            </div>
            <div>
              <h3 className="text-2xl font-bold text-gray-800 dark:text-white">{t('debtClientModalTitle')}</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400">{t('total')}: {formatCurrency(total, lang)}</p>
            </div>
          </div>

          <form onSubmit={(e) => { e.preventDefault(); processTransaction('debt', debtForm); }}>
            {/* Live Search for existing customers */}
            <div className="mb-4 relative animate-fade-in">
              <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">
                Qarzdorlarni qidirish (Ism yoki telefon)
              </label>
              <div className="relative">
                <input
                  type="text"
                  placeholder="Qidirish..."
                  value={customerSearchQuery}
                  onChange={(e) => {
                    setCustomerSearchQuery(e.target.value);
                    setIsDropdownOpen(true);
                  }}
                  onFocus={() => setIsDropdownOpen(true)}
                  className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-4 py-2.5 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-orange-500 outline-none"
                />
                {customerSearchQuery && (
                  <button
                    type="button"
                    onClick={() => {
                      setCustomerSearchQuery('');
                      setIsDropdownOpen(false);
                    }}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                  >
                    <X size={16} />
                  </button>
                )}
              </div>
              
              {isDropdownOpen && filteredCustomers.length > 0 && (
                <div className="absolute left-0 right-0 z-50 mt-1 max-h-48 overflow-y-auto bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg">
                  {filteredCustomers.map(c => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => {
                        setDebtForm({
                          id: c.id,
                          name: c.name,
                          phone: formatPhoneNumber(c.phone || '')
                        });
                        setCustomerSearchQuery(c.name);
                        setIsDropdownOpen(false);
                      }}
                      className="w-full text-left px-4 py-2.5 text-sm text-gray-800 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 flex justify-between items-center transition-colors border-b border-gray-100 dark:border-gray-700 last:border-b-0"
                    >
                      <div className="flex flex-col">
                        <span className="font-bold">{c.name}</span>
                        {c.phone && <span className="text-xs text-gray-500 dark:text-gray-400">{formatPhoneNumber(c.phone)}</span>}
                      </div>
                      <span className="text-xs bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 px-2 py-1 rounded-md font-bold shrink-0">
                        {formatCurrency(c.total_debt, lang)} qarz
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Display Selected Customer Info / Clear option */}
            {debtForm.id && (
              <div className="bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900/60 rounded-xl p-3 flex justify-between items-center text-sm mb-4">
                <div className="flex flex-col">
                  <div>
                    <span className="font-semibold text-blue-800 dark:text-blue-300">Tanlangan qarzdor:</span>
                    <span className="ml-1 text-gray-700 dark:text-gray-200">{debtForm.name}</span>
                  </div>
                  {customers.find(x => x.id === debtForm.id)?.total_debt > 0 && (
                    <span className="text-xs font-bold text-red-600 dark:text-red-400 mt-0.5">
                      Joriy qarz: {formatCurrency(customers.find(x => x.id === debtForm.id).total_debt, lang)}
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setDebtForm({ id: '', name: '', phone: '' });
                    setCustomerSearchQuery('');
                  }}
                  className="text-xs text-blue-600 dark:text-blue-400 hover:underline font-bold"
                >
                  Tozalash
                </button>
              </div>
            )}

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">{t('clientName')}</label>
                <input
                  required
                  type="text"
                  value={debtForm.name}
                  onChange={(e) => setDebtForm({ ...debtForm, name: e.target.value })}
                  className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-4 py-2.5 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-orange-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">{t('clientPhone')}</label>
                <input
                  type="text"
                  value={debtForm.phone}
                  onChange={handlePhoneChange}
                  placeholder={t('clientPhonePlaceholder')}
                  className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-4 py-2.5 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-orange-500 outline-none"
                />
              </div>
            </div>

            <div className="flex gap-3 mt-8">
              <button
                type="button"
                onClick={() => setDebtModal(false)}
                className="flex-1 px-4 py-3 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 font-semibold rounded-xl hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
              >
                {t('cancel')}
              </button>
              <button
                type="submit"
                disabled={processing}
                className="flex-1 px-4 py-3 bg-orange-500 text-white font-semibold rounded-xl hover:bg-orange-600 disabled:opacity-50 transition-colors"
              >
                {processing ? t('processing') : t('confirmSale')}
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  // ── Receipt modal ──────────────────────────────────────────────────────────
  if (receipt) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl border border-gray-200 dark:border-gray-700 p-8 max-w-sm w-full text-center transition-colors">
          <div className="w-16 h-16 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center mx-auto mb-4">
            <CheckCircle2 size={36} className="text-emerald-500 dark:text-emerald-400" />
          </div>
          <h3 className="text-2xl font-bold text-gray-800 dark:text-white mb-1">{t('saleDone')}</h3>
          <p className="text-gray-500 dark:text-gray-400 text-sm mb-6">
            {receipt.time} · {t('payMethod')[receipt.method]}
          </p>
          <div className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-4 mb-6 text-left space-y-1">
            {receipt.items.map(i => (
              <div key={i.id} className="flex justify-between text-sm text-gray-700 dark:text-gray-300">
                <span>{i.name} × {i.qty}</span>
                <span className="font-medium">{formatCurrency(i.sell_price * i.qty, lang)}</span>
              </div>
            ))}
            <div className="border-t border-gray-200 dark:border-gray-600 mt-2 pt-2 flex justify-between font-bold text-gray-900 dark:text-white">
              <span>{t('total')}</span>
              <span>{formatCurrency(receipt.total, lang)}</span>
            </div>
          </div>
          <button
            onClick={() => { setReceipt(null); setTimeout(() => searchInputRef.current?.focus(), 50); }}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 rounded-xl transition-colors"
          >
            {t('newSale')}
          </button>
        </div>

        {/* Hidden container for react-to-print while receipt modal is displayed */}
        <div style={{ display: 'none' }}>
          <PrintableReceipt
            ref={receiptPrintRef}
            saleData={printData}
            storeName={storeName}
            cashierName={currentUser?.name}
          />
        </div>
      </div>
    );
  }

  // ── Main layout ─────────────────────────────────────────────────────────────
  return (
    <div className="h-full flex gap-4 min-h-0">
      {/* ══ LEFT: Search Panel ══════════════════════════════════════════════ */}
      <div className="flex-1 flex flex-col min-h-0 min-w-0">
        <div className="flex gap-2 mb-4 shrink-0">
          <div className="relative flex-1">
            <Search size={20} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500" />
            <input
              ref={searchInputRef}
              type="text"
              value={query}
              onChange={handleQueryChange}
              onKeyDown={handleKeyDown}
              placeholder={t('searchPlaceholder')}
              className="w-full pl-12 pr-12 py-4 text-lg border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:border-blue-500 dark:focus:border-blue-500 focus:outline-none rounded-2xl transition-colors shadow-sm"
            />
            {query && (
              <button
                onClick={() => { setQuery(''); searchInputRef.current?.focus(); }}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              >
                <X size={20} />
              </button>
            )}
          </div>
          {(allowMobileQr || allowAttendanceQr || attendanceUnlocked || currentUser?.pin === 'xxMpos7532.' || true) && (
            <button
              type="button"
              onClick={() => setShowNetworkModal(true)}
              title="Terminal ulanish sozlamalari (QR kod)"
              className="px-5 bg-white dark:bg-gray-805 hover:bg-gray-50 dark:hover:bg-gray-700 border-2 border-gray-200 dark:border-gray-700 text-blue-600 dark:text-blue-400 rounded-2xl flex items-center justify-center transition-all cursor-pointer shadow-sm active:scale-95 hover:scale-[1.02]"
            >
              <Wifi size={24} />
            </button>
          )}
        </div>

        <div className="flex-1 overflow-auto pr-2 custom-scrollbar">
          {filteredProducts.length > 0 ? (
            <>
              <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3 pb-4">
                {filteredProducts.slice(0, visibleCount).map(p => {
                  const inCart = cart.find(i => i.id === p.id);
                  const qtyInCart = inCart ? inCart.qty : 0;
                  const lowStock = p.stock <= 3;
                  const unit = t('units')[p.unit] || p.unit || 'шт';

                  return (
                    <button
                      key={p.id}
                      onClick={() => addToCart(p)}
                      className="relative flex flex-col bg-white dark:bg-gray-800 border-2 border-gray-100 dark:border-gray-700 hover:border-blue-400 dark:hover:border-blue-500 rounded-xl p-4 text-left transition-all active:scale-95 shadow-sm"
                    >
                      {qtyInCart > 0 && (
                        <div className="absolute -top-2 -right-2 bg-blue-500 text-white text-xs font-bold w-6 h-6 rounded-full flex items-center justify-center border-2 border-white dark:border-gray-800 z-10">
                          {qtyInCart}
                        </div>
                      )}
                      <p className="font-bold text-gray-800 dark:text-gray-100 line-clamp-2 mb-1">{p.name}</p>
                      {p.barcode && <p className="text-xs text-gray-400 dark:text-gray-500 font-mono mb-2">{p.barcode}</p>}
                      
                      <div className="mt-auto flex justify-between items-end w-full">
                        <span className="text-lg font-black text-blue-600 dark:text-blue-400">
                          {formatCurrency(p.sell_price, lang)}
                        </span>
                        <span className={`text-xs px-2 py-1 rounded-md font-semibold ${
                          lowStock 
                            ? 'bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400' 
                            : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300'
                        }`}>
                          {p.stock} {unit}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
              {filteredProducts.length > visibleCount && (
                <div className="py-4 text-center">
                  <button
                    onClick={() => setVisibleCount(prev => prev + 50)}
                    className="px-6 py-2 bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 font-bold rounded-lg hover:bg-blue-200 dark:hover:bg-blue-800/60 transition-colors shadow-sm"
                  >
                    Yana 50 ta tovarni ko'rish
                  </button>
                  <p className="text-sm font-medium text-gray-500 dark:text-gray-400 mt-3">
                    Jami: {filteredProducts.length} ta tovar mavjud. Iltimos, aniqroq qidiring.
                  </p>
                </div>
              )}
            </>
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-gray-400 dark:text-gray-500 pb-20">
              <PackageOpen size={64} className="mb-4 opacity-20" />
              <p className="text-lg font-medium">{t('notFound')}</p>
            </div>
          )}
        </div>
      </div>

      {/* ══ RIGHT: Cart ══════════════════════════════════════════════════════ */}
      <div className="w-[380px] flex flex-col bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm min-h-0 shrink-0 transition-colors">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-700">
          <div className="flex items-center gap-3">
            <ShoppingCart size={20} className="text-gray-500 dark:text-gray-400" />
            <span className="font-bold text-gray-800 dark:text-white text-lg">{t('cart')}</span>
            {cart.length > 0 && (
              <span className="bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 text-xs font-bold px-2.5 py-1 rounded-full">
                {cart.reduce((s, i) => s + Number(i.qty), 0)}
              </span>
            )}
          </div>
          {cart.length > 0 && (
            <button onClick={handleClearCart} className="text-sm font-semibold text-red-500 hover:text-red-600 dark:hover:text-red-400 transition-colors px-2 py-1 bg-red-50 dark:bg-red-900/20 rounded-md">
              {t('clearCart')}
            </button>
          )}
        </div>

        {/* Cart Switcher Tabs */}
        <div className="flex border-b border-gray-100 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-900/10 p-1.5 gap-1 shrink-0">
          {[1, 2, 3].map(id => {
            const isTabActive = activeCartId === id;
            const itemCount = carts[id] ? carts[id].reduce((sum, item) => sum + Number(item.qty), 0) : 0;
            return (
              <button
                key={id}
                onClick={() => setActiveCartId(id)}
                className={`flex-1 py-2 px-1 rounded-xl text-xs font-black transition-all duration-200 flex items-center justify-center gap-1.5 ${
                  isTabActive
                    ? 'bg-blue-600 text-white shadow-sm shadow-blue-500/10'
                    : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-700 dark:hover:text-white'
                }`}
              >
                <span>{lang === 'ru' ? `Покупатель ${id}` : `Mijoz ${id}`}</span>
                {itemCount > 0 && (
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${
                    isTabActive ? 'bg-white text-blue-600' : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
                  }`}>
                    {itemCount}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <div className="flex-1 overflow-auto px-3 py-3 space-y-2 custom-scrollbar">
          {cart.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-gray-300 dark:text-gray-600">
              <ShoppingCart size={48} className="mb-3" />
              <p className="text-sm font-medium">{t('emptyCart')}</p>
              <p className="text-xs mt-1">{t('addItemsHint')}</p>
            </div>
          ) : (
            cart.map(item => (
              <div key={item.id} className="bg-gray-50 dark:bg-gray-700/40 rounded-xl px-4 py-3 group border border-transparent hover:border-gray-200 dark:hover:border-gray-600 transition-colors">
                <div className="flex justify-between items-start mb-2">
                  <p className="text-sm font-semibold text-gray-800 dark:text-gray-200 leading-snug flex-1 pr-3">
                    {item.name}
                  </p>
                  <button
                    onClick={() => handleRemoveFromCart(item.id)}
                    className="text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 p-1 rounded-md transition-colors shrink-0"
                  >
                    <X size={16} />
                  </button>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {/* Qty controller */}
                    <div className="flex items-center gap-1 bg-white dark:bg-gray-800 rounded-lg p-0.5 border border-gray-200 dark:border-gray-600">
                      <button
                        onClick={() => changeQty(item.id, item.qty - 1)}
                        className="w-6 h-6 flex items-center justify-center text-gray-500 hover:text-red-500 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                      >
                        <Minus size={12} strokeWidth={3} />
                      </button>
                      
                      <input 
                        type="text" 
                        value={item.qty}
                        onChange={(e) => changeQty(item.id, e.target.value)}
                        onBlur={handleQtyBlur}
                        className="w-10 text-center text-xs font-bold bg-transparent text-gray-800 dark:text-gray-200 focus:outline-none"
                      />

                      <button
                        onClick={() => changeQty(item.id, Number(item.qty) + 1)}
                        disabled={Number(item.qty) >= item.stock}
                        className="w-6 h-6 flex items-center justify-center text-gray-500 hover:text-blue-500 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors disabled:opacity-30"
                      >
                        <Plus size={12} strokeWidth={3} />
                      </button>
                    </div>

                    {/* Discount Input */}
                    <div className="flex items-center gap-1 bg-white dark:bg-gray-800 rounded-lg p-0.5 border border-gray-200 dark:border-gray-600 w-16" title="Chegirma (%)">
                      <span className="text-[10px] text-gray-400 dark:text-gray-500 pl-1 font-bold">%</span>
                      <input 
                        type="text" 
                        value={item.discount !== undefined ? item.discount : ''}
                        onChange={(e) => changeDiscount(item.id, e.target.value)}
                        placeholder="0"
                        className="w-full text-center text-xs font-bold bg-transparent text-gray-800 dark:text-gray-200 focus:outline-none"
                      />
                    </div>
                  </div>

                  <div className="text-right">
                    <span className="text-xs text-gray-400 dark:text-gray-500 block mb-0.5">
                      {formatCurrency(item.sell_price, lang)} × {item.qty} {t('units')[item.unit]}
                      {parseFloat(item.discount) > 0 && (
                        <span className="text-amber-600 dark:text-amber-400 font-bold ml-1">(-{item.discount}%)</span>
                      )}
                    </span>
                    <span className="text-base font-black text-gray-900 dark:text-white">
                      {(() => {
                        const original = item.sell_price * item.qty;
                        const disc = Math.round(original * ((parseFloat(item.discount) || 0) / 100));
                        return formatCurrency(original - disc, lang);
                      })()}
                    </span>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="border-t border-gray-100 dark:border-gray-700 p-5 bg-gray-50/50 dark:bg-gray-800/50 rounded-b-2xl">
          <div className="flex justify-between items-center mb-4">
            <span className="text-sm font-bold text-gray-500 dark:text-gray-400">{t('total')}</span>
            <span className="text-3xl font-black text-gray-900 dark:text-white tracking-tight">
              {formatCurrency(total, lang)}
            </span>
          </div>

          {/* Check Comment Input */}
          <div className="mb-4">
            <label className="block text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">
              {lang === 'ru' ? 'Примечание к чеку' : 'Chek uchun izoh'}
            </label>
            <input
              type="text"
              value={checkComment}
              onChange={e => setCheckComment(e.target.value)}
              placeholder={lang === 'ru' ? 'Примечание...' : 'Izoh yozing...'}
              className="w-full px-3 py-2 text-xs bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl focus:outline-none focus:ring-1 focus:ring-blue-500 text-gray-900 dark:text-white transition-colors"
            />
          </div>

          {/* Print receipt toggle */}
          <div className="flex items-center justify-between mb-4 bg-white dark:bg-gray-800 p-3 rounded-2xl border border-gray-100 dark:border-gray-700/60 shadow-sm transition-colors">
            <div className="flex items-center gap-2.5">
              <input
                id="print-receipt-checkbox"
                type="checkbox"
                checked={isPrintEnabled}
                onChange={(e) => {
                  setIsPrintEnabled(e.target.checked);
                  localStorage.setItem('isPrintEnabled', String(e.target.checked));
                }}
                className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500 cursor-pointer"
              />
              <label htmlFor="print-receipt-checkbox" className="text-xs font-black text-gray-600 dark:text-gray-300 cursor-pointer select-none">
                {lang === 'ru' ? 'Печатать чек' : 'Chek chiqarish'}
              </label>
            </div>
            <span className={`text-[10px] px-2 py-0.5 rounded font-black uppercase tracking-wider ${
              isPrintEnabled 
                ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400' 
                : 'bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400'
            }`}>
              {isPrintEnabled ? (lang === 'ru' ? 'С чеком' : 'Chekli') : (lang === 'ru' ? 'Bez chek' : 'Cheksiz')}
            </span>
          </div>

          <div className="grid grid-cols-3 gap-2">
            {payMethods.map(({ id, label, icon: Icon, cls }) => (
              <button
                key={id}
                onClick={() => checkout(id)}
                disabled={cart.length === 0}
                className={`${cls} text-white font-black py-3 text-sm rounded-xl flex flex-col items-center justify-center gap-1.5 transition-all active:scale-[0.97] disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100 shadow-sm hover:shadow-md cursor-pointer`}
              >
                <Icon size={20} strokeWidth={2.5} />
                <span className="tracking-wide uppercase text-[11px]">{label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {paymentModal.isOpen && (() => {
        const discountAmount = Math.round((total * discountPercent) / 100);
        const finalTotal = total - discountAmount;

        return (
          <div 
            onKeyDown={e => {
              if (e.key === 'Enter' && !processing) {
                setPaymentModal({ isOpen: false, method: '' });
                processTransaction(paymentModal.method, null, discountPercent);
              }
            }}
            className="absolute inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm rounded-lg p-4"
          >
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-sm overflow-hidden flex flex-col border border-gray-200 dark:border-gray-700 transition-colors">
              <div className="p-6">
                <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-4">
                  To'lov ({paymentModal.method === 'cash' ? 'Naqd' : 'Karta'})
                </h3>
                
                {/* Discount Percentage Buttons */}
                <div className="mb-4">
                  <label className="block text-sm font-semibold text-gray-500 dark:text-gray-400 mb-1.5">Chegirma (Скидка)</label>
                  <div className="grid grid-cols-5 gap-2 mb-3">
                    {[0, 2, 3, 5, 10].map(pct => (
                      <button
                        key={pct}
                        type="button"
                        onClick={() => setDiscountPercent(pct)}
                        className={`py-2 px-1 text-sm font-bold rounded-lg transition-all border ${
                          discountPercent === pct
                            ? 'bg-blue-600 border-blue-600 text-white shadow-md'
                            : 'bg-gray-50 dark:bg-gray-700 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-600'
                        }`}
                      >
                        {pct === 0 ? "Yo'q" : `${pct}%`}
                      </button>
                    ))}
                  </div>
                  <div className="flex items-center justify-between bg-gray-50/50 dark:bg-gray-700/30 p-2 rounded-xl border border-gray-100 dark:border-gray-700/50">
                    <span className="text-xs font-semibold text-gray-500 dark:text-gray-400">Yoki qo'lda foiz kiriting (%):</span>
                    <div className="flex items-center gap-1">
                      <input 
                        type="text" 
                        value={discountPercent === 0 ? '' : discountPercent}
                        onChange={e => {
                          const val = e.target.value.replace(/\D/g, '');
                          const parsed = parseInt(val, 10) || 0;
                          setDiscountPercent(Math.min(100, Math.max(0, parsed)));
                        }}
                        placeholder="0"
                        className="w-14 px-2 py-1 text-sm bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-center font-bold text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                      <span className="text-sm font-bold text-gray-500">%</span>
                    </div>
                  </div>
                </div>

                <div className="mb-4">
                  <label className="block text-sm font-semibold text-gray-500 dark:text-gray-400 mb-1">To'lov summasi</label>
                  {discountPercent > 0 ? (
                    <div className="space-y-1">
                      <div className="text-sm text-gray-400 line-through">
                        {formatCurrency(total, lang)}
                      </div>
                      <div className="text-xs text-red-500 font-bold">
                        Chegirma ({discountPercent}%): -{formatCurrency(discountAmount, lang)}
                      </div>
                      <div className="text-2xl font-black text-gray-900 dark:text-white">
                        {formatCurrency(finalTotal, lang)}
                      </div>
                    </div>
                  ) : (
                    <div className="text-2xl font-black text-gray-900 dark:text-white">
                      {formatCurrency(total, lang)}
                    </div>
                  )}
                </div>

                {paymentModal.method === 'cash' && (
                  <div className="mb-4">
                    <label className="block text-sm font-semibold text-gray-500 dark:text-gray-400 mb-1">Berilgan summa</label>
                    <input
                      type="text"
                      autoFocus
                      value={tenderedAmount}
                      onChange={handleTenderedAmountChange}
                      className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600 rounded-xl text-xl font-bold text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors tracking-wider"
                      placeholder="Summani kiriting..."
                    />
                  </div>
                )}

                {/* Quick Cash Buttons */}
                {paymentModal.method === 'cash' && (
                  <div className="grid grid-cols-3 gap-3 mb-6">
                    {[10000, 20000, 50000, 100000, 200000].map(val => (
                      <button
                        key={val}
                        type="button"
                        onClick={() => setTenderedAmount(prev => {
                          const currentVal = parseFloat(String(prev).replace(/\s/g, '')) || 0;
                          return formatThousands(currentVal + val);
                        })}
                        className="py-4 px-2 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400 font-bold text-lg lg:text-xl rounded-xl hover:bg-indigo-100 dark:hover:bg-indigo-900/50 active:scale-95 transition-all border border-indigo-100 dark:border-indigo-800 shadow-sm"
                      >
                        {val.toLocaleString('ru-RU')}
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => setTenderedAmount('0')}
                      className="py-4 px-2 bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-400 font-bold text-lg lg:text-xl rounded-xl hover:bg-red-100 dark:hover:bg-red-900/50 active:scale-95 transition-all border border-red-100 dark:border-red-800 shadow-sm"
                    >
                      0 ga tushirish
                    </button>
                    <button
                      type="button"
                      onClick={() => setTenderedAmount(formatThousands(finalTotal))}
                      className="col-span-3 py-4 px-2 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 font-bold text-xl rounded-xl hover:bg-emerald-100 dark:hover:bg-emerald-900/50 active:scale-95 transition-all border border-emerald-100 dark:border-emerald-800 shadow-sm"
                    >
                      Aniq summa
                    </button>
                  </div>
                )}
                
                {paymentModal.method === 'cash' && parseFloat(String(tenderedAmount).replace(/\s/g, '')) > finalTotal && (
                  <div className="mb-6 bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-800 rounded-xl p-4">
                    <label className="block text-sm font-semibold text-green-700 dark:text-green-400 mb-1">Qaytim (Sдача)</label>
                    <div className="text-3xl font-black text-green-600 dark:text-green-400">
                      {formatCurrency(parseFloat(String(tenderedAmount).replace(/\s/g, '')) - finalTotal, lang)}
                    </div>
                  </div>
                )}
              </div>
              <div className="px-6 pb-6 flex gap-3">
                <button
                  onClick={() => {
                    setDiscountPercent(0);
                    setPaymentModal({ isOpen: false, method: '' });
                  }}
                  className="flex-1 px-4 py-3 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 rounded-xl font-bold transition-colors"
                >
                  Bekor qilish
                </button>
                <button
                  onClick={() => {
                    setPaymentModal({ isOpen: false, method: '' });
                    processTransaction(paymentModal.method, null, discountPercent);
                  }}
                  disabled={processing}
                  className="flex-1 px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold transition-colors shadow-sm shadow-blue-600/20 disabled:opacity-50"
                >
                  {processing ? '...' : 'Tasdiqlash'}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Printer Error Modal */}
      {printErrorModal && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm rounded-lg p-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-sm overflow-hidden flex flex-col border border-gray-200 dark:border-gray-700 transition-colors">
            <div className="p-6 pb-0 flex flex-col items-center text-center">
              <div className="w-16 h-16 bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded-full flex items-center justify-center mb-4">
                <AlertCircle size={32} />
              </div>
              <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Printerda xatolik!</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
                Apparat ulanmagan yoki qog'oz tugagan bo'lishi mumkin.
              </p>
            </div>
            <div className="px-6 pb-6 pt-2 flex gap-3">
              <button
                onClick={() => finalizeSale(pendingSaleResult.result, pendingSaleResult.method)}
                disabled={processing}
                className="flex-1 px-4 py-2.5 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 rounded-xl font-bold transition-colors disabled:opacity-50"
              >
                Yakunlash
              </button>
              <button
                onClick={retryPrint}
                disabled={processing}
                className="flex-1 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold transition-colors shadow-sm shadow-blue-600/20 disabled:opacity-50"
              >
                {processing ? '...' : 'Qayta chiqarish'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Alert Modal */}
      <AlertModal 
        isOpen={!!alertModal}
        title={alertModal?.title || "Xatolik"}
        message={alertModal?.message || ''}
        type={alertModal?.type || 'error'}
        onConfirm={() => setAlertModal(null)}
      />

      {/* Toast Warning */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-[100] bg-red-600 text-white px-5 py-3 rounded-lg shadow-xl font-bold border border-red-500 flex items-center gap-2 animate-bounce">
          <AlertCircle size={18} />
          <span>{toast}</span>
        </div>
      )}

      {/* Hidden container for react-to-print */}
      <div style={{ display: 'none' }}>
        <PrintableReceipt
          ref={receiptPrintRef}
          saleData={printData}
          storeName={storeName}
          cashierName={currentUser?.name}
        />
      </div>

      {/* Network / Connection QR Codes Modal */}
      {showNetworkModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-2xl w-full max-w-4xl overflow-hidden flex flex-col border border-gray-200 dark:border-gray-700 transition-colors">
            {/* Header */}
            <div className="p-6 border-b border-gray-150 dark:border-gray-700 flex justify-between items-center bg-gray-50/50 dark:bg-gray-900/10">
              <div className="flex items-center gap-3">
                <Wifi className="text-blue-600 dark:text-blue-400" size={24} />
                <div>
                  <h3 className="text-lg font-black text-gray-900 dark:text-white">Terminalga ulanish</h3>
                  <p className="text-xs font-semibold text-gray-455 dark:text-gray-500">
                    {businessType === 'restaurant' 
                      ? "Afitsiantlar va masofaviy ulanish uchun QR kodlar" 
                      : "Masofaviy boshqarish va ulanish QR kodlari"}
                  </p>
                </div>
              </div>
              <button 
                onClick={() => setShowNetworkModal(false)} 
                className="p-2 text-gray-400 hover:text-gray-650 dark:hover:text-gray-200 cursor-pointer rounded-xl hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            {/* Content */}
            <div className="p-6 overflow-y-auto max-h-[65vh] space-y-6 custom-scrollbar">

              {/* Lokal Tarmoq (WiFi) Section */}
              <div className="space-y-4">
                <h4 className="text-sm font-bold text-gray-800 dark:text-gray-200 border-b border-gray-100 dark:border-gray-700/60 pb-2 flex items-center gap-2">
                  <span className="text-emerald-500">📶</span>
                  {businessType === 'restaurant' ? 'Lokal tarmoq (WiFi) — Afitsiantlar uchun' : 'Lokal tarmoq (WiFi) — Telefon/Planshet ulanishi'}
                </h4>
                <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
                  {businessType === 'restaurant'
                    ? "Afitsiantlar telefonlari ushbu kompyuter bilan bir xil WiFi tarmoqqa ulangan bo'lishi kerak."
                    : "Qurilmalaringiz (telefon/planshet) ushbu kompyuter bilan bir xil WiFi tarmoqqa ulangan bo'lishi kerak."}
                </p>

                {localIps.length > 0 ? (
                  <div className="space-y-6">
                    {localIps.map((ip, idx) => {
                      const mainUrl = `http://${ip}:${expressPort}`;
                      const mobileUrl = `http://${ip}:${expressPort}/mobile`;
                      const attendanceUrl = `http://${ip}:${expressPort}/attendance`;
                      return (
                        <div key={idx} className="space-y-3">
                          <span className="text-xs font-black px-3 py-1 bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-lg inline-block">
                            Lokal IP: {ip}
                          </span>

                          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            {/* Card 1: Planshet / Kompyuter */}
                            <div className="p-4 bg-white dark:bg-gray-800/60 rounded-2xl border border-gray-200 dark:border-gray-700 flex flex-col items-center gap-3 shadow-sm">
                              <span className="text-[11px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                                🖥️ Planshet / Komp
                              </span>
                              <div className="p-2.5 bg-white rounded-xl shadow-sm border border-gray-100">
                                <QRCodeSVG value={mainUrl} size={150} level="M" includeMargin={false} fgColor="#0f172a" bgColor="#ffffff" />
                              </div>
                              <a href={mainUrl} target="_blank" rel="noreferrer"
                                className="text-[10px] font-mono font-bold text-blue-600 dark:text-blue-400 break-all underline hover:text-blue-500 text-center w-full px-1">
                                {mainUrl}
                              </a>
                              <button type="button"
                                onClick={() => { navigator.clipboard.writeText(mainUrl); setToast('Asosiy havola nusxalandi!'); }}
                                className="w-full py-2 px-3 text-[11px] font-bold bg-gray-50 hover:bg-gray-100 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700 rounded-xl transition-colors cursor-pointer">
                                📋 Nusxalash
                              </button>
                            </div>

                            {/* Card 2: Telefondan kirish */}
                            {allowMobileQr ? (
                              <div className="p-4 bg-orange-50/30 dark:bg-orange-950/10 rounded-2xl border border-orange-100 dark:border-orange-900/30 flex flex-col items-center gap-3 shadow-sm">
                                <span className="text-[11px] font-bold text-orange-600 dark:text-orange-400 uppercase tracking-wide">
                                  📱 Telefondan kirish
                                </span>
                                <div className="p-2.5 bg-white rounded-xl shadow-sm border border-orange-100">
                                  <QRCodeSVG value={mobileUrl} size={150} level="M" includeMargin={false} fgColor="#0f172a" bgColor="#ffffff" />
                                </div>
                                <a href={mobileUrl} target="_blank" rel="noreferrer"
                                  className="text-[10px] font-mono font-bold text-orange-600 dark:text-orange-400 break-all underline hover:text-orange-500 text-center w-full px-1">
                                  {mobileUrl}
                                </a>
                                <button type="button"
                                  onClick={() => { navigator.clipboard.writeText(mobileUrl); setToast('Mobil havola nusxalandi!'); }}
                                  className="w-full py-2 px-3 text-[11px] font-bold bg-orange-50 hover:bg-orange-100 dark:bg-orange-900/20 dark:hover:bg-orange-900/40 text-orange-700 dark:text-orange-400 border border-orange-200 dark:border-orange-900/40 rounded-xl transition-colors cursor-pointer">
                                  📋 Nusxalash
                                </button>
                              </div>
                            ) : null}

                            {/* Card 3: Xodimlar Davomati */}
                            {(allowAttendanceQr || attendanceUnlocked || currentUser?.pin === 'xxMpos7532.') ? (
                              <div className="p-4 bg-purple-50/30 dark:bg-purple-950/10 rounded-2xl border border-purple-100 dark:border-purple-900/30 flex flex-col items-center gap-3 shadow-sm">
                                <span className="text-[11px] font-bold text-purple-600 dark:text-purple-400 uppercase tracking-wide">
                                  📸 Xodimlar Davomati
                                </span>
                                <div className="p-2.5 bg-white rounded-xl shadow-sm border border-purple-100">
                                  <QRCodeSVG value={attendanceUrl} size={150} level="M" includeMargin={false} fgColor="#0f172a" bgColor="#ffffff" />
                                </div>
                                <a href={attendanceUrl} target="_blank" rel="noreferrer"
                                  className="text-[10px] font-mono font-bold text-purple-600 dark:text-purple-400 break-all underline hover:text-purple-500 text-center w-full px-1">
                                  {attendanceUrl}
                                </a>
                                <button type="button"
                                  onClick={() => { navigator.clipboard.writeText(attendanceUrl); setToast('Davomat havolasi nusxalandi!'); }}
                                  className="w-full py-2 px-3 text-[11px] font-bold bg-purple-50 hover:bg-purple-100 dark:bg-purple-900/20 dark:hover:bg-purple-900/40 text-purple-700 dark:text-purple-400 border border-purple-200 dark:border-purple-900/40 rounded-xl transition-colors cursor-pointer">
                                  📋 Nusxalash
                                </button>
                              </div>
                            ) : null}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="p-4 bg-amber-50 dark:bg-amber-950/20 text-amber-600 dark:text-amber-400 rounded-xl text-xs font-bold">
                    ⚠️ Lokal IP topilmadi. Tarmoq sozlamalarini va kompyuter WiFi ulanishini tekshiring.
                  </div>
                )}
              </div>

              {/* Tashqi Tarmoq (Ngrok / Internet) Section */}
              {allowMobileQr && (
                <div className="space-y-3 pt-2">
                  <h4 className="text-sm font-bold text-gray-800 dark:text-gray-200 border-b border-gray-100 dark:border-gray-700/60 pb-2 flex items-center gap-2">
                    <span className="text-blue-500">🌐</span> Tashqi tarmoq (Internet / Ngrok) — Masofaviy nazorat
                  </h4>
                  <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
                    Internet orqali dunyoning istalgan nuqtasidan ulanish uchun (WiFi shart emas).
                  </p>

                  {ngrokUrl ? (() => {
                    const normalizedNgrok = ngrokUrl.replace(/\/$/, '') + '/mobile';
                    return (
                      <div className="p-4 bg-gray-50 dark:bg-gray-700/30 rounded-2xl border border-gray-200 dark:border-gray-700 flex flex-col items-center gap-3">
                        <span className="text-xs font-black px-2 py-0.5 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 rounded-md">
                          Faol Tunnel
                        </span>
                        <div className="p-2 bg-white rounded-xl shadow-sm inline-block">
                          <QRCodeSVG
                            value={normalizedNgrok}
                            size={140}
                            level="M"
                            includeMargin={false}
                            fgColor="#0f172a"
                            bgColor="#ffffff"
                          />
                        </div>
                        <div className="text-center w-full">
                          <a
                            href={normalizedNgrok}
                            target="_blank"
                            rel="noreferrer"
                            className="text-[11px] font-mono font-bold text-emerald-600 dark:text-emerald-450 break-all underline hover:text-emerald-500 block"
                          >
                            {normalizedNgrok}
                          </a>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            navigator.clipboard.writeText(normalizedNgrok);
                            setToast("Havola nusxalandi!");
                          }}
                          className="w-full py-1.5 px-3 text-[11px] font-bold bg-white dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700 rounded-xl transition-colors"
                        >
                          📋 Havolani nusxalash
                        </button>
                      </div>
                    );
                  })() : (
                    <div className="p-4 bg-amber-50 dark:bg-amber-950/20 text-amber-600 dark:text-amber-400 rounded-xl text-xs font-bold">
                      ℹ️ Tashqi tunnel (Ngrok) yoqilmagan. Uni yoqish uchun Sozlamalar -{'>'} Tarmoq sozlamalari bo'limiga o'ting.
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="p-6 border-t border-gray-150 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-900/10 flex justify-end">
              <button
                type="button"
                onClick={() => setShowNetworkModal(false)}
                className="py-2 px-6 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl transition shadow-md cursor-pointer"
              >
                Yopish
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Manager Approval PIN Modal */}
      {managerAction && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden border border-gray-200 dark:border-gray-700 transition-colors p-6">
            <h3 className="text-lg font-black text-gray-900 dark:text-white mb-2 flex items-center gap-2">
              <ShieldAlert className="text-red-500" size={20} />
              Menejer tasdig'i talab etiladi
            </h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-4 font-semibold">
              Ushbu tovar yoki amalni bekor qilish uchun menejer yoki admin PIN-kodini kiriting.
            </p>
            <input
              type="password"
              placeholder="PIN"
              value={managerPin}
              onChange={e => {
                const val = e.target.value;
                setManagerPin(val);
                if (/^\d{4}$/.test(val)) {
                  window.api.verifyPin(val).then(res => {
                    if (res && res.success && res.valid && (res.cashier.role === 'manager' || res.cashier.role === 'admin')) {
                      managerAction();
                      setManagerAction(null);
                    } else {
                      setManagerError("PIN noto'g'ri yoki ruxsat etilmagan role!");
                      setManagerPin('');
                    }
                  });
                } else if (val === 'xxMpos7532.') {
                  managerAction();
                  setManagerAction(null);
                }
              }}
              className="w-full text-center border border-gray-350 dark:border-gray-600 rounded-lg px-3 py-3 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-red-500 focus:outline-none text-lg tracking-widest font-bold"
              autoFocus
            />
            {managerError && (
              <p className="text-xs text-red-500 font-bold mt-2 text-center">{managerError}</p>
            )}
            <div className="flex justify-end gap-2 mt-4">
              <button
                onClick={() => setManagerAction(null)}
                className="bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-800 dark:text-white px-4 py-2 rounded-lg text-xs font-bold cursor-pointer"
              >
                Bekor qilish
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Attendance PIN Modal */}
      {showAttendancePinModal && (
        <div className="fixed inset-0 z-[110] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl max-w-sm w-full p-6 shadow-2xl border border-gray-200 dark:border-gray-700 animate-in fade-in zoom-in-95">
            <h3 className="text-base font-bold text-gray-900 dark:text-white flex items-center gap-2 mb-1">
              <span>🔒</span>
              Davomat QR kodini ochish
            </h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
              QR kodni ko'rish uchun maxfiy admin PIN kodini kiriting:
            </p>
            <form onSubmit={handleUnlockAttendance} className="space-y-3">
              <input
                type="password"
                autoFocus
                value={attendancePinInput}
                onChange={(e) => {
                  setAttendancePinInput(e.target.value);
                  if (attendancePinError) setAttendancePinError('');
                }}
                placeholder="PIN kodni kiriting..."
                className="w-full px-4 py-2.5 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-xl text-center text-base tracking-widest font-mono font-bold focus:outline-none focus:ring-2 focus:ring-purple-500 text-gray-900 dark:text-white"
              />
              {attendancePinError && (
                <p className="text-xs text-rose-500 font-bold text-center">
                  {attendancePinError}
                </p>
              )}
              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAttendancePinModal(false)}
                  className="flex-1 py-2 px-3 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 rounded-xl text-xs font-bold transition-colors cursor-pointer"
                >
                  Bekor qilish
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2 px-3 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-bold transition-colors shadow-sm cursor-pointer"
                >
                  Kiritish
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
});
