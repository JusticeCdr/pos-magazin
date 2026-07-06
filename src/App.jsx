import { useState, useEffect, useCallback } from 'react';
import { ShoppingCart, Package, PackageSearch, Users, BarChart3, Moon, Sun, Globe, LogOut, CheckCircle, X } from 'lucide-react';
import { useApp } from './context/AppContext';
import Cashier from './Cashier';
import RestaurantCashier from './RestaurantCashier';
import Warehouse from './Warehouse';
import Debts from './Debts';
import Reports from './Reports';
import Login from './Login';
import Settings from './Settings';
import SalesHistory from './SalesHistory';
import InventoryHistory from './InventoryHistory';
import AiBashoratchi from './AiBashoratchi';
import ShiftModal from './components/ShiftModal';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Settings as SettingsIcon, History, Lock, ClipboardList, Sparkles } from 'lucide-react';
import { logoBase64 } from './logoBase64';
import { parseSQLiteDate } from './utils';

export function LogoIcon({ className = "w-5 h-5 text-orange-500" }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"></path>
      <line x1="3" y1="6" x2="21" y2="6"></line>
      <path d="M16 10a4 4 0 0 1-8 0"></path>
    </svg>
  );
}

// ── Boot Loader ──────────────────────────────────────────────────────────────
// Shown ONLY during the initial license check. Prevents any flash.
function BootLoader({ theme, shopLogo }) {
  return (
    <div
      className={`flex flex-col items-center justify-center h-screen w-screen font-sans select-none transition-colors duration-300 ${
        theme === 'dark' ? 'bg-gray-950' : 'bg-gray-50'
      }`}
    >
      <div className="flex flex-col items-center gap-6">
        {/* Logo */}
        <div className="relative">
          <div
            className={`w-20 h-20 rounded-3xl flex items-center justify-center shadow-2xl border ${
              theme === 'dark'
                ? 'bg-gray-800 border-gray-700'
                : 'bg-white border-gray-100'
            }`}
          >
            <img src={shopLogo || logoBase64} alt="xxMpos" className="w-12 h-12 object-contain drop-shadow-md" />
          </div>
          {/* Spinning ring */}
          <div className="absolute -inset-2 rounded-[2rem] border-4 border-transparent border-t-blue-500 border-r-blue-400 animate-spin opacity-70" />
        </div>

        <div className="text-center">
          <h1
            className={`text-xl font-black tracking-tight mb-1 ${
              theme === 'dark' ? 'text-white' : 'text-gray-900'
            }`}
          >
            xxMpos
          </h1>
          <p
            className={`text-sm font-medium ${
              theme === 'dark' ? 'text-gray-500' : 'text-gray-400'
            }`}
          >
            Yuklanmoqda...
          </p>
        </div>
      </div>
    </div>
  );
}

// ── Activation Screen ────────────────────────────────────────────────────────
function ActivationScreen({ theme, currentMachineId, onActivated }) {
  const [activationCode, setActivationCode] = useState('');
  const [activationError, setActivationError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    const code = activationCode.trim();
    if (code === 'Justice7532') {
      if (window.api) {
        try {
          const res = await window.api.saveActivation(currentMachineId);
          if (res && res.success) {
            onActivated();
          } else {
            setActivationError("Ma'lumotlar bazasiga yozishda xatolik!");
          }
        } catch (err) {
          setActivationError("Xatolik yuz berdi: " + err.message);
        }
      } else {
        onActivated();
      }
    } else {
      setActivationError("Xato kod!");
    }
  };

  return (
    <div
      className={`flex items-center justify-center h-screen w-screen font-sans select-none transition-colors duration-300 ${
        theme === 'dark' ? 'dark bg-gray-950 text-gray-100' : 'bg-gray-50 text-gray-900'
      }`}
    >
      <div className="max-w-md w-full mx-4 bg-white dark:bg-gray-800 p-8 rounded-3xl shadow-2xl border border-gray-100 dark:border-gray-700/50 flex flex-col items-center transition-all duration-300 relative overflow-hidden">
        {/* Decorative gradient line */}
        <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-red-500 via-orange-500 to-yellow-500" />

        {/* Lock Icon */}
        <div className="w-16 h-16 bg-red-50 dark:bg-red-950/30 rounded-2xl flex items-center justify-center mb-6 border border-red-100 dark:border-red-900/30 text-red-600 dark:text-red-400">
          <Lock size={32} className="animate-pulse" />
        </div>

        <h2 className="text-2xl font-black text-center mb-2 tracking-tight text-gray-900 dark:text-white">
          Dasturni faollashtirish
        </h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 text-center mb-6 px-2">
          Ushbu nusxa ushbu kompyuterda faollashtirilmagan yoki boshqa kompyuterga ko'chirilgan.
        </p>

        {/* Machine ID info */}
        <div className="w-full bg-gray-50 dark:bg-gray-900/60 rounded-2xl p-4 mb-6 border border-gray-100 dark:border-gray-800/80">
          <span className="text-[11px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider block mb-1">
            Kompyuter ID (Machine ID)
          </span>
          <code className="text-xs font-mono font-bold text-gray-700 dark:text-gray-300 break-all select-all">
            {currentMachineId || 'Aniqlanmoqda...'}
          </code>
        </div>

        {/* Input form */}
        <form onSubmit={handleSubmit} className="w-full space-y-4">
          <div>
            <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 mb-2 uppercase tracking-wide">
              Faollashtirish kodi
            </label>
            <input
              type="password"
              value={activationCode}
              onChange={(e) => {
                setActivationCode(e.target.value);
                setActivationError('');
              }}
              placeholder="Kod kiritish"
              className="w-full px-4 py-3.5 bg-gray-50 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-700/60 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-center font-mono font-bold text-lg tracking-widest text-gray-800 dark:text-gray-200"
              autoFocus
            />
          </div>

          {activationError && (
            <div className="text-sm font-semibold text-center text-red-500 dark:text-red-400 bg-red-50 dark:bg-red-950/20 py-2.5 rounded-xl border border-red-100 dark:border-red-900/30">
              {activationError}
            </div>
          )}

          <button
            type="submit"
            className="w-full py-4 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-bold rounded-xl shadow-lg hover:shadow-blue-500/20 active:scale-[0.98] transition-all duration-200 flex items-center justify-center gap-2"
          >
            <span>Aktivlashtirish</span>
          </button>
        </form>
      </div>
    </div>
  );
}

// ── Main App Component ───────────────────────────────────────────────────────
function App() {
  const [activeTab, setActiveTab] = useState(() => {
    if (localStorage.getItem('adminSettingsAccess') === 'true') {
      return 'settings';
    }
    return 'cashier';
  });
  const [showShiftModal, setShowShiftModal] = useState(false);
  const [successToast, setSuccessToast] = useState('');
  const { theme, toggleTheme, lang, toggleLang, t, currentUser, setCurrentUser, storeName, shopLogo, terminalMode, businessType } = useApp();
  
  const showSettings = !terminalMode || localStorage.getItem('adminSettingsAccess') === 'true';
  const showSidebar = currentUser && currentUser.role !== 'waiter' && (!terminalMode || localStorage.getItem('adminSettingsAccess') === 'true');

  // Waiter Shaxsiy Hisoboti states
  const [showWaiterReportModal, setShowWaiterReportModal] = useState(false);
  const [waiterReportData, setWaiterReportData] = useState(null);
  const [waiterReportFilter, setWaiterReportFilter] = useState('today'); // 'today' | 'yesterday' | 'week' | 'month'
  const [waiterReportLoading, setWaiterReportLoading] = useState(false);

  const fetchWaiterReport = useCallback(async () => {
    if (!currentUser || currentUser.role !== 'waiter' || !window.api || !window.api.getWaitersReport) return;
    setWaiterReportLoading(true);
    try {
      let start = new Date();
      let end = new Date();
      if (waiterReportFilter === 'today') {
        start.setHours(0,0,0,0);
        end.setHours(23,59,59,999);
      } else if (waiterReportFilter === 'yesterday') {
        start.setDate(start.getDate() - 1);
        start.setHours(0,0,0,0);
        end.setDate(end.getDate() - 1);
        end.setHours(23,59,59,999);
      } else if (waiterReportFilter === 'week') {
        start.setDate(start.getDate() - 7);
        start.setHours(0,0,0,0);
        end.setHours(23,59,59,999);
      } else if (waiterReportFilter === 'month') {
        start.setDate(start.getDate() - 30);
        start.setHours(0,0,0,0);
        end.setHours(23,59,59,999);
      }

      const res = await window.api.getWaitersReport({
        start: start.toISOString(),
        end: end.toISOString(),
        waiterId: currentUser.id
      });
      if (res && res.success) {
        setWaiterReportData(res.data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setWaiterReportLoading(false);
    }
  }, [currentUser, waiterReportFilter]);

  useEffect(() => {
    if (showWaiterReportModal) {
      fetchWaiterReport();
    }
  }, [showWaiterReportModal, fetchWaiterReport]);

  // ── Boot sequence: one-time license check, no flicker ───────────────────
  // 'booting'    → showing spinner (initial, before check completes)
  // 'activated'  → license OK, show app
  // 'locked'     → license missing/wrong, show activation screen
  const [bootState, setBootState] = useState('booting');
  const [currentMachineId, setCurrentMachineId] = useState('');

  useEffect(() => {
    // This effect runs ONCE on mount only. Never triggered by tab changes.
    let cancelled = false;
    async function checkActivation() {
      if (!window.api) {
        // Dev mode without Electron: skip license check
        if (!cancelled) setBootState('activated');
        return;
      }
      try {
        const [machineIdResult, activationRes] = await Promise.all([
          window.api.getMachineId(),
          window.api.getActivation(),
        ]);

        if (cancelled) return;
        setCurrentMachineId(machineIdResult);

        if (activationRes && activationRes.success) {
          const fingerprint = activationRes.data;
          if (!fingerprint) {
            setBootState('locked');
          } else if (fingerprint !== machineIdResult) {
            // Fingerprint mismatch — clear stale record, require re-activation
            await window.api.clearActivation();
            if (!cancelled) setBootState('locked');
          } else {
            if (!cancelled) setBootState('activated');
          }
        } else {
          if (!cancelled) setBootState('locked');
        }
      } catch (err) {
        console.error('Activation check failed:', err);
        if (!cancelled) setBootState('locked');
      }
    }
    checkActivation();
    return () => { cancelled = true; };
  }, []); // ← empty deps: runs ONCE, never on tab switch

  // ── Shift-opened toast ───────────────────────────────────────────────────
  useEffect(() => {
    if (currentUser) {
      const showToast = localStorage.getItem('showShiftOpenedToast');
      if (showToast === 'true') {
        setSuccessToast('Smena ochildi!');
        localStorage.removeItem('showShiftOpenedToast');
        const timer = setTimeout(() => setSuccessToast(''), 5000);
        return () => clearTimeout(timer);
      }
    }
  }, [currentUser]);

  // ── Document title ───────────────────────────────────────────────────────
  useEffect(() => {
    document.title = lang === 'uz' ? t('appName') : 'POS Магазин';
  }, [lang, t]);

  const handleLogout = useCallback(() => {
    localStorage.removeItem('adminSettingsAccess');
    setCurrentUser(null);
    setActiveTab('cashier');
  }, [setCurrentUser]);

  const handleActivated = useCallback(() => {
    setBootState('activated');
    setSuccessToast('Dastur muvaffaqiyatli faollashtirildi!');
    setTimeout(() => setSuccessToast(''), 5000);
  }, []);

  // ── Render: Boot spinner (prevents ANY flash) ────────────────────────────
  if (bootState === 'booting') {
    return <BootLoader theme={theme} shopLogo={shopLogo} />;
  }

  // ── Render: License activation screen ───────────────────────────────────
  if (bootState === 'locked') {
    return (
      <ActivationScreen
        theme={theme}
        currentMachineId={currentMachineId}
        onActivated={handleActivated}
      />
    );
  }

  // ── Render: Login screen (activated but no shift open) ───────────────────
  if (!currentUser) {
    return <Login />;
  }

  // ── Tab definitions ──────────────────────────────────────────────────────
  const allTabs = [
    { id: 'cashier',   icon: ShoppingCart, label: t('cashier') },
    { id: 'warehouse', icon: PackageSearch, label: t('warehouse') },
    { id: 'debts',     icon: Users,         label: t('debts') },
    { id: 'history',   icon: History,       label: 'Sotuv tarixi' },
    { id: 'invlog',    icon: ClipboardList, label: 'Harakatlar jurnali' },
    { id: 'reports',   icon: BarChart3,     label: t('reports') },
    { id: 'bashoratchi', icon: Sparkles,    label: 'AI Maslahatchi' },
    { id: 'settings',  icon: SettingsIcon,  label: t('settings') },
  ];

  const tabs = allTabs.filter(tab => tab.id !== 'settings' || showSettings);

  // ── Render: Main application ─────────────────────────────────────────────
  return (
    <div
      className={`flex h-screen font-sans overflow-hidden transition-colors duration-300 ${
        theme === 'dark' ? 'dark bg-gray-900 text-gray-100' : 'bg-gray-100 text-gray-900'
      }`}
    >
      {/* Global floating action buttons container in top-right corner */}
      <div className="fixed top-4 right-4 z-[99] flex items-center gap-3">
        {currentUser?.role === 'waiter' && (
          <button
            onClick={() => setShowWaiterReportModal(true)}
            title="Mening hisobotim"
            className="p-3.5 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white rounded-2xl shadow-xl transition-all duration-200 flex items-center justify-center border border-blue-400 dark:border-blue-600 cursor-pointer hover:scale-105 active:scale-95 shrink-0"
          >
            <BarChart3 size={22} />
          </button>
        )}

        <button
          onClick={handleLogout}
          title="Kassa qulflansin"
          className="p-3.5 bg-red-500 hover:bg-red-600 active:bg-red-700 text-white rounded-2xl shadow-xl transition-all duration-200 flex items-center justify-center border border-red-400 dark:border-red-600 cursor-pointer hover:scale-105 active:scale-95 shrink-0"
        >
          <Lock size={22} />
        </button>
      </div>

      {/* ── Sidebar ── */}
      {showSidebar && (
        <div className="w-64 bg-white dark:bg-gray-800 border-r border-gray-100 dark:border-gray-700 flex flex-col transition-colors duration-300 shrink-0">
          <div className="p-4 border-b border-gray-100 dark:border-gray-700/60 bg-gray-50/50 dark:bg-gray-900/40 relative flex items-center gap-3 shrink-0">
            <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-slate-100 dark:bg-slate-900/50 border border-gray-200 dark:border-gray-700/50 p-1 shrink-0">
              <img
                src={shopLogo || logoBase64}
                alt="Logo"
                className="w-full h-full object-contain"
              />
            </div>
            <div className="flex flex-col min-w-0 pr-8">
              <h1 className="text-lg font-black text-gray-900 dark:text-white leading-tight truncate">
                xxMpos
              </h1>
              <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 mt-0.5 truncate">
                Kassir: {currentUser.name}
              </p>
            </div>
          </div>

          <nav className="flex-1 px-4 py-6 space-y-2 overflow-y-auto custom-scrollbar">
            {tabs.map(({ id, label, icon: Icon }) => {
              const active = activeTab === id;
              return (
                <button
                  key={id}
                  onClick={() => setActiveTab(id)}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-base font-medium transition-all duration-200 ${
                    active
                      ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 shadow-sm'
                      : 'text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 hover:text-gray-900 dark:hover:text-white'
                  }`}
                >
                  <Icon
                    size={20}
                    className={active ? 'text-blue-600 dark:text-blue-400' : 'text-gray-400 dark:text-gray-500'}
                  />
                  {label}
                </button>
              );
            })}
          </nav>

          {/* ── Sidebar Controls ── */}
          <div className="p-4 border-t border-gray-100 dark:border-gray-700 space-y-2">
            <button
              onClick={() => setShowShiftModal(true)}
              className="w-full flex items-center justify-between px-4 py-2.5 rounded-lg text-sm font-medium bg-orange-50 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400 hover:bg-orange-100 dark:hover:bg-orange-900/40 transition-colors"
            >
              <div className="flex items-center gap-2">
                <Lock size={16} />
                <span>Smenani yopish</span>
              </div>
            </button>

            <button
              onClick={toggleLang}
              className="w-full flex items-center justify-between px-4 py-2.5 rounded-lg text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            >
              <div className="flex items-center gap-2">
                <Globe size={16} />
                <span>{lang === 'ru' ? 'Русский' : "O'zbekcha"}</span>
              </div>
              <span className="text-xs px-2 py-1 bg-gray-200 dark:bg-gray-600 rounded-md font-bold uppercase">
                {lang}
              </span>
            </button>

            <button
              onClick={toggleTheme}
              className="w-full flex items-center justify-between px-4 py-2.5 rounded-lg text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            >
              <div className="flex items-center gap-2">
                {theme === 'light' ? <Moon size={16} /> : <Sun size={16} />}
                <span>{theme === 'light' ? t('darkMode') : t('lightMode')}</span>
              </div>
            </button>
          </div>

          <div className="px-4 py-3 border-t border-gray-100 dark:border-gray-700 text-xs text-center text-gray-400 dark:text-gray-500">
            {t('version')}
          </div>
        </div>
      )}

      {/* ── Main Content Area ── */}
      {/*
        ALL tab panels are rendered at once (never unmounted) and toggled with
        CSS `display` so internal state (scroll position, loaded data, refs)
        is fully preserved between tab switches → ZERO re-fetch on switch.
      */}
      <div
        className={`flex-1 min-w-0 min-h-0 overflow-hidden transition-colors duration-300 ${
          activeTab === 'cashier' ? 'p-4' : 'p-6'
        }`}
      >
        {/* Cashier — always rendered, shown via CSS */}
        <div style={{ display: activeTab === 'cashier' ? 'flex' : 'none' }} className="h-full flex-col">
          <ErrorBoundary name="Cashier">
            {businessType === 'restaurant' ? (
              <RestaurantCashier isActive={activeTab === 'cashier'} />
            ) : (
              <Cashier isActive={activeTab === 'cashier'} />
            )}
          </ErrorBoundary>
        </div>

        {/* All non-cashier tabs share the same card wrapper */}
        <div
          style={{ display: activeTab !== 'cashier' ? 'block' : 'none' }}
          className={`bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-150 dark:border-gray-700 p-6 h-full transition-colors duration-300 ${
            ['warehouse', 'debts', 'history', 'invlog'].includes(activeTab)
              ? 'flex flex-col overflow-hidden'
              : 'overflow-auto'
          }`}
        >
          <div 
            style={{ display: activeTab === 'warehouse' ? 'flex' : 'none' }} 
            className="h-full flex-col min-h-0 flex-1"
          >
            <ErrorBoundary name="Warehouse">
              <Warehouse isActive={activeTab === 'warehouse'} />
            </ErrorBoundary>
          </div>
          <div 
            style={{ display: activeTab === 'debts' ? 'flex' : 'none' }} 
            className="h-full flex-col min-h-0 flex-1"
          >
            <ErrorBoundary name="Debts">
              <Debts isActive={activeTab === 'debts'} />
            </ErrorBoundary>
          </div>
          <div 
            style={{ display: activeTab === 'history' ? 'flex' : 'none' }} 
            className="h-full flex-col min-h-0 flex-1"
          >
            <ErrorBoundary name="SalesHistory">
              <SalesHistory isActive={activeTab === 'history'} />
            </ErrorBoundary>
          </div>
          <div 
            style={{ display: activeTab === 'invlog' ? 'flex' : 'none' }} 
            className="h-full flex-col min-h-0 flex-1"
          >
            <ErrorBoundary name="InventoryHistory">
              <InventoryHistory isActive={activeTab === 'invlog'} />
            </ErrorBoundary>
          </div>
          <div style={{ display: activeTab === 'reports' ? 'block' : 'none' }} className="h-full">
            <ErrorBoundary name="Reports">
              <Reports isActive={activeTab === 'reports'} />
            </ErrorBoundary>
          </div>
          <div style={{ display: activeTab === 'settings' ? 'block' : 'none' }} className="h-full">
            <ErrorBoundary name="Settings">
              <Settings isActive={activeTab === 'settings'} />
            </ErrorBoundary>
          </div>
          <div style={{ display: activeTab === 'bashoratchi' ? 'block' : 'none' }} className="h-full rounded-2xl overflow-hidden bg-slate-900 text-white">
            <ErrorBoundary name="AiBashoratchi">
              <AiBashoratchi isActive={activeTab === 'bashoratchi'} />
            </ErrorBoundary>
          </div>
        </div>
      </div>

      {/* ── Shift Modal ── */}
      {showShiftModal && (
        <ShiftModal
          onClose={() => setShowShiftModal(false)}
          onShiftClosed={() => {}}
          onLogout={handleLogout}
        />
      )}

      {/* ── Success Toast ── */}
      {successToast && (
        <div className="fixed top-6 right-6 z-[1000] bg-emerald-600 dark:bg-emerald-500 text-white font-bold px-6 py-4 rounded-xl shadow-2xl flex items-center gap-3 animate-bounce border border-emerald-500 dark:border-emerald-400">
          <CheckCircle size={20} className="shrink-0" />
          <span>{successToast}</span>
          <button onClick={() => setSuccessToast('')} className="ml-2 hover:text-emerald-200 transition-colors">
            <X size={16} />
          </button>
        </div>
      )}
      {/* Waiter Shaxsiy Hisoboti Modal */}
      {showWaiterReportModal && waiterReportData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-2xl border border-gray-150 dark:border-gray-700 w-full max-w-3xl h-[85vh] flex flex-col mx-4 overflow-hidden relative">
            {/* Modal Header */}
            <div className="p-6 border-b border-gray-150 dark:border-gray-700 flex justify-between items-center bg-gray-50/50 dark:bg-gray-900/30">
              <div>
                <h3 className="text-xl font-bold text-gray-900 dark:text-white">Shaxsiy ish hisoboti</h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Ofitsiant: {currentUser.name}</p>
              </div>
              <button
                onClick={() => setShowWaiterReportModal(false)}
                className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl transition text-gray-400 hover:text-gray-600 dark:hover:text-white cursor-pointer"
              >
                <X size={20} />
              </button>
            </div>

            {/* Date Filters */}
            <div className="p-4 bg-white dark:bg-gray-800 flex gap-2 border-b border-gray-100 dark:border-gray-700">
              {['today', 'yesterday', 'week', 'month'].map((f) => {
                const label = f === 'today' ? 'Bugun' : f === 'yesterday' ? 'Kecha' : f === 'week' ? 'Haftalik' : 'Aylik';
                const active = waiterReportFilter === f;
                return (
                  <button
                    key={f}
                    onClick={() => setWaiterReportFilter(f)}
                    className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                      active
                        ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20'
                        : 'bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-600 dark:text-gray-300'
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>

            {/* Modal Body */}
            <div className="flex-1 p-6 overflow-y-auto space-y-6 custom-scrollbar">
              {waiterReportLoading ? (
                <div className="h-40 flex items-center justify-center">
                  <span className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
                </div>
              ) : (
                <>
                  {/* Stats Cards */}
                  <div className="grid grid-cols-3 gap-4">
                    <div className="p-4 bg-blue-50/50 dark:bg-blue-900/10 border border-blue-100 dark:border-blue-900/30 rounded-2xl text-center">
                      <span className="text-[11px] font-bold text-blue-500 uppercase tracking-wider block mb-1">Jami buyurtmalar</span>
                      <span className="text-2xl font-black text-blue-700 dark:text-blue-400">{waiterReportData.waiter?.total_receipts || 0} ta</span>
                    </div>

                    <div className="p-4 bg-emerald-50/50 dark:bg-emerald-900/10 border border-emerald-100 dark:border-emerald-900/30 rounded-2xl text-center">
                      <span className="text-[11px] font-bold text-emerald-500 uppercase tracking-wider block mb-1">Jami sotuv</span>
                      <span className="text-2xl font-black text-emerald-700 dark:text-emerald-400">
                        {Math.round(waiterReportData.waiter?.total_sales || 0).toLocaleString('ru-RU')} UZS
                      </span>
                    </div>

                    <div className="p-4 bg-purple-50/50 dark:bg-purple-900/10 border border-purple-100 dark:border-purple-900/30 rounded-2xl text-center">
                      <span className="text-[11px] font-bold text-purple-500 uppercase tracking-wider block mb-1">Mening ulushim ({waiterReportData.waiter?.percentage || 0}%)</span>
                      <span className="text-2xl font-black text-purple-700 dark:text-purple-400">
                        {Math.round(waiterReportData.waiter?.total_commission || 0).toLocaleString('ru-RU')} UZS
                      </span>
                    </div>
                  </div>

                  {/* Detailed List */}
                  <div>
                    <h4 className="font-bold text-gray-800 dark:text-white mb-4">Sotilgan cheklar ro'yxati</h4>
                    {waiterReportData.receipts?.length === 0 ? (
                      <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-8">Ushbu davrda sotuvlar topilmadi</p>
                    ) : (
                      <div className="border border-gray-150 dark:border-gray-700 rounded-2xl overflow-hidden">
                        <table className="w-full text-sm text-left">
                          <thead className="bg-gray-50 dark:bg-gray-900/50 text-xs font-bold text-gray-500 dark:text-gray-400 border-b border-gray-150 dark:border-gray-700">
                            <tr>
                              <th className="px-6 py-4">Chek #</th>
                              <th className="px-6 py-4">Sana</th>
                              <th className="px-6 py-4">To'lov usuli</th>
                              <th className="px-6 py-4 text-right">Chek summasi</th>
                              <th className="px-6 py-4 text-right">Mening ulushim</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-150 dark:divide-gray-700 text-gray-700 dark:text-gray-300">
                            {waiterReportData.receipts?.map((r) => (
                              <tr key={r.id} className="hover:bg-gray-50/50 dark:hover:bg-gray-900/20 transition-colors">
                                <td className="px-6 py-4 font-black">#{r.shift_receipt_number}</td>
                                <td className="px-6 py-4 text-gray-500 dark:text-gray-400">
                                  {parseSQLiteDate(r.created_at).toLocaleString('ru-RU', {
                                    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'
                                  })}
                                </td>
                                <td className="px-6 py-4">
                                  <span className={`px-2 py-0.5 rounded-md text-xs font-bold ${
                                    r.payment_method === 'cash' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400' :
                                    r.payment_method === 'card' ? 'bg-blue-100 text-blue-700 dark:bg-blue-950/30 dark:text-blue-400' :
                                    'bg-amber-100 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400'
                                  }`}>
                                    {r.payment_method === 'cash' ? 'Naqd' : r.payment_method === 'card' ? 'Karta' : 'Qarzga'}
                                  </span>
                                </td>
                                <td className="px-6 py-4 text-right font-bold">{Math.round(r.total_amount).toLocaleString('ru-RU')} so'm</td>
                                <td className="px-6 py-4 text-right font-black text-purple-600 dark:text-purple-400">+{Math.round(r.waiter_commission).toLocaleString('ru-RU')} so'm</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
