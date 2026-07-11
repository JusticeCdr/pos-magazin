import { useState, useEffect, useRef, memo } from 'react';
import { Banknote, CreditCard, Clock, TrendingUp, Package, Calendar, AlertTriangle, AlertCircle, X, Plus, Trash2, Users, ArrowLeft, ChevronRight, DollarSign } from 'lucide-react';

import { useApp } from './context/AppContext';
import { formatCurrency, parseSQLiteDate } from './utils';
import { ConfirmModal, AlertModal } from './components/Modals';

// Helper to convert JS Date to SQLite compatible UTC string (YYYY-MM-DD HH:mm:ss)
const toSQLiteUTC = (date) => {
  if (!date || isNaN(date.getTime())) return '';
  return date.toISOString().replace('T', ' ').substring(0, 19);
};

export default memo(function Reports({ isActive }) {
  const { t, lang, currentUser, businessType } = useApp();
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
    warehouseSellValue: 0,
    agingProducts: []
  });
  const [loading, setLoading] = useState(false);
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const [lowStock, setLowStock] = useState([]);
  const [alertState, setAlertState] = useState({ isOpen: false, title: '', message: '' });
  
  // Waiters report states
  const [reportSubTab, setReportSubTab] = useState('main'); // 'main' | 'waiters' | 'staff'
  const [waitersList, setWaitersList] = useState([]);
  const [selectedWaitersReport, setSelectedWaitersReport] = useState(null);
  const [selectedWaiterId, setSelectedWaiterId] = useState(null);
  
  // Staff & Attendance states
  const [attendanceDate, setAttendanceDate] = useState(() => {
    return new Date().toISOString().split('T')[0];
  });
  const [attendanceList, setAttendanceList] = useState([]);
  const [attendanceLoading, setAttendanceLoading] = useState(false);
  
  // Expense State
  const [expenseModal, setExpenseModal] = useState({ isOpen: false, reason: '', amount: '' });
  const [expenseToDelete, setExpenseToDelete] = useState(null);
  const [unsoldDaysLimit, setUnsoldDaysLimit] = useState(10);

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

  const fetchWaitersData = async () => {
    if (!window.api || !window.api.getWaitersReport) return;
    try {
      const dates = getDates(filter);
      const res = await window.api.getWaitersReport({
        start: dates.start,
        end: dates.end,
        waiterId: null
      });
      if (res && res.success) {
        setWaitersList(res.data);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const fetchSingleWaiterReport = async (waiterId) => {
    if (!window.api || !window.api.getWaitersReport) return;
    try {
      const dates = getDates(filter);
      const res = await window.api.getWaitersReport({
        start: dates.start,
        end: dates.end,
        waiterId
      });
      if (res && res.success) {
        setSelectedWaitersReport(res.data);
        setSelectedWaiterId(waiterId);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const fetchAttendance = async (dateStr, showLoader = true) => {
    if (!window.api || !window.api.getAttendance) return;
    if (showLoader) setAttendanceLoading(true);
    try {
      const res = await window.api.getAttendance(dateStr);
      if (res && res.success) {
        setAttendanceList(res.data || []);
      }
    } catch (err) {
      console.error(err);
    } finally {
      if (showLoader) setAttendanceLoading(false);
    }
  };

  const handleSetAttendance = async (employeeId, employeeType, newStatus) => {
    if (!window.api || !window.api.saveAttendance) return;
    
    // Optimistic UI Update
    setAttendanceList(prevList => 
      prevList.map(emp => 
        (emp.id === employeeId && emp.type === employeeType) 
          ? { ...emp, status: newStatus } 
          : emp
      )
    );

    try {
      const res = await window.api.saveAttendance({
        employeeId,
        employeeType,
        date: attendanceDate,
        status: newStatus
      });
      if (res && res.success) {
        await fetchAttendance(attendanceDate, false);
        await fetchReports(false);
      }
    } catch (err) {
      console.error(err);
      await fetchAttendance(attendanceDate, false);
    }
  };

  useEffect(() => {
    if (reportSubTab === 'staff') {
      fetchAttendance(attendanceDate);
    }
  }, [reportSubTab, attendanceDate]);

  // Effect 1 — Fetch when tab is active or filter/dates change.
  useEffect(() => {
    if (!isActive) return;
    if (filter === 'custom' && (!customStart || !customEnd)) return;
    
    fetchReports(!hasLoadedRef.current); // spinner only on first-ever load
    fetchLowStock();
    if (businessType === 'restaurant') {
      fetchWaitersData();
      if (selectedWaiterId) {
        fetchSingleWaiterReport(selectedWaiterId);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive, filterKey, businessType, selectedWaiterId]);

  useEffect(() => {
    if (reportSubTab === 'waiters' && businessType === 'restaurant') {
      fetchWaitersData();
      if (selectedWaiterId) {
        fetchSingleWaiterReport(selectedWaiterId);
      }
    }
  }, [reportSubTab, selectedWaiterId, filterKey, businessType]);

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
      title: lang === 'uz' ? 'Sof Foyda' : 'Чистая Прибыль', 
      value: data.netProfit || 0, 
      icon: TrendingUp, 
      color: 'bg-blue-500', 
      bg: 'bg-blue-50 dark:bg-blue-900/20',
      text: 'text-blue-600 dark:text-blue-400',
      isNetProfit: true
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
      title: lang === 'uz' ? "Qarz to'lovi (yig'ilgan)" : 'Оплата долга (собрано)', 
      value: data.totalDebtPayments || 0, 
      icon: DollarSign, 
      color: 'bg-teal-500', 
      bg: 'bg-teal-50 dark:bg-teal-900/20',
      text: 'text-teal-600 dark:text-teal-400' 
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

  const renderStaffReportView = () => {
    return (
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 animate-in fade-in slide-in-from-bottom-4 duration-200">
        {/* Left Column: Attendance Toggle Sheet */}
        <div className="xl:col-span-1 bg-white dark:bg-gray-800 rounded-2xl p-6 border border-gray-200 dark:border-gray-700 shadow-sm flex flex-col">
          <h3 className="text-lg font-bold text-gray-800 dark:text-white mb-4 flex items-center gap-2">
            <Users className="text-blue-500" size={20} />
            Kundalik Davomat
          </h3>
          <div className="mb-4">
            <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5 uppercase tracking-wider">
              Davomat Sanasi
            </label>
            <input
              type="date"
              value={attendanceDate}
              onChange={e => setAttendanceDate(e.target.value)}
              className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
            />
          </div>
          {attendanceLoading ? (
            <div className="flex justify-center py-12">
              <Clock className="animate-spin text-gray-400" size={24} />
            </div>
          ) : (
            <div className="space-y-2 flex-1 overflow-y-auto max-h-[450px] pr-1">
              {attendanceList.length === 0 ? (
                <div className="text-center py-12 text-gray-400">Xodimlar topilmadi.</div>
              ) : (
                attendanceList.map(emp => {
                  return (
                    <div key={`${emp.type}_${emp.id}`} className="flex items-center justify-between p-3 rounded-xl border border-gray-100 dark:border-gray-700/50 bg-gray-50/50 dark:bg-gray-800/30">
                      <div className="flex flex-col">
                        <span className="font-semibold text-gray-800 dark:text-gray-200 text-sm">
                          {emp.name}
                        </span>
                        <span className="text-[10px] text-gray-500 dark:text-gray-400 font-bold uppercase tracking-wider">
                          {emp.type === 'waiter' ? 'Ofitsiant' : (emp.role === 'admin' ? 'Admin' : emp.role === 'manager' ? 'Menejer' : 'Kassir')}
                        </span>
                      </div>
                      <div className="flex gap-1.5 shrink-0">
                        <button
                          onClick={() => handleSetAttendance(emp.id, emp.type, 'present')}
                          className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer border ${
                            emp.status === 'present'
                              ? 'bg-emerald-500/15 dark:bg-emerald-950/30 border-emerald-500 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/25'
                              : 'bg-gray-100 dark:bg-gray-700/60 border-transparent text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600'
                          }`}
                        >
                          Keldi
                        </button>
                        <button
                          onClick={() => handleSetAttendance(emp.id, emp.type, 'absent')}
                          className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer border ${
                            emp.status === 'absent'
                              ? 'bg-red-500/15 dark:bg-red-950/30 border-red-500 text-red-600 dark:text-red-400 hover:bg-red-500/25'
                              : 'bg-gray-100 dark:bg-gray-700/60 border-transparent text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600'
                          }`}
                        >
                          Kelmadi
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>

        {/* Right Column: Salaries Table */}
        <div className="xl:col-span-2 bg-white dark:bg-gray-800 rounded-2xl p-6 border border-gray-200 dark:border-gray-700 shadow-sm flex flex-col">
          <h3 className="text-lg font-bold text-gray-800 dark:text-white mb-2 flex items-center gap-2">
            <Banknote className="text-emerald-500" size={20} />
            Oylik Maosh va Statistikalar
          </h3>
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-6">
            Davr: <span className="font-bold text-gray-700 dark:text-gray-300">{filter === 'custom' ? `${customStart} dan ${customEnd} gacha` : filter}</span> bo'yicha hisoblangan oylik maoshlar:
          </p>

          <div className="overflow-x-auto flex-1">
            <table className="w-full text-left text-sm text-gray-500 dark:text-gray-400">
              <thead className="bg-gray-50 dark:bg-gray-700/50 text-xs uppercase font-bold text-gray-700 dark:text-gray-300">
                <tr>
                  <th className="px-4 py-3 rounded-l-lg">Xodim</th>
                  <th className="px-4 py-3">Lavozimi</th>
                  <th className="px-4 py-3 text-right">Asosiy oylik</th>
                  <th className="px-4 py-3 text-center">Kelgan kunlari</th>
                  <th className="px-4 py-3 text-right">Hisoblangan oylik</th>
                  {businessType === 'restaurant' && <th className="px-4 py-3 text-right">Komissiya</th>}
                  <th className="px-4 py-3 text-right rounded-r-lg">Jami oylik</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                {(data.cashiersList || []).length === 0 && (data.waitersList || []).length === 0 ? (
                  <tr>
                    <td colSpan={businessType === 'restaurant' ? 7 : 6} className="text-center py-8 text-gray-400">
                      Ma'lumotlar mavjud emas.
                    </td>
                  </tr>
                ) : (
                  <>
                    {(data.cashiersList || []).map(c => (
                      <tr key={`cashier_${c.id}`} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                        <td className="px-4 py-3 font-semibold text-gray-900 dark:text-white">{c.name}</td>
                        <td className="px-4 py-3 text-xs uppercase text-gray-500">
                          {c.role === 'admin' ? 'Admin' : c.role === 'manager' ? 'Menejer' : 'Kassir'}
                        </td>
                        <td className="px-4 py-3 text-right">{formatCurrency(c.salary, lang)}</td>
                        <td className="px-4 py-3 text-center font-semibold text-gray-700 dark:text-gray-300">{c.present_days || 0} kun</td>
                        <td className="px-4 py-3 text-right font-medium text-gray-900 dark:text-white">
                          {formatCurrency(c.earned_salary || 0, lang)}
                        </td>
                        {businessType === 'restaurant' && <td className="px-4 py-3 text-right text-gray-450">-</td>}
                        <td className="px-4 py-3 text-right font-bold text-emerald-600 dark:text-emerald-400">
                          {formatCurrency(c.total_earned || 0, lang)}
                        </td>
                      </tr>
                    ))}
                    {(data.waitersList || []).map(w => (
                      <tr key={`waiter_${w.id}`} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                        <td className="px-4 py-3 font-semibold text-gray-900 dark:text-white">{w.name}</td>
                        <td className="px-4 py-3 text-xs uppercase text-gray-500">Ofitsiant ({w.percentage}%)</td>
                        <td className="px-4 py-3 text-right">{formatCurrency(w.salary, lang)}</td>
                        <td className="px-4 py-3 text-center font-semibold text-gray-700 dark:text-gray-300">{w.present_days || 0} kun</td>
                        <td className="px-4 py-3 text-right font-medium text-gray-900 dark:text-white">
                          {formatCurrency(w.earned_salary || 0, lang)}
                        </td>
                        {businessType === 'restaurant' && (
                          <td className="px-4 py-3 text-right text-blue-600 dark:text-blue-400">
                            {formatCurrency(w.commissions || 0, lang)}
                          </td>
                        )}
                        <td className="px-4 py-3 text-right font-bold text-emerald-600 dark:text-emerald-400">
                          {formatCurrency(w.total_earned || 0, lang)}
                        </td>
                      </tr>
                    ))}
                  </>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  };

  const renderWaitersReportView = () => {
    if (selectedWaiterId && selectedWaitersReport) {
      // 1. Single Waiter Details View
      const { waiter, receipts } = selectedWaitersReport;
      const totalCommission = receipts.reduce((sum, r) => sum + r.waiter_commission, 0);
      const totalSales = receipts.reduce((sum, r) => sum + r.total_amount, 0);
      
      return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-200">
          {/* Back button and Waiter details Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white dark:bg-gray-800 p-6 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm">
            <div className="flex items-center gap-4">
              <button
                onClick={() => {
                  setSelectedWaiterId(null);
                  setSelectedWaitersReport(null);
                }}
                className="p-2.5 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 rounded-xl transition-all cursor-pointer flex items-center justify-center shrink-0 active:scale-95 border border-transparent dark:border-gray-700"
                title="Orqaga"
              >
                <ArrowLeft size={20} />
              </button>
              <div>
                <h3 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                  {waiter.name}
                  <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400">
                    Ofitsiant
                  </span>
                </h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                  Xizmat ulushi foizi: <span className="font-semibold text-gray-800 dark:text-gray-200">{waiter.percentage}%</span>
                </p>
              </div>
            </div>
          </div>

          {/* Waiter KPI Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-gradient-to-br from-blue-50 to-blue-100/50 dark:from-blue-950/20 dark:to-blue-900/10 rounded-2xl p-6 border border-blue-200/50 dark:border-blue-800/30 shadow-sm flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-blue-600 dark:text-blue-400 uppercase tracking-wider mb-1">
                  Jami cheklar soni
                </p>
                <h3 className="text-3xl font-black text-blue-900 dark:text-blue-300">
                  {receipts.length} ta
                </h3>
              </div>
              <div className="p-3 bg-blue-600 text-white rounded-xl shadow-sm shadow-blue-500/20">
                <Clock size={24} />
              </div>
            </div>

            <div className="bg-gradient-to-br from-emerald-50 to-emerald-100/50 dark:from-emerald-950/20 dark:to-emerald-900/10 rounded-2xl p-6 border border-emerald-200/50 dark:border-emerald-800/30 shadow-sm flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider mb-1">
                  Jami qilgan savdosi
                </p>
                <h3 className="text-3xl font-black text-emerald-900 dark:text-emerald-300">
                  {formatCurrency(totalSales, lang)}
                </h3>
              </div>
              <div className="p-3 bg-emerald-600 text-white rounded-xl shadow-sm shadow-emerald-500/20">
                <TrendingUp size={24} />
              </div>
            </div>

            <div className="bg-gradient-to-br from-orange-50 to-orange-100/50 dark:from-orange-950/20 dark:to-orange-900/10 rounded-2xl p-6 border border-orange-200/50 dark:border-orange-800/30 shadow-sm flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-orange-600 dark:text-orange-400 uppercase tracking-wider mb-1">
                  Hisoblangan oyligi (ulushi)
                </p>
                <h3 className="text-3xl font-black text-orange-900 dark:text-orange-300">
                  {formatCurrency(totalCommission, lang)}
                </h3>
              </div>
              <div className="p-3 bg-orange-600 text-white rounded-xl shadow-sm shadow-orange-500/20">
                <Banknote size={24} />
              </div>
            </div>
          </div>

          {/* Receipts Table */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 p-6 flex flex-col">
            <h3 className="text-lg font-bold text-gray-800 dark:text-white mb-4 flex items-center gap-2">
              <Banknote size={20} className="text-blue-500" />
              Sotuvlar tarixi (Cheklar ro'yxati)
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-gray-500 dark:text-gray-400">
                <thead className="bg-gray-50 dark:bg-gray-700/50 text-xs uppercase font-bold text-gray-700 dark:text-gray-300">
                  <tr>
                    <th className="px-4 py-3 rounded-l-lg">Chek raqami</th>
                    <th className="px-4 py-3">Sana va vaqt</th>
                    <th className="px-4 py-3">To'lov turi</th>
                    <th className="px-4 py-3">Jami summa</th>
                    <th className="px-4 py-3">Ofitsiant foizi</th>
                    <th className="px-4 py-3 rounded-r-lg">Hisoblangan oyligi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                  {receipts.length === 0 ? (
                    <tr>
                      <td colSpan="6" className="text-center py-8 text-gray-400 dark:text-gray-500 font-medium">
                        Ushbu davrda ofitsiant tomonidan yopilgan cheklar topilmadi.
                      </td>
                    </tr>
                  ) : (
                    receipts.map((r) => (
                      <tr key={r.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                        <td className="px-4 py-3.5 font-bold text-gray-950 dark:text-white">
                          #{r.shift_receipt_number}
                        </td>
                        <td className="px-4 py-3.5 whitespace-nowrap text-gray-600 dark:text-gray-400">
                          {parseSQLiteDate(r.created_at).toLocaleString('ru-RU', { timeZone: 'Asia/Tashkent' })}
                        </td>
                        <td className="px-4 py-3.5">
                          <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${
                            r.payment_method === 'cash' 
                              ? 'bg-emerald-100 dark:bg-emerald-900/35 text-emerald-800 dark:text-emerald-300' 
                              : r.payment_method === 'card'
                              ? 'bg-blue-100 dark:bg-blue-900/35 text-blue-800 dark:text-blue-300'
                              : 'bg-orange-100 dark:bg-orange-900/35 text-orange-800 dark:text-orange-300'
                          }`}>
                            {r.payment_method === 'cash' ? 'Naqd' : r.payment_method === 'card' ? 'Plastik' : 'Nasiya'}
                          </span>
                        </td>
                        <td className="px-4 py-3.5 font-bold text-gray-800 dark:text-gray-300">
                          {formatCurrency(r.total_amount, lang)}
                        </td>
                        <td className="px-4 py-3.5 font-semibold text-gray-500">
                          {r.waiter_percentage}%
                        </td>
                        <td className="px-4 py-3.5 font-black text-emerald-600 dark:text-emerald-400">
                          {formatCurrency(r.waiter_commission, lang)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      );
    }

    // 2. List of All Waiters View
    const totalWaitersSales = waitersList.reduce((sum, w) => sum + w.total_sales, 0);
    const totalWaitersCommission = waitersList.reduce((sum, w) => sum + w.total_commission, 0);

    return (
      <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-200">
        {/* Consolidated KPI Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-gradient-to-br from-emerald-50 to-emerald-100/50 dark:from-emerald-950/20 dark:to-emerald-900/10 rounded-2xl p-6 border border-emerald-200/50 dark:border-emerald-800/30 shadow-sm flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider mb-1">
                Jami ofitsiantlar savdosi
              </p>
              <h3 className="text-3xl font-black text-emerald-900 dark:text-emerald-300">
                {formatCurrency(totalWaitersSales, lang)}
              </h3>
            </div>
            <div className="p-3 bg-emerald-600 text-white rounded-xl shadow-sm shadow-emerald-500/20">
              <TrendingUp size={24} />
            </div>
          </div>

          <div className="bg-gradient-to-br from-orange-50 to-orange-100/50 dark:from-orange-950/20 dark:to-orange-900/10 rounded-2xl p-6 border border-orange-200/50 dark:border-orange-800/30 shadow-sm flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-orange-600 dark:text-orange-400 uppercase tracking-wider mb-1">
                Jami hisoblangan foiz (maosh)
              </p>
              <h3 className="text-3xl font-black text-orange-900 dark:text-orange-300">
                {formatCurrency(totalWaitersCommission, lang)}
              </h3>
            </div>
            <div className="p-3 bg-orange-600 text-white rounded-xl shadow-sm shadow-orange-500/20">
              <Banknote size={24} />
            </div>
          </div>

          <div className="bg-gradient-to-br from-purple-50 to-purple-100/50 dark:from-purple-950/20 dark:to-purple-900/10 rounded-2xl p-6 border border-purple-200/50 dark:border-purple-800/30 shadow-sm flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-purple-600 dark:text-purple-400 uppercase tracking-wider mb-1">
                Jami ofitsiantlar soni
              </p>
              <h3 className="text-3xl font-black text-purple-900 dark:text-purple-300">
                {waitersList.length} ta
              </h3>
            </div>
            <div className="p-3 bg-purple-600 text-white rounded-xl shadow-sm shadow-purple-500/20">
              <Users size={24} />
            </div>
          </div>
        </div>

        {/* Waiters Table */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 p-6 flex flex-col">
          <h3 className="text-lg font-bold text-gray-800 dark:text-white mb-4 flex items-center gap-2">
            <Users size={20} className="text-emerald-500" />
            Ofitsiantlar bo'yicha savdo va oylik hisoboti
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-gray-500 dark:text-gray-400">
              <thead className="bg-gray-50 dark:bg-gray-700/50 text-xs uppercase font-bold text-gray-700 dark:text-gray-300">
                <tr>
                  <th className="px-4 py-3 rounded-l-lg">Ofitsiant</th>
                  <th className="px-4 py-3">Xizmat foizi</th>
                  <th className="px-4 py-3">Cheklar soni</th>
                  <th className="px-4 py-3">Jami savdosi</th>
                  <th className="px-4 py-3">Hisoblangan oyligi (ulush)</th>
                  <th className="px-4 py-3 rounded-r-lg text-right">Amal</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                {waitersList.length === 0 ? (
                  <tr>
                    <td colSpan="6" className="text-center py-8 text-gray-400 dark:text-gray-500 font-medium">
                      Ushbu davrda ofitsiantlar tomonidan hech qanday sotuv amalga oshirilmagan.
                    </td>
                  </tr>
                ) : (
                  waitersList.map((w) => (
                    <tr key={w.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                      <td className="px-4 py-3.5 font-bold text-gray-950 dark:text-white">
                        {w.name}
                      </td>
                      <td className="px-4 py-3.5 font-semibold text-gray-500">
                        {w.percentage}%
                      </td>
                      <td className="px-4 py-3.5 font-medium text-gray-700 dark:text-gray-300">
                        {w.total_receipts} ta
                      </td>
                      <td className="px-4 py-3.5 font-bold text-gray-900 dark:text-white">
                        {formatCurrency(w.total_sales, lang)}
                      </td>
                      <td className="px-4 py-3.5 font-black text-emerald-600 dark:text-emerald-400">
                        {formatCurrency(w.total_commission, lang)}
                      </td>
                      <td className="px-4 py-3.5 text-right">
                        <button
                          onClick={() => fetchSingleWaiterReport(w.id)}
                          className="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 dark:bg-blue-900/30 dark:hover:bg-blue-900/50 text-blue-600 dark:text-blue-400 text-xs font-bold rounded-lg transition-all cursor-pointer inline-flex items-center gap-1 active:scale-95"
                        >
                          Batafsil
                          <ChevronRight size={14} />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  };

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

      {/* Subtab selection */}
      <div className="flex gap-2 border-b border-gray-200 dark:border-gray-700 pb-2 shrink-0">
        <button
          onClick={() => { setReportSubTab('main'); setSelectedWaiterId(null); setSelectedWaitersReport(null); }}
          className={`px-4 py-2 rounded-xl text-sm font-bold transition-all cursor-pointer ${
            reportSubTab === 'main'
              ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20'
              : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-white'
          }`}
        >
          Umumiy hisobot
        </button>
        {businessType === 'restaurant' && (
          <button
            onClick={() => { setReportSubTab('waiters'); setSelectedWaiterId(null); setSelectedWaitersReport(null); }}
            className={`px-4 py-2 rounded-xl text-sm font-bold transition-all cursor-pointer ${
              reportSubTab === 'waiters'
                ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-white'
            }`}
          >
            Ofitsiantlar hisoboti
          </button>
        )}
        {businessType === 'restaurant' && (
          <button
            onClick={() => { setReportSubTab('staff'); setSelectedWaiterId(null); setSelectedWaitersReport(null); }}
            className={`px-4 py-2 rounded-xl text-sm font-bold transition-all cursor-pointer ${
              reportSubTab === 'staff'
                ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-white'
            }`}
          >
            Xodimlar va Davomat
          </button>
        )}
      </div>

      {/* Dashboard Content (Fades during loading) */}
      <div className={`transition-all duration-200 space-y-6 ${loading ? 'opacity-50 pointer-events-none' : ''}`}>
        {businessType === 'restaurant' && reportSubTab === 'staff' ? (
          renderStaffReportView()
        ) : businessType === 'restaurant' && reportSubTab === 'waiters' ? (
          renderWaitersReportView()
        ) : (
          <>
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
              {c.isNetProfit && (
                <div className="mt-4 pt-3 border-t border-blue-200 dark:border-blue-900/40 space-y-1 text-xs text-gray-500 dark:text-gray-400">
                  <div className="flex justify-between">
                    <span>Yalpi foyda (Gross):</span>
                    <span className="font-semibold text-gray-800 dark:text-gray-200">{formatCurrency(data.totalProfit, lang)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Chiqim (Rasxod):</span>
                    <span className="font-semibold text-red-500">-{formatCurrency(data.totalExpenses || 0, lang)}</span>
                  </div>
                  {businessType === 'restaurant' && (
                    <>
                      <div className="flex justify-between">
                        <span>Xodimlar oyligi:</span>
                        <span className="font-semibold text-red-500">-{formatCurrency(data.totalSalaries || 0, lang)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Ofitsiant foizlari:</span>
                        <span className="font-semibold text-red-500">-{formatCurrency(data.totalCommissions || 0, lang)}</span>
                      </div>
                    </>
                  )}
                </div>
              )}
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
              { id: 'debt_payment', label: lang === 'uz' ? "Qarz to'lovi (yig'ilgan)" : "Оплата долга", value: data.totalDebtPayments || 0, color: 'bg-teal-500' },
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

        {/* Sotilmayotgan tovarlar Card (Dynamic days) */}
        {(() => {
          const filteredAgingProducts = (data.agingProducts || []).filter(product => {
            const daysUnsold = product.last_sold_at 
              ? Math.floor((Date.now() - new Date(product.last_sold_at + 'Z').getTime()) / (24 * 60 * 60 * 1000))
              : product.added_at 
              ? Math.floor((Date.now() - new Date(product.added_at + 'Z').getTime()) / (24 * 60 * 60 * 1000))
              : 30;
            return daysUnsold >= unsoldDaysLimit;
          });
          return (
            <div className={`rounded-2xl shadow-sm p-6 flex flex-col transition-colors lg:col-span-3 ${
              filteredAgingProducts.length > 0
                ? 'bg-white dark:bg-gray-800 border border-orange-200 dark:border-orange-800'
                : 'bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700'
            }`}>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
                <div className="flex items-center gap-2">
                  <Clock size={20} className={filteredAgingProducts.length > 0 ? 'text-orange-500 animate-pulse' : 'text-gray-400'} />
                  <h3 className={`text-lg font-bold ${filteredAgingProducts.length > 0 ? 'text-orange-700 dark:text-orange-400' : 'text-gray-800 dark:text-white'}`}>
                    Sotilmayotgan tovarlar
                  </h3>
                  {filteredAgingProducts.length > 0 && (
                    <span className="text-xs font-semibold px-2 py-1 rounded-full bg-orange-100 dark:bg-orange-900/40 text-orange-600 dark:text-orange-400">
                      {filteredAgingProducts.length} ta
                    </span>
                  )}
                </div>
                <div className="flex bg-gray-100 dark:bg-gray-700 p-1 rounded-xl shrink-0 self-start sm:self-auto gap-0.5">
                  {[10, 20, 30].map(d => (
                    <button key={d} type="button" onClick={() => setUnsoldDaysLimit(d)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                        unsoldDaysLimit === d
                          ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-white shadow-sm'
                          : 'text-gray-500 dark:bg-gray-700 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
                      }`}>
                      {d}+ kun
                    </button>
                  ))}
                </div>
              </div>
              {filteredAgingProducts.length > 0 && (
                <div className="mb-4 text-xs font-medium text-orange-700 dark:text-orange-400 bg-orange-50 dark:bg-orange-950/30 border border-orange-200 dark:border-orange-900/50 p-3.5 rounded-xl flex items-start gap-2.5">
                  <AlertCircle size={18} className="shrink-0 text-orange-500 mt-0.5" />
                  <div>
                    <p className="font-bold">Diqqat ogohlantirish!</p>
                    <p className="mt-0.5 opacity-90">Ushbu mahsulotlar {unsoldDaysLimit} kundan ortiq vaqt davomida sotilmadi. Savdoni jadallashtirish yoki narxini to'g'rilab skidka berish tavsiya etiladi.</p>
                  </div>
                </div>
              )}
              <div className="overflow-x-auto max-h-[300px] custom-scrollbar">
                {filteredAgingProducts.length === 0 ? (
                  <div className="py-8 flex flex-col items-center justify-center gap-2 text-gray-400 dark:text-gray-500">
                    <Package size={32} className="opacity-30" />
                    <p className="text-sm">Barcha tovarlar aylanmoqda (faol)</p>
                  </div>
                ) : (
                  <table className="w-full text-left text-sm text-gray-500 dark:text-gray-400">
                    <thead className="sticky top-0 bg-gray-50 dark:bg-gray-700 text-xs uppercase font-bold text-gray-700 dark:text-gray-300 z-10">
                      <tr>
                        <th className="px-4 py-2.5 rounded-l-lg">Tovar nomi</th>
                        <th className="px-4 py-2.5">Shtrix-kod</th>
                        <th className="px-4 py-2.5">Qoldiq</th>
                        <th className="px-4 py-2.5">Sotish narxi</th>
                        <th className="px-4 py-2.5 rounded-r-lg">Oxirgi savdo sanasi</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                      {filteredAgingProducts.map(product => {
                        const daysUnsold = product.last_sold_at 
                          ? Math.floor((Date.now() - new Date(product.last_sold_at + 'Z').getTime()) / (24 * 60 * 60 * 1000))
                          : product.added_at 
                          ? Math.floor((Date.now() - new Date(product.added_at + 'Z').getTime()) / (24 * 60 * 60 * 1000))
                          : 30;
                        return (
                          <tr key={product.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                            <td className="px-4 py-3 font-semibold text-gray-900 dark:text-white">{product.name}</td>
                            <td className="px-4 py-3 font-mono text-xs">{product.barcode || '-'}</td>
                            <td className="px-4 py-3 font-bold text-gray-800 dark:text-gray-300">
                              {product.stock} {t('units')?.[product.unit] || product.unit || 'dona'}
                            </td>
                            <td className="px-4 py-3 font-black text-gray-900 dark:text-white">
                              {formatCurrency(product.sell_price, lang)}
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap text-xs text-orange-600 dark:text-orange-400 font-bold">
                              {product.last_sold_at 
                                ? `${new Date(product.last_sold_at + 'Z').toLocaleDateString('ru-RU')} (${daysUnsold} kun oldin)`
                                : product.added_at
                                ? `Sotilmagan, kiritilgan: ${new Date(product.added_at + 'Z').toLocaleDateString('ru-RU')} (${daysUnsold} kun oldin)`
                                : `Muddati noma'lum (${unsoldDaysLimit}+ kun)`
                              }
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          );
        })()}

      </div>

      {/* Staff Statistics & Waiter Commissions (Only if businessType === 'restaurant') */}
      {businessType === 'restaurant' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
          {/* Waiters performance */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 p-6 flex flex-col">
            <h3 className="text-lg font-bold text-gray-800 dark:text-white mb-4 flex items-center gap-2">
              <Users className="text-emerald-500" size={20} />
              Ofitsiantlar ulushi (Commissions)
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-gray-500 dark:text-gray-400">
                <thead className="bg-gray-50 dark:bg-gray-700/50 text-xs uppercase font-bold text-gray-700 dark:text-gray-300">
                  <tr>
                    <th className="px-4 py-2.5 rounded-l-lg">Ofitsiant</th>
                    <th className="px-4 py-2.5">Xizmat foizi</th>
                    <th className="px-4 py-2.5">Jami savdosi</th>
                    <th className="px-4 py-2.5 rounded-r-lg">Beriladigan pul (Ulush)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                  {(data.waiterStats || []).map(w => {
                    const commission = Math.round(w.total_sales * (w.percentage / 100));
                    return (
                      <tr key={w.waiter_id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                        <td className="px-4 py-3 font-semibold text-gray-900 dark:text-white">{w.waiter_name}</td>
                        <td className="px-4 py-3 font-medium text-gray-500">{w.percentage}%</td>
                        <td className="px-4 py-3 font-bold text-gray-800 dark:text-gray-300">{formatCurrency(w.total_sales, lang)}</td>
                        <td className="px-4 py-3 font-black text-emerald-600 dark:text-emerald-400">{formatCurrency(commission, lang)}</td>
                      </tr>
                    );
                  })}
                  {(data.waiterStats || []).length === 0 && (
                    <tr>
                      <td colSpan="4" className="px-4 py-8 text-center text-xs text-gray-400">Ushbu davrda yopilgan buyurtmalar yo'q.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Cashiers Salary list */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 p-6 flex flex-col">
            <h3 className="text-lg font-bold text-gray-800 dark:text-white mb-4 flex items-center gap-2">
              <Users className="text-blue-500" size={20} />
              Xodimlar oylik maoshlari (Salary)
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-gray-500 dark:text-gray-400">
                <thead className="bg-gray-50 dark:bg-gray-700/50 text-xs uppercase font-bold text-gray-700 dark:text-gray-300">
                  <tr>
                    <th className="px-4 py-2.5 rounded-l-lg">Xodim ismi</th>
                    <th className="px-4 py-2.5">Roli</th>
                    <th className="px-4 py-2.5 rounded-r-lg">Oylik maoshi (Oydan-oyga)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                  {(data.cashiersList || []).map(c => (
                    <tr key={c.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                      <td className="px-4 py-3 font-semibold text-gray-900 dark:text-white">{c.name}</td>
                      <td className="px-4 py-3 font-medium capitalize text-gray-500">{c.role === 'manager' ? 'Menejer' : c.role === 'admin' ? 'Admin' : 'Kassir'}</td>
                      <td className="px-4 py-3 font-black text-blue-600 dark:text-blue-400">
                        {c.salary > 0 ? `${formatCurrency(c.salary, lang)}` : "Belgilanmagan (0)"}
                      </td>
                    </tr>
                  ))}
                  {(data.cashiersList || []).length === 0 && (
                    <tr>
                      <td colSpan="3" className="px-4 py-8 text-center text-xs text-gray-400">Xodimlar kiritilmagan.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

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
                    <td className="px-4 py-3.5 whitespace-nowrap text-gray-600 dark:text-gray-400">{parseSQLiteDate(exp.created_at).toLocaleString('ru-RU', { timeZone: 'Asia/Tashkent' })}</td>
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
      </>
      )}
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
