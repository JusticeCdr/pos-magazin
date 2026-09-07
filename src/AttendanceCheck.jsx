import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  Camera, 
  CheckCircle2, 
  Clock, 
  RefreshCw, 
  AlertCircle, 
  Sparkles, 
  UserCheck, 
  Building2, 
  ChevronRight,
  ArrowLeft,
  RotateCcw,
  Send,
  ShieldCheck
} from 'lucide-react';

export default function AttendanceCheck({ onBack }) {
  const [employees, setEmployees] = useState([]);
  const [loadingEmployees, setLoadingEmployees] = useState(true);
  const [cafeName, setCafeName] = useState('');
  const [selectedEmployee, setSelectedEmployee] = useState(null);
  const [status, setStatus] = useState('keldi'); // 'keldi' | 'ketdi'
  const [currentTime, setCurrentTime] = useState(new Date());

  // Camera state
  const [cameraActive, setCameraActive] = useState(false);
  const [capturedPhoto, setCapturedPhoto] = useState(null); // base64
  const [cameraError, setCameraError] = useState('');
  
  // Submit state
  const [submitting, setSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(null); // { employee, time, telegramSent }
  const [submitError, setSubmitError] = useState('');

  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const fileInputRef = useRef(null);

  // Live clock
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Fetch staff list
  const fetchEmployees = useCallback(async () => {
    setLoadingEmployees(true);
    try {
      let res;
      if (window.api && window.api.getWaiters && window.api.getCashiers) {
        const [wRes, cRes] = await Promise.all([
          window.api.getWaiters(),
          window.api.getCashiers()
        ]);
        const list = [
          ...(cRes?.data || []).map(c => ({ id: c.id, name: c.name, role: c.role || 'Kassir', type: 'cashier' })),
          ...(wRes?.data || []).map(w => ({ id: w.id, name: w.name, role: 'Ofitsiant', type: 'waiter' }))
        ];
        setEmployees(list);
      } else {
        const r = await fetch('/api/attendance/employees');
        res = await r.json();
        if (res && res.success) {
          setEmployees(res.data || []);
          if (res.cafeName) setCafeName(res.cafeName);
        }
      }
    } catch (err) {
      console.error("fetchEmployees error:", err);
    } finally {
      setLoadingEmployees(false);
    }
  }, []);

  useEffect(() => {
    fetchEmployees();
  }, [fetchEmployees]);

  // Start Camera
  const startCamera = async () => {
    setCameraError('');
    try {
      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user', width: { ideal: 720 }, height: { ideal: 960 } },
          audio: false
        });
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play();
        }
        setCameraActive(true);
      } else {
        // Fallback to file input
        fileInputRef.current?.click();
      }
    } catch (err) {
      console.warn("Camera access failed, falling back to file upload:", err);
      setCameraError("Kameraga ulanib bo'lmadi. Telefon galereyasi yoki kamerasidan rasm tanlang.");
      fileInputRef.current?.click();
    }
  };

  // Stop Camera
  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
  }, []);

  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, [stopCamera]);

  // Snap photo from video feed
  const capturePhoto = () => {
    if (!videoRef.current) return;
    const canvas = document.createElement('canvas');
    canvas.width = videoRef.current.videoWidth || 640;
    canvas.height = videoRef.current.videoHeight || 480;
    const ctx = canvas.getContext('2d');
    
    // Mirror front camera horizontally
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
    
    const base64 = canvas.toDataURL('image/jpeg', 0.85);
    setCapturedPhoto(base64);
    stopCamera();
  };

  // Handle fallback file / photo input
  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        setCapturedPhoto(event.target.result);
      };
      reader.readAsDataURL(file);
    }
  };

  // Retake photo
  const retakePhoto = () => {
    setCapturedPhoto(null);
    startCamera();
  };

  // Submit attendance check
  const handleSubmitAttendance = async () => {
    if (!selectedEmployee) {
      setSubmitError("Iltimos, ismingizni tanlang!");
      return;
    }
    if (!capturedPhoto) {
      setSubmitError("Iltimos, selfi rasmga tushing!");
      return;
    }

    setSubmitting(true);
    setSubmitError('');

    try {
      const timeStr = currentTime.toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit' });
      const dateStr = currentTime.toISOString().slice(0, 10);

      const res = await fetch('/api/attendance/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employee_id: selectedEmployee.id,
          employee_type: selectedEmployee.type,
          employee_name: selectedEmployee.name,
          role: selectedEmployee.role,
          status,
          date: dateStr,
          time: timeStr,
          photo: capturedPhoto
        })
      });

      const data = await res.json();
      if (data && data.success) {
        setSubmitSuccess({
          employee: selectedEmployee.name,
          role: selectedEmployee.role,
          time: timeStr,
          status,
          telegramSent: data.telegramSent
        });
      } else {
        setSubmitError(data?.error || "Davomatni qayd etishda xatolik yuz berdi");
      }
    } catch (err) {
      setSubmitError(err.message || "Tarmoq xatoligi");
    } finally {
      setSubmitting(false);
    }
  };

  const handleResetForNext = () => {
    setSelectedEmployee(null);
    setCapturedPhoto(null);
    setSubmitSuccess(null);
    setSubmitError('');
    stopCamera();
  };

  return (
    <div className="min-h-screen bg-slate-950 text-white flex flex-col font-sans select-none">
      {/* ── Top Header ──────────────────────────────────────────────────────── */}
      <header className="bg-slate-900/90 backdrop-blur-md border-b border-slate-800 px-5 py-4 sticky top-0 z-30 flex items-center justify-between shadow-xl">
        <div className="flex items-center gap-3">
          {onBack && (
            <button
              onClick={onBack}
              className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition cursor-pointer"
            >
              <ArrowLeft size={18} />
            </button>
          )}
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-500 to-purple-600 flex items-center justify-center shadow-md shadow-indigo-500/20">
            <Camera size={20} className="text-white" />
          </div>
          <div>
            <h1 className="text-base font-black tracking-tight text-white flex items-center gap-2">
              XODIMLAR DAVOMATI
            </h1>
            <p className="text-[11px] text-slate-400 font-medium">
              {cafeName ? `${cafeName} • ` : ''}Telegram orqali nazorat
            </p>
          </div>
        </div>

        {/* Live Time Clock */}
        <div className="bg-slate-800/80 px-3.5 py-1.5 rounded-xl border border-slate-700/80 text-right">
          <span className="text-sm font-black text-amber-400 font-mono tracking-wider">
            {currentTime.toLocaleTimeString('ru-RU')}
          </span>
        </div>
      </header>

      {/* ── Main Container ──────────────────────────────────────────────────── */}
      <main className="flex-1 max-w-lg w-full mx-auto p-4 sm:p-6 flex flex-col justify-between">
        {submitSuccess ? (
          /* ── SUCCESS SCREEN ──────────────────────────────────────────────── */
          <div className="my-auto py-10 flex flex-col items-center text-center space-y-6 animate-fadeIn">
            <div className={`w-24 h-24 rounded-full border-2 flex items-center justify-center animate-bounce ${
              submitSuccess.status === 'ketdi'
                ? 'bg-rose-500/20 border-rose-500 text-rose-400 shadow-[0_0_50px_rgba(244,63,94,0.3)]'
                : 'bg-emerald-500/20 border-emerald-500 text-emerald-400 shadow-[0_0_50px_rgba(16,185,129,0.3)]'
            }`}>
              <CheckCircle2 size={52} />
            </div>

            <div className="space-y-2">
              <h2 className="text-2xl font-black text-white">
                {submitSuccess.status === 'ketdi' ? "KETGANLIK QAYD ETILDI!" : "KELGANLIK QAYD ETILDI!"}
              </h2>
              <p className="text-sm text-slate-300">
                <span className="font-bold text-white">{submitSuccess.employee}</span> ({submitSuccess.role})
              </p>
              <div className={`inline-flex items-center gap-2 px-4 py-1.5 rounded-full border font-bold text-xs mt-2 ${
                submitSuccess.status === 'ketdi'
                  ? 'bg-rose-500/10 border-rose-500/30 text-rose-300'
                  : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
              }`}>
                <Clock size={14} />
                <span>{submitSuccess.status === 'ketdi' ? 'Ketgan vaqti:' : 'Kelgan vaqti:'} {submitSuccess.time}</span>
              </div>
            </div>

            {submitSuccess.telegramSent ? (
              <div className="p-3 bg-blue-500/10 border border-blue-500/30 rounded-2xl text-xs text-blue-300 flex items-center gap-2 max-w-xs">
                <Sparkles size={16} className="text-blue-400 shrink-0" />
                <span>Selfi fotosi va {submitSuccess.status === 'ketdi' ? 'ketgan' : 'kelgan'} vaqtingiz Telegram guruhga yuborildi!</span>
              </div>
            ) : (
              <div className="p-3 bg-slate-800 rounded-2xl text-xs text-slate-400 max-w-xs">
                Davomat bazada saqlandi.
              </div>
            )}

            <button
              onClick={handleResetForNext}
              className="w-full py-4 bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white font-black text-sm rounded-2xl shadow-xl shadow-indigo-500/25 transition-all cursor-pointer active:scale-98"
            >
              Keyingi xodim uchun yangilash
            </button>
          </div>
        ) : (
          /* ── ATTENDANCE CHECK-IN FORM ─────────────────────────────────────── */
          <div className="space-y-6 my-auto">
            {/* Step 1: Select Employee */}
            <div className="p-5 rounded-3xl bg-slate-900 border border-slate-800 shadow-xl space-y-3">
              <label className="text-xs font-black tracking-wider text-slate-400 uppercase flex items-center gap-2">
                <UserCheck size={16} className="text-indigo-400" />
                1. Ismingizni tanlang:
              </label>

              {loadingEmployees ? (
                <div className="py-6 flex items-center justify-center gap-2 text-slate-500 text-xs">
                  <RefreshCw size={16} className="animate-spin text-indigo-400" />
                  <span>Xodimlar ro'yxati yuklanmoqda...</span>
                </div>
              ) : employees.length === 0 ? (
                <div className="p-4 bg-slate-800/60 rounded-2xl text-center text-xs text-slate-400">
                  Faol xodimlar topilmadi. Sozlamalardan ofitsiant yoki kassir qo'shing.
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-48 overflow-y-auto pr-1 custom-scrollbar">
                  {employees.map(emp => {
                    const isSelected = selectedEmployee?.id === emp.id && selectedEmployee?.type === emp.type;
                    return (
                      <button
                        key={`${emp.type}_${emp.id}`}
                        type="button"
                        onClick={() => setSelectedEmployee(emp)}
                        className={`p-3 rounded-2xl border text-left transition-all cursor-pointer flex items-center justify-between gap-2 active:scale-98 ${
                          isSelected
                            ? 'bg-indigo-600 text-white border-indigo-500 shadow-lg shadow-indigo-600/30'
                            : 'bg-slate-800/80 hover:bg-slate-800 text-slate-200 border-slate-700/80'
                        }`}
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-bold truncate">{emp.name}</p>
                          <p className={`text-[10px] font-semibold uppercase ${isSelected ? 'text-indigo-200' : 'text-slate-400'}`}>
                            {emp.role || (emp.type === 'cashier' ? 'Kassir' : 'Ofitsiant')}
                          </p>
                        </div>
                        {isSelected && <CheckCircle2 size={18} className="shrink-0 text-white" />}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Step 2: Camera Selfie Photo */}
            <div className="p-5 rounded-3xl bg-slate-900 border border-slate-800 shadow-xl space-y-3">
              <label className="text-xs font-black tracking-wider text-slate-400 uppercase flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <Camera size={16} className="text-purple-400" />
                  2. Selfi rasmga tushing:
                </span>
                {capturedPhoto && (
                  <span className="text-[11px] font-bold text-emerald-400 flex items-center gap-1">
                    <CheckCircle2 size={13} /> Rasm tayyor
                  </span>
                )}
              </label>

              {/* Photo View / Camera Container */}
              <div className="relative rounded-2xl overflow-hidden bg-slate-950 border border-slate-800 aspect-[4/3] flex items-center justify-center shadow-inner">
                {capturedPhoto ? (
                  /* Snapped Photo Preview */
                  <div className="relative w-full h-full">
                    <img
                      src={capturedPhoto}
                      alt="Selfie"
                      className="w-full h-full object-cover"
                    />
                    <button
                      type="button"
                      onClick={retakePhoto}
                      className="absolute bottom-3 right-3 px-3 py-1.5 rounded-xl bg-black/60 backdrop-blur-md text-white border border-white/20 text-xs font-bold flex items-center gap-1.5 cursor-pointer active:scale-95 shadow-lg"
                    >
                      <RotateCcw size={14} />
                      Qayta tushish
                    </button>
                  </div>
                ) : cameraActive ? (
                  /* Live Camera Feed */
                  <div className="relative w-full h-full">
                    <video
                      ref={videoRef}
                      playsInline
                      muted
                      className="w-full h-full object-cover transform -scale-x-100"
                    />
                    <div className="absolute inset-0 border-2 border-dashed border-white/20 rounded-2xl pointer-events-none flex items-center justify-center">
                      <div className="w-40 h-48 border-2 border-indigo-400/60 rounded-full" />
                    </div>
                    <button
                      type="button"
                      onClick={capturePhoto}
                      className="absolute bottom-4 left-1/2 -translate-x-1/2 px-6 py-3 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white font-black text-sm shadow-2xl flex items-center gap-2 cursor-pointer active:scale-95"
                    >
                      <Camera size={20} />
                      Suratga olish
                    </button>
                  </div>
                ) : (
                  /* Camera Off Placeholder */
                  <div className="flex flex-col items-center justify-center text-center p-6 space-y-3">
                    <div className="w-16 h-16 rounded-2xl bg-slate-800/80 border border-slate-700 flex items-center justify-center text-slate-500">
                      <Camera size={32} />
                    </div>
                    <p className="text-xs text-slate-400 max-w-[200px]">
                      Kamera orqali selfi rasmga tushing
                    </p>
                    <button
                      type="button"
                      onClick={startCamera}
                      className="py-2.5 px-5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-black text-xs rounded-xl shadow-lg transition-all cursor-pointer active:scale-95 flex items-center gap-2"
                    >
                      <Camera size={16} />
                      Kamerani yoqish
                    </button>
                  </div>
                )}
              </div>

              {/* Hidden File Input fallback */}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                capture="user"
                onChange={handleFileChange}
                className="hidden"
              />

              {cameraError && (
                <p className="text-xs text-amber-400 font-medium flex items-center gap-1.5">
                  <AlertCircle size={14} />
                  {cameraError}
                </p>
              )}
            </div>

            {/* Step 3: Status selection (Keldi / Ketdi) */}
            <div className="p-5 rounded-3xl bg-slate-900 border border-slate-800 shadow-xl space-y-3">
              <label className="text-xs font-black tracking-wider text-slate-400 uppercase flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <Clock size={16} className="text-indigo-400" />
                  3. Holatni tanlang (Keldi / Ketdi):
                </span>
                <span className={`text-xs font-bold px-2.5 py-0.5 rounded-full ${
                  status === 'ketdi' ? 'bg-rose-500/20 text-rose-300' : 'bg-emerald-500/20 text-emerald-300'
                }`}>
                  {status === 'ketdi' ? '🔴 Ishdan ketish' : '🟢 Ishga kelish'}
                </span>
              </label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setStatus('keldi')}
                  className={`py-3.5 px-4 rounded-2xl font-black text-sm sm:text-base border transition-all cursor-pointer flex items-center justify-center gap-2 active:scale-95 ${
                    status === 'keldi'
                      ? 'bg-emerald-600 text-white border-emerald-400 shadow-xl shadow-emerald-600/30 ring-2 ring-emerald-400/50'
                      : 'bg-slate-800/80 hover:bg-slate-800 text-slate-300 border-slate-700/80'
                  }`}
                >
                  <span className="text-lg">🟢</span>
                  <span>Keldi</span>
                </button>
                <button
                  type="button"
                  onClick={() => setStatus('ketdi')}
                  className={`py-3.5 px-4 rounded-2xl font-black text-sm sm:text-base border transition-all cursor-pointer flex items-center justify-center gap-2 active:scale-95 ${
                    status === 'ketdi'
                      ? 'bg-rose-600 text-white border-rose-400 shadow-xl shadow-rose-600/30 ring-2 ring-rose-400/50'
                      : 'bg-slate-800/80 hover:bg-slate-800 text-slate-300 border-slate-700/80'
                  }`}
                >
                  <span className="text-lg">🔴</span>
                  <span>Ketdi</span>
                </button>
              </div>
            </div>

            {/* Error message */}
            {submitError && (
              <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-2xl text-xs text-rose-300 font-bold flex items-center gap-2">
                <AlertCircle size={16} className="shrink-0" />
                <span>{submitError}</span>
              </div>
            )}

            {/* Submit Button */}
            <button
              type="button"
              disabled={submitting || !selectedEmployee || !capturedPhoto}
              onClick={handleSubmitAttendance}
              className={`w-full py-4 disabled:opacity-40 disabled:pointer-events-none text-white font-black text-base rounded-2xl shadow-xl transition-all cursor-pointer flex items-center justify-center gap-2.5 active:scale-98 ${
                status === 'ketdi'
                  ? 'bg-gradient-to-r from-rose-600 via-red-600 to-rose-600 hover:from-rose-500 hover:to-red-500 shadow-rose-950/40 ring-1 ring-rose-400/30'
                  : 'bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-600 hover:from-emerald-500 hover:to-teal-500 shadow-emerald-950/40 ring-1 ring-emerald-400/30'
              }`}
            >
              {submitting ? (
                <>
                  <RefreshCw size={20} className="animate-spin" />
                  <span>Yuborilmoqda...</span>
                </>
              ) : (
                <>
                  <Send size={18} />
                  <span>
                    {status === 'ketdi' ? "🔴 Ketganlikni tasdiqlash" : "🟢 Kelganlikni tasdiqlash"}
                  </span>
                </>
              )}
            </button>
          </div>
        )}

        {/* ── Footer ────────────────────────────────────────────────────────── */}
        <footer className="pt-6 pb-2 text-center text-[11px] text-slate-500 font-medium">
          <span>xxMpos Davomat Tizimi • Xavfsiz Wi-Fi tekshiruvi</span>
        </footer>
      </main>
    </div>
  );
}
