import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  Tv, 
  Clock, 
  Volume2, 
  VolumeX, 
  Utensils, 
  ShoppingBag, 
  Sparkles, 
  ChefHat, 
  CheckCircle2, 
  ArrowLeft,
  BellRing,
  Maximize2,
  Minimize2
} from 'lucide-react';

// Web Audio API Gong / Chime for TV announcement
function playTvChime() {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    const ctx = new AudioContext();
    if (ctx.state === 'suspended') ctx.resume();

    // High quality double ding-dong chime: G5 -> C6
    const chords = [
      { freq: 783.99, time: 0, duration: 0.35, gain: 0.7 },
      { freq: 1046.50, time: 0.22, duration: 0.8, gain: 0.85 }
    ];

    chords.forEach(({ freq, time, duration, gain: gVal }) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, ctx.currentTime + time);

      gain.gain.setValueAtTime(gVal, ctx.currentTime + time);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + time + duration);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(ctx.currentTime + time);
      osc.stop(ctx.currentTime + time + duration);
    });
  } catch (e) {
    console.error("Audio error:", e);
  }
}

// Web Speech API Voice Announcement in Uzbek
function speakOrderReady(orderNumber) {
  try {
    if (!('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel(); // Stop any pending speech

    // Clean order number: extract ONLY digits so speech never pronounces '#' as 'reshotka'
    const cleanNum = String(orderNumber).replace(/\D/g, '') || String(orderNumber).replace('#', '').trim();

    // As requested: "3 chi zakaz deyish kerak" (e.g. "3 chi zakaz tayyor")
    const text = `${cleanNum} chi zakaz tayyor`;
    const utterance = new SpeechSynthesisUtterance(text);
    
    // Select best voice (try uz, ru, tr, or default)
    const voices = window.speechSynthesis.getVoices();
    const voice = voices.find(v => v.lang.startsWith('uz')) || 
                  voices.find(v => v.lang.startsWith('ru')) || 
                  voices.find(v => v.lang.startsWith('tr')) || 
                  voices[0];
    
    if (voice) utterance.voice = voice;
    utterance.rate = 0.92;
    utterance.pitch = 1.0;
    utterance.volume = 1.0;

    // Speak right after chime
    setTimeout(() => {
      try {
        window.speechSynthesis.speak(utterance);
      } catch (err) {
        console.error("Speech speak error:", err);
      }
    }, 600);
  } catch (e) {
    console.error("Speech synthesis error:", e);
  }
}

export default function TvQueueDisplay({ onBack }) {
  const [tvData, setTvData] = useState({ preparing: [], ready: [] });
  const [currentTime, setCurrentTime] = useState(new Date());
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [hasInteracted, setHasInteracted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [lastReadyAnnounced, setLastReadyAnnounced] = useState(null);
  const prevReadyIdsRef = useRef(new Set());
  const isFirstLoadRef = useRef(true);

  // Live clock tick
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Prevent any document scrolling
  useEffect(() => {
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, []);

  // Track Fullscreen changes
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
    };
  }, []);

  const toggleFullscreen = useCallback(() => {
    try {
      if (!document.fullscreenElement) {
        const rootElem = document.documentElement;
        if (rootElem.requestFullscreen) {
          rootElem.requestFullscreen().catch(err => console.warn("Fullscreen request error:", err));
        } else if (rootElem.webkitRequestFullscreen) {
          rootElem.webkitRequestFullscreen();
        }
      } else {
        if (document.exitFullscreen) {
          document.exitFullscreen().catch(err => console.warn("Exit fullscreen error:", err));
        } else if (document.webkitExitFullscreen) {
          document.webkitExitFullscreen();
        }
      }
    } catch (e) {
      console.warn("Fullscreen toggle error:", e);
    }
  }, []);

  // Pre-load speech synthesis voices
  useEffect(() => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.getVoices();
      window.speechSynthesis.onvoiceschanged = () => {
        window.speechSynthesis.getVoices();
      };
    }
  }, []);

  // Fetch TV orders
  const fetchTvOrders = useCallback(async () => {
    try {
      let res;
      if (window.api && window.api.getTvOrders) {
        res = await window.api.getTvOrders();
      } else {
        const r = await fetch('/api/tv/orders');
        res = await r.json();
      }

      if (res && res.success && res.data) {
        const { preparing = [], ready = [] } = res.data;
        
        // Detect NEW ready orders to trigger chime and voice announcement
        if (!isFirstLoadRef.current) {
          const newlyReadyOrders = ready.filter(o => !prevReadyIdsRef.current.has(o.id));
          if (newlyReadyOrders.length > 0) {
            const latest = newlyReadyOrders[newlyReadyOrders.length - 1];
            const num = latest.order_number || latest.id;
            setLastReadyAnnounced(num);

            if (soundEnabled) {
              playTvChime();
              speakOrderReady(num);
            }
          }
        } else {
          isFirstLoadRef.current = false;
        }

        prevReadyIdsRef.current = new Set(ready.map(o => o.id));
        setTvData({ preparing, ready });
      }
    } catch (err) {
      console.error("fetchTvOrders error:", err);
    }
  }, [soundEnabled]);

  // Polling every 2.5s
  useEffect(() => {
    fetchTvOrders();
    const interval = setInterval(() => fetchTvOrders(), 2500);
    return () => clearInterval(interval);
  }, [fetchTvOrders]);

  // Listen to IPC and Socket events
  useEffect(() => {
    if (window.api && window.api.onKitchenUpdated) {
      window.api.onKitchenUpdated(() => fetchTvOrders());
    }

    const handleUpdate = () => fetchTvOrders();
    window.addEventListener('kitchen-updated', handleUpdate);
    window.addEventListener('sales-updated', handleUpdate);

    return () => {
      window.removeEventListener('kitchen-updated', handleUpdate);
      window.removeEventListener('sales-updated', handleUpdate);
    };
  }, [fetchTvOrders]);

  const toggleSound = () => {
    if (!soundEnabled) {
      playTvChime();
      setSoundEnabled(true);
      setHasInteracted(true);
    } else {
      setSoundEnabled(false);
    }
  };

  const handleFirstInteraction = () => {
    setHasInteracted(true);
    setSoundEnabled(true);
    playTvChime();
    toggleFullscreen();
  };

  return (
    <div className="fixed inset-0 w-screen h-screen max-w-screen max-h-screen bg-gray-950 text-white flex flex-col font-sans select-none overflow-hidden">
      {/* ── First-Time Fullscreen & Audio Activation Overlay ──────────────── */}
      {!hasInteracted && (
        <div
          onClick={handleFirstInteraction}
          className="absolute inset-0 z-50 bg-black/80 backdrop-blur-sm flex flex-col items-center justify-center cursor-pointer p-6 transition-all"
        >
          <div className="max-w-md w-full p-8 rounded-3xl bg-gray-900 border-2 border-emerald-500/60 shadow-[0_0_50px_rgba(16,185,129,0.3)] text-center space-y-5 animate-pulse">
            <div className="w-20 h-20 mx-auto rounded-3xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center border border-emerald-500/40">
              <Maximize2 size={40} />
            </div>
            <div>
              <h2 className="text-2xl font-black text-white tracking-tight">TV TABLONI BOSHLASH</h2>
              <p className="text-sm text-gray-300 mt-2 font-medium">
                To'liq ekranga o'tish va ovozli e'lonlarni yoqish uchun ekranning istalgan joyini bosing.
              </p>
            </div>
            <button
              onClick={handleFirstInteraction}
              className="w-full py-4 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-gray-950 font-black text-lg rounded-2xl shadow-lg shadow-emerald-500/30 transition-all cursor-pointer active:scale-98"
            >
              To'liq ekran va Ovozni yoqish
            </button>
          </div>
        </div>
      )}

      {/* ── Top Header ────────────────────────────────────────────────────── */}
      <header className="shrink-0 bg-gray-900 border-b border-gray-800 px-6 lg:px-8 py-3.5 flex items-center justify-between shadow-2xl">
        <div className="flex items-center gap-4">
          {onBack && (
            <button
              onClick={onBack}
              className="p-2.5 rounded-2xl bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white transition-all cursor-pointer border border-gray-700 active:scale-95"
              title="Orqaga"
            >
              <ArrowLeft size={22} />
            </button>
          )}
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center shadow-lg shadow-blue-500/20">
            <Tv size={26} className="text-white" />
          </div>
          <div>
            <h1 className="text-xl lg:text-2xl font-black tracking-tight text-white flex items-center gap-3">
              BUYURTMALAR HOLATI
              <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                Jonli Tablo
              </span>
            </h1>
            <p className="text-xs text-gray-400 font-medium hidden sm:block">Buyurtmangiz tayyor bo'lishini ekranda kuzatib boring</p>
          </div>
        </div>

        {/* Right side: Fullscreen, Audio unlock & Clock */}
        <div className="flex items-center gap-3">
          <button
            onClick={toggleFullscreen}
            className="px-4 py-2.5 rounded-2xl bg-gray-800 hover:bg-gray-700 text-gray-200 border border-gray-700 font-bold text-xs flex items-center gap-2 transition-all cursor-pointer active:scale-95 shadow-md"
            title={isFullscreen ? "To'liq ekrandan chiqish" : "To'liq ekran rejimiga o'tish"}
          >
            {isFullscreen ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
            <span className="hidden md:inline">{isFullscreen ? "Kichraytirish" : "To'liq ekran"}</span>
          </button>

          <button
            onClick={toggleSound}
            className={`px-4 py-2.5 rounded-2xl border-2 font-black text-xs flex items-center gap-2 transition-all cursor-pointer shadow-lg active:scale-95 ${
              soundEnabled
                ? 'bg-emerald-500/20 border-emerald-500 text-emerald-300 shadow-emerald-950/40'
                : 'bg-rose-500/20 border-rose-500 text-rose-300 animate-pulse shadow-rose-950/40'
            }`}
          >
            {soundEnabled ? <Volume2 size={18} /> : <VolumeX size={18} />}
            {soundEnabled ? "Ovoz yoqilgan" : "Ovozni yoqish"}
          </button>

          <div className="bg-gray-800/90 px-4 py-2 rounded-2xl border border-gray-700/80 shadow-inner text-right">
            <span className="text-xl lg:text-2xl font-black text-amber-400 tracking-widest font-mono">
              {currentTime.toLocaleTimeString('ru-RU')}
            </span>
          </div>
        </div>
      </header>

      {/* ── Main Two-Column Split Queue ────────────────────────────────────── */}
      <main className="flex-1 min-h-0 grid grid-cols-2 gap-5 p-5 overflow-hidden">
        {/* LEFT COLUMN: TAYYORLANMOQDA (AMBER) */}
        <div className="flex flex-col h-full min-h-0 rounded-3xl bg-gray-900/90 border-2 border-amber-500/40 shadow-2xl overflow-hidden">
          {/* Header Banner */}
          <div className="shrink-0 bg-gradient-to-r from-amber-500 via-amber-600 to-yellow-600 px-5 py-3.5 text-gray-950 flex items-center justify-between shadow-lg">
            <div className="flex items-center gap-3">
              <ChefHat size={28} className="stroke-[2.5]" />
              <div>
                <h2 className="text-xl lg:text-2xl font-black tracking-wider uppercase">
                  TAYYORLANMOQDA
                </h2>
                <p className="text-[10px] font-bold text-gray-900/80 uppercase tracking-widest">Готовится / In Progress</p>
              </div>
            </div>
            <span className="px-3.5 py-1 rounded-xl bg-black/30 text-white font-black text-lg backdrop-blur-sm">
              {tvData.preparing.length}
            </span>
          </div>

          {/* Preparing Numbers Grid - Absolutely no scrollbars */}
          <div className="flex-1 min-h-0 p-5 overflow-y-auto no-scrollbar">
            {tvData.preparing.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center py-16 text-gray-600">
                <ChefHat size={48} className="mb-2 opacity-40" />
                <p className="text-base font-bold text-gray-500">Tayyorlanayotgan buyurtmalar yo'q</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3.5">
                {tvData.preparing.map(order => {
                  const isTakeaway = order.order_type === 'takeaway' || order.table_zone === 'Dostavka';
                  return (
                    <div
                      key={order.id}
                      className="p-4 rounded-2xl bg-gray-800/80 border-2 border-amber-500/30 hover:border-amber-400 flex flex-col items-center justify-center gap-1 shadow-lg transition-all"
                    >
                      <span className="text-3xl lg:text-4xl font-black text-amber-400 tracking-tight font-mono">
                        #{order.order_number || order.id}
                      </span>
                      <div className="flex items-center gap-1 text-[11px] font-bold text-gray-400 mt-1">
                        {isTakeaway ? (
                          <span className="text-amber-300/90 flex items-center gap-1">
                            <ShoppingBag size={12} />
                            Olib ketish
                          </span>
                        ) : (
                          <span className="text-gray-300 flex items-center gap-1">
                            <Utensils size={12} />
                            {order.table_name || `Stol #${order.table_id}`}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* RIGHT COLUMN: TAYYOR BO'LDI (EMERALD GLOW) */}
        <div className="flex flex-col h-full min-h-0 rounded-3xl bg-gray-900/90 border-2 border-emerald-500/70 shadow-[0_0_50px_rgba(16,185,129,0.15)] overflow-hidden">
          {/* Header Banner */}
          <div className="shrink-0 bg-gradient-to-r from-emerald-500 via-teal-500 to-green-600 px-5 py-3.5 text-gray-950 flex items-center justify-between shadow-lg">
            <div className="flex items-center gap-3">
              <CheckCircle2 size={28} className="stroke-[2.5]" />
              <div>
                <h2 className="text-xl lg:text-2xl font-black tracking-wider uppercase">
                  TAYYOR BO'LDI
                </h2>
                <p className="text-[10px] font-bold text-gray-900/80 uppercase tracking-widest">Готово к выдаче / Ready</p>
              </div>
            </div>
            <span className="px-3.5 py-1 rounded-xl bg-black/30 text-white font-black text-lg backdrop-blur-sm">
              {tvData.ready.length}
            </span>
          </div>

          {/* Ready Numbers Grid with Glow & Pulse - Absolutely no scrollbars */}
          <div className="flex-1 min-h-0 p-5 overflow-y-auto no-scrollbar">
            {tvData.ready.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center py-16 text-gray-600">
                <CheckCircle2 size={48} className="mb-2 opacity-40" />
                <p className="text-base font-bold text-gray-500">Tayyor buyurtmalar kutilmoqda</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3.5">
                {tvData.ready.map(order => {
                  const isTakeaway = order.order_type === 'takeaway' || order.table_zone === 'Dostavka';
                  const orderNum = order.order_number || order.id;
                  const isRecentlyAnnounced = lastReadyAnnounced === orderNum;

                  return (
                    <div
                      key={order.id}
                      className={`p-4 rounded-2xl bg-emerald-950/40 border-2 border-emerald-400 flex flex-col items-center justify-center gap-1 shadow-[0_0_30px_rgba(52,211,153,0.3)] transition-all ${
                        isRecentlyAnnounced ? 'animate-bounce border-emerald-300 shadow-[0_0_50px_rgba(52,211,153,0.6)]' : 'animate-pulse'
                      }`}
                    >
                      <span className="text-4xl lg:text-5xl font-black text-emerald-300 tracking-tight font-mono drop-shadow-[0_0_15px_rgba(16,185,129,0.8)]">
                        #{orderNum}
                      </span>
                      <div className="flex items-center gap-1 text-[11px] font-black text-emerald-400 mt-1">
                        {isTakeaway ? (
                          <span className="flex items-center gap-1 bg-emerald-500/20 px-2 py-0.5 rounded-lg border border-emerald-500/30">
                            <ShoppingBag size={12} />
                            Olib ketish
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 bg-emerald-500/20 px-2 py-0.5 rounded-lg border border-emerald-500/30">
                            <Utensils size={12} />
                            {order.table_name || `Stol #${order.table_id}`}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </main>

      {/* ── Bottom Marquee Notification Bar ───────────────────────────────── */}
      <footer className="shrink-0 bg-gray-900 border-t border-gray-800 px-6 py-2.5 flex items-center justify-between text-xs text-gray-400 font-bold">
        <div className="flex items-center gap-2">
          <BellRing size={16} className="text-amber-400 animate-bounce" />
          <span>Raqamingiz "Tayyor bo'ldi" ustunida paydo bo'lganda buyurtmangizni qabul qilib olishingiz mumkin.</span>
        </div>
        <div className="flex items-center gap-2 text-gray-500">
          <span>xxMpos Smart TV Display</span>
        </div>
      </footer>
    </div>
  );
}

