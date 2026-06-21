import React, { useState } from 'react';
import { Sparkles, TrendingUp, AlertTriangle, PackageX, Calendar } from 'lucide-react';
import { useApp } from './context/AppContext';

export default function AiBashoratchi({ isActive }) {
  const { t } = useApp();
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  if (!isActive) return null;

  const handleAnalyze = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await window.api.getAiInsights();
      if (res.success) {
        setData(res.data);
      } else {
        setError(res.error || "Xatolik yuz berdi");
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="h-full flex flex-col p-6 bg-slate-900 text-white overflow-y-auto">
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between mb-8 border-b border-slate-700 pb-6 gap-4">
        <div className="flex items-center gap-4">
          <div className="p-4 bg-purple-500/20 rounded-2xl border border-purple-500/30">
            <Sparkles className="text-purple-400" size={32} />
          </div>
          <div>
            <h1 className="text-3xl font-black bg-gradient-to-r from-purple-400 to-blue-400 bg-clip-text text-transparent">
              AI Maslahatchi
            </h1>
            <p className="text-slate-400 text-sm mt-1">Sotuvlar asosida biznesingiz uchun tezkor maslahatlar</p>
          </div>
        </div>
        
        <button
          onClick={handleAnalyze}
          disabled={loading}
          className={`flex items-center gap-2 px-8 py-4 rounded-2xl font-bold text-lg transition-all shadow-lg
            ${loading 
              ? 'bg-slate-700 text-slate-400 cursor-not-allowed shadow-none border border-slate-600' 
              : 'bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 text-white shadow-purple-500/25 hover:shadow-purple-500/40 transform hover:-translate-y-0.5 border border-purple-500/50'
            }`}
        >
          {loading ? (
            <>
              <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
              <span>AI bozorni tahlil qilmoqda...</span>
            </>
          ) : (
            <>
              <Sparkles size={22} />
              <span>Tahlil qilish</span>
            </>
          )}
        </button>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/50 rounded-2xl p-5 mb-6 flex items-start gap-4">
          <AlertTriangle className="text-red-400 shrink-0 mt-0.5" size={24} />
          <div className="text-red-200">
            <p className="font-semibold text-lg">Tahlil jarayonida xatolik</p>
            <p className="mt-1 opacity-80">{error}</p>
          </div>
        </div>
      )}

      {data && !loading && (
        <div className="space-y-8 pb-10">
          
          {/* Monthly Summary Statistics */}
          {data.monthly_summary && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              
              <div className="bg-slate-800/40 border border-slate-700/50 p-5 rounded-2xl">
                <p className="text-slate-400 text-xs font-bold uppercase tracking-wider">30 kunlik Savdo</p>
                <p className="text-xl md:text-2xl font-black text-white mt-1.5">
                  {Math.round(data.monthly_summary.revenue_last_30_days || 0).toLocaleString('ru-RU')} <span className="text-xs font-semibold text-slate-400">UZS</span>
                </p>
              </div>

              <div className="bg-slate-800/40 border border-slate-700/50 p-5 rounded-2xl">
                <p className="text-slate-400 text-xs font-bold uppercase tracking-wider">Sof Foyda</p>
                <p className="text-xl md:text-2xl font-black text-emerald-400 mt-1.5">
                  {Math.round(data.monthly_summary.net_profit_last_30_days || 0).toLocaleString('ru-RU')} <span className="text-xs font-semibold text-slate-400">UZS</span>
                </p>
              </div>

              <div className="bg-slate-800/40 border border-slate-700/50 p-5 rounded-2xl">
                <p className="text-slate-400 text-xs font-bold uppercase tracking-wider">Sotuvlar soni</p>
                <p className="text-xl md:text-2xl font-black text-blue-400 mt-1.5">
                  {data.monthly_summary.sales_count_last_30_days || 0} <span className="text-xs font-semibold text-slate-400">ta chek</span>
                </p>
              </div>

              <div className="bg-slate-800/40 border border-slate-700/50 p-5 rounded-2xl">
                <p className="text-slate-400 text-xs font-bold uppercase tracking-wider">Eng faol savdo kuni</p>
                <p className="text-xl md:text-2xl font-black text-purple-400 mt-1.5">
                  {data.monthly_summary.best_day_of_week || 'Noma\'lum'}
                </p>
              </div>

            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            
            {/* Top Product Card */}
            <div className="bg-slate-800/50 border border-emerald-500/30 p-6 rounded-3xl shadow-[0_0_15px_rgba(16,185,129,0.05)] relative overflow-hidden group hover:shadow-[0_0_25px_rgba(16,185,129,0.15)] hover:border-emerald-500/50 transition-all">
              <div className="absolute top-0 right-0 p-4 opacity-[0.03] transform translate-x-4 -translate-y-4 group-hover:scale-110 transition-transform duration-500">
                <TrendingUp size={120} className="text-emerald-500" />
              </div>
              <div className="flex items-center gap-4 mb-4 relative z-10">
                <div className="w-14 h-14 bg-emerald-500/20 rounded-2xl flex items-center justify-center border border-emerald-500/30 shadow-inner">
                  <span className="text-3xl">🔥</span>
                </div>
                <h2 className="text-2xl font-bold text-emerald-400 tracking-wide">Top Mahsulot</h2>
              </div>
              <p className="text-slate-200 text-lg leading-relaxed relative z-10 font-medium">
                {data.top_product}
              </p>
            </div>

            {/* Price Up Card */}
            <div className="bg-slate-800/50 border border-blue-500/30 p-6 rounded-3xl shadow-[0_0_15px_rgba(59,130,246,0.05)] relative overflow-hidden group hover:shadow-[0_0_25px_rgba(59,130,246,0.15)] hover:border-blue-500/50 transition-all">
              <div className="absolute top-0 right-0 p-4 opacity-[0.03] transform translate-x-4 -translate-y-4 group-hover:scale-110 transition-transform duration-500">
                <TrendingUp size={120} className="text-blue-500" />
              </div>
              <div className="flex items-center gap-4 mb-4 relative z-10">
                <div className="w-14 h-14 bg-blue-500/20 rounded-2xl flex items-center justify-center border border-blue-500/30 shadow-inner">
                  <span className="text-3xl">💰</span>
                </div>
                <h2 className="text-2xl font-bold text-blue-400 tracking-wide">Narxni Ko'tarish</h2>
              </div>
              <p className="text-slate-200 text-lg leading-relaxed relative z-10 font-medium">
                {data.price_up}
              </p>
            </div>

            {/* Dead Stock Card */}
            <div className="bg-slate-800/50 border border-rose-500/30 p-6 rounded-3xl shadow-[0_0_15px_rgba(244,63,94,0.05)] relative overflow-hidden group hover:shadow-[0_0_25px_rgba(244,63,94,0.15)] hover:border-rose-500/50 transition-all">
              <div className="absolute top-0 right-0 p-4 opacity-[0.03] transform translate-x-4 -translate-y-4 group-hover:scale-110 transition-transform duration-500">
                <PackageX size={120} className="text-rose-500" />
              </div>
              <div className="flex items-center gap-4 mb-4 relative z-10">
                <div className="w-14 h-14 bg-rose-500/20 rounded-2xl flex items-center justify-center border border-rose-500/30 shadow-inner">
                  <span className="text-3xl">📉</span>
                </div>
                <h2 className="text-2xl font-bold text-rose-400 tracking-wide">O'lik Yuk</h2>
              </div>
              <p className="text-slate-200 text-lg leading-relaxed relative z-10 font-medium">
                {data.dead_stock}
              </p>
            </div>

            {/* Forecast Card */}
            <div className="bg-slate-800/50 border border-purple-500/30 p-6 rounded-3xl shadow-[0_0_15px_rgba(168,85,247,0.05)] relative overflow-hidden group hover:shadow-[0_0_25px_rgba(168,85,247,0.15)] hover:border-purple-500/50 transition-all">
              <div className="absolute top-0 right-0 p-4 opacity-[0.03] transform translate-x-4 -translate-y-4 group-hover:scale-110 transition-transform duration-500">
                <Calendar size={120} className="text-purple-500" />
              </div>
              <div className="flex items-center gap-4 mb-4 relative z-10">
                <div className="w-14 h-14 bg-purple-500/20 rounded-2xl flex items-center justify-center border border-purple-500/30 shadow-inner">
                  <span className="text-3xl">🔮</span>
                </div>
                <h2 className="text-2xl font-bold text-purple-400 tracking-wide">Kelgusi Oy Prognozi</h2>
              </div>
              <p className="text-slate-200 text-lg leading-relaxed relative z-10 font-medium">
                {data.forecast}
              </p>
            </div>

          </div>

          {/* Detailed insights list */}
          {data.detailed_insights && data.detailed_insights.length > 0 && (
            <div className="bg-slate-800/30 border border-slate-700/60 p-6 rounded-3xl space-y-4">
              <h3 className="text-xl font-bold text-slate-350 tracking-wide flex items-center gap-2">
                <Sparkles size={20} className="text-purple-400" />
                Batafsil Tahliliy Maslahatlar (Tavsiyalar)
              </h3>
              <ul className="space-y-3.5 pl-1.5">
                {data.detailed_insights.map((insight, idx) => (
                  <li key={idx} className="flex gap-3 text-slate-200 text-base leading-relaxed">
                    <span className="text-purple-400 font-bold">📌</span>
                    <span>{insight}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

        </div>
      )}

      {!data && !loading && !error && (
        <div className="flex-1 flex flex-col items-center justify-center text-slate-500">
          <div className="relative">
            <Sparkles size={80} className="opacity-10 mb-6" />
            <div className="absolute inset-0 bg-gradient-to-t from-slate-900 via-transparent to-transparent"></div>
          </div>
          <p className="text-xl font-medium text-slate-400">Bozor va sotuv tahlilini olish uchun "Tahlil qilish" tugmasini bosing</p>
          <p className="mt-3 text-slate-500">Sun'iy intellekt oxirgi 30 kunlik faoliyatingizni o'rganib chiqadi</p>
        </div>
      )}
    </div>
  );
}
