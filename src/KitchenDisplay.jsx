import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { 
  ChefHat, 
  Clock, 
  CheckCircle2, 
  Volume2, 
  VolumeX, 
  RefreshCw, 
  Utensils, 
  ShoppingBag, 
  User, 
  Sparkles, 
  RotateCcw, 
  Check, 
  Flame, 
  ArrowLeft,
  Tv,
  Maximize2,
  Minimize2,
  Bell,
  History,
  AlertTriangle,
  Undo2
} from 'lucide-react';

// Web Audio API Synthesizer for Kitchen Chimes (Loud 2.0-second alert) & Voice Alerts
function playKitchenOrderAlert(type = 'new-order') {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    const ctx = new AudioContext();
    if (ctx.state === 'suspended') ctx.resume();

    if (type === 'new-order') {
      // 2.0-second continuous loud, attention-grabbing kitchen chime chords (4 rings spanning 2.0s)
      const chords = [
        // Ring 1 (0.0s - 0.45s)
        { freq: 880, time: 0.0, duration: 0.22, gain: 0.95 },
        { freq: 1318.51, time: 0.18, duration: 0.32, gain: 1.0 },
        // Ring 2 (0.5s - 0.95s)
        { freq: 880, time: 0.5, duration: 0.22, gain: 0.95 },
        { freq: 1318.51, time: 0.68, duration: 0.32, gain: 1.0 },
        // Ring 3 (1.0s - 1.45s)
        { freq: 987.77, time: 1.0, duration: 0.22, gain: 0.95 },
        { freq: 1479.98, time: 1.18, duration: 0.32, gain: 1.0 },
        // Ring 4 (1.5s - 2.0s)
        { freq: 1046.50, time: 1.5, duration: 0.22, gain: 1.0 },
        { freq: 1567.98, time: 1.68, duration: 0.45, gain: 1.0 }
      ];

      chords.forEach(({ freq, time, duration, gain: gVal }) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, ctx.currentTime + time);

        gain.gain.setValueAtTime(gVal, ctx.currentTime + time);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + time + duration);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(ctx.currentTime + time);
        osc.stop(ctx.currentTime + time + duration);
      });

      // Voice Alert in Uzbek: "Yangi buyurtma!"
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance("Yangi buyurtma!");
        utterance.lang = 'uz-UZ';
        const voices = window.speechSynthesis.getVoices() || [];
        const uzVoice = voices.find(v => v.lang.startsWith('uz') || v.lang.includes('uz')) ||
                          voices.find(v => v.lang.startsWith('tr') || v.lang.includes('TR')) ||
                          voices.find(v => (v.lang.includes('ru') || v.lang.includes('RU'))) ||
                          voices[0];
        if (uzVoice) utterance.voice = uzVoice;
        utterance.rate = 0.95;
        utterance.pitch = 1.0;
        utterance.volume = 1.0;

        setTimeout(() => {
          try {
            window.speechSynthesis.speak(utterance);
          } catch (e) {
            console.warn("Speech error:", e);
          }
        }, 1800);
      }
    } else if (type === 'ready') {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(523.25, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(1046.50, ctx.currentTime + 0.3);

      gain.gain.setValueAtTime(0.5, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.4);
    }
  } catch (e) {
    console.error("Audio alert error:", e);
  }
}

// Helper for Target Preparation Countdown and Overtime calculation
function getOrderTimingInfo(order) {
  const startTimeStr = order.cooking_started_at || order.created_at;
  if (!startTimeStr) {
    return { isOvertime: false, formatted: '00:00', elapsedSec: 0, targetSec: 300, targetMin: 5 };
  }

  const start = new Date(startTimeStr.replace(' ', 'T')).getTime();
  if (isNaN(start)) {
    return { isOvertime: false, formatted: '00:00', elapsedSec: 0, targetSec: 300, targetMin: 5 };
  }

  const now = Date.now();
  const elapsedSec = Math.max(0, Math.floor((now - start) / 1000));
  const targetMin = parseInt(order.target_prep_time, 10) || 5;
  const targetSec = targetMin * 60;
  const diffSec = targetSec - elapsedSec;

  if (diffSec >= 0) {
    const mins = Math.floor(diffSec / 60);
    const secs = diffSec % 60;
    return {
      isOvertime: false,
      formatted: `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`,
      elapsedSec,
      targetSec,
      targetMin,
      diffSec
    };
  } else {
    const overtimeSec = Math.abs(diffSec);
    const mins = Math.floor(overtimeSec / 60);
    const secs = overtimeSec % 60;
    return {
      isOvertime: true,
      formatted: `+${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`,
      elapsedSec,
      targetSec,
      targetMin,
      diffSec
    };
  }
}

export default function KitchenDisplay({ onBack, onOpenTv }) {
  const [orders, setOrders] = useState([]);
  const [historyOrders, setHistoryOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [hasInteracted, setHasInteracted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [newOrderAlertBanner, setNewOrderAlertBanner] = useState(false);
  const [activeTab, setActiveTab] = useState('orders'); // 'orders' | 'history'
  const [filterTab, setFilterTab] = useState('all'); // 'all' | 'preparing' | 'ready'
  const [currentTime, setCurrentTime] = useState(new Date());
  const [actionLoading, setActionLoading] = useState({});
  const [toastMsg, setToastMsg] = useState(null);
  
  const prevOrderMapRef = useRef(new Map());
  const isFirstLoadRef = useRef(true);

  const showToast = (msg) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 3500);
  };

  // Real-time clock tick every second
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Prevent outer window scrolling
  useEffect(() => {
    const origOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = origOverflow;
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
          rootElem.requestFullscreen().catch(err => console.warn("Fullscreen error:", err));
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

  // Fetch active kitchen orders
  const fetchKitchenOrders = useCallback(async (isInitial = false) => {
    try {
      if (isInitial) setLoading(true);
      let res;
      if (window.api && window.api.getKitchenOrders) {
        res = await window.api.getKitchenOrders();
      } else {
        const r = await fetch('/api/kitchen/orders');
        res = await r.json();
      }

      if (res && res.success) {
        const newOrders = res.data || [];
        
        // Detect newly arrived orders or added items for 2-second loud audio alert
        if (!isFirstLoadRef.current && soundEnabled) {
          const preparingOrders = newOrders.filter(o => o.kitchen_status === 'preparing');
          const hasNewOrderOrItems = preparingOrders.some(o => {
            const currentItemCount = (o.items || []).reduce((acc, it) => acc + (parseFloat(it.qty) || 1), 0);
            if (!prevOrderMapRef.current.has(o.id)) {
              return true; // Brand new order
            }
            const prevItemCount = prevOrderMapRef.current.get(o.id) || 0;
            return currentItemCount > prevItemCount; // Additional dishes added
          });

          if (hasNewOrderOrItems) {
            playKitchenOrderAlert('new-order');
            setNewOrderAlertBanner(true);
            setTimeout(() => setNewOrderAlertBanner(false), 5000);
          }
        } else {
          isFirstLoadRef.current = false;
        }

        // Store latest order item counts
        const newMap = new Map();
        newOrders.forEach(o => {
          const count = (o.items || []).reduce((acc, it) => acc + (parseFloat(it.qty) || 1), 0);
          newMap.set(o.id, count);
        });
        prevOrderMapRef.current = newMap;
        setOrders(newOrders);
      }
    } catch (err) {
      console.error("fetchKitchenOrders error:", err);
    } finally {
      if (isInitial) setLoading(false);
    }
  }, [soundEnabled]);

  // Fetch recently completed/served history
  const fetchKitchenHistory = useCallback(async () => {
    try {
      setHistoryLoading(true);
      let res;
      if (window.api && window.api.getKitchenHistory) {
        res = await window.api.getKitchenHistory(40);
      } else {
        const r = await fetch('/api/kitchen/history?limit=40');
        res = await r.json();
      }
      if (res && res.success) {
        setHistoryOrders(res.data || []);
      }
    } catch (err) {
      console.error("fetchKitchenHistory error:", err);
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  // Initial load and auto-polling backup
  useEffect(() => {
    fetchKitchenOrders(true);
    const interval = setInterval(() => fetchKitchenOrders(false), 2500);
    return () => clearInterval(interval);
  }, [fetchKitchenOrders]);

  // Listen to IPC / WebSocket real-time updates
  useEffect(() => {
    if (window.api && window.api.onKitchenUpdated) {
      window.api.onKitchenUpdated(() => {
        fetchKitchenOrders(false);
        if (activeTab === 'history') fetchKitchenHistory();
      });
    }

    const handleWindowKitchen = () => {
      fetchKitchenOrders(false);
      if (activeTab === 'history') fetchKitchenHistory();
    };
    window.addEventListener('kitchen-updated', handleWindowKitchen);
    window.addEventListener('sales-updated', handleWindowKitchen);

    return () => {
      window.removeEventListener('kitchen-updated', handleWindowKitchen);
      window.removeEventListener('sales-updated', handleWindowKitchen);
    };
  }, [fetchKitchenOrders, fetchKitchenHistory, activeTab]);

  // Handle single item status change: 'preparing' | 'ready' | 'served'
  const handleSetItemStatus = async (itemId, newStatus) => {
    setActionLoading(prev => ({ ...prev, [`item_${itemId}`]: true }));
    try {
      let res;
      if (window.api && window.api.setOrderItemStatus) {
        res = await window.api.setOrderItemStatus({ itemId, status: newStatus });
      } else {
        const r = await fetch(`/api/kitchen/items/${itemId}/set-status`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: newStatus })
        });
        res = await r.json();
      }

      if (res && res.success) {
        if (soundEnabled && newStatus === 'ready') playKitchenOrderAlert('ready');
        fetchKitchenOrders(false);
      }
    } catch (err) {
      console.error("handleSetItemStatus error:", err);
    } finally {
      setActionLoading(prev => ({ ...prev, [`item_${itemId}`]: false }));
    }
  };

  // Handle Mark Whole Order Ready or Completed (Served)
  const handleSetOrderStatus = async (orderId, newStatus) => {
    setActionLoading(prev => ({ ...prev, [orderId]: true }));
    try {
      if (soundEnabled && newStatus === 'ready') {
        playKitchenOrderAlert('ready');
      }

      let res;
      if (window.api && window.api.setOrderStatus) {
        res = await window.api.setOrderStatus({ orderId, status: newStatus });
      } else {
        const r = await fetch(`/api/orders/${orderId}/set-status`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: newStatus })
        });
        res = await r.json();
      }

      if (res && res.success) {
        if (newStatus === 'completed') {
          setOrders(prev => prev.filter(o => o.id !== orderId));
          showToast(`Buyurtma #${orderId} stolga berildi deb belgilandi`);
        } else {
          setOrders(prev => prev.map(o => o.id === orderId ? { ...o, kitchen_status: newStatus, ready_at: new Date().toISOString() } : o));
        }
      }
    } catch (err) {
      console.error("handleSetOrderStatus error:", err);
    } finally {
      setActionLoading(prev => ({ ...prev, [orderId]: false }));
    }
  };

  // Mark Whole Order Served (Delivered)
  const handleSetOrderServed = async (orderId) => {
    setActionLoading(prev => ({ ...prev, [orderId]: true }));
    try {
      let res;
      if (window.api && window.api.setOrderServed) {
        res = await window.api.setOrderServed({ orderId, source: 'kitchen' });
      } else {
        const r = await fetch(`/api/kitchen/orders/${orderId}/set-served`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ source: 'kitchen' })
        });
        res = await r.json();
      }

      if (res && res.success) {
        setOrders(prev => prev.filter(o => o.id !== orderId));
        showToast(`Buyurtma #${orderId} berildi va arxivlandi`);
        fetchKitchenOrders(false);
      }
    } catch (err) {
      console.error("handleSetOrderServed error:", err);
    } finally {
      setActionLoading(prev => ({ ...prev, [orderId]: false }));
    }
  };

  // Revert / Undo order from History back to Preparing
  const handleRevertOrder = async (orderId) => {
    setActionLoading(prev => ({ ...prev, [`rev_${orderId}`]: true }));
    try {
      let res;
      if (window.api && window.api.revertKitchenOrderStatus) {
        res = await window.api.revertKitchenOrderStatus(orderId);
      } else {
        const r = await fetch(`/api/kitchen/orders/${orderId}/revert`, {
          method: 'POST'
        });
        res = await r.json();
      }

      if (res && res.success) {
        showToast(`Buyurtma #${orderId} oshxonaga muvaffaqiyatli qaytarildi!`);
        fetchKitchenOrders(false);
        fetchKitchenHistory();
        setActiveTab('orders');
      }
    } catch (err) {
      console.error("handleRevertOrder error:", err);
    } finally {
      setActionLoading(prev => ({ ...prev, [`rev_${orderId}`]: false }));
    }
  };

  // Filtered orders
  const filteredOrders = useMemo(() => {
    if (filterTab === 'preparing') return orders.filter(o => o.kitchen_status === 'preparing');
    if (filterTab === 'ready') return orders.filter(o => o.kitchen_status === 'ready');
    return orders;
  }, [orders, filterTab]);

  const counts = useMemo(() => {
    const preparing = orders.filter(o => o.kitchen_status === 'preparing').length;
    const ready = orders.filter(o => o.kitchen_status === 'ready').length;
    return { all: orders.length, preparing, ready };
  }, [orders]);

  return (
    <div 
      onClick={() => { if (!hasInteracted) { setHasInteracted(true); playKitchenOrderAlert('new-order'); } }}
      className="fixed inset-0 w-screen h-screen max-w-screen max-h-screen bg-gray-950 text-gray-100 flex flex-col font-sans select-none overflow-hidden"
    >
      {/* ── Top Flash Alert Banner for New Incoming Orders ────────────────── */}
      {newOrderAlertBanner && (
        <div className="shrink-0 bg-gradient-to-r from-amber-500 via-orange-500 to-amber-500 text-gray-950 font-black px-6 py-2.5 flex items-center justify-center gap-3 shadow-2xl animate-pulse z-50">
          <Bell className="animate-bounce" size={22} />
          <span className="text-base tracking-wide uppercase">YANGI BUYURTMA KELDI! OSHPAZGA XABAR BERILDI (2 SEKUND OVOZ)!</span>
        </div>
      )}

      {/* ── Toast Notification ────────────────────────────────────────────── */}
      {toastMsg && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-50 bg-emerald-600 text-white font-black text-xs px-5 py-2.5 rounded-2xl shadow-2xl border border-emerald-400 flex items-center gap-2 animate-fade-in">
          <CheckCircle2 size={16} />
          <span>{toastMsg}</span>
        </div>
      )}

      {/* ── First-Time Audio Unlock Prompt Banner ─────────────────────────── */}
      {!hasInteracted && (
        <div 
          onClick={(e) => { 
            e.stopPropagation(); 
            setHasInteracted(true); 
            playKitchenOrderAlert('new-order'); 
            toggleFullscreen(); 
          }}
          className="shrink-0 bg-gradient-to-r from-blue-900/90 to-indigo-900/90 border-b border-blue-500/40 text-white px-6 py-2.5 text-xs flex items-center justify-between cursor-pointer hover:brightness-110 transition-all z-40"
        >
          <div className="flex items-center gap-2">
            <Volume2 size={16} className="text-blue-300 animate-pulse" />
            <span className="font-bold">Oshpaz ekrani: Ovozli xabarlar va to'liq ekranni yoqish uchun shu yerga bosing!</span>
          </div>
          <button className="px-3.5 py-1 bg-blue-500 hover:bg-blue-400 text-white rounded-xl text-xs font-black shadow-lg cursor-pointer transition-all active:scale-95">
            To'liq ekran & Ovozni yoqish
          </button>
        </div>
      )}

      {/* ── Top Navigation Bar ────────────────────────────────────────────── */}
      <header className="shrink-0 bg-gray-900/95 backdrop-blur-md border-b border-gray-800 px-6 py-3.5 flex items-center justify-between shadow-2xl">
        <div className="flex items-center gap-4">
          {onBack && (
            <button
              onClick={onBack}
              className="p-2.5 rounded-xl bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white transition-all cursor-pointer border border-gray-700 active:scale-95"
              title="Orqaga"
            >
              <ArrowLeft size={20} />
            </button>
          )}
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center shadow-lg shadow-orange-500/20">
              <ChefHat size={24} className="text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-black tracking-tight text-white">OSHXONA EKRANI (KDS)</h1>
                <span className="flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
                  Jonli
                </span>
              </div>
              <p className="text-[11px] text-gray-400 font-medium">Har bir taom holati, taymer va qaytarish tarixi</p>
            </div>
          </div>
        </div>

        {/* Center: Orders vs History Tabs */}
        <div className="flex bg-gray-800/80 p-1 rounded-2xl border border-gray-700/60">
          <button
            onClick={() => setActiveTab('orders')}
            className={`px-4 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer flex items-center gap-2 ${
              activeTab === 'orders'
                ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/30'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            Faol buyurtmalar ({counts.all})
          </button>
          <button
            onClick={() => {
              setActiveTab('history');
              fetchKitchenHistory();
            }}
            className={`px-4 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer flex items-center gap-2 ${
              activeTab === 'history'
                ? 'bg-purple-600 text-white shadow-lg shadow-purple-600/30'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            <History size={14} />
            Tarix & Qaytarish
          </button>
        </div>

        {/* Right side controls */}
        <div className="flex items-center gap-2.5">
          {onOpenTv && (
            <button
              onClick={onOpenTv}
              className="px-3.5 py-2 rounded-xl bg-purple-600/20 hover:bg-purple-600/30 text-purple-300 border border-purple-500/30 font-bold text-xs flex items-center gap-2 transition-all cursor-pointer active:scale-95"
              title="Zaldagi TV-Tabloni ochish"
            >
              <Tv size={16} />
              <span className="hidden sm:inline">TV-Tablo</span>
            </button>
          )}

          {/* Fullscreen Button */}
          <button
            onClick={toggleFullscreen}
            className="p-2.5 rounded-xl bg-gray-800 hover:bg-gray-700 text-gray-200 border border-gray-700 transition-all cursor-pointer active:scale-95 flex items-center gap-1.5 text-xs font-bold shadow-md"
            title={isFullscreen ? "To'liq ekrandan chiqish" : "To'liq ekran (Fullscreen)"}
          >
            {isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
            <span className="hidden lg:inline">{isFullscreen ? "Kichraytirish" : "To'liq ekran"}</span>
          </button>

          <button
            onClick={() => setSoundEnabled(!soundEnabled)}
            className={`p-2.5 rounded-xl border transition-all cursor-pointer flex items-center gap-1.5 text-xs font-bold ${
              soundEnabled
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20'
                : 'bg-gray-800 border-gray-700 text-gray-400 hover:bg-gray-700'
            }`}
            title={soundEnabled ? "Ovoz yoqilgan (O'chirish)" : "Ovoz o'chirilgan (Yoqish)"}
          >
            {soundEnabled ? <Volume2 size={16} /> : <VolumeX size={16} />}
          </button>

          <button
            onClick={() => {
              fetchKitchenOrders(true);
              if (activeTab === 'history') fetchKitchenHistory();
            }}
            className="p-2.5 rounded-xl bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white border border-gray-700 transition-all cursor-pointer active:scale-95"
            title="Yangilash"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin text-blue-400' : ''} />
          </button>

          <div className="bg-gray-800 px-3.5 py-1.5 rounded-xl border border-gray-700 text-right">
            <span className="text-base font-black text-amber-400 tracking-wider font-mono">
              {currentTime.toLocaleTimeString('ru-RU')}
            </span>
          </div>
        </div>
      </header>

      {/* ── Sub-header filters (only for active orders tab) ────────────────── */}
      {activeTab === 'orders' && (
        <div className="px-6 py-2 bg-gray-900/60 border-b border-gray-800 flex items-center justify-between">
          <div className="flex gap-2">
            <button
              onClick={() => setFilterTab('all')}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                filterTab === 'all'
                  ? 'bg-gray-700 text-white'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              Barchasi ({counts.all})
            </button>
            <button
              onClick={() => setFilterTab('preparing')}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                filterTab === 'preparing'
                  ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                  : 'text-gray-400 hover:text-amber-300'
              }`}
            >
              ⏳ Tayyorlanmoqda ({counts.preparing})
            </button>
            <button
              onClick={() => setFilterTab('ready')}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                filterTab === 'ready'
                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                  : 'text-gray-400 hover:text-emerald-300'
              }`}
            >
              ✅ Tayyor bo'lganlar ({counts.ready})
            </button>
          </div>

          <div className="text-[11px] text-gray-500 flex items-center gap-3">
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500" /> Vaqtida
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" /> Kechikmoqda
            </span>
          </div>
        </div>
      )}

      {/* ── Main View Area ────────────────────────────────────────────────── */}
      <main className="flex-1 min-h-0 p-6 overflow-y-auto custom-scrollbar">
        {activeTab === 'orders' ? (
          filteredOrders.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center py-24 text-center">
              <div className="w-24 h-24 rounded-3xl bg-gray-900 border border-gray-800 flex items-center justify-center mb-4 text-gray-600">
                <ChefHat size={48} />
              </div>
              <h3 className="text-xl font-bold text-gray-300 mb-1">
                {filterTab === 'preparing'
                  ? "Hozirda tayyorlanayotgan taomlar yo'q"
                  : filterTab === 'ready'
                  ? "Hozirda tayyor bo'lgan buyurtmalar yo'q"
                  : "Hozirda faol buyurtmalar yo'q"}
              </h3>
              <p className="text-sm text-gray-500 max-w-sm">
                Kassir yoki ofitsiant yangi buyurtma yuborganda u darhol 2 soniyali signal bilan shu yerda paydo bo'ladi.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {filteredOrders.map(order => {
                const isReady = order.kitchen_status === 'ready';
                const isTakeaway = order.order_type === 'takeaway' || order.table_zone === 'Dostavka';
                const timing = getOrderTimingInfo(order);

                // Timer badge styling: Green if in time, pulsating Red if overtime
                let timerBadgeClass = "bg-emerald-500/10 text-emerald-400 border-emerald-500/20";
                if (timing.isOvertime) {
                  timerBadgeClass = "bg-rose-500/20 text-rose-400 border-rose-500/50 animate-pulse";
                } else if (timing.diffSec <= 120) {
                  timerBadgeClass = "bg-amber-500/20 text-amber-400 border-amber-500/40";
                }

                return (
                  <div
                    key={order.id}
                    className={`rounded-3xl flex flex-col justify-between border-2 transition-all shadow-xl overflow-hidden ${
                      timing.isOvertime
                        ? 'bg-gray-900/95 border-rose-600/70 shadow-rose-950/30'
                        : isReady
                        ? 'bg-gray-900/95 border-emerald-500/80 shadow-emerald-900/20'
                        : 'bg-gray-900/95 border-gray-800 hover:border-amber-500/40 shadow-black/40'
                    }`}
                  >
                    {/* Card Header */}
                    <div className={`p-4 border-b ${
                      timing.isOvertime
                        ? 'bg-rose-950/40 border-rose-900/50'
                        : isReady
                        ? 'bg-emerald-950/40 border-emerald-800/40'
                        : 'bg-gray-800/50 border-gray-800'
                    }`}>
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <span className="text-2xl font-black text-white tracking-tight">
                            #{order.order_number || order.id}
                          </span>
                          {isTakeaway ? (
                            <span className="px-2.5 py-1 rounded-lg text-[11px] font-black bg-amber-500/20 text-amber-300 border border-amber-500/30 flex items-center gap-1">
                              <ShoppingBag size={12} />
                              Olib ketish
                            </span>
                          ) : (
                            <span className="px-2.5 py-1 rounded-lg text-[11px] font-black bg-blue-500/20 text-blue-300 border border-blue-500/30 flex items-center gap-1">
                              <Utensils size={12} />
                              {order.table_name || `Stol #${order.table_id}`}
                            </span>
                          )}
                        </div>

                        {/* Countdown / Overtime Timer */}
                        <div className={`px-2.5 py-1 rounded-xl text-xs font-black border flex items-center gap-1.5 ${timerBadgeClass}`}>
                          {timing.isOvertime ? <AlertTriangle size={13} /> : <Clock size={13} />}
                          <span>{timing.formatted}</span>
                          {timing.isOvertime && (
                            <span className="text-[10px] uppercase font-bold text-rose-300">kechikmoqda</span>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center justify-between text-xs text-gray-400">
                        <span className="flex items-center gap-1">
                          <User size={12} className="text-gray-500" />
                          {order.waiter_name || 'Kassir'}
                        </span>
                        <span className="text-[11px] text-gray-400 font-medium">
                          Vaqt me'yori: <b className="text-gray-200">{timing.targetMin} daq</b>
                        </span>
                      </div>
                    </div>

                    {/* Items List with Item-by-item status buttons */}
                    <div className="p-4 flex-1 space-y-2.5 max-h-[350px] overflow-y-auto custom-scrollbar">
                      {order.items && order.items.length > 0 ? (
                        order.items.map((item, idx) => {
                          const itemStatus = item.item_status || 'preparing';
                          const isItemReady = itemStatus === 'ready';
                          const isItemServed = itemStatus === 'served';

                          return (
                            <div
                              key={item.id || idx}
                              className={`flex flex-col gap-2 p-2.5 rounded-2xl border transition-all ${
                                isItemServed
                                  ? 'bg-gray-900/40 border-gray-800/40 opacity-50'
                                  : isItemReady
                                  ? 'bg-emerald-950/30 border-emerald-700/50'
                                  : 'bg-gray-800/40 border-gray-800/80 hover:bg-gray-800/70'
                              }`}
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div className="flex items-start gap-2.5 flex-1 min-w-0">
                                  <span className={`w-8 h-8 rounded-xl border flex items-center justify-center font-black text-sm shrink-0 ${
                                    isItemReady
                                      ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                                      : 'bg-amber-500/20 text-amber-400 border-amber-500/30'
                                  }`}>
                                    {item.qty}x
                                  </span>
                                  <div className="flex-1 min-w-0">
                                    <p className={`text-base font-bold leading-snug break-words ${
                                      isItemServed ? 'line-through text-gray-500' : isItemReady ? 'text-emerald-200' : 'text-gray-100'
                                    }`}>
                                      {item.name}
                                    </p>
                                    {item.category && (
                                      <span className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold">
                                        {item.category}
                                      </span>
                                    )}
                                  </div>
                                </div>

                                {/* Status badge */}
                                <span className={`px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider ${
                                  isItemServed
                                    ? 'bg-gray-800 text-gray-400'
                                    : isItemReady
                                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                                    : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                                }`}>
                                  {isItemServed ? 'Berildi' : isItemReady ? 'Tayyor' : 'Pishmoqda'}
                                </span>
                              </div>

                              {/* Item status action buttons */}
                              <div className="grid grid-cols-3 gap-1.5 pt-1 border-t border-gray-800/60">
                                <button
                                  type="button"
                                  disabled={actionLoading[`item_${item.id}`]}
                                  onClick={() => handleSetItemStatus(item.id, 'preparing')}
                                  className={`py-1 rounded-lg text-[10px] font-black transition-all cursor-pointer ${
                                    itemStatus === 'preparing'
                                      ? 'bg-amber-500 text-gray-950 shadow-sm'
                                      : 'bg-gray-800/80 text-gray-400 hover:text-white'
                                  }`}
                                >
                                  ⏳ Pishmoqda
                                </button>
                                <button
                                  type="button"
                                  disabled={actionLoading[`item_${item.id}`]}
                                  onClick={() => handleSetItemStatus(item.id, 'ready')}
                                  className={`py-1 rounded-lg text-[10px] font-black transition-all cursor-pointer ${
                                    isItemReady
                                      ? 'bg-emerald-500 text-white shadow-sm'
                                      : 'bg-gray-800/80 text-gray-400 hover:text-emerald-300'
                                  }`}
                                >
                                  ✅ Tayyor
                                </button>
                                <button
                                  type="button"
                                  disabled={actionLoading[`item_${item.id}`]}
                                  onClick={() => handleSetItemStatus(item.id, 'served')}
                                  className={`py-1 rounded-lg text-[10px] font-black transition-all cursor-pointer ${
                                    isItemServed
                                      ? 'bg-purple-600 text-white shadow-sm'
                                      : 'bg-gray-800/80 text-gray-400 hover:text-purple-300'
                                  }`}
                                >
                                  🍽️ Berildi
                                </button>
                              </div>
                            </div>
                          );
                        })
                      ) : (
                        <p className="text-xs text-gray-500 italic text-center py-4">Taomlar ro'yxati bo'sh</p>
                      )}
                    </div>

                    {/* Card Footer Actions */}
                    <div className="p-4 bg-gray-900 border-t border-gray-800/80 space-y-2">
                      {!isReady ? (
                        <button
                          onClick={() => handleSetOrderStatus(order.id, 'ready')}
                          disabled={actionLoading[order.id]}
                          className="w-full py-3 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-black text-sm rounded-2xl shadow-lg shadow-emerald-600/30 transition-all cursor-pointer flex items-center justify-center gap-2 active:scale-98 disabled:opacity-50"
                        >
                          <CheckCircle2 size={18} />
                          Barchasi tayyor bo'ldi
                        </button>
                      ) : (
                        <div className="p-2 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-center">
                          <span className="text-xs font-black text-emerald-400 flex items-center justify-center gap-1.5">
                            <Sparkles size={14} />
                            Ofitsiantga xabar berildi (TVda e'lon qilindi)
                          </span>
                        </div>
                      )}

                      <div className="grid grid-cols-2 gap-2">
                        {isReady && (
                          <button
                            onClick={() => handleSetOrderStatus(order.id, 'preparing')}
                            disabled={actionLoading[order.id]}
                            className="py-2.5 bg-gray-800 hover:bg-gray-700 text-gray-300 font-bold text-xs rounded-xl border border-gray-700 transition cursor-pointer flex items-center justify-center gap-1"
                          >
                            <RotateCcw size={13} />
                            Orqaga
                          </button>
                        )}
                        <button
                          onClick={() => handleSetOrderServed(order.id)}
                          disabled={actionLoading[order.id]}
                          className={`py-2.5 bg-purple-700 hover:bg-purple-600 text-white font-black text-xs rounded-xl shadow-md transition cursor-pointer flex items-center justify-center gap-1.5 ${
                            !isReady ? 'col-span-2' : ''
                          }`}
                        >
                          <Check size={14} />
                          Barchasi berildi (Yopish)
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )
        ) : (
          /* ── HISTORY / REVERT TAB VIEW ── */
          <div className="space-y-4">
            <div className="flex items-center justify-between bg-gray-900/80 p-4 rounded-2xl border border-gray-800">
              <div className="flex items-center gap-2">
                <History className="text-purple-400" size={20} />
                <h3 className="font-black text-sm text-white">So'nggi tayyorlangan va berilgan buyurtmalar tarixi</h3>
              </div>
              <span className="text-xs text-gray-400">
                Agar bilmasdan "Tayyor" yoki "Berildi" bosib yuborilgan bo'lsa, <b>"Qaytarish"</b> tugmasi orqali chekni oshxona ekraniga qaytaring.
              </span>
            </div>

            {historyLoading ? (
              <div className="text-center py-20 text-gray-400">
                <RefreshCw size={32} className="animate-spin mx-auto mb-2 text-purple-400" />
                <p className="text-sm font-bold">Tarix yuklanmoqda...</p>
              </div>
            ) : historyOrders.length === 0 ? (
              <div className="text-center py-20 text-gray-500">
                <History size={48} className="mx-auto mb-3 opacity-30" />
                <p className="text-base font-bold">Tarixda yakunlangan buyurtmalar hozircha yo'q</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
                {historyOrders.map(order => (
                  <div
                    key={order.id}
                    className="rounded-2xl bg-gray-900/80 border border-gray-800 p-4 flex flex-col justify-between gap-3 shadow-md hover:border-gray-700 transition"
                  >
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xl font-black text-white">#{order.order_number || order.id}</span>
                        <span className="px-2 py-0.5 rounded-md text-[11px] font-bold bg-purple-500/20 text-purple-300 border border-purple-500/30">
                          {order.table_name || `Stol #${order.table_id}`}
                        </span>
                      </div>
                      <div className="text-xs text-gray-400 mb-3 flex items-center justify-between">
                        <span>Ofitsiant: {order.waiter_name || 'Kassir'}</span>
                        <span>{order.served_at ? order.served_at.substring(11, 16) : order.created_at?.substring(11, 16)}</span>
                      </div>

                      {/* Items list summary */}
                      <div className="space-y-1.5 max-h-36 overflow-y-auto custom-scrollbar border-t border-gray-800 pt-2 text-xs">
                        {order.items && order.items.map((it, idx) => (
                          <div key={idx} className="flex justify-between text-gray-300">
                            <span>{it.qty}x {it.name}</span>
                            <span className="text-[10px] text-gray-500 uppercase">{it.item_status || 'berildi'}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Revert / Undo Button */}
                    <button
                      type="button"
                      disabled={actionLoading[`rev_${order.id}`]}
                      onClick={() => handleRevertOrder(order.id)}
                      className="w-full py-2.5 bg-amber-600 hover:bg-amber-500 text-gray-950 font-black text-xs rounded-xl shadow-md transition cursor-pointer flex items-center justify-center gap-1.5 active:scale-95 disabled:opacity-50"
                    >
                      <Undo2 size={15} />
                      Oshxonaga qaytarish (Bekor qilish)
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
