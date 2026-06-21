import { useState, useEffect, useMemo, memo, useRef } from 'react';
import { Search, Users, Phone, DollarSign, Wallet, X, Trash2 } from 'lucide-react';
import { useApp } from './context/AppContext';
import { formatCurrency, formatThousands } from './utils';
import { AlertModal } from './components/Modals';

export default memo(function Debts({ isActive }) {
  const { t, lang, currentUser, globalCustomers: customers, fetchGlobalCustomers } = useApp();
  const [search, setSearch] = useState('');
  
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
    debtors = debtors.filter(c => c.last_debt_date && new Date(c.last_debt_date).getTime() >= start);
  }

  if (endDate) {
    const end = new Date(endDate).setHours(23, 59, 59, 999);
    debtors = debtors.filter(c => c.last_debt_date && new Date(c.last_debt_date).getTime() <= end);
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

  const splitDetails = useMemo(() => {
    if (!debtDetails || debtDetails.length === 0) return { active: [], closed: [] };
    
    // sorted oldest first:
    const sorted = [...debtDetails].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    
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
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-gray-800 dark:text-white">{t('debtsTitle')}</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{t('debtsSubtitle')}</p>
      </div>

      {/* Summary Stats Cards */}
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

      {/* Debtors List */}
      <div className="flex-1 flex flex-col bg-white dark:bg-gray-800 shadow-sm rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700 min-h-0 transition-colors">
        <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center shrink-0">
          <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">
            {t('debtsTitle')} ({debtors.length})
          </span>
          <div className="relative w-72">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500" />
            <input
              type="text"
              placeholder={t('searchDebtors')}
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-800 dark:text-gray-100 transition"
            />
          </div>
        </div>

        <div className="overflow-auto flex-1 custom-scrollbar">
          <table className="w-full text-left border-collapse">
            <thead className="bg-gray-50 dark:bg-gray-700/50 border-b border-gray-200 dark:border-gray-700 sticky top-0 z-10 transition-colors">
              <tr>
                <th className="py-3 px-4 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">ID</th>
                <th className="py-3 px-4 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">{t('clientName')}</th>
                <th className="py-3 px-4 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">{t('clientPhone')}</th>
                <th className="py-3 px-4 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Sana</th>
                <th className="py-3 px-4 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">{t('total')}</th>
                <th className="py-3 px-4 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider text-right">Действия</th>
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
                      <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-blue-600 dark:text-blue-400">
                        {c.name.charAt(0).toUpperCase()}
                      </div>
                      {c.name}
                    </td>
                    <td className="py-3 px-4 text-sm text-gray-600 dark:text-gray-400 font-mono flex items-center gap-2">
                      {c.phone ? <><Phone size={14} className="text-gray-400" /> {c.phone}</> : <span className="text-gray-300 dark:text-gray-600">—</span>}
                    </td>
                    <td className="py-3 px-4 text-sm text-gray-600 dark:text-gray-400">
                      {c.last_debt_date ? new Date(c.last_debt_date).toLocaleString('ru-RU', {day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit'}) : '—'}
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
                        <button
                          onClick={() => confirmDeleteCustomer(c)}
                          className="bg-red-50 dark:bg-red-950/20 hover:bg-red-100 dark:hover:bg-red-900/30 text-red-600 dark:text-red-400 p-2 rounded-md transition-colors"
                          title="O'chirish"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
          {debtors.length > visibleCount && (
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
                    const d = new Date(record.created_at);
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

                    return (
                      <div key={`sale_${record.id}`} className="border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
                        <div className="bg-gray-50 dark:bg-gray-700/50 px-4 py-2 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center">
                          <span className="font-semibold text-gray-700 dark:text-gray-300">Sotuv (Chek N: {record.id})</span>
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
                                <td className="px-4 py-2 text-center">{item.qty}</td>
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
