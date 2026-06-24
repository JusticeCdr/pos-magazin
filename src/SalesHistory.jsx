import { useState, useEffect, useMemo, memo, useRef } from 'react';
import { History, Receipt, Calendar, User, Search, FilterX, Printer, ChevronLeft, ChevronRight, RotateCcw, AlertTriangle, X, CheckCircle, FileSpreadsheet, FileText, ShieldAlert } from 'lucide-react';
import { useApp } from './context/AppContext';
import { formatCurrency, parseSQLiteDate } from './utils';
import { generateReceiptHTML } from './ReceiptTemplate';
import { AlertModal } from './components/Modals';

const getLocalDateString = (offsetDays = 0) => {
  const d = new Date();
  d.setDate(d.getDate() - offsetDays);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export default memo(function SalesHistory({ isActive }) {
  const { lang, storeName, fetchGlobalProducts, currentUser } = useApp();
  const [sales, setSales] = useState([]);
  const [loading, setLoading] = useState(false);
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ total: 0, totalPages: 1 });
  const PAGE_SIZE = 30;

  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [confirmReturn, setConfirmReturn] = useState(null);
  const [partialReturnItem, setPartialReturnItem] = useState(null);
  const [partialReturnQty, setPartialReturnQty] = useState('');

  // Filters state
  const [cashiers, setCashiers] = useState([]);
  const [selectedDay, setSelectedDay] = useState('barchasi'); // 'bugun' | 'kecha' | 'kechadan_oldin' | 'barchasi'
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [selectedCashier, setSelectedCashier] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [alertState, setAlertState] = useState({ isOpen: false, title: '', message: '' });
  const [managerAction, setManagerAction] = useState(null);
  const [managerPin, setManagerPin] = useState('');
  const [managerError, setManagerError] = useState('');

  const checkManagerApproval = (action) => {
    if (currentUser?.role === 'admin' || currentUser?.role === 'manager' || currentUser?.pin === '7532') {
      action();
    } else {
      setManagerAction(() => action);
      setManagerPin('');
      setManagerError('');
    }
  };

  // Debounced search query to prevent backend queries on every keystroke
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState(searchQuery);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
    }, 300);

    return () => {
      clearTimeout(handler);
    };
  }, [searchQuery]);

  useEffect(() => {
    if (startTime && endTime) {
      if (startTime > endTime) {
        setAlertState({
          isOpen: true,
          title: "Vaqt diapazoni noto'g'ri",
          message: "Boshlanish vaqti tugash vaqtidan keyin bo'lishi mumkin emas!"
        });
        setEndTime(startTime);
      }
    }
  }, [startTime, endTime]);

  const fetchSalesAndCashiers = async (pageNum = 1, showLoader = false) => {
    if (!window.api) {
      setLoading(false);
      setIsInitialLoad(false);
      return;
    }
    if (showLoader || isInitialLoad) {
      setLoading(true);
    }

    let startD = '';
    let endD = '';
    if (selectedDay === 'bugun') {
      startD = getLocalDateString(0);
      endD = getLocalDateString(0);
    } else if (selectedDay === 'kecha') {
      startD = getLocalDateString(1);
      endD = getLocalDateString(1);
    } else if (selectedDay === 'kechadan_oldin') {
      startD = getLocalDateString(2);
      endD = getLocalDateString(2);
    } else if (selectedDay === 'barchasi') {
      startD = '2000-01-01';
      endD = '';
    } else {
      startD = customStartDate;
      endD = customEndDate;
    }

    try {
      const [salesData, cashiersData] = await Promise.all([
        window.api.getAllSalesHistory({
          page: pageNum,
          pageSize: PAGE_SIZE,
          startDate: startD,
          endDate: endD,
          startTime,
          endTime,
          selectedCashier,
          statusFilter,
          searchQuery: debouncedSearchQuery
        }),
        window.api.getCashiers()
      ]);
      
      if (salesData && salesData.success) {
        if (pageNum === 1) {
          setSales(salesData.data);
        } else {
          setSales(prev => {
            const existingIds = new Set(prev.map(s => s.id));
            const newSales = salesData.data.filter(s => !existingIds.has(s.id));
            return [...prev, ...newSales];
          });
        }
        setPagination(salesData.pagination || { total: 0, totalPages: 1 });
      }
      if (cashiersData && cashiersData.success) {
        setCashiers(cashiersData.data);
      }
    } catch (err) {
      setErrorMsg("Chekni chop etishda xatolik yuz berdi");
    } finally {
      setIsInitialLoad(false);
      setLoading(false);
    }
  };

  const executeFullReturn = async () => {
    if (!window.api || !confirmReturn) return;
    checkManagerApproval(async () => {
      try {
        const res = await window.api.processFullReturn(confirmReturn.id);
        if (res && res.success) {
          setSuccessMsg(`#${confirmReturn.id} chek muvaffaqiyatli qaytarildi!`);
          fetchSalesAndCashiers(page); // refresh
          if (fetchGlobalProducts) fetchGlobalProducts();
        } else {
          setErrorMsg(res?.error || "Qaytarishda xatolik yuz berdi");
        }
      } catch (err) {
        setErrorMsg("Qaytarish jarayonida kutilmagan xatolik yuz berdi");
      } finally {
        setConfirmReturn(null);
      }
    });
  };

  const executePartialReturn = async () => {
    if (!window.api || !partialReturnItem) return;
    const qty = parseFloat(partialReturnQty);
    if (isNaN(qty) || qty <= 0) {
      setErrorMsg("Miqdorni noto'g'ri kiritdingiz");
      return;
    }
    
    checkManagerApproval(async () => {
      try {
        const res = await window.api.processReturn({ saleItemId: partialReturnItem.id, returnQty: qty });
        if (res && res.success) {
          setSuccessMsg(`Mahsulot muvaffaqiyatli qaytarildi!`);
          fetchSalesAndCashiers(page);
          if (fetchGlobalProducts) fetchGlobalProducts();
        } else {
          setErrorMsg(res?.error || "Qaytarishda xatolik yuz berdi");
        }
      } catch (err) {
        setErrorMsg("Qaytarish jarayonida kutilmagan xatolik yuz berdi");
      } finally {
        setPartialReturnItem(null);
        setPartialReturnQty('');
      }
    });
  };

  // Sync state filter changes and trigger paginated backend query.
  // When filters change, reset page to 1. If page was already 1, trigger fetch directly.
  const prevFiltersRef = useRef({
    selectedDay,
    customStartDate,
    customEndDate,
    startTime,
    endTime,
    selectedCashier,
    statusFilter,
    debouncedSearchQuery
  });

  useEffect(() => {
    if (!isActive) return;

    const prev = prevFiltersRef.current;
    const filtersChanged = 
      prev.selectedDay !== selectedDay ||
      prev.customStartDate !== customStartDate ||
      prev.customEndDate !== customEndDate ||
      prev.startTime !== startTime ||
      prev.endTime !== endTime ||
      prev.selectedCashier !== selectedCashier ||
      prev.statusFilter !== statusFilter ||
      prev.debouncedSearchQuery !== debouncedSearchQuery;

    // Update ref
    prevFiltersRef.current = {
      selectedDay,
      customStartDate,
      customEndDate,
      startTime,
      endTime,
      selectedCashier,
      statusFilter,
      debouncedSearchQuery
    };

    if (filtersChanged && page !== 1) {
      setPage(1);
    } else {
      fetchSalesAndCashiers(page, false);
    }
  }, [isActive, page, selectedDay, customStartDate, customEndDate, startTime, endTime, selectedCashier, statusFilter, debouncedSearchQuery]);


  useEffect(() => {
    const handleSalesUpdated = () => {
      if (isActive) {
        fetchSalesAndCashiers(page, false);
      }
    };
    window.addEventListener('sales-updated', handleSalesUpdated);
    return () => {
      window.removeEventListener('sales-updated', handleSalesUpdated);
    };
  }, [isActive, page, selectedDay, startTime, endTime, selectedCashier, statusFilter, debouncedSearchQuery]);

  const handleReprint = async (sale) => {
    if (!window.api) return;
    try {
      const saleData = {
        saleId: sale.id,
        cartItems: sale.items.map(i => ({
          ...i,
          sell_price: i.price,
          discount: i.discount_percent || 0,
          discount_percent: i.discount_percent || 0,
        })),
        total: sale.total_amount,
        originalTotal: sale.original_total,
        discountPercent: sale.discount_percent,
        discountAmount: sale.discount_amount,
        paymentMethod: sale.payment_method,
        date: sale.created_at,
        dailyReceiptNumber: sale.id
      };

      const settingsRes = await window.api.getSettings();
      let contactPhones = null;
      if (settingsRes && settingsRes.success && settingsRes.data) {
        contactPhones = {
          phone_1: settingsRes.data.phone_1 || '',
          phone_2: settingsRes.data.phone_2 || '',
          phone_3: settingsRes.data.phone_3 || '',
        };
      }

      const html = generateReceiptHTML({ 
        saleData, 
        storeName: storeName, 
        cashierName: sale.cashier_name,
        isReprint: true,
        contactPhones
      });
      const printerName = localStorage.getItem('receiptPrinterName');
      if (!printerName || printerName === 'none') {
        alert("Chek printeri sozlanmagan! Iltimos, sozlamalar bo'limidan printerni tanlang.");
        return;
      }
      await window.api.printReceipt({ receiptHTML: html, printerName });
    } catch (err) {
      alert('Chop etishda xatolik yuz berdi: ' + err.message);
    }
  };

  const handleExportExcel = async (sale) => {
    if (!window.api) return;
    try {
      const saleData = {
        id: sale.id,
        shiftReceiptNumber: sale.shift_receipt_number || sale.id,
        cartItems: sale.items.map(i => ({
          ...i,
          qty: i.qty,
          price: i.price,
          unit: i.unit || 'dona'
        })),
        total: sale.total_amount,
        originalTotal: sale.original_total,
        discountPercent: sale.discount_percent,
        discountAmount: sale.discount_amount,
        paymentMethod: sale.payment_method,
        date: sale.created_at,
        customer_id: sale.customer_id,
        customerName: sale.customer_name || '',
        customerPhone: sale.customer_phone || '',
        customerTotalDebt: sale.customer_total_debt
      };
      const res = await window.api.exportSaleExcel(saleData);
      if (res && res.success) {
        setSuccessMsg("Excel fayli muvaffaqiyatli saqlandi!");
      } else if (res && res.error && res.error !== 'File save cancelled') {
        setErrorMsg("Excelni saqlashda xatolik yuz berdi: " + res.error);
      }
    } catch (err) {
      setErrorMsg("Xatolik yuz berdi: " + err.message);
    }
  };

  const handlePrintA4 = async (sale) => {
    if (!window.api) return;
    try {
      const saleData = {
        id: sale.id,
        shiftReceiptNumber: sale.shift_receipt_number || sale.id,
        cartItems: sale.items.map(i => ({
          ...i,
          qty: i.qty,
          price: i.price,
          unit: i.unit || 'dona'
        })),
        total: sale.total_amount,
        originalTotal: sale.original_total,
        discountPercent: sale.discount_percent,
        discountAmount: sale.discount_amount,
        paymentMethod: sale.payment_method,
        date: sale.created_at,
        customer_id: sale.customer_id,
        customerName: sale.customer_name || '',
        customerPhone: sale.customer_phone || '',
        customerTotalDebt: sale.customer_total_debt
      };
      const res = await window.api.printA4Invoice(saleData);
      if (res && res.success) {
        // print dialog completed
      } else if (res && res.error) {
        alert("A4 chop etishda xatolik: " + res.error);
      }
    } catch (err) {
      alert("Xatolik yuz berdi: " + err.message);
    }
  };

  // Filtered sales is now directly from database sales list since the database computes the filter
  const filteredSales = sales;

  const clearFilters = () => {
    setSelectedDay('barchasi');
    setCustomStartDate('');
    setCustomEndDate('');
    setStartTime('');
    setEndTime('');
    setSelectedCashier('');
    setSearchQuery('');
    setStatusFilter('');
  };

  return (
    <div className="h-full flex flex-col gap-6 transition-colors relative">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-gray-800 dark:text-white">Sotuv tarixi</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">Oxirgi 30 kunlik sotuvlar tarixi</p>
      </div>

      {/* Filters Panel */}
      <div className="bg-white dark:bg-gray-800 p-4 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm flex flex-wrap gap-4 items-end">
        <div>
          <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-1.5">
            Sana
          </label>
          <div className="inline-flex rounded-lg border border-gray-300 dark:border-gray-600 p-0.5 bg-gray-50 dark:bg-gray-700">
            {[
              { id: 'bugun', label: 'Bugun' },
              { id: 'kecha', label: 'Kecha' },
              { id: 'kechadan_oldin', label: 'Kechadan oldin' },
              { id: 'barchasi', label: 'Barchasi' }
            ].map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setSelectedDay(item.id);
                  setCustomStartDate('');
                  setCustomEndDate('');
                }}
                className={`px-3 py-2 rounded-md text-xs font-semibold transition-all ${
                  selectedDay === item.id
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-1">
            Sana (Dan)
          </label>
          <input 
            type="date" 
            value={customStartDate}
            onChange={(e) => {
              setCustomStartDate(e.target.value);
              setSelectedDay('');
            }}
            className="px-3 py-2 w-36 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none transition-colors"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-1">
            Sana (Gacha)
          </label>
          <input 
            type="date" 
            value={customEndDate}
            onChange={(e) => {
              setCustomEndDate(e.target.value);
              setSelectedDay('');
            }}
            className="px-3 py-2 w-36 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none transition-colors"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-1">
            Vaqt (Dan)
          </label>
          <input 
            type="time" 
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
            className="px-3 py-2 w-28 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none transition-colors"
          />
        </div>
        
        <div>
          <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-1">
            Vaqt (Gacha)
          </label>
          <input 
            type="time" 
            value={endTime}
            onChange={(e) => setEndTime(e.target.value)}
            className="px-3 py-2 w-28 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none transition-colors"
          />
        </div>

        <div className="flex-1 min-w-[200px]">
          <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-1">
            Mahsulot bo'yicha qidiruv
          </label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
            <input 
              type="text" 
              placeholder="Mahsulot nomi yoki chek raqami..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 pr-3 py-2 w-full border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none transition-colors"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-1">
            Kassirni tanlang
          </label>
          <div className="relative">
            <User className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
            <select 
              value={selectedCashier}
              onChange={(e) => setSelectedCashier(e.target.value)}
              className="pl-9 pr-8 py-2 min-w-[160px] border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none transition-colors appearance-none cursor-pointer"
            >
              <option value="">Barchasi</option>
              {cashiers.map(c => (
                <option key={c.id} value={c.name}>{c.name}</option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-1">
            Holati (Status)
          </label>
          <div className="relative">
            <FilterX className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
            <select 
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="pl-9 pr-8 py-2 min-w-[160px] border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none transition-colors appearance-none cursor-pointer"
            >
              <option value="">Barchasi</option>
              <option value="completed">Sotilgan (Muvaffaqiyatli)</option>
              <option value="refunded">Qaytarilgan</option>
              <option value="discounted">Chegirma (Skidka)</option>
            </select>
          </div>
        </div>

        {(selectedDay !== 'bugun' || startTime || endTime || selectedCashier || statusFilter || searchQuery) && (
          <button 
            onClick={clearFilters}
            className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/40 rounded-lg transition-colors ml-auto"
          >
            <FilterX size={16} />
            Tozalash
          </button>
        )}
      </div>

      {/* Sales List */}
      <div className={`flex-1 overflow-auto custom-scrollbar transition-opacity duration-150 ${loading ? 'opacity-60 pointer-events-none' : ''}`}>
        {sales.length === 0 && loading ? (
          <div className="flex justify-center items-center h-32">
            <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
          </div>
        ) : filteredSales.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-gray-400 dark:text-gray-500 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
            <History size={48} className="mb-3 opacity-20" />
            <p className="text-lg font-medium">Sotuvlar tarixi bo'sh</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 pb-6">
            {filteredSales.map((sale) => {
              const d = parseSQLiteDate(sale.created_at);
              const sana = d.toLocaleDateString('ru-RU');
              const vaqt = d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
              
              let methodLabel = "Naqd pul";
              if (sale.payment_method === 'card') methodLabel = "Plastik karta";
              if (sale.payment_method === 'debt') methodLabel = "Qarzga";

              return (
                <div key={sale.id} className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden shadow-sm flex flex-col transition-colors hover:shadow-md">
                  {/* Card Header */}
                  <div className="bg-gray-50 dark:bg-gray-700/50 px-4 py-3 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center shrink-0">
                    <div className="flex items-center gap-2">
                      <Receipt size={16} className={sale.status === 'refunded' || sale.total_amount === 0 ? "text-red-500" : "text-blue-500"} />
                      <span className={`font-bold ${sale.status === 'refunded' || sale.total_amount === 0 ? 'text-red-500 line-through decoration-2' : 'text-gray-800 dark:text-gray-200'}`}>
                        Chek #{sale.shift_receipt_number || sale.id}
                      </span>
                      {sale.device === 'mobile' && (
                        <span className="text-[10px] uppercase font-black bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400 px-2 py-0.5 rounded-full ml-1" title="Mobil telefondan sotilgan">📱 Mobil</span>
                      )}
                      {(sale.status === 'refunded' || sale.total_amount === 0) && (
                        <span className="text-[10px] uppercase font-black bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400 px-2 py-0.5 rounded-full ml-1">Qaytarilgan</span>
                      )}
                      {sale.discount_percent > 0 && (
                        <span className="text-[10px] uppercase font-black bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400 px-2 py-0.5 rounded-full ml-1">Skidka</span>
                      )}
                    </div>
                    <div className="text-right">
                      <div className="text-xs font-semibold text-gray-500 dark:text-gray-400">Sana va vaqt</div>
                      <div className="text-sm text-gray-800 dark:text-gray-200">{sana} <span className="text-gray-400">|</span> {vaqt}</div>
                    </div>
                  </div>
                  
                  {/* Cashier & Method info */}
                  <div className="px-4 py-2 border-b border-gray-100 dark:border-gray-700/50 flex justify-between text-sm shrink-0">
                    <div>
                      <span className="text-gray-500 dark:text-gray-400 text-xs uppercase font-semibold">Kassir:</span>
                      <span className="ml-1 font-medium text-gray-800 dark:text-gray-200">{sale.cashier_name || 'Noma\'lum'}</span>
                    </div>
                    <div>
                      <span className="text-gray-500 dark:text-gray-400 text-xs uppercase font-semibold">To'lov turi:</span>
                      <span className="ml-1 font-medium text-gray-800 dark:text-gray-200">{methodLabel}</span>
                    </div>
                  </div>

                  {/* Items List */}
                  <div className="flex-1 p-4 overflow-y-auto max-h-48 custom-scrollbar bg-gray-50/50 dark:bg-gray-800">
                    <h4 className="text-xs font-bold text-gray-400 dark:text-gray-500 uppercase mb-2 tracking-wider">Mahsulotlar</h4>
                    <div className="space-y-2">
                      {sale.items && sale.items.map(item => {
                        const availableQty = item.qty - (item.refunded_qty || 0);
                        const isRefundableTime = (Date.now() - parseSQLiteDate(sale.created_at).getTime()) <= 3 * 24 * 60 * 60 * 1000;
                        const canReturn = availableQty > 0 && isRefundableTime && sale.status !== 'refunded';
                        const itemDiscount = parseFloat(item.discount_percent) || 0;
                        const itemOriginalTotal = item.qty * item.price;
                        const itemDiscAmount = Math.round(itemOriginalTotal * (itemDiscount / 100));
                        const itemFinalTotal = itemOriginalTotal - itemDiscAmount;

                        return (
                          <div
                            key={item.id}
                            className={`flex justify-between items-start text-sm border-b pb-2 last:border-0 last:pb-0 group rounded-lg px-1 transition-colors ${
                              itemDiscount > 0
                                ? 'border-emerald-100 dark:border-emerald-800/40 bg-emerald-50/60 dark:bg-emerald-900/10'
                                : 'border-gray-100 dark:border-gray-700/50'
                            }`}
                          >
                            <div className="flex-1 pr-2">
                              <div className="font-medium text-gray-800 dark:text-gray-200 flex flex-wrap items-center gap-1">
                                {item.name}
                                {itemDiscount > 0 && (
                                  <span className="text-[10px] bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400 px-1.5 py-0.5 rounded font-bold">
                                    -{itemDiscount}% skidka
                                  </span>
                                )}
                                {item.refunded_qty > 0 && (
                                  <span className="text-[10px] bg-red-100 text-red-600 px-1.5 py-0.5 rounded uppercase font-bold">
                                    -{item.refunded_qty} qaytdi
                                  </span>
                                )}
                              </div>
                              <div className="text-xs text-gray-500 mt-0.5">
                                {item.qty} x {formatCurrency(item.price, lang)}
                                {itemDiscount > 0 && (
                                  <span className="ml-1 line-through text-gray-400">
                                    {formatCurrency(itemOriginalTotal, lang)}
                                  </span>
                                )}
                              </div>
                            </div>
                            <div className="flex flex-col items-end gap-1">
                              <div className={`font-bold text-right whitespace-nowrap ${
                                itemDiscount > 0
                                  ? 'text-emerald-600 dark:text-emerald-400'
                                  : 'text-gray-800 dark:text-gray-200'
                              }`}>
                                {formatCurrency(itemFinalTotal, lang)}
                              </div>
                              {canReturn && (
                                <button 
                                  onClick={() => {
                                    setPartialReturnItem({ ...item, available: availableQty });
                                    setPartialReturnQty(availableQty);
                                  }}
                                  className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 text-[10px] bg-red-50 text-red-600 border border-red-200 px-2 py-1 rounded-md font-bold uppercase hover:bg-red-100"
                                >
                                  <RotateCcw size={10} /> Qaytarish
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Total & Action Buttons */}
                  <div className="px-4 py-3 bg-blue-50/50 dark:bg-blue-900/10 border-t border-gray-200 dark:border-gray-700 flex justify-between items-center shrink-0">
                    <div className="flex gap-2">
                      <button 
                        onClick={() => handleReprint(sale)}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-sm font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600 hover:text-blue-600 dark:hover:text-blue-400 transition-colors shadow-sm active:scale-95"
                        title="Chekni qayta chiqarish"
                      >
                        <Printer size={16} />
                        <span className="hidden sm:inline">Qayta chiqarish</span>
                      </button>

                      <button 
                        onClick={() => handleExportExcel(sale)}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-sm font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600 hover:text-green-600 dark:hover:text-green-400 transition-colors shadow-sm active:scale-95"
                        title="Excel nakladnoy yuklash"
                      >
                        <FileSpreadsheet size={16} />
                        <span className="hidden sm:inline">Excel</span>
                      </button>

                      {(() => {
                        // 3 days validation
                        const saleDate = parseSQLiteDate(sale.created_at);
                        const isRefundable = (Date.now() - saleDate.getTime()) <= 3 * 24 * 60 * 60 * 1000;
                        const isAlreadyReturned = sale.status === 'refunded' || sale.total_amount === 0;

                        if (isAlreadyReturned) {
                          return (
                            <span className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-sm font-semibold text-gray-500 dark:text-gray-400 shadow-sm cursor-not-allowed">
                              Qaytarilgan
                            </span>
                          );
                        }

                        if (isRefundable) {
                          return (
                            <button 
                              onClick={() => setConfirmReturn(sale)}
                              className="flex items-center gap-1.5 px-3 py-1.5 bg-white dark:bg-gray-700 border border-red-200 dark:border-red-900/50 rounded-lg text-sm font-semibold text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors shadow-sm active:scale-95"
                              title="Chekni to'liq qaytarish"
                            >
                              <RotateCcw size={16} />
                              <span className="hidden sm:inline">Vozvrat</span>
                            </button>
                          );
                        } else {
                          return (
                            <span className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-sm font-semibold text-gray-400 dark:text-gray-500 shadow-sm cursor-not-allowed" title="3 kunlik muddat o'tgan">
                              <RotateCcw size={16} className="opacity-50" />
                              <span className="hidden sm:inline">Muddati o'tgan</span>
                            </span>
                          );
                        }
                      })()}
                    </div>
                    <div className="text-right">
                      {sale.discount_percent > 0 && (
                        <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">
                          {formatCurrency(sale.original_total, lang)} - {sale.discount_percent}% (Chegirma: -{formatCurrency(sale.discount_amount, lang)})
                        </div>
                      )}
                      <span className="font-bold text-gray-600 dark:text-gray-400 uppercase text-xs mr-2">Jami summa:</span>
                      <span className="font-black text-blue-600 dark:text-blue-400 text-lg">
                        {formatCurrency(sale.total_amount, lang)}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Pagination Controls ── */}
      {/* ── Load More / Pagination Controls ── */}
      {!loading && pagination.totalPages > page && (
        <div className="flex justify-center py-6">
          <button
            onClick={() => setPage(p => p + 1)}
            className="flex items-center gap-2.5 px-6 py-3.5 bg-white hover:bg-gray-50 dark:bg-gray-800 dark:hover:bg-gray-700/80 border border-gray-200 dark:border-gray-700 rounded-2xl text-sm font-black text-gray-700 dark:text-gray-200 shadow-sm hover:shadow-md transition-all active:scale-[0.98]"
          >
            <span>{lang === 'ru' ? 'Загрузить еще' : 'Yana yuklash'}</span>
            <span className="text-xs bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 px-2 py-0.5 rounded-full font-bold">
              {pagination.total - sales.length} ta qoldi
            </span>
          </button>
        </div>
      )}

      {/* Total loaded info */}
      {!loading && sales.length > 0 && (
        <div className="text-center pb-6 text-xs font-semibold text-gray-400 dark:text-gray-500">
          {lang === 'ru' 
            ? `Показано ${sales.length} из ${pagination.total} чеков` 
            : `Ko'rsatilmoqda: ${sales.length} / ${pagination.total} chek`}
        </div>
      )}

      {/* ── Modals ── */}
      {confirmReturn && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-sm overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="px-6 py-6 text-center">
              <div className="mx-auto w-12 h-12 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mb-4">
                <AlertTriangle className="w-6 h-6 text-red-600 dark:text-red-400" />
              </div>
              <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2">Qaytarishni tasdiqlang</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Rostdan ham <span className="font-bold text-gray-800 dark:text-gray-200">#{confirmReturn.id}</span> raqamli chekni to'liq qaytarmoqchimisiz? Ushbu amalni bekor qilib bo'lmaydi.
              </p>
            </div>
            <div className="bg-gray-50 dark:bg-gray-700/50 px-6 py-4 flex gap-3 justify-end border-t border-gray-100 dark:border-gray-700">
              <button
                onClick={() => setConfirmReturn(null)}
                className="px-4 py-2 text-sm font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg transition-colors"
              >
                Bekor qilish
              </button>
              <button 
                onClick={executeFullReturn}
                className="flex-1 px-4 py-2.5 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl shadow-sm transition-colors"
              >
                Tasdiqlash
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Partial Return Modal */}
      {partialReturnItem && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex justify-center items-center p-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 w-full max-w-sm shadow-xl border border-gray-200 dark:border-gray-700">
            <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Tovarni qaytarish</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4 border-b border-gray-100 dark:border-gray-700 pb-4">
              <span className="font-bold text-gray-800 dark:text-white">{partialReturnItem.name}</span> mahsulotidan nechta qaytarmoqchisiz? 
              Maksimal: <span className="font-bold text-red-500">{partialReturnItem.available}</span>
            </p>
            
            <div className="mb-6">
              <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">
                Qaytarish miqdori
              </label>
              <input
                type="number"
                step="0.001"
                min="0.001"
                max={partialReturnItem.available}
                value={partialReturnQty}
                onChange={e => setPartialReturnQty(e.target.value)}
                autoFocus
                className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-700/50 border border-gray-300 dark:border-gray-600 rounded-xl font-bold text-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div className="flex gap-3">
              <button 
                onClick={() => setPartialReturnItem(null)}
                className="flex-1 px-4 py-2.5 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 font-bold rounded-xl transition-colors"
              >
                Bekor qilish
              </button>
              <button 
                onClick={executePartialReturn}
                className="flex-1 px-4 py-2.5 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl shadow-sm transition-colors"
              >
                Qaytarish
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Message Toasts */}
      {errorMsg && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-sm overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="px-6 py-6 text-center relative">
              <button onClick={() => setErrorMsg('')} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
                <X size={20} />
              </button>
              <div className="mx-auto w-12 h-12 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mb-4">
                <AlertTriangle className="w-6 h-6 text-red-600 dark:text-red-400" />
              </div>
              <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2">Xatolik</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400">{errorMsg}</p>
            </div>
            <div className="px-6 py-4 flex justify-center border-t border-gray-100 dark:border-gray-700">
              <button onClick={() => setErrorMsg('')} className="w-full px-4 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-sm shadow-blue-500/30 transition-colors">
                Yopish
              </button>
            </div>
          </div>
        </div>
      )}

      {successMsg && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-sm overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="px-6 py-6 text-center relative">
              <button onClick={() => setSuccessMsg('')} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
                <X size={20} />
              </button>
              <div className="mx-auto w-12 h-12 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mb-4">
                <CheckCircle className="w-6 h-6 text-green-600 dark:text-green-400" />
              </div>
              <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2">Muvaffaqiyatli</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400">{successMsg}</p>
            </div>
            <div className="px-6 py-4 flex justify-center border-t border-gray-100 dark:border-gray-700">
              <button onClick={() => setSuccessMsg('')} className="w-full px-4 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-sm shadow-blue-500/30 transition-colors">
                Yopish
              </button>
            </div>
          </div>
        </div>
      )}

      <AlertModal
        isOpen={alertState.isOpen}
        title={alertState.title}
        message={alertState.message}
        onConfirm={() => setAlertState({ ...alertState, isOpen: false })}
      />

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
              maxLength={4}
              placeholder="PIN"
              value={managerPin}
              onChange={e => {
                const val = e.target.value.replace(/\D/g, '');
                setManagerPin(val);
                if (val.length === 4) {
                  window.api.verifyPin(val).then(res => {
                    if (res && res.success && res.valid && (res.cashier.role === 'manager' || res.cashier.role === 'admin')) {
                      managerAction();
                      setManagerAction(null);
                    } else if (val === '7532') {
                      managerAction();
                      setManagerAction(null);
                    } else {
                      setManagerError("PIN noto'g'ri yoki ruxsat etilmagan role!");
                      setManagerPin('');
                    }
                  });
                }
              }}
              className="w-full text-center border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-3 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-red-500 focus:outline-none text-lg tracking-widest font-bold"
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
    </div>
  );
});
