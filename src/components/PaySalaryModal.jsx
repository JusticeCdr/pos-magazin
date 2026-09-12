import { useState, useEffect } from 'react';
import { X, DollarSign, Calendar, User, CheckCircle2, AlertCircle } from 'lucide-react';
import { formatCurrency, formatPriceInput } from '../utils';

export default function PaySalaryModal({ isOpen, onClose, employee, currentUser, onSuccess, lang = 'uz' }) {
  const [paidAmount, setPaidAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (employee) {
      const defaultCalculated = Math.round(employee.earned_salary || employee.total_earned || employee.salary || 0);
      setPaidAmount(defaultCalculated > 0 ? String(defaultCalculated) : '');
      setPaymentMethod('cash');
      setNote(`Oylik to'lovi (${employee.name})`);
      setError(null);
    }
  }, [employee]);

  if (!isOpen || !employee) return null;

  const baseSalary = parseFloat(employee.salary) || 0;
  const calculatedSalary = parseFloat(employee.earned_salary || employee.total_earned || employee.salary) || 0;
  const presentDays = employee.present_days !== undefined ? employee.present_days : null;

  const handleAmountChange = (e) => {
    const raw = e.target.value.replace(/\D/g, '');
    setPaidAmount(raw);
    setError(null);
  };

  const handleSetBaseSalary = () => {
    setPaidAmount(String(Math.round(baseSalary)));
  };

  const handleSetCalculatedSalary = () => {
    setPaidAmount(String(Math.round(calculatedSalary)));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const amountNum = parseFloat(paidAmount);
    if (isNaN(amountNum) || amountNum <= 0) {
      setError("To'lanadigan summani to'g'ri kiriting!");
      return;
    }

    if (!window.api || !window.api.payStaffSalary) {
      setError("API mavjud emas!");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const res = await window.api.payStaffSalary({
        employeeId: employee.id,
        employeeName: employee.name,
        role: employee.role || 'Xodim',
        baseSalary,
        calculatedSalary,
        paidAmount: amountNum,
        paymentMethod,
        note: note.trim(),
        userName: currentUser?.name || 'Admin'
      });

      if (res && res.success) {
        if (onSuccess) onSuccess(`"${employee.name}"ga ${formatCurrency(amountNum, lang)} oylik to'landi va Xarajatlarga yozildi!`);
        onClose();
      } else {
        setError(res?.error || "To'lovni amalga oshirishda xatolik yuz berdi");
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const displayFormattedAmount = paidAmount
    ? Number(paidAmount).toLocaleString('ru-RU')
    : '';

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in">
      <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-2xl w-full max-w-lg border border-gray-200 dark:border-gray-700 overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-5 border-b border-gray-150 dark:border-gray-700 flex items-center justify-between bg-gradient-to-r from-emerald-500/10 to-teal-500/10">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-300 flex items-center justify-center font-bold shadow-inner">
              <DollarSign size={24} />
            </div>
            <div>
              <h3 className="text-base font-black text-gray-900 dark:text-white">
                Oylik Maosh To'lash
              </h3>
              <p className="text-xs text-emerald-700 dark:text-emerald-400 font-bold">
                {employee.name} ({employee.role || 'Xodim'})
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-700 transition cursor-pointer"
          >
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="p-3 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 text-red-700 dark:text-red-300 rounded-xl text-xs font-bold flex items-center gap-2">
              <AlertCircle size={16} className="shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Salary Breakdown Summary Card */}
          <div className="p-4 rounded-2xl bg-gray-50 dark:bg-gray-900/60 border border-gray-200 dark:border-gray-700 space-y-2.5">
            <div className="flex justify-between items-center text-xs">
              <span className="text-gray-600 dark:text-gray-400 font-medium">Asosiy belgilangan oylik:</span>
              <span className="font-extrabold text-gray-900 dark:text-white">
                {formatCurrency(baseSalary, lang)}
              </span>
            </div>

            {presentDays !== null && (
              <div className="flex justify-between items-center text-xs">
                <span className="text-gray-600 dark:text-gray-400 font-medium">Ishlagan kunlari (Davomat):</span>
                <span className="font-bold text-blue-600 dark:text-blue-400">
                  {presentDays} kun {presentDays < 30 ? `(Kelmagan: ${Math.max(0, 30 - presentDays)} kun)` : ''}
                </span>
              </div>
            )}

            <div className="flex justify-between items-center text-xs pt-2 border-t border-gray-200 dark:border-gray-700">
              <span className="text-gray-700 dark:text-gray-300 font-bold">Dastur hisoblagan summa:</span>
              <span className="text-sm font-black text-purple-600 dark:text-purple-300 font-mono">
                {formatCurrency(calculatedSalary, lang)}
              </span>
            </div>
          </div>

          {/* Editable Payment Amount */}
          <div>
            <div className="flex justify-between items-center mb-1.5">
              <label className="block text-xs font-black text-gray-700 dark:text-gray-200 uppercase tracking-wide">
                To'lanadigan Oylik Summasi (so'm) <span className="text-red-500">*</span>
              </label>
              <div className="flex gap-1.5">
                {baseSalary > 0 && (
                  <button
                    type="button"
                    onClick={handleSetBaseSalary}
                    className="text-[11px] px-2 py-0.5 rounded-lg bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 font-bold transition cursor-pointer"
                  >
                    To'liq ({Number(baseSalary).toLocaleString('ru-RU')})
                  </button>
                )}
                {calculatedSalary !== baseSalary && calculatedSalary > 0 && (
                  <button
                    type="button"
                    onClick={handleSetCalculatedSalary}
                    className="text-[11px] px-2 py-0.5 rounded-lg bg-purple-100 hover:bg-purple-200 dark:bg-purple-950/60 dark:hover:bg-purple-900/60 text-purple-700 dark:text-purple-300 font-bold transition cursor-pointer"
                  >
                    Hisoblangan ({Number(calculatedSalary).toLocaleString('ru-RU')})
                  </button>
                )}
              </div>
            </div>

            <div className="relative">
              <input
                type="text"
                required
                autoFocus
                value={displayFormattedAmount}
                onChange={handleAmountChange}
                placeholder="0"
                className="w-full border-2 border-emerald-500 dark:border-emerald-600 rounded-2xl px-4 py-3 text-xl font-black text-gray-900 dark:text-white bg-white dark:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 font-mono text-center shadow-inner tracking-wider"
              />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-extrabold text-gray-400 uppercase pointer-events-none">
                so'm
              </span>
            </div>
            <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1.5">
              💡 Masalan, kelmagan kuni hisobiga 3 mln chiqib turgan bo'lsa ham, summani xohlagancha o'zgartirib (4 mln qilib) berishingiz mumkin.
            </p>
          </div>

          {/* Payment Method */}
          <div>
            <label className="block text-xs font-extrabold text-gray-700 dark:text-gray-300 uppercase mb-1.5">
              To'lov Shakli
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setPaymentMethod('cash')}
                className={`py-2.5 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                  paymentMethod === 'cash'
                    ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-500 text-emerald-700 dark:text-emerald-300 shadow-sm ring-1 ring-emerald-500'
                    : 'bg-gray-50 dark:bg-gray-700/50 border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-100'
                }`}
              >
                💵 Naqd Pul (Kassa)
              </button>
              <button
                type="button"
                onClick={() => setPaymentMethod('card')}
                className={`py-2.5 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                  paymentMethod === 'card'
                    ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-500 text-emerald-700 dark:text-emerald-300 shadow-sm ring-1 ring-emerald-500'
                    : 'bg-gray-50 dark:bg-gray-700/50 border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-100'
                }`}
              >
                💳 Karta / Perechisleniye
              </button>
            </div>
          </div>

          {/* Izoh */}
          <div>
            <label className="block text-xs font-extrabold text-gray-700 dark:text-gray-300 uppercase mb-1">
              Izoh (Ixtiyoriy)
            </label>
            <input
              type="text"
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder="Masalan: Avgust oyi to'liq oyligi berildi"
              className="w-full bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600 rounded-xl px-3.5 py-2.5 text-xs font-medium text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          {/* Actions */}
          <div className="pt-2 flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-3 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 rounded-xl font-bold text-xs transition cursor-pointer"
            >
              Bekor qilish
            </button>
            <button
              type="submit"
              disabled={loading || !paidAmount || parseFloat(paidAmount) <= 0}
              className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-xl font-black text-xs shadow-lg shadow-emerald-600/30 transition active:scale-95 flex items-center justify-center gap-2 cursor-pointer"
            >
              {loading ? (
                <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <>
                  <CheckCircle2 size={16} />
                  <span>To'lovni Tasdiqlash</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
