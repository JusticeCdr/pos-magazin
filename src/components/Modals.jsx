import { AlertTriangle, AlertCircle, CheckCircle2 } from 'lucide-react';

/**
 * A highly reusable modal component for confirmations.
 * Replaces native window.confirm()
 */
export function ConfirmModal({ isOpen, title, message, onConfirm, onCancel, confirmText = 'Tasdiqlash', cancelText = 'Bekor qilish' }) {
  if (!isOpen) return null;

  return (
    <div className="absolute inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-sm overflow-hidden flex flex-col border border-gray-200 dark:border-gray-700 transition-colors animate-in fade-in zoom-in duration-200">
        <div className="p-6 pb-0 flex flex-col items-center text-center">
          <div className="w-16 h-16 bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded-full flex items-center justify-center mb-4">
            <AlertTriangle size={32} />
          </div>
          <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">{title}</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">{message}</p>
        </div>
        <div className="px-6 pb-6 pt-2 flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 px-4 py-2.5 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 rounded-xl font-bold transition-colors"
          >
            {cancelText}
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 px-4 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-xl font-bold transition-colors shadow-sm shadow-red-600/20"
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * A highly reusable modal component for alerts.
 * Replaces native window.alert()
 */
export function AlertModal({ isOpen, title, message, onConfirm, type = 'error', confirmText = 'Tasdiqlash' }) {
  if (!isOpen) return null;

  const isError = type === 'error';
  const displayTitle = (title === 'Xatolik' && !isError)
    ? 'Muvaffaqiyatli'
    : (title || (isError ? 'Xatolik' : 'Muvaffaqiyatli'));

  return (
    <div className="absolute inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-sm overflow-hidden flex flex-col border border-gray-200 dark:border-gray-700 transition-colors animate-in fade-in zoom-in duration-200">
        <div className="p-6 pb-0 flex flex-col items-center text-center">
          <div className={`w-16 h-16 rounded-full flex items-center justify-center mb-4 ${
            isError 
              ? 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400' 
              : 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400'
          }`}>
            {isError ? <AlertCircle size={32} /> : <CheckCircle2 size={32} />}
          </div>
          <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">{displayTitle}</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">{message}</p>
        </div>
        <div className="px-6 pb-6 pt-2 flex gap-3">
          <button
            onClick={onConfirm}
            className={`flex-1 px-4 py-2.5 text-white rounded-xl font-bold transition-colors shadow-sm ${
              isError 
                ? 'bg-red-600 hover:bg-red-700 shadow-red-600/20' 
                : 'bg-green-600 hover:bg-green-700 shadow-green-600/20'
            }`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
