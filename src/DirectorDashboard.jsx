import { useState, useEffect, useCallback } from 'react';
import { 
  BarChart3, DollarSign, CreditCard, Users, Utensils, 
  TrendingUp, AlertTriangle, Send, RefreshCw, Lock, 
  ChevronRight, ArrowLeft, ShieldCheck, Sun, Moon, Calendar
} from 'lucide-react';
import { useApp } from './context/AppContext';
import { formatCurrency } from './utils';

export default function DirectorDashboard({ onBack }) {
  const { theme, toggleTheme, lang, t, shopLogo, storeName } = useApp();

  const [pin, setPin] = useState(() => sessionStorage.getItem('director_pin') || '');
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState('');
  const [isUnlocked, setIsUnlocked] = useState(() => !!sessionStorage.getItem('director_pin'));

  const [period, setPeriod] = useState('today'); // 'today' | 'yesterday' | 'week' | 'month'
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [telegramStatus, setTelegramStatus] = useState('');

  const fetchDirectorData = useCallback(async (currentPin, selectedPeriod) => {
    setLoading(true);
    setErrorMsg('');
    try {
      if (window.api && window.api.getDirectorStats) {
        const res = await window.api.getDirectorStats(selectedPeriod);
        if (res && res.success) {
          setStats(res);
        } else {
          setErrorMsg(res?.error || "Statistikani yuklashda xatolik");
        }
      } else {
        // Remote Ngrok / Web fetch
        const res = await fetch(`/api/director/stats?period=${selectedPeriod}`, {
          headers: {
            'Authorization': currentPin
          }
        });
        const data = await res.json();
        if (res.ok && data.success) {
          setStats(data);
        } else {
          if (res.status === 401 || res.status === 429) {
            setIsUnlocked(false);
            sessionStorage.removeItem('director_pin');
            setPinError(data.error || "PIN kod noto'g'ri yoki kirish taqiqlangan!");
          } else {
            setErrorMsg(data.error || "Statistikani yuklashda xatolik");
          }
        }
      }
    } catch (err) {
      setErrorMsg("Tarmoq xatosi: " + err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isUnlocked && pin) {
      fetchDirectorData(pin, period);
    }
  }, [isUnlocked, pin, period, fetchDirectorData]);

  const handlePinSubmit = (e) => {
    e.preventDefault();
    const cleanPin = pinInput.trim();
    if (!cleanPin) return;

    if (cleanPin === 'xxMpos7532.' || cleanPin.length === 4) {
      setPin(cleanPin);
      sessionStorage.setItem('director_pin', cleanPin);
      setIsUnlocked(true);
      setPinError('');
      setPinInput('');
    } else {
      setPinError("Noto'g'ri PIN kod!");
    }
  };

  const handleSendTelegramBackup = async () => {
    setTelegramStatus('yuborilmoqda...');
    try {
      if (window.api && window.api.sendTelegramBackup) {
        const res = await window.api.sendTelegramBackup();
        if (res && res.success) {
          setTelegramStatus('✅ Telegram botga yuborildi!');
        } else {
          setTelegramStatus('❌ Xatolik: ' + (res?.error || 'Xato'));
        }
      } else {
        const res = await fetch('/api/backup/send-telegram', {
          method: 'POST',
          headers: { 'Authorization': pin }
        });
        const data = await res.json();
        if (data.success) {
          setTelegramStatus('✅ Telegram botga yuborildi!');
        } else {
          setTelegramStatus('❌ Xatolik: ' + (data.error || 'Xato'));
        }
      }
    } catch (err) {
      setTelegramStatus('❌ Tarmoq xatosi: ' + err.message);
    } setTimeout(() => setTelegramStatus(''), 5000);
  };

  // ── PIN Screen ──
  if (!isUnlocked) {
    return (
      <div className={`min-h-screen w-full flex items-center justify-center p-4 select-none ${theme === 'dark' ? 'dark bg-gray-950 text-white' : 'bg-gray-100 text-gray-900'}`}>
        <div className="max-w-md w-full bg-white dark:bg-gray-800 rounded-3xl shadow-2xl border border-gray-100 dark:border-gray-700/60 p-8 flex flex-col items-center relative overflow-hidden animate-in zoom-in-95 duration-200">
          <div className="absolute top-0 left-0 right-0 h-2 bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600" />
          
          {onBack && (
            <button 
              onClick={onBack}
              className="absolute top-4 left-4 p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded-xl transition"
            >
              <ArrowLeft size={20} />
            </button>
          )}

          <div className="w-16 h-16 rounded-2xl bg-blue-50 dark:bg-blue-950/50 border border-blue-100 dark:border-blue-900/40 text-blue-600 dark:text-blue-400 flex items-center justify-center mb-4 mt-2 shadow-inner">
            <ShieldCheck size={32} />
          </div>

          <h2 className="text-xl font-black text-center text-gray-900 dark:text-white mb-1">
            Direktor Rejimi Paneli
          </h2>
          <p className="text-xs text-gray-500 dark:text-gray-400 text-center mb-6">
            Restoran real-vaqt statistikasi va hisobotlarini ko'rish uchun maxfiy PIN kodni kiriting.
          </p>

          <form onSubmit={handlePinSubmit} className="w-full space-y-4">
            <div>
              <input
                type="password"
                maxLength={10}
                required
                autoFocus
                value={pinInput}
                onChange={(e) => {
                  setPinInput(e.target.value);
                  setPinError('');
                }}
                placeholder="PIN kod kiritish"
                className="w-full px-4 py-3.5 bg-gray-50 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-700 rounded-2xl text-center text-xl font-mono font-extrabold tracking-widest text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {pinError && (
              <div className="p-3 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 text-red-600 dark:text-red-300 rounded-xl text-xs font-bold text-center">
                {pinError}
              </div>
            )}

            <button
              type="submit"
              className="w-full py-3.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-bold rounded-2xl shadow-lg transition active:scale-95 flex items-center justify-center gap-2 cursor-pointer"
            >
              <Lock size={18} />
              <span>Tizimga kirish</span>
            </button>
          </form>
        </div>
      </div>
    );
  }

  const sales = stats?.sales || {};
  const tables = stats?.tables || {};
  const waiters = stats?.waiters || [];
  const topDishes = stats?.topDishes || [];

  return (
    <div className={`min-h-screen w-full font-sans select-none pb-12 transition-colors duration-300 ${theme === 'dark' ? 'dark bg-gray-950 text-gray-100' : 'bg-gray-100 text-gray-900'}`}>
      
      {/* Top Header */}
      <header className="sticky top-0 z-40 bg-white/80 dark:bg-gray-900/80 backdrop-blur-md border-b border-gray-200 dark:border-gray-800 px-4 py-3 shadow-sm">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            {onBack && (
              <button 
                onClick={onBack}
                className="p-2 text-gray-500 hover:text-gray-800 dark:hover:text-gray-200 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 transition"
              >
                <ArrowLeft size={20} />
              </button>
            )}
            <div>
              <h1 className="text-base font-black text-gray-900 dark:text-white flex items-center gap-2">
                <span className="p-1.5 bg-blue-600 text-white rounded-lg text-xs">DIRECTOR</span>
                {storeName || 'Restoran'} Executive Dashboard
              </h1>
              <p className="text-[11px] text-gray-500 dark:text-gray-400 font-bold">
                Masofaviy real-vaqt statistikasi va ombor nazorati
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => fetchDirectorData(pin, period)}
              disabled={loading}
              title="Yangilash"
              className="p-2 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 text-gray-700 dark:text-gray-200 rounded-xl transition cursor-pointer"
            >
              <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
            </button>

            <button
              onClick={toggleTheme}
              className="p-2 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 text-gray-700 dark:text-gray-200 rounded-xl transition cursor-pointer"
            >
              {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
            </button>

            <button
              onClick={() => {
                sessionStorage.removeItem('director_pin');
                setIsUnlocked(false);
              }}
              className="px-3 py-1.5 bg-red-50 text-red-600 dark:bg-red-950/40 dark:text-red-400 font-bold text-xs rounded-xl hover:bg-red-100 transition cursor-pointer"
            >
              Chiqish
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-6xl mx-auto px-4 pt-6 space-y-6">

        {/* Period Selector Tabs & Instant Telegram Backup */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-white dark:bg-gray-900 p-3 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm">
          <div className="flex items-center gap-1 bg-gray-100 dark:bg-gray-800 p-1 rounded-xl w-full sm:w-auto">
            {[
              { id: 'today', label: 'Bugun' },
              { id: 'yesterday', label: 'Kecha' },
              { id: 'week', label: 'Oxirgi 7 kun' },
              { id: 'month', label: 'Oxirgi 30 kun' },
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setPeriod(tab.id)}
                className={`flex-1 sm:flex-none px-4 py-2 rounded-lg text-xs font-extrabold transition-all cursor-pointer ${
                  period === tab.id
                    ? 'bg-blue-600 text-white shadow-md'
                    : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
            {telegramStatus && (
              <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400">{telegramStatus}</span>
            )}
            <button
              onClick={handleSendTelegramBackup}
              className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs rounded-xl shadow-md transition flex items-center gap-2 cursor-pointer active:scale-95"
            >
              <Send size={15} />
              <span>Telegram Botga Hisobot Yuborish</span>
            </button>
          </div>
        </div>

        {errorMsg && (
          <div className="p-4 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 text-red-600 dark:text-red-300 rounded-2xl text-xs font-bold flex items-center gap-2">
            <AlertTriangle size={18} />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* ── 1. Key Performance Cards ── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          
          {/* Total Sales */}
          <div className="bg-white dark:bg-gray-900 p-5 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm relative overflow-hidden">
            <div className="flex justify-between items-start mb-2">
              <span className="text-xs font-extrabold text-gray-500 uppercase tracking-wider">Jami Sotuv & Tushum</span>
              <div className="p-2.5 bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 rounded-xl">
                <DollarSign size={20} />
              </div>
            </div>
            <div className="text-2xl font-black text-gray-900 dark:text-white mb-1">
              {formatCurrency(sales.total_sales || 0, lang)}
            </div>
            <p className="text-[11px] font-bold text-gray-500 dark:text-gray-400">
              Jami yopilgan cheklar: <span className="font-extrabold text-emerald-600">{sales.total_receipts || 0} ta</span>
            </p>
          </div>

          {/* Cash Sales */}
          <div className="bg-white dark:bg-gray-900 p-5 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm">
            <div className="flex justify-between items-start mb-2">
              <span className="text-xs font-extrabold text-gray-500 uppercase tracking-wider">Naqd Pul Tushumi</span>
              <div className="p-2.5 bg-blue-50 dark:bg-blue-950/60 text-blue-600 rounded-xl">
                <TrendingUp size={20} />
              </div>
            </div>
            <div className="text-2xl font-black text-gray-900 dark:text-white mb-1">
              {formatCurrency(sales.cash_sales || 0, lang)}
            </div>
            <p className="text-[11px] font-bold text-gray-500 dark:text-gray-400">
              Kassadagi naqd pul balansida
            </p>
          </div>

          {/* Card & Debt Sales */}
          <div className="bg-white dark:bg-gray-900 p-5 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm">
            <div className="flex justify-between items-start mb-2">
              <span className="text-xs font-extrabold text-gray-500 uppercase tracking-wider">Plastik & Qarzlar</span>
              <div className="p-2.5 bg-purple-50 dark:bg-purple-950/60 text-purple-600 rounded-xl">
                <CreditCard size={20} />
              </div>
            </div>
            <div className="text-lg font-black text-gray-900 dark:text-white mb-1 flex flex-col">
              <span className="text-purple-600 dark:text-purple-400">Plastik: {formatCurrency(sales.card_sales || 0, lang)}</span>
              <span className="text-amber-600 dark:text-amber-400 text-sm">Nasiya (Qarz): {formatCurrency(sales.debt_sales || 0, lang)}</span>
            </div>
          </div>

          {/* Service Fee */}
          <div className="bg-white dark:bg-gray-900 p-5 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm">
            <div className="flex justify-between items-start mb-2">
              <span className="text-xs font-extrabold text-gray-500 uppercase tracking-wider">Kafe Xizmat Foizi</span>
              <div className="p-2.5 bg-amber-50 dark:bg-amber-950/60 text-amber-600 rounded-xl">
                <Utensils size={20} />
              </div>
            </div>
            <div className="text-2xl font-black text-amber-600 dark:text-amber-400 mb-1">
              {formatCurrency(sales.total_service_fee || 0, lang)}
            </div>
            <p className="text-[11px] font-bold text-gray-500 dark:text-gray-400">
              Restoran xizmat ko'rsatish tushumi
            </p>
          </div>
        </div>

        {/* ── 2. Live Tables Status & Active Orders ── */}
        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-5 shadow-sm">
          <h3 className="text-base font-black text-gray-900 dark:text-white mb-4 flex items-center justify-between">
            <span className="flex items-center gap-2">
              <Utensils className="text-blue-600" size={20} />
              Stollar Jonli Holati (Live Tables)
            </span>
            <span className="text-xs font-extrabold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/60 px-3 py-1 rounded-full">
              Hozirgi Ochiq Buyurtmalar Summasi: {formatCurrency(tables.activeTablesSum || 0, lang)}
            </span>
          </h3>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
            <div className="p-4 bg-gray-50 dark:bg-gray-800/60 rounded-xl border border-gray-200 dark:border-gray-700">
              <span className="text-xs font-bold text-gray-500 uppercase block mb-1">Jami Stollar</span>
              <span className="text-2xl font-black text-gray-900 dark:text-white">{tables.total || 0} ta</span>
            </div>

            <div className="p-4 bg-red-50 dark:bg-red-950/30 rounded-xl border border-red-200 dark:border-red-900/60">
              <span className="text-xs font-bold text-red-600 dark:text-red-400 uppercase block mb-1">Band Stollar</span>
              <span className="text-2xl font-black text-red-600 dark:text-red-400">{tables.occupied || 0} ta</span>
            </div>

            <div className="p-4 bg-emerald-50 dark:bg-emerald-950/30 rounded-xl border border-emerald-200 dark:border-emerald-900/60">
              <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 uppercase block mb-1">Bo'sh Stollar</span>
              <span className="text-2xl font-black text-emerald-600 dark:text-emerald-400">{tables.free || 0} ta</span>
            </div>

            <div className="p-4 bg-purple-50 dark:bg-purple-950/30 rounded-xl border border-purple-200 dark:border-purple-900/60">
              <span className="text-xs font-bold text-purple-600 dark:text-purple-400 uppercase block mb-1">Stollar Bandligi</span>
              <span className="text-2xl font-black text-purple-600 dark:text-purple-400">
                {tables.total > 0 ? Math.round((tables.occupied / tables.total) * 100) : 0}%
              </span>
            </div>
          </div>
        </div>

        {/* ── 3. Grid: Waiters Performance & Top Dishes ── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

          {/* Waiters Performance */}
          <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-5 shadow-sm">
            <h3 className="text-base font-black text-gray-900 dark:text-white mb-4 flex items-center gap-2">
              <Users className="text-emerald-600" size={20} />
              Ofitsiantlar Sotuv Tahlili va Ulushlari
            </h3>

            {waiters.length === 0 ? (
              <p className="text-xs text-gray-400 font-bold text-center py-8">Ushbu davrda ofitsiantlar sotuvi topilmadi.</p>
            ) : (
              <div className="space-y-3 max-h-72 overflow-y-auto pr-1 custom-scrollbar">
                {waiters.map(w => (
                  <div key={w.id} className="p-3 bg-gray-50 dark:bg-gray-800/60 rounded-xl border border-gray-200 dark:border-gray-700 flex items-center justify-between text-xs">
                    <div>
                      <span className="font-extrabold text-gray-900 dark:text-white text-sm block">{w.name}</span>
                      <span className="text-gray-500 font-bold">
                        {w.receipts_count || 0} ta chek yopildi ({w.percentage || 0}% ulush)
                      </span>
                    </div>

                    <div className="text-right">
                      <span className="font-black text-emerald-600 dark:text-emerald-400 text-sm block">
                        {formatCurrency(w.total_sales || 0, lang)}
                      </span>
                      <span className="text-purple-600 dark:text-purple-400 font-bold text-[11px]">
                        Ulush: {formatCurrency(w.total_commission || 0, lang)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Top 5 Sold Dishes */}
          <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-5 shadow-sm">
            <h3 className="text-base font-black text-gray-900 dark:text-white mb-4 flex items-center gap-2">
              <BarChart3 className="text-purple-600" size={20} />
              Eng Ko'p Sotilgan Top-5 Taomlar
            </h3>

            {topDishes.length === 0 ? (
              <p className="text-xs text-gray-400 font-bold text-center py-8">Hozircha sotuvlar mavjud emas.</p>
            ) : (
              <div className="space-y-3 max-h-72 overflow-y-auto pr-1 custom-scrollbar">
                {topDishes.map((dish, idx) => (
                  <div key={idx} className="p-3 bg-purple-50/40 dark:bg-purple-950/20 rounded-xl border border-purple-100 dark:border-purple-900/40 flex items-center justify-between text-xs">
                    <div className="flex items-center gap-3">
                      <span className="w-6 h-6 rounded-full bg-purple-600 text-white font-extrabold text-xs flex items-center justify-center">
                        {idx + 1}
                      </span>
                      <div>
                        <span className="font-extrabold text-gray-900 dark:text-white text-sm block">{dish.product_name}</span>
                        <span className="text-gray-500 font-bold">Sotilgan miqdor: {dish.total_qty} porsiya</span>
                      </div>
                    </div>

                    <span className="font-black text-gray-900 dark:text-white text-sm">
                      {formatCurrency(dish.total_sum || 0, lang)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>

        {/* ── 4. Low Stock Ingredients & Stop List Alerts ── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          
          {/* Stop List Alert */}
          <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-5 shadow-sm">
            <h3 className="text-base font-black text-gray-900 dark:text-white mb-3 flex items-center justify-between">
              <span className="flex items-center gap-2">
                <AlertTriangle className="text-red-500" size={20} />
                Stop-Listdagi Taomlar
              </span>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-black bg-red-100 dark:bg-red-950/60 text-red-600 dark:text-red-400">
                {stats?.stopListCount || 0} ta taom to'xtatilgan
              </span>
            </h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
              Masalliq tugashi yoki oshpaz to'xtatishi sababli sotish taqiqlangan taomlar va retseptlar.
            </p>
          </div>

          {/* Low Stock Ingredients */}
          <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-5 shadow-sm">
            <h3 className="text-base font-black text-gray-900 dark:text-white mb-3 flex items-center gap-2">
              <AlertTriangle className="text-amber-500" size={20} />
              Kam Qolgan Masalliqlar (Zaxira ogohlantirishi)
            </h3>

            {(!stats?.lowStockIngredients || stats.lowStockIngredients.length === 0) ? (
              <p className="text-xs text-emerald-600 font-bold py-3">✅ Masalliqlar zaxirasi yetarli darajada.</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto pr-1 custom-scrollbar">
                {stats.lowStockIngredients.map(ing => (
                  <div key={ing.id} className="p-2 bg-amber-50 dark:bg-amber-950/30 rounded-lg border border-amber-200 dark:border-amber-900/60 flex justify-between items-center text-xs">
                    <span className="font-bold text-gray-800 dark:text-gray-200">{ing.name}</span>
                    <span className="font-black text-amber-700 dark:text-amber-400">
                      {ing.stock} {ing.unit || 'kg'}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>

      </main>
    </div>
  );
}
