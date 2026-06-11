import { useState } from 'react';
import { Lock, ArrowRight } from 'lucide-react';
import { useApp } from './context/AppContext';

export default function Login() {
  const { t, setCurrentUser } = useApp();
  const [pin, setPin] = useState('');
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();
    if (pin.length !== 4) return;
    
    setLoading(true);
    setError(false);
    
    try {
      // Master PIN override
      if (pin === '7532') {
        const adminUser = { id: 0, name: 'Asosiy Admin', pin: '7532' };
        if (window.api) {
          const openRes = await window.api.maybeOpenShift(adminUser.name);
          if (openRes && openRes.success && openRes.shiftOpened) {
            localStorage.setItem('showShiftOpenedToast', 'true');
          }
        }
        setCurrentUser(adminUser);
        return;
      }

      const result = await window.api.verifyPin(pin);
      if (result && result.success && result.valid) {
        const openRes = await window.api.maybeOpenShift(result.cashier.name);
        if (openRes && openRes.success && openRes.shiftOpened) {
          localStorage.setItem('showShiftOpenedToast', 'true');
        }
        setCurrentUser(result.cashier);
      } else {
        setError(true);
        setPin('');
      }
    } catch (err) {
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  const handleNumClick = (num) => {
    if (pin.length < 4) {
      setPin(prev => prev + num);
      setError(false);
    }
  };

  const handleBackspace = () => {
    setPin(prev => prev.slice(0, -1));
    setError(false);
  };

  // Auto-submit when 4 digits are entered via keypad
  if (pin.length === 4 && !loading && !error) {
    handleLogin({ preventDefault: () => {} });
  }

  return (
    <div className="h-screen w-full flex items-center justify-center bg-gray-50 dark:bg-gray-900 transition-colors">
      <div className="w-full max-w-md bg-white dark:bg-gray-800 p-8 rounded-3xl shadow-xl border border-gray-100 dark:border-gray-700/50 flex flex-col items-center">
        
        <div className="w-16 h-16 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center mb-6">
          <Lock className="text-blue-600 dark:text-blue-400" size={32} />
        </div>
        
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">{t('loginTitle')}</h2>
        <p className="text-gray-500 dark:text-gray-400 text-sm mb-8 text-center">{t('loginSubtitle')}</p>

        {/* PIN Indicators */}
        <div className="flex gap-4 mb-8">
          {[0, 1, 2, 3].map(i => (
            <div 
              key={i} 
              className={`w-4 h-4 rounded-full transition-all duration-300 ${
                pin.length > i 
                  ? 'bg-blue-600 dark:bg-blue-500 scale-110' 
                  : 'bg-gray-200 dark:bg-gray-700'
              } ${error ? 'bg-red-500 dark:bg-red-500 animate-pulse' : ''}`}
            />
          ))}
        </div>

        {error && (
          <p className="text-red-500 text-sm font-semibold mb-4 animate-bounce">{t('loginError')}</p>
        )}

        {/* Keypad */}
        <div className="grid grid-cols-3 gap-5 w-full mb-6">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(num => (
            <button
              key={num}
              onClick={() => handleNumClick(num.toString())}
              className="h-20 rounded-2xl bg-gray-50 hover:bg-gray-100 dark:bg-gray-700/50 dark:hover:bg-gray-700 text-4xl font-bold text-gray-800 dark:text-white transition-colors active:scale-95 shadow-sm"
            >
              {num}
            </button>
          ))}
          <div /> {/* Empty cell */}
          <button
            onClick={() => handleNumClick('0')}
            className="h-20 rounded-2xl bg-gray-50 hover:bg-gray-100 dark:bg-gray-700/50 dark:hover:bg-gray-700 text-4xl font-bold text-gray-800 dark:text-white transition-colors active:scale-95 shadow-sm"
          >
            0
          </button>
          <button
            onClick={handleBackspace}
            className="h-20 rounded-2xl bg-gray-50 hover:bg-gray-100 dark:bg-gray-700/50 dark:hover:bg-gray-700 flex items-center justify-center text-gray-500 dark:text-gray-400 transition-colors active:scale-95 shadow-sm"
          >
            <ArrowRight className="rotate-180" size={32} strokeWidth={2.5} />
          </button>
        </div>

      </div>
    </div>
  );
}
