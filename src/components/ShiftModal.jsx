import { useState, useEffect } from 'react';
import { X, Printer, Lock, AlertCircle, RefreshCw, CheckCircle2, ChevronDown, ChevronUp, Users, Tag, Wallet } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { formatCurrency, parseSQLiteDate } from '../utils';
import { generateZReportHTML } from '../ReceiptTemplate';

export default function ShiftModal({ onClose, onShiftClosed, onLogout }) {
  const { storeName, currentUser, lang, businessType } = useApp();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isClosing, setIsClosing] = useState(false);
  const [error, setError] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);
  const [showWaiters, setShowWaiters] = useState(false);
  const [showCategories, setShowCategories] = useState(false);

  const fetchStats = async () => {
    if (!window.api) return;
    setLoading(true);
    try {
      const res = await window.api.getCurrentShiftStats();
      if (res && res.success) {
        setStats(res.data);
      } else {
        setError(res?.error || 'Xatolik yuz berdi');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
  }, []);

  const handleCloseShift = async () => {
    if (!window.api || !stats) return;
    setIsClosing(true);
    setError(null);
    try {
      // 1. Try to Print Z-Report (Non-blocking)
      const html = generateZReportHTML({ 
        stats: { ...stats, businessType }, 
        storeName: storeName, 
        cashierName: currentUser?.name || 'Admin'
      });
      
      const printerName = localStorage.getItem('receiptPrinterName');

      if (printerName && printerName !== 'none') {
        try {
          const printRes = await window.api.printReceipt({ receiptHTML: html, printerName });
          if (!printRes || !printRes.success) {
            console.warn('Z-Report printing failed: printReceipt returned success=false');
          }
        } catch (printErr) {
          console.error('Z-Report printing failed:', printErr);
        }
      }

      // 2. Save shift to DB (includes async backup)
      const finalStats = {
        ...stats,
        closed_by: currentUser?.name || 'Admin'
      };
      const res = await window.api.closeShift(finalStats);
      
      if (res && res.success) {
        setSuccessMsg("Smena muvaffaqiyatli yopildi va arxivlandi!");
        setTimeout(() => {
          if (onShiftClosed) onShiftClosed();
          onClose();
          if (onLogout) onLogout();
        }, 1500);
      } else {
        setError('Smenani yopishda xatolik: ' + res?.error);
        setIsClosing(false);
      }
    } catch (err) {
      setError('Xatolik: ' + err.message);
      setIsClosing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col border border-gray-100 dark:border-gray-700 animate-in zoom-in-95 duration-200 max-h-[92vh]">
        
        {/* Header */}
        <div className="bg-gray-50 dark:bg-gray-700/50 px-6 py-4 border-b border-gray-100 dark:border-gray-700 flex justify-between items-center shrink-0">
          <div className="flex items-center gap-2 text-gray-800 dark:text-gray-100">
            <Lock size={20} className="text-orange-500" />
            <h2 className="text-lg font-bold">Smenani yopish (Z-Hisobot {stats?.shift_number ? `№${stats.shift_number}` : ''})</h2>
          </div>
          <button 
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors p-1 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto space-y-4">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-10">
              <RefreshCw className="animate-spin text-blue-500 mb-2" size={32} />
              <p className="text-gray-500 dark:text-gray-400 font-medium">Ma'lumotlar yuklanmoqda...</p>
            </div>
          ) : error ? (
            <div className="bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 p-4 rounded-xl flex items-start gap-3">
              <AlertCircle size={24} className="shrink-0" />
              <p>{error}</p>
            </div>
          ) : successMsg ? (
            <div className="bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 p-4 rounded-xl flex flex-col items-center gap-3 py-8">
              <CheckCircle2 size={48} className="text-emerald-500" />
              <p className="text-lg font-bold">{successMsg}</p>
            </div>
          ) : stats ? (
            <div className="space-y-4">
              <div className="bg-orange-50 dark:bg-orange-900/10 text-orange-800 dark:text-orange-300 p-3.5 rounded-xl border border-orange-100 dark:border-orange-900/30 text-xs">
                <p className="font-medium">Diqqat! Smenani yopganingizdan so'ng hisobot chop etiladi, ushbu savdolar yopilgan smenalar arxiviga o'tkaziladi va yangi smena noldan ochiladi.</p>
              </div>

              {/* Time and Cashier Info */}
              <div className="bg-gray-50 dark:bg-gray-900/40 rounded-xl p-3 border border-gray-100 dark:border-gray-700/50 grid grid-cols-2 gap-2 text-xs">
                <div>
                  <span className="text-gray-400 block">Smena ochilgan:</span>
                  <span className="font-semibold text-gray-700 dark:text-gray-300">
                    {stats.opened_at ? (() => {
                      const d = parseSQLiteDate(stats.opened_at);
                      return `${d.toLocaleDateString('ru-RU')} ${d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}`;
                    })() : "Noma'lum"}
                  </span>
                </div>
                <div>
                  <span className="text-gray-400 block">Kassir / Mas'ul:</span>
                  <span className="font-semibold text-gray-700 dark:text-gray-300">
                    {stats.opened_by || currentUser?.name || 'Kassir'}
                  </span>
                </div>
              </div>

              {/* Key Financial Totals */}
              <div className="bg-gray-50 dark:bg-gray-900/50 rounded-xl p-4 space-y-3 border border-gray-100 dark:border-gray-700">
                <div className="flex justify-between items-center pb-3 border-b border-gray-200 dark:border-gray-700/50">
                  <span className="text-gray-600 dark:text-gray-400 font-bold uppercase text-xs">Jami tushum (Savdo)</span>
                  <span className="text-2xl font-black text-gray-900 dark:text-gray-100">{formatCurrency(stats.total_sales, lang)}</span>
                </div>

                <div className="grid grid-cols-2 gap-2 pb-2 text-xs border-b border-gray-200 dark:border-gray-700/30">
                  <div>
                    <span className="text-gray-400">Cheklar soni:</span>
                    <span className="ml-1 font-bold text-gray-800 dark:text-gray-200">{stats.receipts_count} ta</span>
                  </div>
                  <div className="text-right">
                    <span className="text-gray-400">O'rtacha chek:</span>
                    <span className="ml-1 font-bold text-gray-800 dark:text-gray-200">{formatCurrency(stats.average_check || 0, lang)}</span>
                  </div>
                </div>
                
                {/* Payment Breakdown */}
                <div className="space-y-1.5 text-sm pt-1">
                  <div className="flex justify-between items-center">
                    <span className="text-gray-500 dark:text-gray-400">Naqd pul</span>
                    <span className="font-semibold text-gray-800 dark:text-gray-200">{formatCurrency(stats.cash_sales, lang)}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-500 dark:text-gray-400">Plastik karta</span>
                    <span className="font-semibold text-gray-800 dark:text-gray-200">{formatCurrency(stats.card_sales, lang)}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-500 dark:text-gray-400">Nasiya (Qarzga)</span>
                    <span className="font-semibold text-orange-600 dark:text-orange-400">{formatCurrency(stats.debt_sales, lang)}</span>
                  </div>
                  {stats.debt_payments > 0 && (
                    <div className="flex justify-between items-center text-teal-600 dark:text-teal-400 font-medium">
                      <span>Qarz to'lovi (yig'ilgan)</span>
                      <span>+{formatCurrency(stats.debt_payments, lang)}</span>
                    </div>
                  )}
                  {businessType !== 'retail' && stats.service_fee_total > 0 && (
                    <div className="flex justify-between items-center text-blue-600 dark:text-blue-400">
                      <span>Xizmat haqi (Usluga)</span>
                      <span>+{formatCurrency(stats.service_fee_total, lang)}</span>
                    </div>
                  )}
                  {stats.total_discounts > 0 && (
                    <div className="flex justify-between items-center text-amber-600 dark:text-amber-400">
                      <span>Chegirmalar</span>
                      <span>-{formatCurrency(stats.total_discounts, lang)}</span>
                    </div>
                  )}
                  {stats.total_refunds > 0 && (
                    <div className="flex justify-between items-center text-red-500">
                      <span>Qaytarishlar ({stats.refunds_count} ta)</span>
                      <span>-{formatCurrency(stats.total_refunds, lang)}</span>
                    </div>
                  )}
                  {stats.total_expenses > 0 && (
                    <div className="flex justify-between items-center text-red-500 font-medium">
                      <span>Chiqim (Rasxod)</span>
                      <span>-{formatCurrency(stats.total_expenses, lang)}</span>
                    </div>
                  )}
                  {stats.write_offs_total > 0 && (
                    <div className="flex justify-between items-center text-rose-500 text-xs">
                      <span>Hisobdan chiqarish (Spisaniya)</span>
                      <span>-{formatCurrency(stats.write_offs_total, lang)}</span>
                    </div>
                  )}
                </div>

                {/* Cash in Drawer Box */}
                <div className="mt-3 p-3.5 bg-emerald-50 dark:bg-emerald-950/30 rounded-xl border border-emerald-200 dark:border-emerald-800/40">
                  <div className="flex justify-between items-center">
                    <div className="flex items-center gap-2 text-emerald-800 dark:text-emerald-300 font-bold text-sm">
                      <Wallet size={18} className="text-emerald-600" />
                      <span>Kassadagi naqd pul</span>
                    </div>
                    <span className="text-xl font-black text-emerald-700 dark:text-emerald-300">
                      {formatCurrency(stats.expected_cash, lang)}
                    </span>
                  </div>
                  <p className="text-[11px] text-emerald-600/80 dark:text-emerald-400/70 mt-1">
                    (Naqd savdo: +{formatCurrency(stats.cash_sales, lang)}{stats.debt_payments > 0 ? ` | Qarzdan: +${formatCurrency(stats.debt_payments, lang)}` : ''}{stats.total_expenses > 0 ? ` | Chiqim: -${formatCurrency(stats.total_expenses, lang)}` : ''})
                  </p>
                </div>
              </div>

              {/* Waiters Breakdown Accordion */}
              {businessType !== 'retail' && stats.waiter_stats && stats.waiter_stats.length > 0 && (
                <div className="border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setShowWaiters(!showWaiters)}
                    className="w-full px-4 py-2.5 bg-gray-50 dark:bg-gray-700/40 flex justify-between items-center text-xs font-bold text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700/60 transition-colors"
                  >
                    <span className="flex items-center gap-1.5">
                      <Users size={14} className="text-blue-500" />
                      Ofitsiantlar natijasi ({stats.waiter_stats.length})
                    </span>
                    {showWaiters ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  </button>
                  {showWaiters && (
                    <div className="p-3 space-y-2 text-xs bg-white dark:bg-gray-800 divide-y divide-gray-100 dark:divide-gray-700">
                      {stats.waiter_stats.map((w, idx) => (
                        <div key={idx} className="pt-2 first:pt-0 flex justify-between items-center">
                          <div>
                            <span className="font-semibold text-gray-800 dark:text-gray-200">{w.waiter_name}</span>
                            <span className="text-gray-400 ml-1.5">({w.receipts_count} chek)</span>
                          </div>
                          <div className="text-right">
                            <div className="font-bold text-gray-900 dark:text-white">{formatCurrency(w.total_sales, lang)}</div>
                            {w.total_commission > 0 && (
                              <div className="text-[11px] text-blue-600 dark:text-blue-400">Ulush: {formatCurrency(w.total_commission, lang)}</div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Categories Breakdown Accordion */}
              {businessType !== 'retail' && stats.category_stats && stats.category_stats.length > 0 && (
                <div className="border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setShowCategories(!showCategories)}
                    className="w-full px-4 py-2.5 bg-gray-50 dark:bg-gray-700/40 flex justify-between items-center text-xs font-bold text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700/60 transition-colors"
                  >
                    <span className="flex items-center gap-1.5">
                      <Tag size={14} className="text-purple-500" />
                      Kategoriyalar bo'yicha savdo ({stats.category_stats.length})
                    </span>
                    {showCategories ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  </button>
                  {showCategories && (
                    <div className="p-3 space-y-1.5 text-xs bg-white dark:bg-gray-800">
                      {stats.category_stats.map((c, idx) => (
                        <div key={idx} className="flex justify-between items-center">
                          <span className="text-gray-700 dark:text-gray-300">{c.category_name} ({c.total_qty} dona)</span>
                          <span className="font-semibold text-gray-900 dark:text-white">{formatCurrency(c.total_amount, lang)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : null}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-gray-50 dark:bg-gray-700/30 border-t border-gray-100 dark:border-gray-700 flex gap-3 shrink-0">
          <button
            onClick={onClose}
            disabled={isClosing}
            className="flex-1 px-4 py-2.5 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-xl text-gray-700 dark:text-gray-300 font-semibold hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors cursor-pointer"
          >
            Bekor qilish
          </button>
          <button
            onClick={handleCloseShift}
            disabled={loading || isClosing || !!error || !!successMsg}
            className="flex-[2] flex items-center justify-center gap-2 px-4 py-2.5 bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white rounded-xl font-bold shadow-md shadow-orange-500/20 transition-all active:scale-95 cursor-pointer"
          >
            {isClosing ? (
              <RefreshCw className="animate-spin" size={18} />
            ) : (
              <Printer size={18} />
            )}
            Chop etish va Smenani yopish
          </button>
        </div>
      </div>
    </div>
  );
}
