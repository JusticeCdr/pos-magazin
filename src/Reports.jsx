import { useState, useEffect, useRef, memo } from 'react';
import { 
  Banknote, CreditCard, Clock, TrendingUp, Package, Calendar, AlertCircle, AlertTriangle, 
  X, Plus, Users, ArrowLeft, ChevronRight, DollarSign, Percent, Camera, UserCheck, 
  Settings as SettingsIcon, Edit2, Trash2, Image, CheckCircle2, UserX, RefreshCw
} from 'lucide-react';

import { useApp } from './context/AppContext';
import { formatCurrency, parseSQLiteDate, getAttendancePhotoUrl } from './utils';
import { ConfirmModal, AlertModal } from './components/Modals';

// Helper to convert JS Date to SQLite compatible local string (YYYY-MM-DD HH:mm:ss)
const toSQLiteLocal = (date) => {
  if (!date || isNaN(date.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
};

export default memo(function Reports({ isActive }) {
  const { t, lang, currentUser, businessType } = useApp();
  const [filter, setFilter] = useState('today'); // shift, today, yesterday, week, month, custom
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
  
  // Staff report states
  const [expenseModal, setExpenseModal] = useState({ isOpen: false, reason: '', amount: '' });
  const [expenseToDelete, setExpenseToDelete] = useState(null);
  const [unsoldDaysLimit, setUnsoldDaysLimit] = useState(10);

  // Attendance report states
  const [attendanceList, setAttendanceList] = useState([]);
  const [attendanceLoading, setAttendanceLoading] = useState(false);
  const [attendanceStaff, setAttendanceStaff] = useState([]);
  const [attendanceSettings, setAttendanceSettings] = useState({
    workStartTime: '09:00',
    workEndTime: '18:00',
    lateGraceMinutes: 5
  });
  const [attendanceFilterStaff, setAttendanceFilterStaff] = useState('all');
  const [attendanceFilterStatus, setAttendanceFilterStatus] = useState('all');
  const [viewingPhoto, setViewingPhoto] = useState(null);
  const [manualAttendanceModal, setManualAttendanceModal] = useState({
    isOpen: false,
    id: null,
    employeeKey: '',
    date: new Date().toISOString().split('T')[0],
    checkInTime: '',
    checkOutTime: ''
  });
  const [scheduleModal, setScheduleModal] = useState({
    isOpen: false,
    workStartTime: '09:00',
    workEndTime: '18:00',
    lateGraceMinutes: '5'
  });
  const [attendanceToDelete, setAttendanceToDelete] = useState(null);

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
    if (type === 'shift') {
      return { start: 'shift', end: 'shift' };
    }
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
      start: toSQLiteLocal(start),
      end: toSQLiteLocal(end)
    };
  };

  const getAttendanceDates = (type) => {
    const formatDateLocal = (d) => {
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    };

    const now = new Date();
    if (type === 'shift' || type === 'today') {
      const s = formatDateLocal(now);
      return { start: s, end: s };
    }
    if (type === 'yesterday') {
      const y = new Date(now);
      y.setDate(now.getDate() - 1);
      const s = formatDateLocal(y);
      return { start: s, end: s };
    }
    if (type === 'week') {
      const day = now.getDay() || 7;
      const mon = new Date(now);
      mon.setDate(now.getDate() - day + 1);
      return { start: formatDateLocal(mon), end: formatDateLocal(now) };
    }
    if (type === 'month') {
      const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
      return { start: formatDateLocal(firstDay), end: formatDateLocal(now) };
    }
    if (type === 'custom') {
      return { start: customStart, end: customEnd };
    }
    const s = formatDateLocal(now);
    return { start: s, end: s };
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
      const queryDates = filter === 'shift' ? getDates('today') : dates;
      const result = await window.api.getReports(queryDates);
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
        waiterId: null,
        period: filter === 'shift' ? 'shift' : null
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
        waiterId,
        period: filter === 'shift' ? 'shift' : null
      });
      if (res && res.success) {
        setSelectedWaitersReport(res.data);
        setSelectedWaiterId(waiterId);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const fetchAttendanceData = async (showLoader = false) => {
    if (!window.api || !window.api.getAttendanceReport) return;
    if (showLoader) setAttendanceLoading(true);
    try {
      const dates = getAttendanceDates(filter);
      const res = await window.api.getAttendanceReport(dates.start, dates.end);
      if (res && res.success) {
        setAttendanceList(res.data || []);
        if (res.allStaff) setAttendanceStaff(res.allStaff);
        setAttendanceSettings({
          workStartTime: res.workStartTime || '09:00',
          workEndTime: res.workEndTime || '18:00',
          lateGraceMinutes: Number(res.lateGraceMinutes ?? 5)
        });
        setScheduleModal(prev => ({
          ...prev,
          workStartTime: res.workStartTime || '09:00',
          workEndTime: res.workEndTime || '18:00',
          lateGraceMinutes: String(res.lateGraceMinutes ?? 5)
        }));
      }
    } catch (err) {
      console.error("fetchAttendanceData error:", err);
    } finally {
      setAttendanceLoading(false);
    }
  };

  const handleSaveManualAttendance = async (e) => {
    e.preventDefault();
    if (!manualAttendanceModal.employeeKey || !manualAttendanceModal.date) {
      setAlertState({
        isOpen: true,
        title: "Xatolik",
        message: "Xodim va sana kiritilishi shart!"
      });
      return;
    }
    const [empType, empId] = manualAttendanceModal.employeeKey.split('_');
    try {
      const res = await window.api.saveManualAttendance({
        employeeId: parseInt(empId, 10),
        employeeType: empType,
        date: manualAttendanceModal.date,
        checkInTime: manualAttendanceModal.checkInTime || null,
        checkOutTime: manualAttendanceModal.checkOutTime || null
      });
      if (res && res.success) {
        setManualAttendanceModal({
          isOpen: false,
          id: null,
          employeeKey: '',
          date: new Date().toISOString().split('T')[0],
          checkInTime: '',
          checkOutTime: ''
        });
        fetchAttendanceData();
      } else {
        setAlertState({
          isOpen: true,
          title: "Xatolik",
          message: res?.error || "Davomatni saqlab bo'lmadi"
        });
      }
    } catch (err) {
      setAlertState({
        isOpen: true,
        title: "Xatolik",
        message: err.message
      });
    }
  };

  const handleSaveScheduleSettings = async (e) => {
    e.preventDefault();
    try {
      await window.api.updateSetting('work_start_time', scheduleModal.workStartTime);
      await window.api.updateSetting('work_end_time', scheduleModal.workEndTime);
      await window.api.updateSetting('late_grace_minutes', scheduleModal.lateGraceMinutes);
      setAttendanceSettings({
        workStartTime: scheduleModal.workStartTime,
        workEndTime: scheduleModal.workEndTime,
        lateGraceMinutes: parseInt(scheduleModal.lateGraceMinutes || '5', 10)
      });
      setScheduleModal(prev => ({ ...prev, isOpen: false }));
      fetchAttendanceData();
    } catch (err) {
      setAlertState({
        isOpen: true,
        title: "Xatolik",
        message: err.message
      });
    }
  };

  const confirmDeleteAttendance = async () => {
    if (!attendanceToDelete) return;
    try {
      const res = await window.api.deleteAttendanceRecord(attendanceToDelete);
      if (res && res.success) {
        fetchAttendanceData();
      } else {
        setAlertState({
          isOpen: true,
          title: "Xatolik",
          message: res?.error || "Davomat yozuvini o'chirishda xatolik yuz berdi"
        });
      }
    } catch (err) {
      setAlertState({
        isOpen: true,
        title: "Xatolik",
        message: err.message
      });
    } finally {
      setAttendanceToDelete(null);
    }
  };

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
    if (reportSubTab === 'attendance') {
      fetchAttendanceData(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive, filterKey, businessType, selectedWaiterId, reportSubTab]);

  useEffect(() => {
    if (reportSubTab === 'waiters' && businessType === 'restaurant') {
      fetchWaitersData();
      if (selectedWaiterId) {
        fetchSingleWaiterReport(selectedWaiterId);
      }
    } else if (reportSubTab === 'attendance') {
      fetchAttendanceData(true);
    }
  }, [reportSubTab, selectedWaiterId, filterKey, businessType]);

  // Effect 2 — Real-time refresh from Socket.io events.
  // isActive gates the refresh so background tabs don't do extra work.
  useEffect(() => {
    const handleUpdate = () => {
      if (isActive) {
        fetchReports(false);
        fetchLowStock();
        if (reportSubTab === 'attendance') {
          fetchAttendanceData(false);
        }
      }
    };
    const handleAttendanceUpdate = () => {
      if (isActive && reportSubTab === 'attendance') {
        fetchAttendanceData(false);
      }
    };
    window.addEventListener('sales-updated', handleUpdate);
    window.addEventListener('debts-updated', handleUpdate);
    window.addEventListener('attendance-updated', handleAttendanceUpdate);
    return () => {
      window.removeEventListener('sales-updated', handleUpdate);
      window.removeEventListener('debts-updated', handleUpdate);
      window.removeEventListener('attendance-updated', handleAttendanceUpdate);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive, filterKey, reportSubTab]);



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
      const res = await window.api.deleteExpense(expenseToDelete, currentUser?.name || 'Admin');
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
    ...(businessType === 'restaurant' ? [
      {
        title: 'Xizmat haqi (Usluga)',
        value: data.totalServiceFees || 0,
        icon: Percent,
        color: 'bg-teal-500',
        bg: 'bg-teal-50 dark:bg-teal-900/20',
        text: 'text-teal-600 dark:text-teal-400'
      },
      {
        title: 'Xodimlar maoshi (Jami)',
        value: (data.totalSalaries || 0) + (data.totalCommissions || 0),
        icon: Users,
        color: 'bg-indigo-500',
        bg: 'bg-indigo-50 dark:bg-indigo-900/20',
        text: 'text-indigo-600 dark:text-indigo-400'
      }
    ] : []),
    { 
      title: lang === 'uz' ? 'Kirim (Xaridlar / Faktura)' : 'Закупки (Приход)', 
      value: data.totalPurchases || 0, 
      icon: Package, 
      color: 'bg-teal-600', 
      bg: 'bg-teal-50 dark:bg-teal-900/20',
      text: 'text-teal-700 dark:text-teal-300' 
    },
    { 
      title: lang === 'uz' ? 'Tannarx (Sotilgan mahsulot)' : 'Себестоимость (COGS)', 
      value: data.totalCogs || 0, 
      icon: DollarSign, 
      color: 'bg-cyan-600', 
      bg: 'bg-cyan-50 dark:bg-cyan-900/20',
      text: 'text-cyan-700 dark:text-cyan-300' 
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
      title: lang === 'uz' ? 'Spisaniya (Chiqim/Ziyon)' : 'Списание (Убыль/Брак)', 
      value: data.totalWriteOffs || 0, 
      icon: AlertTriangle, 
      color: 'bg-rose-500', 
      bg: 'bg-rose-50 dark:bg-rose-900/20',
      text: 'text-rose-600 dark:text-rose-400' 
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
      <div className="w-full bg-white dark:bg-gray-800 rounded-2xl p-6 border border-gray-200 dark:border-gray-700 shadow-sm flex flex-col animate-in fade-in slide-in-from-bottom-4 duration-200">
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
                <th className="px-4 py-3 text-right">Hisoblangan oylik</th>
                {businessType === 'restaurant' && <th className="px-4 py-3 text-right">Komissiya</th>}
                <th className="px-4 py-3 text-right rounded-r-lg">Jami oylik</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
              {(data.cashiersList || []).length === 0 && (data.waitersList || []).length === 0 ? (
                <tr>
                  <td colSpan={businessType === 'restaurant' ? 6 : 5} className="text-center py-8 text-gray-400">
                    Ma'lumotlar mavjud emas.
                  </td>
                </tr>
              ) : (
                <>
                  {(data.cashiersList || []).map(c => (
                    <tr key={`cashier_${c.id}`} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                      <td className="px-4 py-3 font-semibold text-gray-900 dark:text-white">{c.name}</td>
                      <td className="px-4 py-3 text-xs uppercase text-gray-500">
                        {c.role === 'admin' ? 'Admin' : c.role === 'manager' ? 'Menejer' : c.role === 'cook' ? 'Oshpaz' : c.role === 'worker' ? 'Ishchi' : 'Kassir'}
                      </td>
                      <td className="px-4 py-3 text-right">{formatCurrency(c.salary, lang)}</td>
                      <td className="px-4 py-3 text-right font-medium text-gray-900 dark:text-white">
                        {formatCurrency(c.earned_salary || 0, lang)}
                      </td>
                      {businessType === 'restaurant' && (
                        <td className="px-4 py-3 text-right text-blue-600 dark:text-blue-400 font-medium">
                          {c.commissions > 0 ? `${formatCurrency(c.commissions, lang)} (${c.percentage}%)` : (c.percentage > 0 ? `${c.percentage}%` : '-')}
                        </td>
                      )}
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
                      <td className="px-4 py-3 text-right font-medium text-gray-900 dark:text-white">
                        {formatCurrency(w.earned_salary || 0, lang)}
                      </td>
                      {businessType === 'restaurant' && (
                        <td className="px-4 py-3 text-right text-blue-600 dark:text-blue-400 font-medium">
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
                  <th className="px-4 py-3 text-right">Fiksa maoshi</th>
                  <th className="px-4 py-3 text-center">Cheklar soni</th>
                  <th className="px-4 py-3 text-right">Jami savdosi</th>
                  <th className="px-4 py-3 text-right">Foizdan ulushi</th>
                  <th className="px-4 py-3 text-right">Jami daromadi</th>
                  <th className="px-4 py-3 rounded-r-lg text-right">Amal</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                {waitersList.length === 0 ? (
                  <tr>
                    <td colSpan="8" className="text-center py-8 text-gray-400 dark:text-gray-500 font-medium">
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
                      <td className="px-4 py-3.5 text-right font-medium text-gray-700 dark:text-gray-300">
                        {w.salary > 0 ? formatCurrency(w.salary, lang) : "0 so'm"}
                      </td>
                      <td className="px-4 py-3.5 text-center font-medium text-gray-700 dark:text-gray-300">
                        {w.total_receipts} ta
                      </td>
                      <td className="px-4 py-3.5 text-right font-bold text-gray-900 dark:text-white">
                        {formatCurrency(w.total_sales, lang)}
                      </td>
                      <td className="px-4 py-3.5 text-right font-black text-emerald-600 dark:text-emerald-400">
                        {formatCurrency(w.total_commission, lang)}
                      </td>
                      <td className="px-4 py-3.5 text-right font-black text-blue-600 dark:text-blue-400">
                        {formatCurrency((w.total_commission || 0) + (w.salary || 0), lang)}
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

  const renderAttendanceReportView = () => {
    // Filter list
    const filteredList = attendanceList.filter(item => {
      // 1. Staff filter
      if (attendanceFilterStaff !== 'all') {
        const key = `${item.employee_type}_${item.employee_id}`;
        if (key !== attendanceFilterStaff) return false;
      }
      // 2. Status filter
      if (attendanceFilterStatus === 'late') {
        return item.is_late;
      }
      if (attendanceFilterStatus === 'on_time') {
        return item.check_in_time && !item.is_late;
      }
      if (attendanceFilterStatus === 'working') {
        return item.check_in_time && !item.check_out_time;
      }
      if (attendanceFilterStatus === 'completed') {
        return item.check_in_time && item.check_out_time;
      }
      if (attendanceFilterStatus === 'absent') {
        return !item.check_in_time;
      }
      return true;
    });

    // Summary calculations
    const totalStaffCount = attendanceStaff.length > 0 ? attendanceStaff.length : attendanceList.length;
    const presentCount = attendanceList.filter(i => !!i.check_in_time).length;
    const lateCount = attendanceList.filter(i => i.is_late).length;
    const workingCount = attendanceList.filter(i => !!i.check_in_time && !i.check_out_time).length;
    const completedList = attendanceList.filter(i => i.worked_minutes > 0);
    const avgMinutes = completedList.length > 0 
      ? Math.round(completedList.reduce((sum, i) => sum + i.worked_minutes, 0) / completedList.length)
      : 0;
    const avgDurationText = avgMinutes > 0 
      ? `${Math.floor(avgMinutes / 60)} soat ${avgMinutes % 60 > 0 ? (avgMinutes % 60) + ' daq' : ''}`.trim()
      : '-';

    return (
      <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-200">
        {/* KPI Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 border border-gray-200 dark:border-gray-700 shadow-sm flex items-center justify-between">
            <div>
              <p className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">
                Jami xodimlar
              </p>
              <h3 className="text-2xl font-black text-gray-900 dark:text-white">
                {totalStaffCount} nafar
              </h3>
            </div>
            <div className="p-3 bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-xl">
              <Users size={22} />
            </div>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 border border-gray-200 dark:border-gray-700 shadow-sm flex items-center justify-between">
            <div>
              <p className="text-xs font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider mb-1">
                Kelganlar (Davomat)
              </p>
              <h3 className="text-2xl font-black text-emerald-600 dark:text-emerald-400">
                {presentCount} nafar
              </h3>
            </div>
            <div className="p-3 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 rounded-xl">
              <UserCheck size={22} />
            </div>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 border border-amber-200 dark:border-amber-800/40 shadow-sm flex items-center justify-between">
            <div>
              <p className="text-xs font-bold text-amber-600 dark:text-amber-400 uppercase tracking-wider mb-1">
                Kechikkanlar
              </p>
              <h3 className="text-2xl font-black text-amber-600 dark:text-amber-400 flex items-center gap-1.5">
                {lateCount} nafar
                {lateCount > 0 && <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/50 text-amber-800 dark:text-amber-300 font-bold">⚠️ Ogohlantirish</span>}
              </h3>
            </div>
            <div className="p-3 bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 rounded-xl">
              <AlertTriangle size={22} />
            </div>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 border border-gray-200 dark:border-gray-700 shadow-sm flex items-center justify-between">
            <div>
              <p className="text-xs font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-wider mb-1">
                Hozir ishda
              </p>
              <h3 className="text-2xl font-black text-indigo-600 dark:text-indigo-400">
                {workingCount} nafar
              </h3>
            </div>
            <div className="p-3 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded-xl">
              <Clock size={22} />
            </div>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 border border-gray-200 dark:border-gray-700 shadow-sm flex items-center justify-between">
            <div>
              <p className="text-xs font-bold text-teal-600 dark:text-teal-400 uppercase tracking-wider mb-1">
                O'rtacha ishlash
              </p>
              <h3 className="text-2xl font-black text-teal-600 dark:text-teal-400">
                {avgDurationText}
              </h3>
            </div>
            <div className="p-3 bg-teal-50 dark:bg-teal-900/30 text-teal-600 dark:text-teal-400 rounded-xl">
              <TrendingUp size={22} />
            </div>
          </div>
        </div>

        {/* Toolbar & Filters */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl p-4 border border-gray-200 dark:border-gray-700 shadow-sm flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-3">
            {/* Staff filter */}
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-gray-500 dark:text-gray-400">Xodim:</span>
              <select
                value={attendanceFilterStaff}
                onChange={(e) => setAttendanceFilterStaff(e.target.value)}
                className="bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl px-3 py-1.5 text-xs font-semibold text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">Barcha xodimlar</option>
                {attendanceStaff.map((s) => (
                  <option key={`${s.type}_${s.id}`} value={`${s.type}_${s.id}`}>
                    {s.name} ({s.role})
                  </option>
                ))}
              </select>
            </div>

            {/* Status filter */}
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-gray-500 dark:text-gray-400">Holati:</span>
              <select
                value={attendanceFilterStatus}
                onChange={(e) => setAttendanceFilterStatus(e.target.value)}
                className="bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl px-3 py-1.5 text-xs font-semibold text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">Barcha holatlar</option>
                <option value="late">⚠️ Faqat kechikkanlar</option>
                <option value="on_time">✅ Vaqtida kelganlar</option>
                <option value="working">🕒 Hozir ishda bo'lganlar</option>
                <option value="completed">🏁 Ishni yakunlaganlar</option>
                <option value="absent">🔴 Kelmaganlar</option>
              </select>
            </div>

            {/* Active Work Schedule Display */}
            <div className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 rounded-xl text-xs font-semibold border border-blue-200/60 dark:border-blue-800/40">
              <Clock size={14} />
              Ish grafigi: <span className="font-bold">{attendanceSettings.workStartTime} - {attendanceSettings.workEndTime}</span>
              <span className="text-[11px] opacity-75">(Chegara: +{attendanceSettings.lateGraceMinutes}m)</span>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2.5 shrink-0">
            <button
              onClick={() => setScheduleModal({
                isOpen: true,
                workStartTime: attendanceSettings.workStartTime,
                workEndTime: attendanceSettings.workEndTime,
                lateGraceMinutes: String(attendanceSettings.lateGraceMinutes)
              })}
              className="px-3.5 py-2 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 text-xs font-bold rounded-xl transition-all flex items-center gap-1.5 cursor-pointer shadow-sm active:scale-95"
              title="Standart ish vaqti grafigini sozlash"
            >
              <SettingsIcon size={15} />
              Ish grafigi
            </button>

            <button
              onClick={() => {
                setManualAttendanceModal({
                  isOpen: true,
                  id: null,
                  employeeKey: attendanceStaff.length > 0 ? `${attendanceStaff[0].type}_${attendanceStaff[0].id}` : '',
                  date: new Date().toISOString().split('T')[0],
                  checkInTime: attendanceSettings.workStartTime || '09:00',
                  checkOutTime: ''
                });
              }}
              className="px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl transition-all flex items-center gap-1.5 cursor-pointer shadow-md shadow-blue-500/20 active:scale-95"
            >
              <Plus size={15} />
              Qo'lda davomat kiritish
            </button>

            <button
              onClick={() => fetchAttendanceData(true)}
              disabled={attendanceLoading}
              className="p-2 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 rounded-xl transition-all cursor-pointer disabled:opacity-50"
              title="Yangilash"
            >
              <RefreshCw size={15} className={attendanceLoading ? 'animate-spin' : ''} />
            </button>
          </div>
        </div>

        {/* Attendance Table */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 p-6 flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold text-gray-800 dark:text-white flex items-center gap-2">
              <UserCheck size={20} className="text-blue-500" />
              Davomat jurnali ({filteredList.length} ta yozuv)
            </h3>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              * Kamerada rasm olinmagan bo'lsa ham kelgan va ketgan vaqtlari avtomatik hisoblanadi
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-gray-500 dark:text-gray-400">
              <thead className="bg-gray-50 dark:bg-gray-700/50 text-xs uppercase font-bold text-gray-700 dark:text-gray-300">
                <tr>
                  <th className="px-4 py-3 rounded-l-lg">Xodim</th>
                  <th className="px-4 py-3">Sana</th>
                  <th className="px-4 py-3">Kelgan vaqti</th>
                  <th className="px-4 py-3">Ketgan vaqti</th>
                  <th className="px-4 py-3">Ishlagan vaqti</th>
                  <th className="px-4 py-3">Holati / Kechikish</th>
                  <th className="px-4 py-3 text-center">Rasm (Selfi)</th>
                  <th className="px-4 py-3 rounded-r-lg text-right">Amallar</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                {filteredList.length === 0 ? (
                  <tr>
                    <td colSpan="8" className="text-center py-12 text-gray-400 dark:text-gray-500 font-medium">
                      Tanlangan filtr va davr bo'yicha hech qanday davomat yozuvi topilmadi.
                    </td>
                  </tr>
                ) : (
                  filteredList.map((item, idx) => {
                    const rowKey = item.id ? `att_${item.id}` : `absent_${item.employee_type}_${item.employee_id}_${item.date}_${idx}`;
                    return (
                      <tr key={rowKey} className="hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                        {/* Employee info */}
                        <td className="px-4 py-3.5 whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-gray-900 dark:text-white text-sm">
                              {item.employee_name}
                            </span>
                            <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                              item.employee_type === 'cashier' 
                                ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300' 
                                : 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300'
                            }`}>
                              {item.role || (item.employee_type === 'cashier' ? 'Kassir' : 'Ofitsiant')}
                            </span>
                          </div>
                        </td>

                        {/* Date */}
                        <td className="px-4 py-3.5 whitespace-nowrap font-medium text-gray-700 dark:text-gray-300 text-xs">
                          {item.date}
                        </td>

                        {/* Check In */}
                        <td className="px-4 py-3.5 whitespace-nowrap">
                          {item.check_in_time ? (
                            <span className="font-bold text-gray-900 dark:text-white flex items-center gap-1.5 text-sm">
                              <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                              {item.check_in_time}
                            </span>
                          ) : (
                            <span className="text-gray-400 dark:text-gray-500 text-xs">-</span>
                          )}
                        </td>

                        {/* Check Out */}
                        <td className="px-4 py-3.5 whitespace-nowrap">
                          {item.check_out_time ? (
                            <span className="font-bold text-gray-900 dark:text-white flex items-center gap-1.5 text-sm">
                              <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                              {item.check_out_time}
                            </span>
                          ) : item.check_in_time ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-300">
                              Hali ketmadi
                            </span>
                          ) : (
                            <span className="text-gray-400 dark:text-gray-500 text-xs">-</span>
                          )}
                        </td>

                        {/* Worked duration */}
                        <td className="px-4 py-3.5 whitespace-nowrap font-semibold text-gray-800 dark:text-gray-200">
                          {item.worked_duration_text || (item.check_in_time && !item.check_out_time ? "Davom etmoqda..." : "-")}
                        </td>

                        {/* Status & Lateness */}
                        <td className="px-4 py-3.5 whitespace-nowrap">
                          {item.is_late ? (
                            <div className="inline-flex flex-col gap-0.5">
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-black bg-amber-100 dark:bg-amber-950/50 text-amber-900 dark:text-amber-300 border border-amber-300 dark:border-amber-800">
                                <AlertTriangle size={13} className="text-amber-600 dark:text-amber-400 shrink-0" />
                                {item.late_minutes} daqiqa kechikdi
                              </span>
                              <span className="text-[10px] text-gray-500 dark:text-gray-400 pl-1">
                                Ish vaqti: {attendanceSettings.workStartTime}
                              </span>
                            </div>
                          ) : item.check_in_time ? (
                            <div className="inline-flex flex-col gap-0.5">
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-100 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">
                                <CheckCircle2 size={13} className="text-emerald-600 dark:text-emerald-400 shrink-0" />
                                Vaqtida kelgan
                              </span>
                              {item.is_early_departure && (
                                <span className="text-[10px] text-orange-600 dark:text-orange-400 pl-1 font-semibold">
                                  ⚠️ {item.early_minutes} daq vaqtli ketdi
                                </span>
                              )}
                            </div>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 dark:bg-gray-700/60 text-gray-500 dark:text-gray-400 border border-gray-200 dark:border-gray-700">
                              <UserX size={13} />
                              Hali kelmadi
                            </span>
                          )}
                        </td>

                        {/* Photo Selfie Thumbnails */}
                        <td className="px-4 py-3.5 text-center whitespace-nowrap">
                          {item.check_in_photo || item.check_out_photo ? (
                            <div className="flex items-center justify-center gap-2">
                              {item.check_in_photo && (
                                <button
                                  onClick={() => setViewingPhoto({
                                    url: getAttendancePhotoUrl(item.check_in_photo),
                                    title: `${item.employee_name} — Kelgan vaqti selfisi (${item.check_in_time || ''})`
                                  })}
                                  className="w-8 h-8 rounded-lg overflow-hidden border border-emerald-300 hover:scale-110 transition-transform shadow-xs cursor-pointer"
                                  title="Kelgan vaqtidagi rasm"
                                >
                                  <img
                                    src={getAttendancePhotoUrl(item.check_in_photo)}
                                    alt="Keldi"
                                    className="w-full h-full object-cover"
                                  />
                                </button>
                              )}
                              {item.check_out_photo && (
                                <button
                                  onClick={() => setViewingPhoto({
                                    url: getAttendancePhotoUrl(item.check_out_photo),
                                    title: `${item.employee_name} — Ketgan vaqti selfisi (${item.check_out_time || ''})`
                                  })}
                                  className="w-8 h-8 rounded-lg overflow-hidden border border-blue-300 hover:scale-110 transition-transform shadow-xs cursor-pointer"
                                  title="Ketgan vaqtidagi rasm"
                                >
                                  <img
                                    src={getAttendancePhotoUrl(item.check_out_photo)}
                                    alt="Ketdi"
                                    className="w-full h-full object-cover"
                                  />
                                </button>
                              )}
                            </div>
                          ) : (
                            <span className="text-[11px] text-gray-400 dark:text-gray-500 italic">
                              Rasm yo'q (Dasturdan)
                            </span>
                          )}
                        </td>

                        {/* Actions */}
                        <td className="px-4 py-3.5 text-right whitespace-nowrap">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={() => {
                                setManualAttendanceModal({
                                  isOpen: true,
                                  id: item.id,
                                  employeeKey: `${item.employee_type}_${item.employee_id}`,
                                  date: item.date,
                                  checkInTime: item.check_in_time || '',
                                  checkOutTime: item.check_out_time || ''
                                });
                              }}
                              className="p-1.5 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded-lg transition-colors cursor-pointer"
                              title="Tahrirlash (Vaqtlarni kiritish)"
                            >
                              <Edit2 size={15} />
                            </button>
                            {item.id && (
                              <button
                                onClick={() => setAttendanceToDelete(item.id)}
                                className="p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition-colors cursor-pointer"
                                title="O'chirish"
                              >
                                <Trash2 size={15} />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
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
            {(businessType === 'restaurant' ? ['shift', 'today', 'yesterday', 'week', 'month', 'custom'] : ['today', 'yesterday', 'week', 'month', 'custom']).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-3 py-1.5 text-sm font-semibold rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                  filter === f 
                    ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-white shadow-sm' 
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                }`}
              >
                {f === 'shift' && (lang === 'uz' ? 'Hozirgi smena' : 'Текущая смена')}
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
            Xodimlar maoshi
          </button>
        )}
        <button
          onClick={() => { setReportSubTab('attendance'); setSelectedWaiterId(null); setSelectedWaitersReport(null); }}
          className={`px-4 py-2 rounded-xl text-sm font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
            reportSubTab === 'attendance'
              ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20'
              : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-white'
          }`}
        >
          <UserCheck size={16} />
          Xodimlar davomati
        </button>
      </div>

      {/* Dashboard Content (Fades during loading) */}
      <div className={`transition-all duration-200 space-y-6 ${(loading || (reportSubTab === 'attendance' && attendanceLoading)) ? 'opacity-50 pointer-events-none' : ''}`}>
        {reportSubTab === 'attendance' ? (
          renderAttendanceReportView()
        ) : businessType === 'restaurant' && reportSubTab === 'staff' ? (
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
                  {data.totalWriteOffs > 0 && (
                    <div className="flex justify-between">
                      <span>Spisaniya (Chiqim):</span>
                      <span className="font-semibold text-red-500">-{formatCurrency(data.totalWriteOffs || 0, lang)}</span>
                    </div>
                  )}
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

      {/* Manual Attendance Modal */}
      {manualAttendanceModal.isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col border border-gray-100 dark:border-gray-700 animate-in zoom-in-95 duration-200">
            <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between">
              <h3 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <UserCheck className="text-blue-500" size={20} />
                {manualAttendanceModal.id ? "Davomatni tahrirlash" : "Qo'lda davomat kiritish"}
              </h3>
              <button
                onClick={() => setManualAttendanceModal({ ...manualAttendanceModal, isOpen: false })}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              >
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleSaveManualAttendance} className="p-6 space-y-4">
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Kamera yoki selfi rasmi shart emas. Kelgan va ketgan vaqtlarini belgilang, dastur kechikishni avtomatik hisoblab beradi.
              </p>

              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
                  Xodim
                </label>
                <select
                  required
                  value={manualAttendanceModal.employeeKey}
                  onChange={(e) => setManualAttendanceModal({ ...manualAttendanceModal, employeeKey: e.target.value })}
                  className="w-full bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600 rounded-xl px-4 py-2.5 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium"
                >
                  <option value="" disabled>Xodimni tanlang</option>
                  {attendanceStaff.map((s) => (
                    <option key={`${s.type}_${s.id}`} value={`${s.type}_${s.id}`}>
                      {s.name} ({s.role})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
                  Sana
                </label>
                <input
                  type="date"
                  required
                  value={manualAttendanceModal.date}
                  onChange={(e) => setManualAttendanceModal({ ...manualAttendanceModal, date: e.target.value })}
                  className="w-full bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600 rounded-xl px-4 py-2.5 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
                    Kelgan vaqti
                  </label>
                  <input
                    type="time"
                    value={manualAttendanceModal.checkInTime}
                    onChange={(e) => setManualAttendanceModal({ ...manualAttendanceModal, checkInTime: e.target.value })}
                    className="w-full bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600 rounded-xl px-4 py-2.5 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500 font-bold"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
                    Ketgan vaqti
                  </label>
                  <input
                    type="time"
                    value={manualAttendanceModal.checkOutTime}
                    onChange={(e) => setManualAttendanceModal({ ...manualAttendanceModal, checkOutTime: e.target.value })}
                    className="w-full bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600 rounded-xl px-4 py-2.5 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500 font-bold"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-100 dark:border-gray-700">
                <button
                  type="button"
                  onClick={() => setManualAttendanceModal({ ...manualAttendanceModal, isOpen: false })}
                  className="px-4 py-2.5 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 rounded-xl font-semibold transition-colors"
                >
                  Bekor qilish
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold shadow-md shadow-blue-500/20 transition-all active:scale-[0.98]"
                >
                  Saqlash
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Work Schedule Modal */}
      {scheduleModal.isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col border border-gray-100 dark:border-gray-700 animate-in zoom-in-95 duration-200">
            <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between">
              <h3 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <SettingsIcon className="text-blue-500" size={20} />
                Ish vaqti grafigi sozlamalari
              </h3>
              <button
                onClick={() => setScheduleModal({ ...scheduleModal, isOpen: false })}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              >
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleSaveScheduleSettings} className="p-6 space-y-4">
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Xodimlarning kechikishini avtomatik hisoblash uchun standart ish vaqtlari:
              </p>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
                    Ish boshlanishi
                  </label>
                  <input
                    type="time"
                    required
                    value={scheduleModal.workStartTime}
                    onChange={(e) => setScheduleModal({ ...scheduleModal, workStartTime: e.target.value })}
                    className="w-full bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600 rounded-xl px-4 py-2.5 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500 font-bold text-center"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
                    Ish tugashi
                  </label>
                  <input
                    type="time"
                    required
                    value={scheduleModal.workEndTime}
                    onChange={(e) => setScheduleModal({ ...scheduleModal, workEndTime: e.target.value })}
                    className="w-full bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600 rounded-xl px-4 py-2.5 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500 font-bold text-center"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
                  Kechikish chegarasi (daqiqa)
                </label>
                <input
                  type="number"
                  required
                  min="0"
                  max="120"
                  value={scheduleModal.lateGraceMinutes}
                  onChange={(e) => setScheduleModal({ ...scheduleModal, lateGraceMinutes: e.target.value })}
                  placeholder="5"
                  className="w-full bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600 rounded-xl px-4 py-2.5 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500 font-bold"
                />
                <span className="text-[11px] text-gray-400 dark:text-gray-500 mt-1 block">
                  Masalan: 5 daqiqa belgilansa, 09:05 gacha kelganlar kechikmagan hisoblanadi.
                </span>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-100 dark:border-gray-700">
                <button
                  type="button"
                  onClick={() => setScheduleModal({ ...scheduleModal, isOpen: false })}
                  className="px-4 py-2.5 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 rounded-xl font-semibold transition-colors"
                >
                  Bekor qilish
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold shadow-md shadow-blue-500/20 transition-all active:scale-[0.98]"
                >
                  Saqlash
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Selfie Photo Preview Modal */}
      {viewingPhoto && (
        <div 
          onClick={() => setViewingPhoto(null)}
          className="fixed inset-0 z-[110] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200"
        >
          <div 
            onClick={(e) => e.stopPropagation()}
            className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden border border-gray-200 dark:border-gray-700 animate-in zoom-in-95 duration-200"
          >
            <div className="px-5 py-3.5 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
              <h4 className="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <Camera size={16} className="text-blue-500" />
                {viewingPhoto.title}
              </h4>
              <button 
                onClick={() => setViewingPhoto(null)}
                className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded-lg"
              >
                <X size={18} />
              </button>
            </div>
            <div className="p-4 flex items-center justify-center bg-black/10 dark:bg-black/40">
              <img 
                src={viewingPhoto.url} 
                alt="Davomat selfisi"
                className="max-h-[70vh] rounded-xl object-contain shadow-lg"
              />
            </div>
          </div>
        </div>
      )}

      {/* Attendance Record Delete Confirm Modal */}
      <ConfirmModal
        isOpen={!!attendanceToDelete}
        title="Davomat yozuvini o'chirish"
        message="Rostdan ham ushbu davomat yozuvini o'chirmoqchimisiz? Bu amalni ortga qaytarib bo'lmaydi."
        onConfirm={confirmDeleteAttendance}
        onCancel={() => setAttendanceToDelete(null)}
        confirmText="O'chirish"
      />

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
