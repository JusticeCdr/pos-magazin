import { useState, useEffect } from 'react';
import { X, Printer, Lock, AlertCircle, RefreshCw, CheckCircle2 } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { formatCurrency, parseSQLiteDate } from '../utils';
import { generateZReportHTML } from '../ReceiptTemplate';

export default function ShiftModal({ onClose, onShiftClosed, onLogout }) {
  const { lang, storeName, currentUser } = useApp();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isClosing, setIsClosing] = useState(false);
  const [error, setError] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);

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
        stats, 
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
        closed_by: currentUser?.name || 'Admin' // Track closing cashier
      };
      const res = await window.api.closeShift(finalStats);
      
      if (res && res.success) {
        setSuccessMsg("Smena yopildi va baza nusxalandi!");
        // Wait a bit so the user can read the success message
        setTimeout(() => {
          if (onShiftClosed) onShiftClosed();
          onClose();
          if (onLogout) onLogout(); // Auto-logout
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
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col border border-gray-100 dark:border-gray-700 animate-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="bg-gray-50 dark:bg-gray-700/50 px-6 py-4 border-b border-gray-100 dark:border-gray-700 flex justify-between items-center">
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
        <div className="p-6">
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
          ) : (
            <div className="space-y-4">
              <div className="bg-orange-50 dark:bg-orange-900/10 text-orange-800 dark:text-orange-300 p-4 rounded-xl border border-orange-100 dark:border-orange-900/30">
                <p className="text-sm font-medium">Diqqat! Smenani yopganingizdan so'ng, ushbu savdolar joriy smenadan olinadi va yangi smena noldan boshlanadi.</p>
              </div>

              <div className="bg-gray-50 dark:bg-gray-900/50 rounded-xl p-5 space-y-3 border border-gray-100 dark:border-gray-700">
                {stats.opened_at && (
                  <div className="flex justify-between items-center text-xs text-gray-500 dark:text-gray-400 pb-2 border-b border-gray-200 dark:border-gray-700/30">
                    <span>Smena ochilgan:</span>
                    <span className="font-semibold text-gray-700 dark:text-gray-300">
                      {(() => {
                        const openedDate = parseSQLiteDate(stats.opened_at);
                        return `${openedDate.toLocaleDateString('ru-RU')} ${openedDate.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}`;
                      })()}
                    </span>
                  </div>
                )}
                <div className="flex justify-between items-center pb-3 border-b border-gray-200 dark:border-gray-700/50">
                  <span className="text-gray-600 dark:text-gray-400 font-semibold uppercase text-xs">Jami savdo</span>
                  <span className="text-xl font-black text-gray-900 dark:text-gray-100">{formatCurrency(stats.total_sales, lang)}</span>
                </div>
                
                <div className="flex justify-between items-center text-sm">
                  <span className="text-gray-500 dark:text-gray-400">Naqd pul</span>
                  <span className="font-bold text-gray-800 dark:text-gray-200">{formatCurrency(stats.cash_sales, lang)}</span>
                </div>
                
                <div className="flex justify-between items-center text-sm">
                  <span className="text-gray-500 dark:text-gray-400">Plastik karta</span>
                  <span className="font-bold text-gray-800 dark:text-gray-200">{formatCurrency(stats.card_sales, lang)}</span>
                </div>
                
                <div className="flex justify-between items-center text-sm">
                  <span className="text-gray-500 dark:text-gray-400">Qarzga</span>
                  <span className="font-bold text-gray-800 dark:text-gray-200">{formatCurrency(stats.debt_sales, lang)}</span>
                </div>
                
                {stats.total_discounts > 0 && (
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-gray-500 dark:text-gray-400">Jami chegirmalar</span>
                    <span className="font-bold text-amber-600 dark:text-amber-400">-{formatCurrency(stats.total_discounts, lang)}</span>
                  </div>
                )}

                {stats.total_refunds > 0 && (
                  <div className="flex justify-between items-center text-sm text-red-500">
                    <span>Qaytarilgan cheklar ({stats.refunds_count} ta)</span>
                    <span className="font-bold">-{formatCurrency(stats.total_refunds, lang)}</span>
                  </div>
                )}

                {stats.total_expenses > 0 && (
                  <div className="flex justify-between items-center text-sm pt-2 mt-2 border-t border-gray-200 dark:border-gray-700/50 text-red-500">
                    <span className="font-medium">Chiqim (Rasxod)</span>
                    <span className="font-bold">-{formatCurrency(stats.total_expenses, lang)}</span>
                  </div>
                )}
                
                <div className="flex justify-between items-center text-sm pt-2 mt-2 border-t border-gray-200 dark:border-gray-700/50 font-bold text-emerald-600 dark:text-emerald-400">
                  <span>Kassadagi naqd pul</span>
                  <span>{formatCurrency(stats.expected_cash, lang)}</span>
                </div>

                <div className="flex justify-between items-center text-sm pt-2 mt-2 border-t border-gray-200 dark:border-gray-700/30 text-gray-500 dark:text-gray-400">
                  <span>Cheklar soni</span>
                  <span className="font-bold text-gray-800 dark:text-gray-200">{stats.receipts_count} ta</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-gray-50 dark:bg-gray-700/30 border-t border-gray-100 dark:border-gray-700 flex gap-3">
          <button
            onClick={onClose}
            disabled={isClosing}
            className="flex-1 px-4 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-xl text-gray-700 dark:text-gray-300 font-semibold hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
          >
            Bekor qilish
          </button>
          <button
            onClick={handleCloseShift}
            disabled={loading || isClosing || !!error || !!successMsg || stats?.receipts_count === 0}
            className="flex-[2] flex items-center justify-center gap-2 px-4 py-2 bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white rounded-xl font-bold shadow-md shadow-orange-500/20 transition-all active:scale-95"
          >
            {isClosing ? (
              <RefreshCw className="animate-spin" size={18} />
            ) : (
              <Printer size={18} />
            )}
            Chop etish va Yopish
          </button>
        </div>
      </div>
    </div>
  );
}
