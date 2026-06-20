import { useState, useEffect, useCallback } from 'react';
import { ShoppingCart, Package, PackageSearch, Users, BarChart3, Moon, Sun, Globe, LogOut, CheckCircle, X } from 'lucide-react';
import { useApp } from './context/AppContext';
import Cashier from './Cashier';
import Warehouse from './Warehouse';
import Debts from './Debts';
import Reports from './Reports';
import Login from './Login';
import Settings from './Settings';
import SalesHistory from './SalesHistory';
import InventoryHistory from './InventoryHistory';
import ShiftModal from './components/ShiftModal';
import { Settings as SettingsIcon, History, Lock, ClipboardList } from 'lucide-react';
import logo from './assets/logo.png';

// ── Boot Loader ──────────────────────────────────────────────────────────────
// Shown ONLY during the initial license check. Prevents any flash.
function BootLoader({ theme }) {
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
            <img src={logo} alt="xxMpos" className="w-12 h-12 object-contain drop-shadow-md" />
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
  const [activeTab, setActiveTab] = useState('cashier');
  const [showShiftModal, setShowShiftModal] = useState(false);
  const [successToast, setSuccessToast] = useState('');
  const { theme, toggleTheme, lang, toggleLang, t, currentUser, setCurrentUser, storeName } = useApp();

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
    return <BootLoader theme={theme} />;
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
  const tabs = [
    { id: 'cashier',   icon: ShoppingCart, label: t('cashier') },
    { id: 'warehouse', icon: PackageSearch, label: t('warehouse') },
    { id: 'debts',     icon: Users,         label: t('debts') },
    { id: 'history',   icon: History,       label: 'Sotuv tarixi' },
    { id: 'invlog',    icon: ClipboardList, label: 'Harakatlar jurnali' },
    { id: 'reports',   icon: BarChart3,     label: t('reports') },
    { id: 'settings',  icon: SettingsIcon,  label: t('settings') },
  ];

  // ── Render: Main application ─────────────────────────────────────────────
  return (
    <div
      className={`flex h-screen font-sans overflow-hidden transition-colors duration-300 ${
        theme === 'dark' ? 'dark bg-gray-900 text-gray-100' : 'bg-gray-100 text-gray-900'
      }`}
    >
      {/* ── Sidebar ── */}
      <div className="w-64 bg-white dark:bg-gray-800 border-r border-gray-100 dark:border-gray-700 flex flex-col transition-colors duration-300 shrink-0">
        <div className="p-6">
          <div className="flex items-center gap-3">
            <img
              src={logo}
              alt="Logo"
              className="w-10 h-10 object-contain shrink-0 drop-shadow-md"
            />
            <div className="flex-1 min-w-0">
              <h1 className="text-xl font-bold text-gray-900 dark:text-white line-clamp-1">xxMpos</h1>
              <p className="text-sm text-gray-500 dark:text-gray-400 truncate">
                Kassir: {currentUser.name}
              </p>
            </div>
            <button
              onClick={handleLogout}
              title="Заблокировать кассу"
              className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition-colors"
            >
              <LogOut size={20} />
            </button>
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
          <Cashier isActive={activeTab === 'cashier'} />
        </div>

        {/* All non-cashier tabs share the same card wrapper */}
        <div
          style={{ display: activeTab !== 'cashier' ? 'block' : 'none' }}
          className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-150 dark:border-gray-700 p-6 h-full overflow-auto transition-colors duration-300"
        >
          <div style={{ display: activeTab === 'warehouse' ? 'block' : 'none' }} className="h-full">
            <Warehouse isActive={activeTab === 'warehouse'} />
          </div>
          <div style={{ display: activeTab === 'debts' ? 'block' : 'none' }} className="h-full">
            <Debts isActive={activeTab === 'debts'} />
          </div>
          <div style={{ display: activeTab === 'history' ? 'block' : 'none' }} className="h-full">
            <SalesHistory isActive={activeTab === 'history'} />
          </div>
          <div style={{ display: activeTab === 'invlog' ? 'block' : 'none' }} className="h-full">
            <InventoryHistory isActive={activeTab === 'invlog'} />
          </div>
          <div style={{ display: activeTab === 'reports' ? 'block' : 'none' }} className="h-full">
            <Reports isActive={activeTab === 'reports'} />
          </div>
          <div style={{ display: activeTab === 'settings' ? 'block' : 'none' }} className="h-full">
            <Settings isActive={activeTab === 'settings'} />
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
    </div>
  );
}

export default App;
