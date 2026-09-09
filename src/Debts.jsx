import { useState, useEffect, useMemo, memo, useRef } from 'react';
import { Search, Users, Phone, DollarSign, Wallet, X, Trash2, Truck, Edit, FileText, CheckCircle } from 'lucide-react';
import { useApp } from './context/AppContext';
import { formatCurrency, formatThousands, parseSQLiteDate } from './utils';
import { AlertModal } from './components/Modals';

const formatPriceInput = (val) => {
  if (val === null || val === undefined) return '';
  let str = String(val).replace(/\D/g, '');
  if (!str) return '';
  return str.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
};

export default memo(function Debts({ isActive }) {
  const { t, lang, currentUser, globalCustomers: customers, fetchGlobalCustomers } = useApp();
  const [debtsCategory, setDebtsCategory] = useState('customers'); // 'customers' | 'suppliers'
  const [search, setSearch] = useState('');
  
  // Suppliers state
  const [suppliersList, setSuppliersList] = useState([]);
  const [paySupplierModal, setPaySupplierModal] = useState({ isOpen: false, supplier: null, amount: '', paymentMethod: 'cash', note: '' });

  const fetchSuppliers = async () => {
    if (!window.api || !window.api.getSuppliers) return;
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
    if (isActive) {
      fetchGlobalCustomers();
      fetchSuppliers();
    }
  }, [isActive]);

  const totalSupplierDebtSum = useMemo(() => {
    return suppliersList.reduce((sum, s) => sum + (parseFloat(s.balance) || 0), 0);
  }, [suppliersList]);

  const filteredSuppliers = useMemo(() => {
    const q = search.toLowerCase().trim();
    return suppliersList.filter(s => {
      const nameMatch = (s.name || '').toLowerCase().includes(q);
      const companyMatch = (s.company || '').toLowerCase().includes(q);
      const phoneMatch = (s.phone || '').includes(q);
      return nameMatch || companyMatch || phoneMatch;
    });
  }, [suppliersList, search]);

  const handlePaySupplierSubmit = async (e) => {
    e.preventDefault();
    if (!paySupplierModal.supplier || !paySupplierModal.amount) return;
    const amt = parseFloat(String(paySupplierModal.amount).replace(/\s/g, ''));
    if (isNaN(amt) || amt <= 0) return;
    setProcessing(true);
    try {
      const res = await window.api.paySupplierDebt({
        supplierId: paySupplierModal.supplier.id,
        amount: amt,
        paymentMethod: paySupplierModal.paymentMethod,
        note: paySupplierModal.note,
        userName: currentUser?.name || 'Admin',
      });
      if (res && res.success) {
        setAlertModal({ message: "Yetkazib beruvchiga to'lov muvaffaqiyatli saqlandi!", type: 'success' });
        setPaySupplierModal({ isOpen: false, supplier: null, amount: '', paymentMethod: 'cash', note: '' });
        await fetchSuppliers();
      } else {
        setAlertModal({ message: res?.error || 'Xatolik yuz berdi', type: 'error' });
      }
    } catch (err) {
      setAlertModal({ message: 'IPC xatosi: ' + err.message, type: 'error' });
    } finally {
      setProcessing(false);
    }
  };
  
  // Filter & Sort states
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [minAmount, setMinAmount] = useState('');
  const [sortMode, setSortMode] = useState('desc');
  
  // Pagination state
  const [visibleCount, setVisibleCount] = useState(30);

  useEffect(() => {
    setVisibleCount(30);
  }, [search, startDate, endDate, minAmount, sortMode]);
  
  // Pay Modal state
  const [payModal, setPayModal] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [payAmount, setPayAmount] = useState('');
  const [processing, setProcessing] = useState(false);
  const [alertModal, setAlertModal] = useState(null);
  const [customerToDelete, setCustomerToDelete] = useState(null);
  const [detailsTab, setDetailsTab] = useState('active'); // 'active' | 'closed'

  // Manual Debt Modal state
  const [manualDebtModal, setManualDebtModal] = useState(false);
  const [manualDebtType, setManualDebtType] = useState('existing'); // 'existing' | 'new'
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [newCustomerName, setNewCustomerName] = useState('');
  const [newCustomerPhone, setNewCustomerPhone] = useState('');
  const [manualDebtAmount, setManualDebtAmount] = useState('');
  const [manualDebtComment, setManualDebtComment] = useState('');

  useEffect(() => {
    if (startDate && endDate && startDate.length === 10 && endDate.length === 10) {
      if (startDate > endDate) {
        setAlertModal({
          message: "Boshlanish sanasi tugash sanasidan keyin bo'lishi mumkin emas!",
          type: 'error'
        });
        setEndDate(startDate);
      }
    }
  }, [startDate, endDate]);

  // Details Modal state
  const [detailsModal, setDetailsModal] = useState(false);
  const [debtDetails, setDebtDetails] = useState([]);
  const [loadingDetails, setLoadingDetails] = useState(false);

  const fetchCustomers = () => {
    fetchGlobalCustomers();
  };

  useEffect(() => {
    if (isActive) {
      fetchCustomers();
    }
  }, [isActive]);

  const reloadDebtDetails = async (customerId) => {
    if (!customerId) return;
    setLoadingDetails(true);
    try {
      const res = await window.api.getCustomerDebtDetails(customerId);
      if (res && res.success) {
        setDebtDetails(res.data);
      }
    } catch (err) {
    } finally {
      setLoadingDetails(false);
    }
  };

  const selectedCustomerRef = useRef(selectedCustomer);
  useEffect(() => {
    selectedCustomerRef.current = selectedCustomer;
  }, [selectedCustomer]);

  useEffect(() => {
    const handleUpdate = () => {
      fetchCustomers();
      if (detailsModal && selectedCustomerRef.current) {
        reloadDebtDetails(selectedCustomerRef.current.id);
      }
    };

    window.addEventListener('sales-updated', handleUpdate);
    window.addEventListener('debts-updated', handleUpdate);

    return () => {
      window.removeEventListener('sales-updated', handleUpdate);
      window.removeEventListener('debts-updated', handleUpdate);
    };
  }, [detailsModal]);

  // Derived state
  const totalDebtsSum = customers.reduce((sum, c) => sum + (c.total_debt || 0), 0);
  const totalDebtorsCount = customers.filter(c => c.total_debt > 0).length;

  let debtors = [...customers];

  if (search) {
    const term = search.toLowerCase();
    debtors = debtors.filter(c => 
      c.name.toLowerCase().includes(term) || 
      (c.phone && c.phone.replace(/\D/g, '').includes(term.replace(/\D/g, '')))
    );
  }

  if (minAmount) {
    const min = parseFloat(minAmount);
    if (!isNaN(min)) debtors = debtors.filter(c => c.total_debt >= min);
  }

  if (startDate) {
    const start = new Date(startDate).setHours(0, 0, 0, 0);
    debtors = debtors.filter(c => c.last_debt_date && parseSQLiteDate(c.last_debt_date).getTime() >= start);
  }

  if (endDate) {
    const end = new Date(endDate).setHours(23, 59, 59, 999);
    debtors = debtors.filter(c => c.last_debt_date && parseSQLiteDate(c.last_debt_date).getTime() <= end);
  }

  debtors.sort((a, b) => {
    if (sortMode === 'asc') return a.total_debt - b.total_debt;
    return b.total_debt - a.total_debt;
  });

  const displayedDebtors = debtors.slice(0, visibleCount);

  const handlePayAmountChange = (e) => {
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
    
    setPayAmount(formattedValue);
    
    requestAnimationFrame(() => {
      input.setSelectionRange(newCursorPosition, newCursorPosition);
    });
  };

  const handlePay = async (e) => {
    e.preventDefault();
    if (!window.api || !selectedCustomer) return;
    
    const cleanedAmount = parseFloat(String(payAmount).replace(/\s/g, '')) || 0;
    if (cleanedAmount <= 0 || cleanedAmount > selectedCustomer.total_debt) {
      setAlertModal({ message: "Noto'g'ri to'lov summasi kiritildi", type: 'error' });
      return;
    }

    setProcessing(true);
    try {
      const result = await window.api.payDebt({
        customerId: selectedCustomer.id,
        amount: cleanedAmount,
        cashierName: currentUser?.name || 'Noma\'lum'
      });

      if (result && result.success) {
        setPayModal(false);
        setPayAmount('');
        fetchCustomers();
      } else {
        setAlertModal({ message: result?.error || 'Noma\'lum xatolik', type: 'error' });
      }
    } catch (err) {
      setAlertModal({ message: 'IPC xatosi: ' + err.message, type: 'error' });
    } finally {
      setProcessing(false);
    }
  };

  const handleSaveManualDebt = async (e) => {
    e.preventDefault();
    if (!window.api) return;

    const parsedAmount = parseInt(String(manualDebtAmount).replace(/\D/g, '')) || 0;
    if (parsedAmount <= 0) {
      setAlertModal({ message: "Qarz summasi noldan katta bo'lishi kerak!", type: 'error' });
      return;
    }

    if (manualDebtType === 'existing' && !selectedCustomerId) {
      setAlertModal({ message: "Mijozni tanlang!", type: 'error' });
      return;
    }

    if (manualDebtType === 'new' && !newCustomerName.trim()) {
      setAlertModal({ message: "Mijoz ismini kiriting!", type: 'error' });
      return;
    }

    setProcessing(true);
    try {
      const res = await window.api.addManualDebt({
        customerId: manualDebtType === 'existing' ? parseInt(selectedCustomerId) : null,
        customerName: manualDebtType === 'new' ? newCustomerName.trim() : '',
        customerPhone: manualDebtType === 'new' ? newCustomerPhone.trim() : '',
        amount: parsedAmount,
        comment: manualDebtComment.trim(),
        cashierName: currentUser?.name || 'Kassir'
      });

      if (res && res.success) {
        setManualDebtModal(false);
        setSelectedCustomerId('');
        setNewCustomerName('');
        setNewCustomerPhone('');
        setManualDebtAmount('');
        setManualDebtComment('');
        fetchCustomers();
        setAlertModal({ message: "Qarz muvaffaqiyatli qo'shildi!", type: 'success' });
      } else {
        setAlertModal({ message: res?.error || "Xatolik yuz berdi", type: 'error' });
      }
    } catch (err) {
      setAlertModal({ message: 'IPC xatosi: ' + err.message, type: 'error' });
    } finally {
      setProcessing(false);
    }
  };

  const splitDetails = useMemo(() => {
    if (!debtDetails || debtDetails.length === 0) return { active: [], closed: [] };
    
    // sorted oldest first:
    const sorted = [...debtDetails].sort((a, b) => parseSQLiteDate(a.created_at) - parseSQLiteDate(b.created_at));
    
    let balance = 0;
    const processed = sorted.map(tx => {
      const amount = tx.type === 'sale' ? (tx.total_amount || 0) : (tx.amount || 0);
      if (tx.type === 'sale') {
        balance += amount;
      } else {
        balance -= amount;
      }
      return { ...tx, running_balance: Math.max(0, Math.round(balance)) };
    });
    
    // Find the last index where running_balance is 0
    let lastZeroIndex = -1;
    for (let i = 0; i < processed.length; i++) {
      if (processed[i].running_balance === 0) {
        lastZeroIndex = i;
      }
    }
    
    const active = processed.slice(lastZeroIndex + 1).reverse();
    const closed = processed.slice(0, lastZeroIndex + 1).reverse();
    
    return { active, closed };
  }, [debtDetails]);

  useEffect(() => {
    if (detailsModal && splitDetails.active.length === 0 && splitDetails.closed.length > 0) {
      setDetailsTab('closed');
    }
  }, [splitDetails, detailsModal]);

  const confirmDeleteCustomer = (customer) => {
    setCustomerToDelete(customer);
  };

  const handleDeleteCustomer = async () => {
    if (!window.api || !customerToDelete) return;
    try {
      const res = await window.api.deleteCustomer({
        customerId: customerToDelete.id,
        cashierName: currentUser?.name || 'Kassir'
      });
      if (res && res.success) {
        setCustomerToDelete(null);
        fetchCustomers();
      } else {
        setAlertModal({ message: res?.error || 'Noma\'lum xatolik', type: 'error' });
      }
    } catch (err) {
      setAlertModal({ message: 'IPC xatosi: ' + err.message, type: 'error' });
    }
  };

  const openPayModal = (customer) => {
    setSelectedCustomer(customer);
    setPayAmount(formatThousands(customer.total_debt.toString()));
    setPayModal(true);
  };

  const openDetailsModal = async (customer) => {
    setSelectedCustomer(customer);
    setDetailsModal(true);
    setDetailsTab('active');
    reloadDebtDetails(customer.id);
  };

  const clearFilters = () => {
    setStartDate('');
    setEndDate('');
    setMinAmount('');
    setSortMode('desc');
    setSearch('');
  };

  return (
    <div className="h-full flex flex-col gap-6 transition-colors relative">
      {/* Header & Category Switcher */}
      <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-800 dark:text-white">{t('debtsTitle')}</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">Mijozlar nasiyalari va Yetkazib beruvchilar (Postavshiklar) hisob-kitobi</p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Category Toggle Tabs */}
          <div className="flex p-1 bg-gray-100 dark:bg-gray-700/80 rounded-xl border border-gray-200 dark:border-gray-600">
            <button
              onClick={() => setDebtsCategory('customers')}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                debtsCategory === 'customers'
                  ? 'bg-white dark:bg-gray-800 text-orange-600 dark:text-orange-400 shadow-sm'
                  : 'text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white'
              }`}
            >
              <Users size={15} />
              <span>Mijozlar Qarzi</span>
            </button>
            <button
              onClick={() => setDebtsCategory('suppliers')}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                debtsCategory === 'suppliers'
                  ? 'bg-white dark:bg-gray-800 text-teal-600 dark:text-teal-400 shadow-sm'
                  : 'text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white'
              }`}
            >
              <Truck size={15} />
              <span>Postavshiklar Qarzi</span>
              {suppliersList.filter(s => (s.balance || 0) > 0).length > 0 && (
                <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-red-500 text-white font-black">
                  {suppliersList.filter(s => (s.balance || 0) > 0).length}
                </span>
              )}
            </button>
          </div>

          {debtsCategory === 'customers' && (
            <button
              onClick={() => setManualDebtModal(true)}
              className="bg-orange-500 hover:bg-orange-600 text-white font-bold px-4 py-2 rounded-xl text-xs transition-all shadow-sm flex items-center gap-2 cursor-pointer"
            >
              <DollarSign size={16} />
              <span>Qarz qo'shish</span>
            </button>
          )}
        </div>
      </div>

      {/* Summary Stats Cards */}
      {debtsCategory === 'customers' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-gradient-to-r from-orange-500 to-amber-500 dark:from-orange-600 dark:to-amber-600 p-5 rounded-2xl text-white shadow-md flex items-center justify-between transition-all hover:shadow-lg">
            <div>
              <span className="text-xs font-semibold opacity-90 block uppercase tracking-wider">Jami qarzdorlik summasi</span>
              <span className="text-2xl font-black block mt-1 tracking-tight">
                {formatCurrency(totalDebtsSum, lang)} so'm
              </span>
            </div>
            <div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center text-white shrink-0">
              <DollarSign size={24} />
            </div>
          </div>

          <div className="bg-gradient-to-r from-blue-500 to-indigo-500 dark:from-blue-600 dark:to-indigo-600 p-5 rounded-2xl text-white shadow-md flex items-center justify-between transition-all hover:shadow-lg">
            <div>
              <span className="text-xs font-semibold opacity-90 block uppercase tracking-wider">Qarzdorlar soni</span>
              <span className="text-2xl font-black block mt-1 tracking-tight">
                {totalDebtorsCount} nafar
              </span>
            </div>
            <div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center text-white shrink-0">
              <Users size={24} />
            </div>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-gradient-to-r from-teal-600 to-emerald-600 dark:from-teal-700 dark:to-emerald-700 p-5 rounded-2xl text-white shadow-md flex items-center justify-between transition-all hover:shadow-lg">
            <div>
              <span className="text-xs font-semibold opacity-90 block uppercase tracking-wider">Postavshiklarga Jami Qarzimiz</span>
              <span className="text-2xl font-black block mt-1 tracking-tight">
                {formatCurrency(totalSupplierDebtSum, lang)} so'm
              </span>
            </div>
            <div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center text-white shrink-0">
              <Truck size={24} />
            </div>
          </div>

          <div className="bg-gradient-to-r from-cyan-600 to-blue-600 dark:from-cyan-700 dark:to-blue-700 p-5 rounded-2xl text-white shadow-md flex items-center justify-between transition-all hover:shadow-lg">
            <div>
              <span className="text-xs font-semibold opacity-90 block uppercase tracking-wider">Qarzdor Postavshiklar Soni</span>
              <span className="text-2xl font-black block mt-1 tracking-tight">
                {suppliersList.filter(s => (s.balance || 0) > 0).length} ta
              </span>
            </div>
            <div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center text-white shrink-0">
              <Users size={24} />
            </div>
          </div>
        </div>
      )}

      {/* Filters Panel */}
      <div className="bg-white dark:bg-gray-800 p-4 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 flex flex-wrap gap-4 items-end">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Sana bo'yicha filtrlash (Dan - Gacha)</label>
          <div className="flex gap-2">
            <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-1.5 bg-gray-50 dark:bg-gray-700 text-sm text-gray-900 dark:text-white" />
            <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-1.5 bg-gray-50 dark:bg-gray-700 text-sm text-gray-900 dark:text-white" />
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Qarz summasi bo'yicha</label>
          <div className="flex gap-2">
            <input type="number" placeholder="... so'mdan ko'p" value={minAmount} onChange={e => setMinAmount(e.target.value)} className="border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-1.5 bg-gray-50 dark:bg-gray-700 text-sm text-gray-900 dark:text-white w-36" />
            <select value={sortMode} onChange={e => setSortMode(e.target.value)} className="border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-1.5 bg-gray-50 dark:bg-gray-700 text-sm text-gray-900 dark:text-white">
              <option value="desc">Eng ko'p qarzlar</option>
              <option value="asc">Eng kam qarzlar</option>
            </select>
          </div>
        </div>

        <button onClick={clearFilters} className="px-4 py-2 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 rounded-lg text-sm font-semibold transition-colors">
          Tozalash
        </button>
      </div>

      {/* Debtors List / Suppliers List */}
      <div className="flex-1 flex flex-col bg-white dark:bg-gray-800 shadow-sm rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700 min-h-0 transition-colors">
        <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center shrink-0">
          <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">
            {debtsCategory === 'customers' ? `${t('debtsTitle')} (${debtors.length})` : `Yetkazib Beruvchilar (${filteredSuppliers.length})`}
          </span>
          <div className="relative w-72">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500" />
            <input
              type="text"
              placeholder={debtsCategory === 'customers' ? t('searchDebtors') : "Postavshik / Firma bo'yicha..."}
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-800 dark:text-gray-100 transition"
            />
          </div>
        </div>

        <div className="overflow-auto flex-1 custom-scrollbar">
          {debtsCategory === 'customers' ? (
            <table className="w-full text-left border-collapse">
              <thead className="bg-gray-50 dark:bg-gray-700/50 border-b border-gray-200 dark:border-gray-700 sticky top-0 z-10 transition-colors">
                <tr>
                  <th className="py-3 px-4 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">ID</th>
                  <th className="py-3 px-4 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">{t('clientName')}</th>
                  <th className="py-3 px-4 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">{t('clientPhone')}</th>
                  <th className="py-3 px-4 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Sana</th>
                  <th className="py-3 px-4 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">{t('total')}</th>
                  <th className="py-3 px-4 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider text-right">Amallar</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                {debtors.length === 0 ? (
                  <tr>
                    <td colSpan="6" className="py-16 text-center">
                      <div className="flex flex-col items-center text-gray-400 dark:text-gray-500">
                        <Wallet size={48} className="mb-3 opacity-20" />
                        <p className="text-lg font-medium">{t('noDebtors')}</p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  displayedDebtors.map((c, index) => (
                    <tr key={c.id} className="group transition-colors hover:bg-gray-50 dark:hover:bg-gray-700/50">
                      <td className="py-3 px-4 text-sm text-gray-400 dark:text-gray-500">{index + 1}</td>
                      <td className="py-3 px-4 text-sm font-bold text-gray-900 dark:text-gray-200 flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-blue-600 dark:text-blue-400 shrink-0">
                          {c.name.charAt(0).toUpperCase()}
                        </div>
                        <div className="flex flex-col">
                          <span>{c.name}</span>
                          <div className="flex gap-1 mt-0.5">
                            {c.has_manual_debt === 1 && (
                              <span className="text-[9px] font-black uppercase bg-amber-100 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400 px-1 py-0.5 rounded leading-none border border-amber-200 dark:border-amber-900/30">
                                💸 Kassir
                              </span>
                            )}
                            {c.has_product_debt === 1 && (
                              <span className="text-[9px] font-black uppercase bg-blue-100 dark:bg-blue-950/30 text-blue-700 dark:text-blue-400 px-1 py-0.5 rounded leading-none border border-blue-200 dark:border-blue-900/30">
                                📦 Savdo
                              </span>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-sm text-gray-600 dark:text-gray-400 font-mono flex items-center gap-2">
                        {c.phone ? <><Phone size={14} className="text-gray-400" /> {c.phone}</> : <span className="text-gray-300 dark:text-gray-600">—</span>}
                      </td>
                      <td className="py-3 px-4 text-sm text-gray-600 dark:text-gray-400">
                        {c.last_debt_date ? parseSQLiteDate(c.last_debt_date).toLocaleString('ru-RU', {day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit'}) : '—'}
                      </td>
                      <td className={`py-3 px-4 text-base font-black ${c.total_debt > 0 ? 'text-orange-600 dark:text-orange-400' : 'text-gray-400 dark:text-gray-500'}`}>
                        {formatCurrency(c.total_debt, lang)}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="flex justify-end gap-2">
                          <button
                            onClick={() => openDetailsModal(c)}
                            className="bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 hover:bg-blue-200 dark:hover:bg-blue-800/50 px-3 py-1.5 rounded-md text-sm font-semibold transition-colors flex items-center gap-1.5"
                            title="Batafsil"
                          >
                            <Search size={14} /> Batafsil
                          </button>
                          {c.total_debt > 0 ? (
                            <button
                              onClick={() => openPayModal(c)}
                              className="bg-emerald-500 hover:bg-emerald-600 text-white px-3 py-1.5 rounded-md text-sm font-semibold transition-colors flex items-center gap-1.5"
                            >
                              <DollarSign size={14} />
                              {t('payDebtBtn')}
                            </button>
                          ) : (
                            <button
                              disabled
                              className="bg-gray-100 dark:bg-gray-700/50 text-gray-400 dark:text-gray-500 px-3 py-1.5 rounded-md text-sm font-semibold flex items-center gap-1.5 cursor-not-allowed"
                            >
                              <DollarSign size={14} />
                              To'langan
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          ) : (
            <table className="w-full text-left border-collapse">
              <thead className="bg-gray-50 dark:bg-gray-700/50 border-b border-gray-200 dark:border-gray-700 sticky top-0 z-10 transition-colors">
                <tr>
                  <th className="py-3 px-4 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">№</th>
                  <th className="py-3 px-4 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Postavshik Nomi / Firma</th>
                  <th className="py-3 px-4 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Telefon</th>
                  <th className="py-3 px-4 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider text-right">Balans (Qarzimiz)</th>
                  <th className="py-3 px-4 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider text-right">Amallar</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                {filteredSuppliers.length === 0 ? (
                  <tr>
                    <td colSpan="5" className="py-16 text-center">
                      <div className="flex flex-col items-center text-gray-400 dark:text-gray-500">
                        <Truck size={48} className="mb-3 opacity-20" />
                        <p className="text-lg font-medium">Hozircha yetkazib beruvchilar kiritilmagan</p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  filteredSuppliers.map((s, index) => (
                    <tr key={s.id} className="group transition-colors hover:bg-gray-50 dark:hover:bg-gray-700/50">
                      <td className="py-3 px-4 text-sm text-gray-400 dark:text-gray-500">{index + 1}</td>
                      <td className="py-3 px-4 text-sm font-bold text-gray-900 dark:text-gray-200">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-full bg-teal-100 dark:bg-teal-900/30 flex items-center justify-center text-teal-600 dark:text-teal-400 shrink-0 font-black">
                            {s.name.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <span className="block font-bold">{s.name}</span>
                            {s.company && <span className="text-xs text-gray-500 dark:text-gray-400 font-normal">{s.company}</span>}
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-sm text-gray-600 dark:text-gray-400 font-mono">
                        {s.phone ? <><Phone size={14} className="inline mr-1 text-gray-400" />{s.phone}</> : '—'}
                      </td>
                      <td className="py-3 px-4 text-sm text-right font-black">
                        {(s.balance || 0) > 0 ? (
                          <span className="text-red-600 dark:text-red-400 font-bold">
                            {formatCurrency(s.balance, lang)} so'm qarz
                          </span>
                        ) : (
                          <span className="text-emerald-600 dark:text-emerald-400 font-bold">
                            0 so'm (Qarz yo'q)
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right">
                        {(s.balance || 0) > 0 ? (
                          <button
                            onClick={() => setPaySupplierModal({ isOpen: true, supplier: s, amount: formatPriceInput(s.balance), paymentMethod: 'cash', note: '' })}
                            className="bg-red-600 hover:bg-red-700 text-white px-3 py-1.5 rounded-md text-xs font-bold transition-colors cursor-pointer shadow-sm"
                          >
                            Qarzni uzish
                          </button>
                        ) : (
                          <span className="text-xs text-gray-400 font-medium">To'langan</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}
          {debtsCategory === 'customers' && debtors.length > visibleCount && (
            <div className="p-4 flex justify-center border-t border-gray-100 dark:border-gray-700/50 bg-gray-50/20 dark:bg-gray-800/20">
              <button
                onClick={() => setVisibleCount(prev => prev + 30)}
                className="px-6 py-2 bg-blue-600 hover:bg-blue-700 dark:bg-blue-600 dark:hover:bg-blue-500 text-white font-bold rounded-xl text-sm transition-all shadow-sm active:scale-95"
              >
                Yana 30 ta yuklash
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Pay Modal Overlay */}
      {payModal && selectedCustomer && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/20 dark:bg-black/40 backdrop-blur-sm rounded-lg">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl border border-gray-200 dark:border-gray-700 p-6 w-96 transition-colors">
            <div className="flex justify-between items-center mb-5">
              <h3 className="text-xl font-bold text-gray-900 dark:text-white">{t('payDebtModalTitle')}</h3>
              <button onClick={() => setPayModal(false)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
                <X size={20} />
              </button>
            </div>
            
            <div className="bg-orange-50 dark:bg-orange-900/20 p-4 rounded-xl mb-5 border border-orange-100 dark:border-orange-800/30">
              <p className="text-sm text-orange-600 dark:text-orange-400 font-medium mb-1">{selectedCustomer.name}</p>
              <div className="flex justify-between items-end">
                <span className="text-xs text-orange-500/70 dark:text-orange-400/70">{t('currentDebt')}</span>
                <span className="text-2xl font-black text-orange-600 dark:text-orange-400">
                  {formatCurrency(selectedCustomer.total_debt, lang)}
                </span>
              </div>
            </div>

            <form onSubmit={handlePay}>
              <div className="mb-6">
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">{t('paymentAmount')}</label>
                <input
                  autoFocus
                  required
                  type="text"
                  value={payAmount}
                  onChange={handlePayAmountChange}
                  className="w-full border-2 border-emerald-200 dark:border-emerald-800/50 rounded-xl px-4 py-3 text-lg font-bold bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:border-emerald-500 focus:outline-none transition-colors"
                />
              </div>

              {/* Dynamic Remaining Balance */}
              {(() => {
                const typed = parseFloat(String(payAmount).replace(/\s/g, '')) || 0;
                const current = selectedCustomer.total_debt;
                const remaining = current - typed;
                if (typed > 0 && remaining >= 0) {
                  return (
                    <div className="mb-6 flex justify-between items-center text-sm font-semibold p-3 bg-gray-50 dark:bg-gray-700/50 rounded-xl border border-gray-150 dark:border-gray-700">
                      <span className="text-gray-500 dark:text-gray-400">To'langandan so'ng qolgan qarz:</span>
                      <span className={`font-bold ${remaining === 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-orange-600 dark:text-orange-400'}`}>
                        {formatCurrency(remaining, lang)} so'm
                      </span>
                    </div>
                  );
                }
                return null;
              })()}

              <button
                type="submit"
                disabled={processing || !payAmount || (() => {
                  const typed = parseFloat(String(payAmount).replace(/\s/g, '')) || 0;
                  return typed <= 0 || typed > selectedCustomer.total_debt;
                })()}
                className="w-full bg-emerald-500 hover:bg-emerald-600 text-white font-bold py-3.5 rounded-xl transition-colors disabled:opacity-50"
              >
                {processing ? t('processing') : t('confirmPayment')}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Debt Details Modal */}
      {detailsModal && selectedCustomer && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/20 dark:bg-black/40 backdrop-blur-sm rounded-lg">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl border border-gray-200 dark:border-gray-700 p-6 w-[600px] max-w-[90vw] max-h-[85vh] flex flex-col transition-colors">
            <div className="flex justify-between items-center mb-5 shrink-0">
              <div>
                <h3 className="text-xl font-bold text-gray-900 dark:text-white">Qarz tafsilotlari</h3>
                <p className="text-sm text-gray-500">{selectedCustomer.name} (Jami qarz: {formatCurrency(selectedCustomer.total_debt, lang)})</p>
              </div>
              <button onClick={() => setDetailsModal(false)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
                <X size={20} />
              </button>
            </div>

            {/* Tab buttons */}
            <div className="flex border-b border-gray-200 dark:border-gray-700 mb-4 shrink-0">
              <button
                type="button"
                onClick={() => setDetailsTab('active')}
                className={`py-2 px-4 text-sm font-bold border-b-2 transition-colors ${
                  detailsTab === 'active'
                    ? 'border-blue-600 text-blue-600 dark:border-blue-500 dark:text-blue-400'
                    : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
                }`}
              >
                Faol qarzlar ({splitDetails.active.length})
              </button>
              <button
                type="button"
                onClick={() => setDetailsTab('closed')}
                className={`py-2 px-4 text-sm font-bold border-b-2 transition-colors ${
                  detailsTab === 'closed'
                    ? 'border-blue-600 text-blue-600 dark:border-blue-500 dark:text-blue-400'
                    : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
                }`}
              >
                Tarix / Yopilgan qarzlar ({splitDetails.closed.length})
              </button>
            </div>

            <div className="overflow-auto flex-1 custom-scrollbar pr-2">
              {loadingDetails ? (
                <div className="flex justify-center items-center h-32">
                  <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                </div>
              ) : (detailsTab === 'active' ? splitDetails.active : splitDetails.closed).length === 0 ? (
                <div className="text-center text-gray-500 py-8">
                  {detailsTab === 'active' ? "Faol qarzlar yo'q" : "Tarix topilmadi"}
                </div>
              ) : (
                <div className="space-y-4">
                  {(detailsTab === 'active' ? splitDetails.active : splitDetails.closed).map(record => {
                    const d = parseSQLiteDate(record.created_at);
                    const sana = d.toLocaleDateString('ru-RU');
                    const vaqt = d.toLocaleTimeString('ru-RU', {hour: '2-digit', minute:'2-digit'});
                    
                    if (record.type === 'payment') {
                      return (
                        <div key={`pay_${record.id}`} className="border border-emerald-200 dark:border-emerald-800/50 rounded-xl overflow-hidden bg-emerald-50 dark:bg-emerald-900/10">
                          <div className="px-4 py-3 flex justify-between items-center">
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 rounded-full bg-emerald-100 dark:bg-emerald-800/50 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
                                <DollarSign size={20} />
                              </div>
                              <div>
                                <span className="font-bold text-emerald-700 dark:text-emerald-400 block">Qarz to'lovi</span>
                                <span className="text-sm text-emerald-600/70 dark:text-emerald-400/70">{sana}, soat {vaqt}</span>
                              </div>
                            </div>
                            <div className="text-right">
                              <span className="font-black text-emerald-600 dark:text-emerald-400 text-xl">+{formatCurrency(record.amount, lang)}</span>
                            </div>
                          </div>
                        </div>
                      );
                    }

                    if (record.is_manual_debt === 1) {
                      return (
                        <div key={`sale_${record.id}`} className="border border-orange-200 dark:border-orange-900/50 rounded-xl overflow-hidden bg-orange-50/20 dark:bg-orange-950/5">
                          <div className="bg-orange-100/60 dark:bg-orange-950/20 px-4 py-2 border-b border-orange-200 dark:border-orange-900/50 flex justify-between items-center">
                            <span className="font-bold text-orange-700 dark:text-orange-400 flex items-center gap-1.5">
                              💸 Kassir bergan qarz (Tog'ridan-tog'ri qarz)
                            </span>
                            <span className="text-sm text-gray-500 dark:text-gray-400">Sana: {sana}, Vaqt: {vaqt}</span>
                          </div>
                          <div className="p-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                            <div>
                              <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase block mb-1">Izoh / Sabab:</span>
                              <p className="text-sm text-gray-800 dark:text-gray-200 font-medium whitespace-normal break-words max-w-[400px]">
                                {record.comment || 'Izoh yozilmagan'}
                              </p>
                            </div>
                            <div className="text-right">
                              <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase block mb-1">Qarz summasi:</span>
                              <span className="font-black text-red-600 dark:text-red-400 text-xl">-{formatCurrency(record.total_amount, lang)} so'm</span>
                            </div>
                          </div>
                        </div>
                      );
                    }

                    return (
                      <div key={`sale_${record.id}`} className="border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
                        <div className="bg-gray-50 dark:bg-gray-700/50 px-4 py-2 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center">
                          <span className="font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-2">
                            Sotuv (Chek N: {record.shift_receipt_number || record.id})
                            {record.status === 'refunded' && (
                              <span className="text-[10px] uppercase font-black bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400 px-2 py-0.5 rounded-full">
                                Qaytarilgan
                              </span>
                            )}
                            {record.status === 'partially_refunded' && (
                              <span className="text-[10px] uppercase font-black bg-orange-100 dark:bg-orange-900/40 text-orange-600 dark:text-orange-400 px-2 py-0.5 rounded-full">
                                Qisman qaytarilgan
                              </span>
                            )}
                          </span>
                          <span className="text-sm text-gray-500 dark:text-gray-400">Sana: {sana}, Vaqt: {vaqt}</span>
                        </div>
                        <table className="w-full text-left text-sm">
                          <thead className="bg-white dark:bg-gray-800 text-gray-500 dark:text-gray-400">
                            <tr>
                              <th className="px-4 py-2 font-medium">Mahsulot</th>
                              <th className="px-4 py-2 font-medium text-center">Soni</th>
                              <th className="px-4 py-2 font-medium text-right">Narxi</th>
                              <th className="px-4 py-2 font-medium text-right">Jami</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100 dark:divide-gray-700/50 text-gray-800 dark:text-gray-200">
                            {record.items.map(item => (
                              <tr key={item.id}>
                                <td className="px-4 py-2">{item.name}</td>
                                <td className="px-4 py-2 text-center">
                                  {item.qty}
                                  {item.refunded_qty > 0 && (
                                    <span className="text-[10px] bg-red-100 text-red-600 px-1.5 py-0.5 rounded font-bold ml-1.5 inline-block">
                                      {item.refunded_qty} ta vozvrat
                                    </span>
                                  )}
                                </td>
                                <td className="px-4 py-2 text-right">{formatCurrency(item.price, lang)}</td>
                                <td className="px-4 py-2 text-right font-semibold">{formatCurrency(item.price * item.qty, lang)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      
      {/* Delete Customer Confirmation Modal */}
      {customerToDelete && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/20 dark:bg-black/40 backdrop-blur-sm rounded-lg">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl border border-gray-200 dark:border-gray-700 p-6 w-96 transition-colors">
            <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Mijozni o'chirish</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
              Rostdan ham <strong>{customerToDelete.name}</strong> mijozini o'chirmoqchimisiz?
              {customerToDelete.total_debt > 0 && (
                <span className="text-red-500 block font-semibold mt-2">
                  Diqqat! Mijozning {formatCurrency(customerToDelete.total_debt, lang)} so'm faol qarzi bor.
                </span>
              )}
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setCustomerToDelete(null)}
                className="px-4 py-2 text-sm font-semibold text-gray-700 dark:text-gray-300 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 rounded-xl transition-colors"
              >
                Bekor qilish
              </button>
              <button
                type="button"
                onClick={handleDeleteCustomer}
                className="px-4 py-2 text-sm font-semibold text-white bg-red-500 hover:bg-red-600 rounded-xl transition-colors"
              >
                O'chirish
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Manual Debt Addition Modal */}
      {manualDebtModal && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/20 dark:bg-black/40 backdrop-blur-sm rounded-lg">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl border border-gray-200 dark:border-gray-700 p-6 w-[450px] max-w-full transition-colors">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                💸 Qarz qo'shish (Kassir)
              </h3>
              <button
                type="button"
                onClick={() => setManualDebtModal(false)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 cursor-pointer"
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSaveManualDebt} className="space-y-4">
              {/* Type Selection */}
              <div>
                <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-2">
                  Mijoz turi
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setManualDebtType('existing')}
                    className={`py-2 rounded-xl text-sm font-bold border transition-colors cursor-pointer ${
                      manualDebtType === 'existing'
                        ? 'bg-blue-600 border-blue-600 text-white shadow-sm'
                        : 'bg-gray-50 dark:bg-gray-700/50 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300'
                    }`}
                  >
                    Mavjud mijoz
                  </button>
                  <button
                    type="button"
                    onClick={() => setManualDebtType('new')}
                    className={`py-2 rounded-xl text-sm font-bold border transition-colors cursor-pointer ${
                      manualDebtType === 'new'
                        ? 'bg-blue-600 border-blue-600 text-white shadow-sm'
                        : 'bg-gray-50 dark:bg-gray-700/50 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300'
                    }`}
                  >
                    Yangi mijoz
                  </button>
                </div>
              </div>

              {/* Customer Selection or Form */}
              {manualDebtType === 'existing' ? (
                <div>
                  <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-1.5">
                    Mijozni tanlang <span className="text-red-500">*</span>
                  </label>
                  <select
                    required
                    value={selectedCustomerId}
                    onChange={(e) => setSelectedCustomerId(e.target.value)}
                    className="w-full border border-gray-300 dark:border-gray-600 rounded-xl px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">-- Mijozni tanlang --</option>
                    {customers.map(cust => (
                      <option key={cust.id} value={cust.id}>
                        {cust.name} {cust.phone ? `(${cust.phone})` : ''} - Joriy qarz: {formatCurrency(cust.total_debt, lang)} so'm
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-1.5">
                      Mijoz ismi <span className="text-red-500">*</span>
                    </label>
                    <input
                      required
                      type="text"
                      placeholder="Ism kiriting..."
                      value={newCustomerName}
                      onChange={(e) => setNewCustomerName(e.target.value)}
                      className="w-full border border-gray-300 dark:border-gray-600 rounded-xl px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-1.5">
                      Telefon raqami
                    </label>
                    <input
                      type="text"
                      placeholder="Telefon raqami..."
                      value={newCustomerPhone}
                      onChange={(e) => setNewCustomerPhone(e.target.value)}
                      className="w-full border border-gray-300 dark:border-gray-600 rounded-xl px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>
              )}

              {/* Amount */}
              <div>
                <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-1.5">
                  Qarz summasi (so'mda) <span className="text-red-500">*</span>
                </label>
                <input
                  required
                  type="text"
                  placeholder="0"
                  value={formatPriceInput(manualDebtAmount)}
                  onChange={(e) => setManualDebtAmount(e.target.value)}
                  className="w-full border border-gray-300 dark:border-gray-600 rounded-xl px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 font-bold"
                />
              </div>

              {/* Comment */}
              <div>
                <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-1.5">
                  Izoh / Qarz sababi <span className="text-red-500">*</span>
                </label>
                <textarea
                  required
                  placeholder="Masalan: Naqd pul berildi, tovar nasiyaga berildi, avans so'radi..."
                  value={manualDebtComment}
                  onChange={(e) => setManualDebtComment(e.target.value)}
                  className="w-full border border-gray-300 dark:border-gray-600 rounded-xl px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 h-20 resize-none"
                />
              </div>

              {/* Action Buttons */}
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setManualDebtModal(false)}
                  className="px-4 py-2 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 font-bold rounded-xl text-sm transition-colors cursor-pointer"
                >
                  Bekor qilish
                </button>
                <button
                  type="submit"
                  disabled={processing}
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold rounded-xl text-sm transition-colors cursor-pointer"
                >
                  {processing ? 'Saqlanmoqda...' : 'Saqlash'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Pay Supplier Debt Modal */}
      {paySupplierModal.isOpen && paySupplierModal.supplier && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/20 dark:bg-black/40 backdrop-blur-sm rounded-lg">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col border border-gray-100 dark:border-gray-700 animate-in zoom-in-95 duration-200">
            <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between bg-teal-50/50 dark:bg-teal-950/20">
              <h3 className="text-base font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <Truck className="text-teal-600 dark:text-teal-400" size={18} />
                Yetkazib beruvchiga to'lov: {paySupplierModal.supplier.name}
              </h3>
              <button onClick={() => setPaySupplierModal({ isOpen: false, supplier: null, amount: '', paymentMethod: 'cash', note: '' })} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handlePaySupplierSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">
                  Hozirgi qarzimiz: <span className="text-red-600 dark:text-red-400 font-black">{formatCurrency(paySupplierModal.supplier.balance, lang)} so'm</span>
                </label>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
                  To'lov summasi (so'm) <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="Masalan: 1 000 000"
                  value={paySupplierModal.amount}
                  onChange={(e) => setPaySupplierModal({ ...paySupplierModal, amount: formatPriceInput(e.target.value) })}
                  className="w-full bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl px-4 py-2.5 text-base font-bold text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-teal-500"
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">To'lov turi</label>
                <select
                  value={paySupplierModal.paymentMethod}
                  onChange={(e) => setPaySupplierModal({ ...paySupplierModal, paymentMethod: e.target.value })}
                  className="w-full bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl px-4 py-2.5 text-sm text-gray-900 dark:text-white font-medium"
                >
                  <option value="cash">Naqd pul</option>
                  <option value="card">Plastik karta / Perevod</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">Izoh (ixtiyoriy)</label>
                <input
                  type="text"
                  placeholder="Masalan: 5-faktura bo'yicha to'lov"
                  value={paySupplierModal.note}
                  onChange={(e) => setPaySupplierModal({ ...paySupplierModal, note: e.target.value })}
                  className="w-full bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl px-4 py-2.5 text-xs text-gray-900 dark:text-white"
                />
              </div>

              <div className="pt-2 flex gap-3">
                <button
                  type="button"
                  onClick={() => setPaySupplierModal({ isOpen: false, supplier: null, amount: '', paymentMethod: 'cash', note: '' })}
                  className="flex-1 py-2.5 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 font-bold rounded-xl text-xs transition-colors"
                >
                  Bekor qilish
                </button>
                <button
                  type="submit"
                  disabled={processing}
                  className="flex-1 py-2.5 bg-teal-600 hover:bg-teal-700 disabled:opacity-60 text-white font-bold rounded-xl text-xs transition-all shadow-md shadow-teal-600/30"
                >
                  {processing ? 'Saqlanmoqda...' : 'To\'lovni saqlash'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Alert Modal */}
      <AlertModal 
        isOpen={!!alertModal}
        title="Xatolik"
        message={alertModal?.message || ''}
        type={alertModal?.type || 'error'}
        onConfirm={() => setAlertModal(null)}
      />
    </div>
  );
});
