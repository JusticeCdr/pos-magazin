import { useState, useEffect, useRef, memo } from 'react';
import { Banknote, CreditCard, Clock, TrendingUp, Package, Calendar, AlertTriangle, AlertCircle, X, Plus, Trash2 } from 'lucide-react';
import { useApp } from './context/AppContext';
import { formatCurrency, parseSQLiteDate } from './utils';
import { ConfirmModal, AlertModal } from './components/Modals';

// Helper to convert JS Date to SQLite compatible UTC string (YYYY-MM-DD HH:mm:ss)
const toSQLiteUTC = (date) => {
  if (!date || isNaN(date.getTime())) return '';
  return date.toISOString().replace('T', ' ').substring(0, 19);
};

export default memo(function Reports({ isActive }) {
  const { t, lang, currentUser } = useApp();
  const [filter, setFilter] = useState('today'); // today, yesterday, week, month, custom
  const [customStart, setCustomStart] = useState(() => {
    const d = new Date();
    return d.toISOString().split('T')[0];
  });
  const [customEnd, setCustomEnd] = useState(() => {
    const d = new Date();
    return d.toISOString().split('T')[0];
  });

  const [data, setData] = useState({
    totalRevenue: 0,
    totalProfit: 0,
    totalDebtIssued: 0,
    salesByType: { cash: 0, card: 0, debt: 0 },
    topProducts: [],
    warehouseBuyValue: 0,
    warehouseSellValue: 0
  });
  const [loading, setLoading] = useState(false);
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const [lowStock, setLowStock] = useState([]);
  const [alertState, setAlertState] = useState({ isOpen: false, title: '', message: '' });
  
  // Expense State
  const [expenseModal, setExpenseModal] = useState({ isOpen: false, reason: '', amount: '' });
  const [expenseToDelete, setExpenseToDelete] = useState(null);

  useEffect(() => {
    if (filter === 'custom' && customStart && customEnd && customStart.length === 10 && customEnd.length === 10) {
      if (customStart > customEnd) {
        setAlertState({
          isOpen: true,
          title: "Sana diapazoni noto'g'ri",
          message: "Boshlanish sanasi tugash sanasidan keyin bo'lishi mumkin emas!"
        });
        setCustomEnd(customStart);
      }
    }
  }, [filter, customStart, customEnd]);

  const getDates = (type) => {
    const now = new Date();
    let start = new Date(now);
    let end = new Date(now);

    if (type === 'today') {
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
    } else if (type === 'yesterday') {
      start.setDate(now.getDate() - 1);
      start.setHours(0, 0, 0, 0);
      end.setDate(now.getDate() - 1);
      end.setHours(23, 59, 59, 999);
    } else if (type === 'week') {
      const day = now.getDay() || 7; // 1-7 (Mon-Sun)
      start.setDate(now.getDate() - day + 1);
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
    } else if (type === 'month') {
      start = new Date(now.getFullYear(), now.getMonth(), 1);
      end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
    } else if (type === 'custom') {
      start = new Date(customStart + 'T00:00:00');
      end = new Date(customEnd + 'T23:59:59.999');
    }

    return {
      start: toSQLiteUTC(start),
      end: toSQLiteUTC(end)
    };
  };

  // ── Data fetching ──────────────────────────────────────────────────────────
  // hasLoadedRef: was data ever loaded? Prevents re-fetch on tab-switch.
  const hasLoadedRef = useRef(false);
  // prevFilterKey: detects when the filter/date actually changed.
  const prevFilterKeyRef = useRef('');
  const filterKey = `${filter}|${customStart}|${customEnd}`;

  const fetchLowStock = () => {
    if (!window.api) return;
    window.api.getLowStock(3)
      .then(res => { if (res && res.success) setLowStock(res.data); })
      .catch(() => {});
  };

  const fetchReports = async (showLoader = false) => {
    if (!window.api) return;
    if (filter === 'custom' && (!customStart || !customEnd)) return;
    if (showLoader || isInitialLoad) setLoading(true);
    try {
      const dates = getDates(filter);
      const result = await window.api.getReports(dates);
      if (result && result.success) setData(result.data);
    } catch (_err) {
      // silent
    } finally {
      setIsInitialLoad(false);
      setLoading(false);
      hasLoadedRef.current = true;
    }
  };

  // Effect 1 — Fetch on MOUNT once, then only when filter/dates change.
  // isActive is intentionally NOT in the dependency array:
  // switching tabs must never trigger a new database round-trip.
  useEffect(() => {
    if (filter === 'custom' && (!customStart || !customEnd)) return;
    const filterChanged = prevFilterKeyRef.current !== filterKey;
    prevFilterKeyRef.current = filterKey;
    if (!hasLoadedRef.current || filterChanged) {
      fetchReports(!hasLoadedRef.current); // spinner only on first-ever load
      fetchLowStock();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterKey]);

  // Effect 2 — Real-time refresh from Socket.io events.
  // isActive gates the refresh so background tabs don't do extra work.
  useEffect(() => {
    const handleUpdate = () => {
      if (isActive) {
        fetchReports(false);
        fetchLowStock();
      }
    };
    window.addEventListener('sales-updated', handleUpdate);
    window.addEventListener('debts-updated', handleUpdate);
    return () => {
      window.removeEventListener('sales-updated', handleUpdate);
      window.removeEventListener('debts-updated', handleUpdate);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive, filterKey]);



  const handleAddExpense = async (e) => {
    e.preventDefault();
    if (!expenseModal.reason || !expenseModal.amount) return;
    try {
      const res = await window.api.addExpense({
        reason: expenseModal.reason,
        amount: parseFloat(expenseModal.amount),
        cashier_name: currentUser?.name || 'Kassir/Admin'
      });
      if (res && res.success) {
        setExpenseModal({ isOpen: false, reason: '', amount: '' });
        fetchReports();
      } else {
        alert("Chiqim qo'shishda xatolik: " + (res?.error || "Noma'lum xatolik"));
      }
    } catch (err) {
      alert("Tizim xatosi: " + err.message);
    }
  };

  const handleDeleteExpense = (id) => {
    setExpenseToDelete(id);
  };

  const confirmDeleteExpense = async () => {
    if (!expenseToDelete) return;
    try {
      const res = await window.api.deleteExpense(expenseToDelete);
      if (res && res.success) {
        fetchReports();
      } else {
        alert("Chiqimni o'chirishda xatolik: " + (res?.error || "Noma'lum xatolik"));
      }
    } catch (err) {
      alert("Tizim xatosi: " + err.message);
    } finally {
      setExpenseToDelete(null);
    }
  };


  const cards = [
    { 
      title: t('revenue'), 
      value: data.totalRevenue, 
      icon: Banknote, 
      color: 'bg-emerald-500', 
      bg: 'bg-emerald-50 dark:bg-emerald-900/20',
      text: 'text-emerald-600 dark:text-emerald-400' 
    },
    { 
      title: t('profit'), 
      value: data.totalProfit, 
      icon: TrendingUp, 
      color: 'bg-blue-500', 
      bg: 'bg-blue-50 dark:bg-blue-900/20',
      text: 'text-blue-600 dark:text-blue-400' 
    },
    { 
      title: t('debtIssued'), 
      value: data.totalDebtIssued, 
      icon: Clock, 
      color: 'bg-orange-500', 
      bg: 'bg-orange-50 dark:bg-orange-900/20',
      text: 'text-orange-600 dark:text-orange-400' 
    },
    { 
      title: 'Chiqim (Rasxod)', 
      value: data.totalExpenses || 0, 
      icon: AlertCircle, 
      color: 'bg-red-500', 
      bg: 'bg-red-50 dark:bg-red-900/20',
      text: 'text-red-600 dark:text-red-400' 
    },
    { 
      title: 'Ombor tannarxi (Olish qiymati)', 
      value: data.warehouseBuyValue || 0, 
      icon: Package, 
      color: 'bg-indigo-500', 
      bg: 'bg-indigo-50 dark:bg-indigo-900/20',
      text: 'text-indigo-600 dark:text-indigo-400' 
    },
    { 
      title: 'Ombor sotish qiymati', 
      value: data.warehouseSellValue || 0, 
      icon: Package, 
      color: 'bg-purple-500', 
      bg: 'bg-purple-50 dark:bg-purple-900/20',
      text: 'text-purple-600 dark:text-purple-400' 
    },
  ];

  return (
    <div className="flex flex-col gap-6 transition-colors pb-6">
      {/* Header & Filter */}
      <div className="flex flex-col xl:flex-row xl:items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-800 dark:text-white">{t('reportsTitle')}</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{t('reportsSubtitle')}</p>
        </div>
        
        <div className="flex flex-col md:flex-row items-end md:items-center gap-3">
          <div className="flex items-center bg-gray-100 dark:bg-gray-800 rounded-lg p-1 border border-gray-200 dark:border-gray-700 overflow-x-auto max-w-full">
            <Calendar size={16} className="text-gray-400 ml-3 mr-2 shrink-0" />
            {['today', 'yesterday', 'week', 'month', 'custom'].map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-3 py-1.5 text-sm font-semibold rounded-md transition-colors whitespace-nowrap ${
                  filter === f 
                    ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-white shadow-sm' 
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                }`}
              >
                {f === 'today' && t('filterToday')}
                {f === 'yesterday' && t('filterYesterday')}
                {f === 'week' && t('filterWeek')}
                {f === 'month' && t('filterMonth')}
                {f === 'custom' && t('filterCustom')}
              </button>
            ))}
          </div>

          {/* Custom Date Pickers */}
          {filter === 'custom' && (
            <div className="flex items-center gap-2 bg-white dark:bg-gray-800 p-1.5 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm animate-in fade-in zoom-in-95 duration-200">
              <div className="flex items-center gap-1.5 px-2">
                <span className="text-xs font-semibold text-gray-500 dark:text-gray-400">{t('startDate')}:</span>
                <input
                  type="date"
                  value={customStart}
                  onChange={e => setCustomStart(e.target.value)}
                  className="bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-md px-2 py-1 text-sm text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
              <div className="flex items-center gap-1.5 px-2">
                <span className="text-xs font-semibold text-gray-500 dark:text-gray-400">{t('endDate')}:</span>
                <input
                  type="date"
                  value={customEnd}
                  onChange={e => setCustomEnd(e.target.value)}
                  className="bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-md px-2 py-1 text-sm text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
            </div>
          )}

          {/* Chiqim qo'shish button */}
          <button
            onClick={() => setExpenseModal({ ...expenseModal, isOpen: true })}
            className="px-4 py-2 bg-red-50 dark:bg-red-900/30 hover:bg-red-100 dark:hover:bg-red-900/50 text-red-600 dark:text-red-400 text-sm font-semibold rounded-lg transition-colors flex items-center gap-1.5 shrink-0"
          >
            <Plus size={18} />
            Chiqim qo'shish
          </button>
        </div>
      </div>

      {/* Dashboard Content (Fades during loading) */}
      <div className={`transition-all duration-200 space-y-6 ${loading ? 'opacity-50 pointer-events-none' : ''}`}>
        {/* KPI Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {cards.map((c, i) => (
            <div key={i} className={`rounded-2xl p-6 border border-gray-200 dark:border-gray-700/50 shadow-sm ${c.bg} transition-colors`}>
              <div className="flex items-start justify-between mb-4">
                <div className={`p-3 rounded-xl ${c.color} text-white shadow-sm`}>
                  <c.icon size={24} />
                </div>
              </div>
              <p className="text-sm font-semibold text-gray-500 dark:text-gray-400/80 uppercase tracking-wider mb-1">
                {c.title}
              </p>
              <h3 className={`text-3xl font-black ${c.text}`}>
                {formatCurrency(c.value, lang)}
              </h3>
            </div>
          ))}
        </div>

      {/* Three Column Dashboard Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 flex-1 min-h-0">

        {/* Sales by Type */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 p-6 flex flex-col">
          <h3 className="text-lg font-bold text-gray-800 dark:text-white mb-6 flex items-center gap-2">
            <Banknote className="text-gray-400" size={20} />
            {t('salesByType')}
          </h3>
          <div className="space-y-5 flex-1">
            {[
              { id: 'cash', label: t('payMethod').cash, value: data.salesByType.cash, color: 'bg-emerald-500' },
              { id: 'card', label: t('payMethod').card, value: data.salesByType.card, color: 'bg-blue-500' },
              { id: 'debt', label: t('payMethod').debt, value: data.salesByType.debt, color: 'bg-orange-500' },
            ].map(type => {
              const total = data.totalRevenue + data.totalDebtIssued;
              const percent = total > 0 ? (type.value / total) * 100 : 0;
              
              return (
                <div key={type.id}>
                  <div className="flex justify-between text-sm mb-1.5">
                    <span className="font-semibold text-gray-700 dark:text-gray-300">{type.label}</span>
                    <span className="font-bold text-gray-900 dark:text-white">{formatCurrency(type.value, lang)}</span>
                  </div>
                  <div className="w-full bg-gray-100 dark:bg-gray-700 rounded-full h-2.5 overflow-hidden">
                    <div 
                      className={`h-2.5 rounded-full ${type.color} transition-all duration-1000`} 
                      style={{ width: `${percent}%` }}
                    ></div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Top 5 Products */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 p-6 flex flex-col">
          <h3 className="text-lg font-bold text-gray-800 dark:text-white mb-4 flex items-center gap-2">
            <Package className="text-gray-400" size={20} />
            {t('topProducts')}
          </h3>
          <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 max-h-[350px]">
            {data.topProducts.length === 0 ? (
              <div className="h-full flex items-center justify-center text-sm text-gray-400 dark:text-gray-500">
                Нет данных за этот период
              </div>
            ) : (
              <div className="space-y-2">
                {data.topProducts.map((p, i) => (
                  <div key={i} className="flex items-center justify-between p-3 rounded-xl bg-gray-50 dark:bg-gray-700/50 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-7 h-7 shrink-0 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 font-bold flex items-center justify-center text-xs">
                        {i + 1}
                      </div>
                      <span className="font-semibold text-gray-800 dark:text-gray-200 text-sm truncate">{p.name}</span>
                    </div>
                    <div className="text-right shrink-0 ml-2">
                      <span className="text-sm font-black text-gray-900 dark:text-white">
                        {p.total_sold}
                      </span>
                      <span className="text-xs text-gray-500 dark:text-gray-400 ml-1">
                        {t('units')[p.unit] || p.unit || 'шт'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Low Stock — Critical Stock Card */}
        <div className={`rounded-2xl shadow-sm p-6 flex flex-col transition-colors ${
          lowStock.length > 0
            ? 'bg-white dark:bg-gray-800 border border-orange-200 dark:border-orange-800/60'
            : 'bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700'
        }`}>
          <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
            <AlertTriangle
              size={20}
              className={lowStock.length > 0 ? 'text-orange-500' : 'text-gray-400'}
            />
            <span className={lowStock.length > 0 ? 'text-orange-700 dark:text-orange-400' : 'text-gray-800 dark:text-white'}>
              {t('lowStockTitle') || 'Критичный остаток'}
            </span>
            {lowStock.length > 0 && (
              <span className="ml-auto text-xs font-semibold px-2 py-1 rounded-full bg-orange-100 dark:bg-orange-900/40 text-orange-600 dark:text-orange-400">
                {lowStock.length}
              </span>
            )}
          </h3>

          <div className="flex-1 overflow-y-auto custom-scrollbar pr-1 max-h-[350px]">
            {lowStock.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center gap-2 py-6 text-gray-400 dark:text-gray-500">
                <Package size={32} className="opacity-30" />
                <p className="text-sm text-center">Все товары в норме</p>
              </div>
            ) : (
              <div className="space-y-2">
                {lowStock.map((product, i) => {
                  const isOut = product.stock === 0;
                  return (
                    <div
                      key={product.id}
                      className={`flex items-center justify-between px-3 py-2.5 rounded-xl border transition-colors ${
                        isOut
                          ? 'bg-red-50 dark:bg-red-900/20 border-red-100 dark:border-red-900/40'
                          : 'bg-orange-50 dark:bg-orange-900/20 border-orange-100 dark:border-orange-900/40'
                      }`}
                    >
                      {/* Rank + Name */}
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className={`w-6 h-6 shrink-0 rounded-full flex items-center justify-center text-xs font-bold ${
                          isOut
                            ? 'bg-red-200 dark:bg-red-900/50 text-red-700 dark:text-red-300'
                            : 'bg-orange-200 dark:bg-orange-900/50 text-orange-700 dark:text-orange-300'
                        }`}>
                          {i + 1}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-gray-800 dark:text-gray-200 truncate leading-tight">
                            {product.name}
                          </p>
                          {product.barcode && (
                            <p className="text-xs text-gray-400 dark:text-gray-500 font-mono leading-tight mt-0.5">
                              {product.barcode}
                            </p>
                          )}
                        </div>
                      </div>

                      {/* Stock Badge */}
                      <div className="shrink-0 ml-3 text-right">
                        <span className={`text-base font-black leading-none ${
                          isOut
                            ? 'text-red-600 dark:text-red-400'
                            : 'text-orange-600 dark:text-orange-400'
                        }`}>
                          {isOut ? '0' : product.stock}
                        </span>
                        <span className="text-xs text-gray-400 dark:text-gray-500 ml-1">
                          {t('units')?.[product.unit] || product.unit || 'шт'}
                        </span>
                        {isOut && (
                          <p className="text-xs font-bold text-red-500 dark:text-red-400 mt-0.5">
                            НЕТ
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

      </div>

      {/* Expenses History Table */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 p-6 flex flex-col mt-4">
        <h3 className="text-lg font-bold text-gray-800 dark:text-white mb-4 flex items-center gap-2">
          <Banknote className="text-gray-400" size={20} />
          Chiqimlar tarixi
        </h3>
        <div className="overflow-x-auto overflow-y-auto max-h-[160px] custom-scrollbar">
          <table className="w-full text-left text-sm text-gray-500 dark:text-gray-400">
            <thead className="sticky top-0 bg-gray-50 dark:bg-gray-700 text-xs uppercase font-bold text-gray-700 dark:text-gray-300 shadow-sm rounded-lg z-10">
              <tr>
                <th className="px-4 py-3 rounded-l-lg">Sana</th>
                <th className="px-4 py-3">Sabab (Izoh)</th>
                <th className="px-4 py-3">Kassir</th>
                <th className="px-4 py-3 rounded-r-lg">Summa</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
              {(!data.expensesList || data.expensesList.length === 0) ? (
                <tr>
                  <td colSpan="4" className="text-center py-8 text-gray-400 dark:text-gray-500">Hech qanday chiqim topilmadi</td>
                </tr>
              ) : (
                data.expensesList.map(exp => (
                  <tr key={exp.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                    <td className="px-4 py-3.5 whitespace-nowrap text-gray-600 dark:text-gray-400">{parseSQLiteDate(exp.created_at).toLocaleString('ru-RU')}</td>
                    <td className="px-4 py-3.5 font-medium text-gray-950 dark:text-white">{exp.reason}</td>
                    <td className="px-4 py-3.5 text-gray-600 dark:text-gray-400">{exp.cashier_name}</td>
                    <td className="px-4 py-3.5 font-black text-red-600 dark:text-red-400">{formatCurrency(exp.amount, lang)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
      </div>

      {/* Expense Modal */}
      {expenseModal.isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden flex flex-col border border-gray-100 dark:border-gray-700 animate-in zoom-in-95 duration-200">
            <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between">
              <h3 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <AlertCircle className="text-red-500" size={20} />
                Yangi chiqim (Rasxod)
              </h3>
              <button onClick={() => setExpenseModal({ ...expenseModal, isOpen: false })} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleAddExpense} className="p-6">
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Nima maqsadda (Sabab)</label>
                  <input
                    type="text"
                    required
                    value={expenseModal.reason}
                    onChange={(e) => setExpenseModal({ ...expenseModal, reason: e.target.value })}
                    placeholder="Masalan: Tushlik, Arenda..."
                    className="w-full bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600 rounded-xl px-4 py-2.5 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-red-500/50"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Summa (so'm)</label>
                  <input
                    type="number"
                    required
                    min="0"
                    value={expenseModal.amount}
                    onChange={(e) => setExpenseModal({ ...expenseModal, amount: e.target.value })}
                    placeholder="0"
                    className="w-full bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600 rounded-xl px-4 py-2.5 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-red-500/50 font-bold"
                  />
                </div>
              </div>
              <button
                type="submit"
                className="w-full mt-6 py-3 bg-red-600 hover:bg-red-700 text-white rounded-xl font-bold shadow-md shadow-red-500/20 transition-all active:scale-[0.98]"
              >
                Tasdiqlash va Saqlash
              </button>
            </form>
          </div>
        </div>
      )}

      <ConfirmModal
        isOpen={!!expenseToDelete}
        title="Chiqimni o'chirish"
        message="Rostdan ham ushbu chiqimni o'chirmoqchimisiz? Bu amalni ortga qaytarib bo'lmaydi."
        onConfirm={confirmDeleteExpense}
        onCancel={() => setExpenseToDelete(null)}
        confirmText="O'chirish"
      />

      <AlertModal
        isOpen={alertState.isOpen}
        title={alertState.title}
        message={alertState.message}
        onConfirm={() => setAlertState({ ...alertState, isOpen: false })}
      />
    </div>
  );
});
