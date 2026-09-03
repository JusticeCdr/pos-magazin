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
  Tv
} from 'lucide-react';

// Web Audio API Synthesizer for Kitchen Chimes & Beeps
function playBeep(type = 'new-order') {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    const ctx = new AudioContext();

    if (type === 'new-order') {
      // 2-tone cheerful energetic kitchen bell
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const gain = ctx.createGain();

      osc1.type = 'triangle';
      osc1.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
      osc1.frequency.setValueAtTime(880, ctx.currentTime + 0.15); // A5

      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(1174.66, ctx.currentTime); // D6
      osc2.frequency.setValueAtTime(1760, ctx.currentTime + 0.15); // A6

      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);

      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(ctx.destination);

      osc1.start();
      osc2.start();
      osc1.stop(ctx.currentTime + 0.6);
      osc2.stop(ctx.currentTime + 0.6);
    } else if (type === 'ready') {
      // Success chord
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(523.25, ctx.currentTime); // C5
      osc.frequency.exponentialRampToValueAtTime(1046.50, ctx.currentTime + 0.25); // C6

      gain.gain.setValueAtTime(0.25, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.4);
    }
  } catch (e) {
    console.error("Audio error:", e);
  }
}

// Helper to format elapsed time
function formatElapsedTime(createdAt) {
  if (!createdAt) return '00:00';
  const start = new Date(createdAt.replace(' ', 'T')).getTime();
  if (isNaN(start)) return '00:00';
  const now = Date.now();
  const diffSec = Math.max(0, Math.floor((now - start) / 1000));
  const mins = Math.floor(diffSec / 60);
  const secs = diffSec % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export default function KitchenDisplay({ onBack, onOpenTv }) {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [filterTab, setFilterTab] = useState('all'); // 'all' | 'preparing' | 'ready'
  const [currentTime, setCurrentTime] = useState(new Date());
  const [actionLoading, setActionLoading] = useState({});
  const prevOrderIdsRef = useRef(new Set());

  // Real-time clock tick
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Fetch kitchen orders
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
        
        // Detect newly arrived orders for audio alert
        if (!isInitial && soundEnabled) {
          const newPreparingOrders = newOrders.filter(o => o.kitchen_status === 'preparing');
          const hasNew = newPreparingOrders.some(o => !prevOrderIdsRef.current.has(o.id));
          if (hasNew) {
            playBeep('new-order');
          }
        }

        prevOrderIdsRef.current = new Set(newOrders.map(o => o.id));
        setOrders(newOrders);
      }
    } catch (err) {
      console.error("fetchKitchenOrders error:", err);
    } finally {
      if (isInitial) setLoading(false);
    }
  }, [soundEnabled]);

  // Initial load and auto-polling backup
  useEffect(() => {
    fetchKitchenOrders(true);
    const interval = setInterval(() => fetchKitchenOrders(false), 3000);
    return () => clearInterval(interval);
  }, [fetchKitchenOrders]);

  // Listen to IPC / WebSocket real-time updates
  useEffect(() => {
    if (window.api && window.api.onKitchenUpdated) {
      window.api.onKitchenUpdated(() => {
        fetchKitchenOrders(false);
      });
    }

    const handleWindowKitchen = () => fetchKitchenOrders(false);
    window.addEventListener('kitchen-updated', handleWindowKitchen);
    window.addEventListener('sales-updated', handleWindowKitchen);

    return () => {
      window.removeEventListener('kitchen-updated', handleWindowKitchen);
      window.removeEventListener('sales-updated', handleWindowKitchen);
    };
  }, [fetchKitchenOrders]);

  // Handle Mark Ready / Completed / Preparing
  const handleSetStatus = async (orderId, newStatus) => {
    setActionLoading(prev => ({ ...prev, [orderId]: true }));
    try {
      if (soundEnabled && newStatus === 'ready') {
        playBeep('ready');
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
        // Optimistic UI update
        if (newStatus === 'completed') {
          setOrders(prev => prev.filter(o => o.id !== orderId));
        } else {
          setOrders(prev => prev.map(o => o.id === orderId ? { ...o, kitchen_status: newStatus, ready_at: new Date().toISOString() } : o));
        }
      }
    } catch (err) {
      console.error("handleSetStatus error:", err);
    } finally {
      setActionLoading(prev => ({ ...prev, [orderId]: false }));
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
    <div className="min-h-screen bg-gray-950 text-gray-100 flex flex-col font-sans select-none">
      {/* ── Top Navigation Bar ────────────────────────────────────────────── */}
      <header className="bg-gray-900/90 backdrop-blur-md border-b border-gray-800 px-6 py-4 sticky top-0 z-40 flex items-center justify-between shadow-2xl">
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
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center shadow-lg shadow-orange-500/20">
              <ChefHat size={26} className="text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-black tracking-tight text-white">OSHXONA EKRANI (KDS)</h1>
                <span className="flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
                  Jonli
                </span>
              </div>
              <p className="text-xs text-gray-400 font-medium">Oshpazlar uchun buyurtmalar monitoringi</p>
            </div>
          </div>
        </div>

        {/* Center: Tabs */}
        <div className="flex bg-gray-800/80 p-1 rounded-2xl border border-gray-700/60">
          <button
            onClick={() => setFilterTab('all')}
            className={`px-4 py-2 rounded-xl text-xs font-black transition-all cursor-pointer flex items-center gap-2 ${
              filterTab === 'all'
                ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/30'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            Barchasi
            <span className="px-1.5 py-0.5 rounded-md bg-black/30 text-[10px]">{counts.all}</span>
          </button>
          <button
            onClick={() => setFilterTab('preparing')}
            className={`px-4 py-2 rounded-xl text-xs font-black transition-all cursor-pointer flex items-center gap-2 ${
              filterTab === 'preparing'
                ? 'bg-amber-500 text-white shadow-lg shadow-amber-500/30'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            ⏳ Tayyorlanmoqda
            <span className="px-1.5 py-0.5 rounded-md bg-black/30 text-[10px]">{counts.preparing}</span>
          </button>
          <button
            onClick={() => setFilterTab('ready')}
            className={`px-4 py-2 rounded-xl text-xs font-black transition-all cursor-pointer flex items-center gap-2 ${
              filterTab === 'ready'
                ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-600/30'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            ✅ Tayyor
            <span className="px-1.5 py-0.5 rounded-md bg-black/30 text-[10px]">{counts.ready}</span>
          </button>
        </div>

        {/* Right side controls */}
        <div className="flex items-center gap-3">
          {onOpenTv && (
            <button
              onClick={onOpenTv}
              className="px-3.5 py-2.5 rounded-xl bg-purple-600/20 hover:bg-purple-600/30 text-purple-300 border border-purple-500/30 font-bold text-xs flex items-center gap-2 transition-all cursor-pointer active:scale-95"
              title="Zaldagi TV-Tabloni ochish"
            >
              <Tv size={16} />
              TV-Tablo
            </button>
          )}

          <button
            onClick={() => setSoundEnabled(!soundEnabled)}
            className={`p-2.5 rounded-xl border transition-all cursor-pointer flex items-center gap-1.5 text-xs font-bold ${
              soundEnabled
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20'
                : 'bg-gray-800 border-gray-700 text-gray-400 hover:bg-gray-700'
            }`}
            title={soundEnabled ? "Ovoz yoqilgan (O'chirish)" : "Ovoz o'chirilgan (Yoqish)"}
          >
            {soundEnabled ? <Volume2 size={18} /> : <VolumeX size={18} />}
          </button>

          <button
            onClick={() => fetchKitchenOrders(true)}
            className="p-2.5 rounded-xl bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white border border-gray-700 transition-all cursor-pointer active:scale-95"
            title="Yangilash"
          >
            <RefreshCw size={18} className={loading ? 'animate-spin text-blue-400' : ''} />
          </button>

          <div className="bg-gray-800 px-4 py-2 rounded-xl border border-gray-700 text-right">
            <span className="text-lg font-black text-amber-400 tracking-wider">
              {currentTime.toLocaleTimeString('ru-RU')}
            </span>
          </div>
        </div>
      </header>

      {/* ── Main Orders Grid ──────────────────────────────────────────────── */}
      <main className="flex-1 p-6 overflow-y-auto custom-scrollbar">
        {filteredOrders.length === 0 ? (
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
              Kassir yoki ofitsiant tomonidan yangi buyurtma yuborilganda u shu yerda avtomatik paydo bo'ladi.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {filteredOrders.map(order => {
              const isReady = order.kitchen_status === 'ready';
              const isTakeaway = order.order_type === 'takeaway' || order.table_zone === 'Dostavka';
              const elapsedStr = formatElapsedTime(order.created_at);
              const elapsedMinutes = parseInt(elapsedStr.split(':')[0], 10) || 0;

              // Timer alert colors
              let timerBadgeClass = "bg-emerald-500/10 text-emerald-400 border-emerald-500/20";
              if (elapsedMinutes >= 20) {
                timerBadgeClass = "bg-rose-500/20 text-rose-400 border-rose-500/40 animate-pulse";
              } else if (elapsedMinutes >= 10) {
                timerBadgeClass = "bg-amber-500/20 text-amber-400 border-amber-500/30";
              }

              return (
                <div
                  key={order.id}
                  className={`rounded-3xl flex flex-col justify-between border-2 transition-all shadow-xl overflow-hidden ${
                    isReady
                      ? 'bg-gray-900/90 border-emerald-500/80 shadow-emerald-900/20'
                      : 'bg-gray-900/90 border-gray-800 hover:border-amber-500/40 shadow-black/40'
                  }`}
                >
                  {/* Card Header */}
                  <div className={`p-4 border-b ${isReady ? 'bg-emerald-950/40 border-emerald-800/40' : 'bg-gray-800/50 border-gray-800'}`}>
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

                      <div className={`px-2.5 py-1 rounded-xl text-xs font-black border flex items-center gap-1.5 ${timerBadgeClass}`}>
                        <Clock size={13} />
                        {elapsedStr}
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-xs text-gray-400">
                      <span className="flex items-center gap-1">
                        <User size={12} className="text-gray-500" />
                        {order.waiter_name || 'Kassir'}
                      </span>
                      <span className="text-[11px] text-gray-500">
                        {order.created_at ? order.created_at.substring(11, 16) : ''}
                      </span>
                    </div>
                  </div>

                  {/* Items List */}
                  <div className="p-4 flex-1 space-y-2.5 max-h-[350px] overflow-y-auto custom-scrollbar">
                    {order.items && order.items.length > 0 ? (
                      order.items.map((item, idx) => (
                        <div
                          key={item.id || idx}
                          className="flex items-start justify-between gap-3 p-2.5 rounded-2xl bg-gray-800/40 border border-gray-800/80 hover:bg-gray-800/70 transition-colors"
                        >
                          <div className="flex items-start gap-2.5 flex-1 min-w-0">
                            <span className="w-8 h-8 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center justify-center font-black text-sm shrink-0">
                              {item.qty}x
                            </span>
                            <div className="flex-1 min-w-0">
                              <p className="text-base font-bold text-gray-100 leading-snug break-words">
                                {item.name}
                              </p>
                              {item.category && (
                                <span className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold">
                                  {item.category}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      ))
                    ) : (
                      <p className="text-xs text-gray-500 italic text-center py-4">Taomlar ro'yxati bo'sh</p>
                    )}
                  </div>

                  {/* Card Footer Actions */}
                  <div className="p-4 bg-gray-900 border-t border-gray-800/80">
                    {!isReady ? (
                      <button
                        onClick={() => handleSetStatus(order.id, 'ready')}
                        disabled={actionLoading[order.id]}
                        className="w-full py-3.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-black text-sm rounded-2xl shadow-lg shadow-emerald-600/30 transition-all cursor-pointer flex items-center justify-center gap-2 active:scale-98 disabled:opacity-50"
                      >
                        <CheckCircle2 size={18} />
                        ✅ Tayyor bo'ldi
                      </button>
                    ) : (
                      <div className="space-y-2">
                        <div className="p-2.5 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-center">
                          <span className="text-xs font-black text-emerald-400 flex items-center justify-center gap-1.5">
                            <Sparkles size={14} />
                            Ofitsiantga xabar berildi!
                          </span>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            onClick={() => handleSetStatus(order.id, 'preparing')}
                            disabled={actionLoading[order.id]}
                            className="py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 font-bold text-xs rounded-xl border border-gray-700 transition cursor-pointer flex items-center justify-center gap-1"
                          >
                            <RotateCcw size={13} />
                            Qaytarish
                          </button>
                          <button
                            onClick={() => handleSetStatus(order.id, 'completed')}
                            disabled={actionLoading[order.id]}
                            className="py-2 bg-emerald-800/60 hover:bg-emerald-700 text-emerald-200 font-bold text-xs rounded-xl border border-emerald-600/40 transition cursor-pointer flex items-center justify-center gap-1"
                          >
                            <Check size={13} />
                            Berildi (Yopish)
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
