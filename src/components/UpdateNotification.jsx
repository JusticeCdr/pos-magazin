import { useState, useEffect, useCallback } from 'react';
import { Sparkles, Download, RefreshCw, X, CheckCircle2, AlertCircle, ArrowUpCircle } from 'lucide-react';

export default function UpdateNotification() {
  const [show, setShow] = useState(false);
  const [updateState, setUpdateState] = useState('available'); // 'available' | 'downloading' | 'downloaded' | 'error'
  const [updateInfo, setUpdateInfo] = useState(null);
  const [downloadPercent, setDownloadPercent] = useState(0);
  const [errorMessage, setErrorMessage] = useState('');

  // ── Listen to update status events from main process ──────────────────────
  useEffect(() => {
    let unsubscribe = null;
    if (window.api && window.api.onUpdateStatus) {
      unsubscribe = window.api.onUpdateStatus((status, data) => {
        if (status === 'update-available') {
          const version = data?.version || 'yangi';
          const isDismissed = sessionStorage.getItem('dismissed_update_' + version) === 'true';
          if (!isDismissed) {
            setUpdateInfo(data);
            setUpdateState('available');
            setErrorMessage('');
            setShow(true);
          }
        } else if (status === 'download-progress') {
          setUpdateState('downloading');
          setDownloadPercent(typeof data === 'number' ? data : (data?.percent || 0));
          setShow(true);
        } else if (status === 'update-downloaded') {
          setUpdateState('downloaded');
          setShow(true);
        } else if (status === 'update-error') {
          // Only show error in popup if we were in the middle of downloading
          setUpdateState(prev => (prev === 'downloading' ? 'error' : prev));
          setErrorMessage(typeof data === 'string' ? data : (data?.message || 'Yuklab olishda xatolik'));
        }
      });
    }

    // ── Automatic check on startup (after 4 seconds) ─────────────────────────
    const startupTimer = setTimeout(async () => {
      if (window.api && window.api.checkUpdate) {
        try {
          const res = await window.api.checkUpdate();
          if (res && res.success && res.updateAvailable && res.updateInfo) {
            const version = res.updateInfo.version || 'yangi';
            const isDismissed = sessionStorage.getItem('dismissed_update_' + version) === 'true';
            if (!isDismissed) {
              setUpdateInfo(res.updateInfo);
              setUpdateState('available');
              setErrorMessage('');
              setShow(true);
            }
          }
        } catch (err) {
          // Silent catch on startup: do not disturb the cashier if offline
          console.log('Background startup update check:', err?.message || err);
        }
      }
    }, 4000);

    // ── Developer / Test simulation trigger ─────────────────────────────────
    if (typeof window !== 'undefined') {
      window.__simulateUpdate = (mockVersion = '1.5.4') => {
        setUpdateInfo({ version: mockVersion, releaseDate: new Date().toLocaleDateString() });
        setUpdateState('available');
        setDownloadPercent(0);
        setErrorMessage('');
        setShow(true);
      };
    }

    return () => {
      clearTimeout(startupTimer);
      if (typeof unsubscribe === 'function') {
        unsubscribe();
      }
    };
  }, []);

  const handleStartDownload = async () => {
    if (!window.api || !window.api.startDownload) {
      // In web/dev mock simulation:
      let p = 0;
      setUpdateState('downloading');
      setDownloadPercent(0);
      const mockInterval = setInterval(() => {
        p += 20;
        setDownloadPercent(p);
        if (p >= 100) {
          clearInterval(mockInterval);
          setUpdateState('downloaded');
        }
      }, 500);
      return;
    }

    setUpdateState('downloading');
    setDownloadPercent(0);
    setErrorMessage('');
    try {
      const res = await window.api.startDownload();
      if (!res.success) {
        setUpdateState('error');
        setErrorMessage(res.error || 'Yuklab olishni boshlashda xatolik yuz berdi');
      }
    } catch (err) {
      setUpdateState('error');
      setErrorMessage(err.message || 'Xatolik yuz berdi');
    }
  };

  const handleInstall = async () => {
    if (!window.api || !window.api.installUpdate) {
      alert("Test rejimida: Dastur qayta ishga tushib yangilanadi.");
      setShow(false);
      return;
    }
    try {
      await window.api.installUpdate();
    } catch (err) {
      setErrorMessage("O'rnatishda xatolik: " + err.message);
    }
  };

  const handleDismiss = () => {
    if (updateInfo?.version) {
      sessionStorage.setItem('dismissed_update_' + updateInfo.version, 'true');
    }
    setShow(false);
  };

  if (!show) return null;

  return (
    <div className="fixed bottom-6 right-6 z-[9999] max-w-[380px] w-[calc(100vw-3rem)] animate-in fade-in slide-in-from-bottom-5 duration-300">
      <div className="bg-white/95 dark:bg-gray-900/95 backdrop-blur-xl border border-blue-200 dark:border-blue-800/80 rounded-2xl shadow-2xl p-5 text-gray-800 dark:text-gray-100 ring-4 ring-blue-500/10">
        
        {/* Header */}
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center text-white shadow-md shadow-blue-500/30 shrink-0 animate-pulse">
              <Sparkles size={20} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h4 className="font-extrabold text-sm text-gray-900 dark:text-white leading-tight">
                  Yangilanish mavjud!
                </h4>
                {updateInfo?.version && (
                  <span className="px-1.5 py-0.5 rounded-md bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 font-bold text-[10px]">
                    v{updateInfo.version}
                  </span>
                )}
              </div>
              <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
                xxMpos tizimi
              </p>
            </div>
          </div>

          <button
            onClick={handleDismiss}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition cursor-pointer"
            title="Yopish"
          >
            <X size={16} />
          </button>
        </div>

        {/* Content based on status */}
        {updateState === 'available' && (
          <div className="space-y-3">
            <p className="text-xs text-gray-600 dark:text-gray-300 leading-relaxed">
              Dasturning yangi versiyasi chiqdi. Yangi imkoniyatlar va yaxshilanishlarni olish uchun ustanovka qilib oling!
            </p>

            <div className="flex items-center gap-2 pt-1">
              <button
                onClick={handleStartDownload}
                className="flex-1 py-2.5 px-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-bold text-xs rounded-xl shadow-md shadow-blue-500/20 active:scale-95 transition flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Download size={14} />
                <span>O'rnatish (Yuklab olish)</span>
              </button>
              <button
                onClick={handleDismiss}
                className="py-2.5 px-3 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300 font-bold text-xs rounded-xl transition cursor-pointer"
              >
                Keyinroq
              </button>
            </div>
          </div>
        )}

        {updateState === 'downloading' && (
          <div className="space-y-3">
            <div className="flex justify-between items-center text-xs font-bold text-blue-700 dark:text-blue-400">
              <span className="flex items-center gap-1.5">
                <RefreshCw size={13} className="animate-spin" />
                Yuklanmoqda...
              </span>
              <span>{downloadPercent}%</span>
            </div>

            <div className="w-full bg-gray-100 dark:bg-gray-800 rounded-full h-2.5 overflow-hidden border border-gray-200 dark:border-gray-700">
              <div
                className="bg-gradient-to-r from-blue-600 to-indigo-600 h-2.5 rounded-full transition-all duration-300 shadow-sm"
                style={{ width: `${Math.min(100, Math.max(0, downloadPercent))}%` }}
              />
            </div>

            <p className="text-[11px] text-gray-500 dark:text-gray-400 text-center italic">
              Dasturda ishlashda davom etishingiz mumkin, yuklab olish orqa fonda ketmoqda.
            </p>
          </div>
        )}

        {updateState === 'downloaded' && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 size={16} className="shrink-0" />
              <span className="text-xs font-black">
                Yangilanish yuklab olindi!
              </span>
            </div>

            <p className="text-xs text-gray-600 dark:text-gray-300 leading-relaxed">
              O'rnatish uchun dasturni qayta ishga tushiring. Barcha ma'lumotlaringiz to'liq saqlanadi.
            </p>

            <button
              onClick={handleInstall}
              className="w-full py-2.5 px-3 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-bold text-xs rounded-xl shadow-md shadow-emerald-500/20 active:scale-95 transition flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <ArrowUpCircle size={15} />
              <span>Qayta ishga tushirish va o'rnatish</span>
            </button>
          </div>
        )}

        {updateState === 'error' && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-red-500 dark:text-red-400">
              <AlertCircle size={16} className="shrink-0" />
              <span className="text-xs font-bold">Yuklashda xatolik yuz berdi</span>
            </div>

            {errorMessage && (
              <p className="text-[11px] text-gray-500 dark:text-gray-400 line-clamp-2">
                {errorMessage}
              </p>
            )}

            <div className="flex items-center gap-2 pt-1">
              <button
                onClick={handleStartDownload}
                className="flex-1 py-2 px-3 bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/40 border border-red-200 dark:border-red-800 font-bold text-xs rounded-xl transition cursor-pointer"
              >
                Qayta urinish
              </button>
              <button
                onClick={handleDismiss}
                className="py-2 px-3 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300 font-bold text-xs rounded-xl transition cursor-pointer"
              >
                Yopish
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
