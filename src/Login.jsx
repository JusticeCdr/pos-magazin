import { useState, useEffect } from 'react';
import { Lock, ArrowRight, Store, Send, Camera, Phone, Settings } from 'lucide-react';
import { useApp } from './context/AppContext';
import { logoBase64 } from './logoBase64';

export function LogoIcon({ className = "w-5 h-5 text-orange-500" }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"></path>
      <line x1="3" y1="6" x2="21" y2="6"></line>
      <path d="M16 10a4 4 0 0 1-8 0"></path>
    </svg>
  );
}

export default function Login() {
  const { t, setCurrentUser, shopLogo, terminalMode } = useApp();
  const [pin, setPin] = useState('');
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(false);
  
  // Brute force protection state
  const [failCount, setFailCount] = useState(0);
  const [lockoutTimer, setLockoutTimer] = useState(0);

  // Admin Modal state
  const [showAdminModal, setShowAdminModal] = useState(false);
  const [adminPin, setAdminPin] = useState('');
  const [adminError, setAdminError] = useState(false);

  useEffect(() => {
    let timer;
    if (lockoutTimer > 0) {
      timer = setInterval(() => {
        setLockoutTimer(prev => prev - 1);
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [lockoutTimer]);

  const handleCashierLogin = async (e) => {
    if (e) e.preventDefault();
    if (pin.length !== 4) return;
    if (lockoutTimer > 0) return;
    
    setLoading(true);
    setError(false);
    
    try {
      if (pin === '7532') {
        const adminUser = { id: 0, name: 'Asosiy Admin', pin: '7532', role: 'admin' };
        if (window.api) {
          const openRes = await window.api.maybeOpenShift(adminUser.name);
          if (openRes && openRes.success && openRes.shiftOpened) {
            localStorage.setItem('showShiftOpenedToast', 'true');
          }
        }
        setFailCount(0);
        setCurrentUser(adminUser);
        setPin('');
        return;
      }

      const result = await window.api.verifyPin(pin);
      if (result && result.success && result.valid) {
        if (terminalMode && result.cashier.role !== 'waiter') {
          handleFailedAttempt();
          return;
        }
        const openRes = await window.api.maybeOpenShift(result.cashier.name);
        if (openRes && openRes.success && openRes.shiftOpened) {
          localStorage.setItem('showShiftOpenedToast', 'true');
        }
        setFailCount(0);
        setCurrentUser(result.cashier);
      } else {
        handleFailedAttempt();
      }
    } catch (err) {
      handleFailedAttempt();
    } finally {
      setLoading(false);
    }
  };

  const handleAdminLogin = async (e) => {
    if (e) e.preventDefault();
    if (adminPin !== '7532') {
      setAdminError(true);
      setAdminPin('');
      return;
    }
    
    // Correct Admin PIN
    const adminUser = { id: 0, name: 'Asosiy Admin', pin: '7532', role: 'admin' };
    if (window.api) {
      const openRes = await window.api.maybeOpenShift(adminUser.name);
      if (openRes && openRes.success && openRes.shiftOpened) {
        localStorage.setItem('showShiftOpenedToast', 'true');
      }
    }
    localStorage.setItem('adminSettingsAccess', 'true');
    setCurrentUser(adminUser);
  };

  const handleFailedAttempt = () => {
    setError(true);
    setPin('');
    
    const newFailCount = failCount + 1;
    setFailCount(newFailCount);
    
    if (newFailCount === 2) {
      setLockoutTimer(30); 
    } else if (newFailCount === 3) {
      setLockoutTimer(60); 
    } else if (newFailCount === 4) {
      setLockoutTimer(180); 
    } else if (newFailCount >= 5) {
      setLockoutTimer(300); 
    }
  };

  const handleNumClick = (num) => {
    if (lockoutTimer > 0) return;
    if (pin.length < 4) {
      setPin(prev => prev + num);
      setError(false);
    }
  };

  const handleBackspace = () => {
    if (lockoutTimer > 0) return;
    setPin(prev => prev.slice(0, -1));
    setError(false);
  };

  // Auto-submit Cashier PIN
  if (pin.length === 4 && !loading && !error && lockoutTimer === 0 && !showAdminModal) {
    handleCashierLogin({ preventDefault: () => {} });
  }

  // Auto-submit Admin PIN
  if (adminPin.length === 4 && showAdminModal) {
    handleAdminLogin({ preventDefault: () => {} });
  }

  return (
    <div className="min-h-screen w-full flex bg-white dark:bg-gray-900 transition-colors relative">
      
      {/* --- Admin Modal --- */}
      {showAdminModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-gray-800 rounded-3xl p-8 max-w-sm w-full shadow-2xl relative border border-gray-100 dark:border-gray-700/50">
            <button 
              onClick={() => { setShowAdminModal(false); setAdminPin(''); setAdminError(false); }}
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            </button>
            <div className="flex flex-col items-center text-center">
              <div className="w-16 h-16 bg-slate-100 dark:bg-slate-700 rounded-full flex items-center justify-center mb-4">
                <Settings className="text-slate-700 dark:text-slate-300" size={32} />
              </div>
              <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Sozlamalar</h3>
              <p className="text-gray-500 dark:text-gray-400 text-sm mb-6">Tizimga kirish uchun admin parolini kiriting</p>
              
              <div className="flex gap-3 mb-6">
                {[0, 1, 2, 3].map(i => (
                  <div 
                    key={i} 
                    className={`w-4 h-4 rounded-full transition-all duration-300 ${
                      adminPin.length > i 
                        ? 'bg-slate-800 dark:bg-slate-200 scale-110' 
                        : 'bg-gray-200 dark:bg-gray-700'
                    } ${adminError ? 'bg-red-500 dark:bg-red-500 animate-pulse' : ''}`}
                  />
                ))}
              </div>
              
              {adminError && <p className="text-red-500 text-sm font-bold mb-4 animate-bounce">Noto'g'ri PIN kod</p>}
              
              <div className="grid grid-cols-3 gap-3 w-full">
                {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(num => (
                  <button key={num} onClick={() => { setAdminPin(prev => prev + num); setAdminError(false); }} className="h-16 rounded-xl bg-gray-50 hover:bg-gray-100 dark:bg-gray-700/50 dark:hover:bg-gray-700 text-2xl font-bold text-gray-800 dark:text-white transition-all active:scale-95 border border-gray-100 dark:border-gray-600/50">
                    {num}
                  </button>
                ))}
                <div />
                <button onClick={() => { setAdminPin(prev => prev + '0'); setAdminError(false); }} className="h-16 rounded-xl bg-gray-50 hover:bg-gray-100 dark:bg-gray-700/50 dark:hover:bg-gray-700 text-2xl font-bold text-gray-800 dark:text-white transition-all active:scale-95 border border-gray-100 dark:border-gray-600/50">
                  0
                </button>
                <button onClick={() => { setAdminPin(prev => prev.slice(0, -1)); setAdminError(false); }} className="h-16 rounded-xl bg-gray-50 hover:bg-gray-100 dark:bg-gray-700/50 dark:hover:bg-gray-700 flex items-center justify-center text-gray-500 dark:text-gray-400 transition-all active:scale-95 border border-gray-100 dark:border-gray-600/50">
                  <ArrowRight className="rotate-180" size={24} strokeWidth={3} />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Left Column - Branding (Professional Dark Slate theme, Centered) */}
      <div className="hidden lg:flex w-1/2 bg-slate-900 p-8 pt-16 flex-col items-center justify-start text-center relative overflow-hidden h-screen">
        
        {/* Large Logo - Placed in normal flex flow with height constraints to prevent overflow */}
        <img 
          src={shopLogo || logoBase64}
          alt="Logo" 
          className="w-[1100px] max-w-[95%] max-h-[38vh] object-contain drop-shadow-2xl select-none shrink-0 mb-6" 
        />

        {/* Text and buttons positioned statically below the logo */}
        <div className="flex flex-col items-center max-w-lg w-full shrink-0 z-10 -mt-32 gap-24">
          
          {/* Group 1: Title & Description */}
          <div className="flex flex-col items-center w-full">
            <h1 className="text-4xl lg:text-5xl font-bold text-white mb-4 leading-tight tracking-tight flex items-center justify-center gap-3">
              <LogoIcon className="w-10 h-10 text-orange-500 shrink-0" />
              <span>xxMpos<br/><span className="text-3xl font-semibold">Savdo Tizimi</span></span>
            </h1>
            <p className="text-slate-400 text-sm lg:text-base leading-relaxed px-4">
              Do'kon, kafe, restoran va savdo jarayonlarini avtomatlashtirish, ombor hisobini yuritish uchun zamonaviy va qulay yechim.
            </p>
          </div>

          {/* Group 2: Contact links - now takes the full space */}
          <div className="flex flex-col items-center w-full">
            <p className="text-slate-500 font-semibold text-xs uppercase tracking-widest mb-4">Biz bilan bog'lanish</p>
            <div className="flex gap-8 justify-center">
              <a href="https://t.me/the_xxm" target="_blank" rel="noreferrer" className="flex flex-col items-center gap-2 text-slate-400 hover:text-white transition-colors group">
                <div className="w-12 h-12 bg-slate-800 group-hover:bg-slate-700 rounded-full flex items-center justify-center transition-colors shadow-md border border-slate-700 group-hover:border-slate-600">
                  <Send size={20} className="-ml-0.5" />
                </div>
                <span className="text-sm font-medium">Telegram</span>
              </a>
              <a href="https://instagram.com/the_xxm_" target="_blank" rel="noreferrer" className="flex flex-col items-center gap-2 text-slate-400 hover:text-white transition-colors group">
                <div className="w-12 h-12 bg-slate-800 group-hover:bg-slate-700 rounded-full flex items-center justify-center transition-colors shadow-md border border-slate-700 group-hover:border-slate-600">
                  <Camera size={20} />
                </div>
                <span className="text-sm font-medium">Instagram</span>
              </a>
              <div className="flex flex-col items-center gap-2 text-slate-400 hover:text-white transition-colors group cursor-default">
                <div className="w-12 h-12 bg-slate-800 group-hover:bg-slate-700 rounded-full flex items-center justify-center transition-colors shadow-md border border-slate-700 group-hover:border-slate-600">
                  <Phone size={20} />
                </div>
                <span className="text-sm font-medium">+998507110656</span>
              </div>
            </div>
          </div>
        </div>

        {/* Settings icon — subtle, bottom-left corner */}
        <button
          onClick={() => setShowAdminModal(true)}
          title="Sozlamalarga kirish"
          className="absolute bottom-4 left-4 p-2 text-slate-700/30 hover:text-slate-400 transition-colors rounded-lg"
        >
          <Settings size={18} />
        </button>
      </div>

      {/* Right Column - Cashier Login */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-4 sm:p-8 bg-gray-50 dark:bg-gray-900">
        <div className="w-full max-w-md bg-white dark:bg-gray-800 p-8 sm:p-10 rounded-[2.5rem] shadow-[0_20px_50px_rgba(0,0,0,0.05)] dark:shadow-[0_20px_50px_rgba(0,0,0,0.5)] border border-gray-100 dark:border-gray-700/50 flex flex-col items-center relative overflow-hidden">
          
          <div className="w-20 h-20 bg-slate-50 dark:bg-slate-900/40 rounded-[1.5rem] flex items-center justify-center mb-8 border border-slate-100 dark:border-slate-700/50 rotate-3">
            <Lock className="text-slate-600 dark:text-slate-400 -rotate-3" size={36} />
          </div>
          
          <h2 className="text-3xl font-black text-gray-900 dark:text-white mb-2">{t('loginTitle')}</h2>
          <p className="text-gray-500 dark:text-gray-400 text-base mb-8 text-center">Kassaga kirish uchun parolingizni kiriting</p>

          {/* PIN Indicators */}
          <div className="flex gap-4 mb-6">
            {[0, 1, 2, 3].map(i => (
              <div 
                key={i} 
                className={`w-5 h-5 rounded-full transition-all duration-300 shadow-inner ${
                  pin.length > i 
                    ? 'bg-slate-700 dark:bg-slate-300 scale-110 shadow-slate-500/30' 
                    : 'bg-gray-100 dark:bg-gray-700'
                } ${error && lockoutTimer === 0 ? 'bg-red-500 dark:bg-red-500 animate-pulse shadow-red-500/50' : ''}`}
              />
            ))}
          </div>

          {/* Error Message & Timer Space */}
          <div className="h-14 flex items-center justify-center w-full mb-4">
            {lockoutTimer > 0 ? (
              <div className="bg-red-50 dark:bg-red-900/20 px-6 py-2.5 rounded-2xl border border-red-100 dark:border-red-800 flex items-center gap-3 animate-in fade-in zoom-in duration-300">
                <span className="text-red-600 dark:text-red-400 font-black text-xl tracking-widest w-16 text-center">
                  {Math.floor(lockoutTimer / 60)}:{(lockoutTimer % 60).toString().padStart(2, '0')}
                </span>
                <div className="w-px h-6 bg-red-200 dark:bg-red-800"></div>
                <span className="text-red-500 dark:text-red-400 text-sm font-bold uppercase tracking-wider">Kutib turing</span>
              </div>
            ) : error ? (
              <p className="text-red-500 text-sm font-bold animate-bounce bg-red-50 dark:bg-red-900/20 px-5 py-2 rounded-xl">PIN kod noto'g'ri!</p>
            ) : null}
          </div>

          {/* Keypad */}
          <div className="grid grid-cols-3 gap-3 sm:gap-4 w-full">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(num => (
              <button
                key={num}
                onClick={() => handleNumClick(num.toString())}
                disabled={lockoutTimer > 0}
                className={`h-20 rounded-2xl text-4xl font-black transition-all duration-200 active:scale-90 shadow-sm border border-gray-100 dark:border-gray-700/50
                  ${lockoutTimer > 0 
                    ? 'bg-gray-50 dark:bg-gray-800 text-gray-300 dark:text-gray-600 cursor-not-allowed' 
                    : 'bg-white hover:bg-slate-50 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-800 dark:text-white hover:border-slate-200 dark:hover:border-gray-600 hover:shadow-md'
                  }
                `}
              >
                {num}
              </button>
            ))}
            <div /> {/* Empty cell */}
            <button
              onClick={() => handleNumClick('0')}
              disabled={lockoutTimer > 0}
              className={`h-20 rounded-2xl text-4xl font-black transition-all duration-200 active:scale-90 shadow-sm border border-gray-100 dark:border-gray-700/50
                ${lockoutTimer > 0 
                  ? 'bg-gray-50 dark:bg-gray-800 text-gray-300 dark:text-gray-600 cursor-not-allowed' 
                  : 'bg-white hover:bg-slate-50 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-800 dark:text-white hover:border-slate-200 dark:hover:border-gray-600 hover:shadow-md'
                }
              `}
            >
              0
            </button>
            <button
              onClick={handleBackspace}
              disabled={lockoutTimer > 0}
              className={`h-20 rounded-2xl flex items-center justify-center transition-all duration-200 active:scale-90 shadow-sm border border-gray-100 dark:border-gray-700/50
                ${lockoutTimer > 0 
                  ? 'bg-gray-50 dark:bg-gray-800 text-gray-300 dark:text-gray-600 cursor-not-allowed' 
                  : 'bg-white hover:bg-red-50 dark:bg-gray-800 dark:hover:bg-red-900/20 text-gray-500 hover:text-red-500 dark:text-gray-400 dark:hover:text-red-400 hover:border-red-200 dark:hover:border-red-800 hover:shadow-md'
                }
              `}
            >
              <ArrowRight className="rotate-180" size={32} strokeWidth={3} />
            </button>
          </div>

        </div>
      </div>
    </div>
  );
}
