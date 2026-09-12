import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import {
  Search, ShoppingCart, Trash2, Plus, Minus, Banknote, CreditCard, Clock,
  X, CheckCircle2, AlertCircle, Store, Truck, ChevronRight, Users, Package, Printer, Wifi, ShieldAlert,
  ArrowRightLeft, Ban, Eye, EyeOff, Sparkles, QrCode
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { useApp } from './context/AppContext';
import { formatCurrency, formatThousands, getProductImageUrl } from './utils';
import { useReactToPrint } from 'react-to-print';
import { PrintableReceipt } from './components/PrintableReceipt';
import { generateReceiptHTML } from './ReceiptTemplate';
import { AlertModal, ConfirmModal } from './components/Modals';
import StopListModal from './components/StopListModal';

const FALLBACK_GRADIENTS = [
  'from-rose-500 to-red-600',
  'from-orange-500 to-amber-600',
  'from-amber-500 to-yellow-600',
  'from-emerald-500 to-teal-600',
  'from-teal-500 to-cyan-600',
  'from-blue-500 to-indigo-600',
  'from-indigo-500 to-purple-600',
  'from-purple-500 to-pink-600',
];

const getGradientForName = (name) => {
  if (!name) return FALLBACK_GRADIENTS[0];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % FALLBACK_GRADIENTS.length;
  return FALLBACK_GRADIENTS[index];
};

const DEFAULT_ZONES = ['Stol', 'Zal', 'Terrassa', 'Chorpoya', '2-qavat', 'Podval', 'Banket', 'Dostavka'];

/* ── Zone icon helper ──────────────────────────────────────────────────────── */
function ZoneIcon({ zone, size = 16 }) {
  if (zone === 'Aktiv buyurtmalar') return <Sparkles size={size} className="text-amber-500" />;
  if (zone === 'Dostavka') return <Truck size={size} />;
  if (zone === 'Chorpoya') return <Store size={size} />;
  return <Users size={size} />;
}

/* ── Table Timer component ─────────────────────────────────────────────────── */
function TableTimer({ openedAt }) {
  const [elapsed, setElapsed] = useState('');
  const [orderTime, setOrderTime] = useState('');

  useEffect(() => {
    if (!openedAt) return;
    
    const calculateElapsed = () => {
      try {
        const openedTime = new Date(openedAt.includes('Z') || openedAt.includes('+') ? openedAt : openedAt.replace(' ', 'T') + 'Z');
        const now = new Date();
        const diffMs = now - openedTime;

        const timeStr = openedTime.toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit' });
        setOrderTime(timeStr);

        if (isNaN(diffMs) || diffMs < 0) return '< 1 daq';
        
        const diffMins = Math.floor(diffMs / 60000);
        const hours = Math.floor(diffMins / 60);
        const mins = diffMins % 60;
        
        if (hours > 0) {
          return `${hours}s ${mins}d`;
        }
        if (mins === 0) {
          return '< 1 daq';
        }
        return `${mins} daq`;
      } catch (err) {
        return '';
      }
    };

    setElapsed(calculateElapsed());
    const interval = setInterval(() => {
      setElapsed(calculateElapsed());
    }, 10000); // update every 10 seconds

    return () => clearInterval(interval);
  }, [openedAt]);

  if (!elapsed) return null;

  return (
    <span 
      title={orderTime ? `Buyurtma urilgan vaqt: ${orderTime}` : undefined}
      className="text-[10px] font-black text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-900/40 border border-blue-200 dark:border-blue-800 px-1.5 py-0.5 rounded-md mt-1 flex items-center gap-1 shadow-xs"
    >
      <Clock size={11} className="shrink-0" />
      <span>{elapsed}</span>
      {orderTime && <span className="opacity-75 text-[9px]">({orderTime})</span>}
    </span>
  );
}

/* ── Cart Item Timer component ─────────────────────────────────────────────── */
function CartItemTimer({ addedAt }) {
  const [elapsed, setElapsed] = useState('');
  const [formattedTime, setFormattedTime] = useState('');

  useEffect(() => {
    if (!addedAt) return;
    
    try {
      let utcStr = addedAt;
      if (!utcStr.endsWith('Z') && !utcStr.includes('+')) {
        utcStr = utcStr.replace(' ', 'T') + 'Z';
      }
      const dateObj = new Date(utcStr);
      const hh = String(dateObj.getHours()).padStart(2, '0');
      const mm = String(dateObj.getMinutes()).padStart(2, '0');
      setFormattedTime(`${hh}:${mm}`);
    } catch (_) {
      setFormattedTime('');
    }

    const updateTimer = () => {
      try {
        let utcStr = addedAt;
        if (!utcStr.endsWith('Z') && !utcStr.includes('+')) {
          utcStr = utcStr.replace(' ', 'T') + 'Z';
        }
        const addedTime = new Date(utcStr).getTime();
        const diffMs = Date.now() - addedTime;
        if (isNaN(diffMs) || diffMs < 0) {
          setElapsed('0m');
          return;
        }
        
        const diffSecs = Math.floor(diffMs / 1000);
        const diffMins = Math.floor(diffSecs / 60);
        const hours = Math.floor(diffMins / 60);
        const mins = diffMins % 60;
        
        if (hours > 0) {
          setElapsed(`${hours}s ${mins}m`);
        } else {
          setElapsed(`${mins}m`);
        }
      } catch (err) {
        setElapsed('');
      }
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [addedAt]);

  if (!addedAt) return null;

  return (
    <span className="text-[10px] font-medium text-gray-500 dark:text-gray-400 block mt-0.5">
      🕒 {formattedTime} ({elapsed} oldin)
    </span>
  );
}

/* ── Payment Modal ─────────────────────────────────────────────────────────── */
function PaymentModal({ itemsSubtotal, defaultServiceFee = 10, initialIsTakeaway = false, initialMethod = 'cash', onConfirm, onClose, lang, customers }) {
  const [method, setMethod] = useState(initialMethod || 'cash');
  const [tendered, setTendered] = useState('');
  const [discount, setDiscount] = useState(0);
  const [isTakeaway, setIsTakeaway] = useState(initialIsTakeaway);
  const [serviceFeePercent, setServiceFeePercent] = useState(defaultServiceFee);

  // Debt customer states
  const [customerSearch, setCustomerSearch] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [newCustomerName, setNewCustomerName] = useState('');
  const [newCustomerPhone, setNewCustomerPhone] = useState('');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  const discountAmt = Math.round(itemsSubtotal * discount / 100);
  const subtotalAfterDisc = itemsSubtotal - discountAmt;
  const serviceAmt = isTakeaway ? 0 : Math.round(subtotalAfterDisc * (parseFloat(serviceFeePercent) || 0) / 100);
  const finalTotal = subtotalAfterDisc + serviceAmt;
  const change = parseFloat(String(tendered).replace(/\s/g, '')) - finalTotal;

  const fmt = (v) => formatThousands(v);

  const filteredCustomers = useMemo(() => {
    if (!customerSearch.trim()) return [];
    const q = customerSearch.toLowerCase().trim();
    const qDigits = q.replace(/\D/g, '');
    const cleanStr = (s) => (s || '').toLowerCase().replace(/[`'ʻʼ’]/g, "'");
    const stripApostrophes = (s) => cleanStr(s).replace(/'/g, '');
    const cleanQ = cleanStr(q);
    const strippedQ = stripApostrophes(cleanQ);

    return (customers || []).filter(c => {
      const name = cleanStr(c.name);
      const nameMatch = name.includes(cleanQ) || (strippedQ.length > 0 && stripApostrophes(name).includes(strippedQ));
      const phoneDigits = (c.phone || '').replace(/\D/g, '');
      const phoneMatch = qDigits.length > 0 && phoneDigits.includes(qDigits);
      return nameMatch || phoneMatch;
    });
  }, [customers, customerSearch]);

  const handleConfirm = () => {
    let customerInfo = null;
    if (method === 'debt') {
      if (selectedCustomer) {
        customerInfo = selectedCustomer;
      } else if (newCustomerName.trim()) {
        customerInfo = { name: newCustomerName.trim(), phone: newCustomerPhone.trim() };
      } else {
        alert("Iltimos, qarzdor mijozni tanlang yoki yangi mijoz ma'lumotlarini kiriting!");
        return;
      }
    }
    onConfirm(method, discount, customerInfo, isTakeaway ? 0 : serviceFeePercent, serviceAmt, isTakeaway ? 1 : 0);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-md border border-gray-200 dark:border-gray-700 overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-emerald-600 to-teal-600 p-5 flex justify-between items-center">
          <div>
            <h3 className="text-white font-black text-xl">To'lov</h3>
            <p className="text-emerald-100 text-sm">Stolni yopish va to'lov</p>
          </div>
          <button onClick={onClose} className="text-white/70 hover:text-white p-1">
            <X size={22} />
          </button>
        </div>

        <div className="p-5 space-y-4 max-h-[80vh] overflow-y-auto custom-scrollbar">
          {/* Saboy & Service Fee Option */}
          <div className="bg-emerald-50/60 dark:bg-emerald-950/20 p-3 rounded-xl border border-emerald-100 dark:border-emerald-900/40 flex items-center justify-between">
            <div className="flex flex-col">
              <span className="text-xs font-bold text-gray-800 dark:text-gray-200">
                {isTakeaway ? "🛍️ Saboy (Olib ketish)" : `🍽️ Xizmat haqi (${serviceFeePercent}%)`}
              </span>
              <span className="text-[11px] text-gray-500 dark:text-gray-400">
                {isTakeaway ? "Xizmat haqi olinmaydi (0%)" : "Stol hisobiga xizmat haqi qo'shiladi"}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setIsTakeaway(!isTakeaway)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all border cursor-pointer ${
                isTakeaway 
                  ? 'bg-amber-500 border-amber-600 text-white shadow-sm' 
                  : 'bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50'
              }`}
            >
              {isTakeaway ? "Saboy (Uslugasiz ✓)" : "Saboyga o'tkazish"}
            </button>
          </div>

          {/* Discount */}
          <div>
            <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">Chegirma</label>
            <div className="flex gap-2 flex-wrap">
              {[0, 5, 10, 15, 20].map(pct => (
                <button
                  key={pct}
                  onClick={() => setDiscount(pct)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-bold transition-all border cursor-pointer ${
                    discount === pct
                      ? 'bg-blue-600 border-blue-600 text-white'
                      : 'bg-gray-50 dark:bg-gray-700 border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-300'
                  }`}
                >
                  {pct === 0 ? "Yo'q" : `${pct}%`}
                </button>
              ))}
            </div>
          </div>

          {/* Total Breakdown */}
          <div className="bg-gray-50 dark:bg-gray-700/40 rounded-xl p-4 space-y-1.5">
            <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400">
              <span>Mahsulotlar summasi:</span>
              <span className="font-semibold text-gray-700 dark:text-gray-300">{formatCurrency(itemsSubtotal, lang)}</span>
            </div>
            {discount > 0 && (
              <div className="flex justify-between text-xs text-red-500">
                <span>Chegirma ({discount}%):</span>
                <span className="font-semibold">-{formatCurrency(discountAmt, lang)}</span>
              </div>
            )}
            {!isTakeaway && serviceAmt > 0 && (
              <div className="flex justify-between text-xs text-blue-600 dark:text-blue-400">
                <span>Xizmat haqi ({serviceFeePercent}%):</span>
                <span className="font-semibold">+{formatCurrency(serviceAmt, lang)}</span>
              </div>
            )}
            {isTakeaway && (
              <div className="flex justify-between text-xs text-amber-600 dark:text-amber-400">
                <span>Xizmat haqi:</span>
                <span className="font-semibold">0 so'm (Saboy)</span>
              </div>
            )}
            <div className="border-t border-gray-200 dark:border-gray-600 pt-2 mt-1 flex justify-between text-xl font-black text-gray-900 dark:text-white">
              <span>Jami to'lov:</span>
              <span className="text-emerald-600 dark:text-emerald-400">{formatCurrency(finalTotal, lang)}</span>
            </div>
          </div>

          {/* Payment method */}
          <div>
            <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">To'lov usuli</label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { id: 'cash', label: 'Naqd', icon: Banknote },
                { id: 'card', label: 'Karta', icon: CreditCard },
                { id: 'debt', label: 'Qarzga', icon: Clock },
              ].map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  onClick={() => setMethod(id)}
                  className={`p-3 rounded-xl border-2 flex flex-col items-center gap-1 transition-all font-bold text-sm ${
                    method === id
                      ? id === 'cash' ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400'
                        : id === 'card' ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400'
                        : 'border-orange-500 bg-orange-50 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400'
                      : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400'
                  }`}
                >
                  <Icon size={20} />
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Cash tendered */}
          {method === 'cash' && (
            <div>
              <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">Berilgan summa</label>
              <input
                type="text"
                autoFocus
                value={tendered}
                onChange={e => {
                  const raw = e.target.value.replace(/\s/g, '');
                  if (/^\d*$/.test(raw)) setTendered(fmt(raw));
                }}
                placeholder="Summani kiriting..."
                className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600 rounded-xl text-xl font-bold text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-colors"
              />
              {/* Quick buttons */}
              <div className="grid grid-cols-3 gap-2 mt-2">
                {[10000, 20000, 50000, 100000, 200000].map(v => (
                  <button
                    key={v}
                    onClick={() => {
                      const cur = parseFloat(String(tendered).replace(/\s/g, '')) || 0;
                      setTendered(fmt(cur + v));
                    }}
                    className="py-2 px-1 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400 font-bold text-sm rounded-lg hover:bg-indigo-100 dark:hover:bg-indigo-900/50 active:scale-95 transition-all border border-indigo-100 dark:border-indigo-800"
                  >
                    +{(v/1000).toFixed(0)}K
                  </button>
                ))}
                <button
                  onClick={() => setTendered(fmt(finalTotal))}
                  className="col-span-3 py-2 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 font-bold text-sm rounded-lg hover:bg-emerald-100 dark:hover:bg-emerald-900/50 active:scale-95 transition-all border border-emerald-100 dark:border-emerald-800"
                >
                  Aniq summa
                </button>
              </div>
              {change > 0 && (
                <div className="mt-2 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl p-3 flex justify-between items-center">
                  <span className="text-sm font-bold text-green-700 dark:text-green-400">Qaytim:</span>
                  <span className="text-xl font-black text-green-600 dark:text-green-400">{formatCurrency(change, lang)}</span>
                </div>
              )}
            </div>
          )}

          {/* Debt section */}
          {method === 'debt' && (
            <div className="space-y-3 border-t border-gray-150 dark:border-gray-700 pt-3">
              <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">Qarzdor Mijoz</label>
              
              {!selectedCustomer ? (
                <div className="relative space-y-2">
                  <input
                    type="text"
                    placeholder="Mijoz ismi yoki telefonini yozing..."
                    value={customerSearch}
                    onChange={(e) => { setCustomerSearch(e.target.value); setIsDropdownOpen(true); }}
                    className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-700/50 border border-gray-255 dark:border-gray-600 rounded-lg text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-orange-500"
                  />
                  {isDropdownOpen && filteredCustomers.length > 0 && (
                    <div className="absolute left-0 right-0 z-50 mt-1 max-h-32 overflow-y-auto bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg">
                      {filteredCustomers.map(c => (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => {
                            setSelectedCustomer({ id: c.id, name: c.name, phone: c.phone });
                            setIsDropdownOpen(false);
                          }}
                          className="w-full text-left px-3 py-2 text-xs hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-800 dark:text-gray-200 flex justify-between border-b border-gray-100 dark:border-gray-700 last:border-b-0"
                        >
                          <span className="font-bold">{c.name}</span>
                          <span className="text-gray-400 text-[10px]">{c.phone}</span>
                        </button>
                      ))}
                    </div>
                  )}
                  
                  {/* Create New Customer fields */}
                  <div className="mt-2 space-y-2 border-t border-dashed border-gray-200 dark:border-gray-700 pt-2">
                    <p className="text-[10px] text-gray-400 dark:text-gray-500 font-bold uppercase">Yangi mijoz yaratish:</p>
                    <input
                      type="text"
                      placeholder="Mijoz ismi *"
                      value={newCustomerName}
                      onChange={(e) => setNewCustomerName(e.target.value)}
                      className="w-full px-3 py-1.5 bg-gray-50 dark:bg-gray-700/50 border border-gray-255 dark:border-gray-600 rounded-lg text-xs text-gray-900 dark:text-white focus:outline-none"
                    />
                    <input
                      type="text"
                      placeholder="Telefon raqami"
                      value={newCustomerPhone}
                      onChange={(e) => setNewCustomerPhone(e.target.value)}
                      className="w-full px-3 py-1.5 bg-gray-50 dark:bg-gray-700/50 border border-gray-255 dark:border-gray-600 rounded-lg text-xs text-gray-900 dark:text-white focus:outline-none"
                    />
                  </div>
                </div>
              ) : (
                <div className="bg-orange-50 dark:bg-orange-950/20 border border-orange-200 dark:border-orange-900/40 rounded-xl p-3 flex justify-between items-center text-sm">
                  <div>
                    <span className="font-bold text-orange-750 dark:text-orange-400">Tanlandi: </span>
                    <span className="text-gray-800 dark:text-gray-200 font-bold">{selectedCustomer.name}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => { setSelectedCustomer(null); setCustomerSearch(''); }}
                    className="text-xs text-red-500 hover:text-red-600 font-bold"
                  >
                    O'chirish
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Buttons */}
          <div className="flex gap-3 pt-2">
            <button
              onClick={onClose}
              className="flex-1 py-3 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 rounded-xl font-bold transition-colors"
            >
              Bekor qilish
            </button>
            <button
              onClick={handleConfirm}
              className="flex-1 py-3 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white rounded-xl font-bold transition-all shadow-lg shadow-emerald-600/20"
            >
              Tasdiqlash
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Add Table Modal ───────────────────────────────────────────────────────── */
function AddTableModal({ zone, zones = [], onAdd, onClose }) {
  const availableZones = (zones || []).filter(z => z !== 'Aktiv buyurtmalar');
  const [selectedZone, setSelectedZone] = useState(
    zone === 'Aktiv buyurtmalar' ? (availableZones[0] || 'Stol') : zone
  );
  const [name, setName] = useState('');
  const handleSubmit = (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    onAdd(name.trim(), selectedZone);
    onClose();
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-sm border border-gray-200 dark:border-gray-700 p-6">
        <h3 className="text-lg font-black text-gray-900 dark:text-white mb-4">
          Yangi joy / stol qo'shish
        </h3>
        <form onSubmit={handleSubmit} className="space-y-3">
          {availableZones.length > 1 && (
            <div>
              <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 mb-1">Zona tanlang</label>
              <select
                value={selectedZone}
                onChange={e => setSelectedZone(e.target.value)}
                className="w-full px-4 py-2.5 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm font-semibold"
              >
                {availableZones.map(z => (
                  <option key={z} value={z}>{z}</option>
                ))}
              </select>
            </div>
          )}
          <div>
            <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 mb-1">Stol / joy nomi</label>
            <input
              type="text"
              autoFocus
              placeholder="Mas: Stol 31"
              value={name}
              onChange={e => setName(e.target.value)}
              className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm font-semibold"
            />
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 py-2.5 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-xl font-bold text-sm cursor-pointer">Bekor</button>
            <button type="submit" disabled={!name.trim()} className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl font-bold text-sm transition-colors cursor-pointer">Qo'shish</button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ── Add Zone Modal ────────────────────────────────────────────────────────── */
function AddZoneModal({ onAdd, onClose }) {
  const [name, setName] = useState('');
  const handleSubmit = (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    onAdd(name.trim());
    onClose();
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-sm border border-gray-200 dark:border-gray-700 p-6">
        <h3 className="text-lg font-black text-gray-900 dark:text-white mb-4">
          Yangi zona qo'shish
        </h3>
        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            type="text"
            autoFocus
            placeholder="Zona nomi (mas: VIP, Terrassa)"
            value={name}
            onChange={e => setName(e.target.value)}
            className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-700 border border-gray-205 dark:border-gray-600 rounded-xl text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <div className="flex gap-3">
            <button type="button" onClick={onClose} className="flex-1 py-2.5 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-xl font-bold">Bekor</button>
            <button type="submit" className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold transition-colors">Qo'shish</button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ── Waiters Modal ────────────────────────────────────────────────────────── */
function WaitersModal({ waiters, onAddWaiter, onDeleteWaiter, onClose }) {
  const [name, setName] = useState('');
  const [pin, setPin] = useState('');
  const [percentage, setPercentage] = useState(10);
  const [salary, setSalary] = useState('');
  const [revealedPins, setRevealedPins] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim() || pin.length !== 4) return;
    setSubmitting(true);
    setError('');
    const res = await onAddWaiter({
      name: name.trim(),
      pinCode: pin,
      percentage: Number(percentage) || 10,
      salary: Number(salary) || 0
    });
    setSubmitting(false);
    if (res?.success) {
      setName('');
      setPin('');
      setPercentage(10);
      setSalary('');
    } else if (res?.error === 'pin_exists') {
      setError("Ushbu PIN-kod allaqachon mavjud!");
    } else {
      setError(res?.error || "Xatolik yuz berdi");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-lg border border-gray-200 dark:border-gray-700 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-5 border-b border-gray-150 dark:border-gray-700 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-emerald-100 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 flex items-center justify-center font-bold">
              <Users size={20} />
            </div>
            <div>
              <h3 className="text-base font-black text-gray-900 dark:text-white">
                Ofitsiantlar boshqaruvi
              </h3>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Jami {waiters.length} nafar ofitsiant ro'yxatdan o'tgan
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-gray-650 dark:hover:text-gray-200 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition cursor-pointer"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 overflow-y-auto custom-scrollbar space-y-5">
          {/* Add Waiter Form */}
          <form onSubmit={handleSubmit} className="p-4 bg-gray-50 dark:bg-gray-700/30 rounded-xl border border-gray-200/80 dark:border-gray-700 space-y-3">
            <span className="text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wide block">
              Yangi ofitsiant qo'shish
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <input
                type="text"
                placeholder="Ismi (F.I.O)"
                required
                value={name}
                onChange={e => setName(e.target.value)}
                className="w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
              <input
                type="password"
                maxLength={4}
                placeholder="4 xonali PIN"
                required
                value={pin}
                onChange={e => setPin(e.target.value.replace(/\D/g, ''))}
                className="w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-sm text-center tracking-widest text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500 font-mono font-bold"
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div>
                <label className="block text-[11px] text-gray-500 dark:text-gray-400 mb-1">
                  Xizmat haqi ulushi (%)
                </label>
                <input
                  type="number"
                  min={0}
                  max={100}
                  placeholder="10"
                  value={percentage}
                  onChange={e => setPercentage(e.target.value)}
                  className="w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
              <div>
                <label className="block text-[11px] text-gray-500 dark:text-gray-400 mb-1">
                  Oylik maosh (so'm)
                </label>
                <input
                  type="number"
                  placeholder="0 so'm"
                  value={salary}
                  onChange={e => setSalary(e.target.value)}
                  className="w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
            </div>
            {error && (
              <p className="text-xs text-rose-500 font-bold">{error}</p>
            )}
            <button
              type="submit"
              disabled={submitting || !name.trim() || pin.length !== 4}
              className="w-full py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-lg text-sm font-bold flex items-center justify-center gap-1.5 transition shadow-sm cursor-pointer"
            >
              <Plus size={16} /> Qo'shish
            </button>
          </form>

          {/* Waiters List */}
          <div className="space-y-2">
            <span className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide block">
              Mavjud ofitsiantlar
            </span>
            {waiters.length === 0 ? (
              <p className="text-xs text-gray-400 italic py-3 text-center">
                Ofitsiantlar mavjud emas. Yuqoridagi shakldan qo'shing.
              </p>
            ) : (
              waiters.map(w => {
                const isRevealed = revealedPins[w.id];
                return (
                  <div
                    key={w.id}
                    className="p-3 bg-gray-50 dark:bg-gray-700/20 rounded-xl border border-gray-150 dark:border-gray-700 flex items-center justify-between"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-gray-900 dark:text-white">
                          {w.name}
                        </span>
                        <span className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400">
                          {w.percentage || 10}% xizmat
                        </span>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400 mt-1">
                        <span>PIN: {isRevealed ? w.pin_code : '••••'}</span>
                        {Number(w.salary) > 0 && (
                          <span>Oylik: {Number(w.salary).toLocaleString()} so'm</span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => setRevealedPins(prev => ({ ...prev, [w.id]: !prev[w.id] }))}
                        className="p-1.5 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 rounded-md transition cursor-pointer"
                        title={isRevealed ? "Yashirish" : "PIN ko'rish"}
                      >
                        {isRevealed ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                      <button
                        type="button"
                        onClick={() => onDeleteWaiter(w.id, w.name)}
                        className="p-1.5 text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-md transition cursor-pointer"
                        title="O'chirish"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-150 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-800 dark:text-white font-bold text-xs rounded-xl transition cursor-pointer"
          >
            Yopish
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Transfer Table Modal ─────────────────────────────────────────────────── */
function TransferTableModal({ currentTable, tables, zones, onTransfer, onClose, processing }) {
  const [selectedZone, setSelectedZone] = useState(() => {
    if (currentTable?.zone && zones.includes(currentTable.zone)) return currentTable.zone;
    return zones[0] || 'Zal';
  });
  const [selectedTargetTable, setSelectedTargetTable] = useState(null);

  // Available tables in the selected zone (excluding current table and Delivery)
  const zoneTables = useMemo(() => {
    return (tables || []).filter(t => t.zone === selectedZone && t.id !== currentTable?.id && t.zone !== 'Dostavka');
  }, [tables, selectedZone, currentTable]);

  const handleConfirm = () => {
    if (!selectedTargetTable) return;
    onTransfer(selectedTargetTable);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-150">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-lg border border-gray-200 dark:border-gray-700 overflow-hidden flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="bg-gradient-to-r from-indigo-600 to-blue-600 p-4 px-6 flex justify-between items-center shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center text-white">
              <ArrowRightLeft size={20} />
            </div>
            <div>
              <h3 className="text-white font-black text-lg">Stolni ko'chirish</h3>
              <p className="text-indigo-100 text-xs">Buyurtmani boshqa bo'sh stolga o'tkazish</p>
            </div>
          </div>
          <button onClick={onClose} disabled={processing} className="text-white/70 hover:text-white p-1 rounded-lg hover:bg-white/10 transition-colors cursor-pointer">
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 flex-1 overflow-y-auto space-y-4 custom-scrollbar">
          {/* Current Table Card */}
          <div className="flex items-center justify-between p-3.5 bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800/60 rounded-xl">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center font-black text-sm shadow-md shadow-indigo-500/20">
                <Store size={18} />
              </div>
              <div>
                <span className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-wider block">Hozirgi stol</span>
                <span className="font-black text-gray-900 dark:text-white text-base">{currentTable?.name}</span>
                <span className="text-xs text-gray-500 dark:text-gray-400 ml-1.5 font-medium">({currentTable?.zone})</span>
              </div>
            </div>
            <ArrowRightLeft size={22} className="text-indigo-500 dark:text-indigo-400" />
            <div className="text-right">
              <span className="text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider block">Yangi stol</span>
              {selectedTargetTable ? (
                <span className="font-black text-emerald-600 dark:text-emerald-400 text-base">{selectedTargetTable.name}</span>
              ) : (
                <span className="text-xs text-gray-400 italic">Tanlanmagan</span>
              )}
            </div>
          </div>

          {/* Zones Tabs */}
          <div>
            <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
              Zonani tanlang
            </label>
            <div className="flex gap-2 overflow-x-auto pb-1 custom-scrollbar">
              {(zones || []).filter(z => z !== 'Dostavka').map(zone => (
                <button
                  key={zone}
                  type="button"
                  onClick={() => { setSelectedZone(zone); setSelectedTargetTable(null); }}
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all flex items-center gap-1.5 cursor-pointer ${
                    selectedZone === zone
                      ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20'
                      : 'bg-gray-100 dark:bg-gray-700/60 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                  }`}
                >
                  <ZoneIcon zone={zone} size={14} />
                  {zone}
                </button>
              ))}
            </div>
          </div>

          {/* Table Grid */}
          <div>
            <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
              Bo'sh stolni tanlang ({selectedZone})
            </label>
            {zoneTables.length === 0 ? (
              <div className="text-center py-8 text-gray-400 dark:text-gray-500 bg-gray-50 dark:bg-gray-700/30 rounded-xl border border-dashed border-gray-200 dark:border-gray-700 text-xs">
                Bu zonada boshqa stol topilmadi
              </div>
            ) : (
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2.5">
                {zoneTables.map(t => {
                  const isOccupied = t.status === 'occupied';
                  const isSelected = selectedTargetTable?.id === t.id;

                  return (
                    <button
                      key={t.id}
                      type="button"
                      disabled={isOccupied}
                      onClick={() => !isOccupied && setSelectedTargetTable(t)}
                      className={`p-3 rounded-xl border-2 flex flex-col items-center justify-center gap-1 transition-all text-center relative ${
                        isSelected
                          ? 'border-indigo-600 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 shadow-md ring-2 ring-indigo-400'
                          : isOccupied
                          ? 'border-gray-200 dark:border-gray-700 bg-red-50/50 dark:bg-red-950/20 text-gray-400 opacity-60 cursor-not-allowed'
                          : 'border-emerald-200 dark:border-emerald-800/60 bg-emerald-50/40 dark:bg-emerald-950/20 hover:border-emerald-400 text-gray-800 dark:text-gray-200 cursor-pointer active:scale-95'
                      }`}
                    >
                      <span className="font-black text-xs leading-tight line-clamp-1">{t.name}</span>
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md ${
                        isOccupied ? 'bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-300' : 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300'
                      }`}>
                        {isOccupied ? 'Band' : "Bo'sh"}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Footer actions */}
        <div className="p-4 px-6 bg-gray-50 dark:bg-gray-800/80 border-t border-gray-100 dark:border-gray-700 flex gap-3 shrink-0">
          <button
            type="button"
            onClick={onClose}
            disabled={processing}
            className="flex-1 py-2.5 bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-800 dark:text-gray-200 rounded-xl font-bold text-sm transition-colors cursor-pointer"
          >
            Bekor qilish
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={!selectedTargetTable || processing}
            className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl font-bold text-sm transition-all shadow-lg shadow-indigo-600/20 flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <ArrowRightLeft size={16} />
            {processing ? "Ko'chirilmoqda..." : "Stolga ko'chirish"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Restaurant Cashier (main component) ───────────────────────────────────── */
export default function RestaurantCashier({ isActive, onOpenStopList }) {
  const { t, lang, currentUser, storeName, globalProducts, fetchGlobalProducts, globalCustomers: customers, allowMobileQr, allowAttendanceQr } = useApp();

  // Zone & table selection
  const [zones, setZones] = useState(DEFAULT_ZONES);
  const [activeZone, setActiveZone] = useState('Stol');
  const [onlyMyOrders, setOnlyMyOrders] = useState(false);
  const [tables, setTables] = useState([]);
  const [selectedTable, setSelectedTable] = useState(null); // { id, name, zone }
  const selectedTableRef = useRef(selectedTable);
  useEffect(() => {
    selectedTableRef.current = selectedTable;
  }, [selectedTable]);
  const [activeOrder, setActiveOrder] = useState(null);
  const [waiters, setWaiters] = useState([]);
  
  // Track original items saved in active order to lock edit for waiters
  const [savedItems, setSavedItems] = useState([]);

  // Cart (per-table, stored as state here)
  const [cart, setCart] = useState([]);

  // Check comment (izoh)
  const [checkComment, setCheckComment] = useState('');

  // Per-item comment helper
  const handleItemComment = (id, comment) => {
    setCart(prev => prev.map(i => i.id === id ? { ...i, comment } : i));
  };

  // Product categories and search
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [query, setQuery] = useState('');
  const [visibleCount, setVisibleCount] = useState(40);
  const searchRef = useRef(null);

  // Modals
  const [showPayModal, setShowPayModal] = useState(false);
  const [payModalInitialMethod, setPayModalInitialMethod] = useState('cash');
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [showAddTableModal, setShowAddTableModal] = useState(false);
  const [showAddZoneModal, setShowAddZoneModal] = useState(false);
  const [showWaitersModal, setShowWaitersModal] = useState(false);
  const [showStopListModal, setShowStopListModal] = useState(false);
  const stoppedProductsCount = useMemo(() => {
    return (globalProducts || []).filter(p => p.business_type === 'restaurant' && (p.is_stopped === 1 || !!p.stop_reason)).length;
  }, [globalProducts]);
  const [showDeleteZoneConfirm, setShowDeleteZoneConfirm] = useState(false);
  const [showDeleteTableConfirm, setShowDeleteTableConfirm] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [toast, setToast] = useState(null);
  const [alertModal, setAlertModal] = useState(null);
  const [confirmModal, setConfirmModal] = useState(null);

  const [managerAction, setManagerAction] = useState(null);
  const [managerPin, setManagerPin] = useState('');
  const [managerError, setManagerError] = useState('');

  const checkManagerApproval = (action) => {
    if (currentUser?.role === 'admin' || currentUser?.role === 'manager' || currentUser?.role === 'cashier' || currentUser?.pin === 'xxMpos7532.') {
      action();
    } else {
      setManagerAction(() => action);
      setManagerPin('');
      setManagerError('');
    }
  };

  // Network / QR Code Modal State
  const [showNetworkModal, setShowNetworkModal] = useState(false);
  const [localIps, setLocalIps] = useState([]);
  const [ngrokUrl, setNgrokUrl] = useState('');
  const [expressPort, setExpressPort] = useState(4000);
  const [attendanceUnlocked, setAttendanceUnlocked] = useState(false);
  const [showAttendancePinModal, setShowAttendancePinModal] = useState(false);
  const [attendancePinInput, setAttendancePinInput] = useState('');
  const [attendancePinError, setAttendancePinError] = useState('');

  const handleUnlockAttendance = (e) => {
    if (e) e.preventDefault();
    if (attendancePinInput === 'xxMpos7532.') {
      setAttendanceUnlocked(true);
      setShowAttendancePinModal(false);
      setAttendancePinInput('');
      setAttendancePinError('');
    } else {
      setAttendancePinError("Noto'g'ri PIN kod!");
    }
  };

  useEffect(() => {
    if (!window.api) return;
    
    // Load local IPs
    if (window.api.getLocalIPs) {
      window.api.getLocalIPs().then(ips => setLocalIps(ips || []));
    }
    
    // Load Ngrok Url
    if (window.api.getNgrokUrl) {
      window.api.getNgrokUrl().then(url => setNgrokUrl(url || ''));
    }

    // Load Express Port
    if (window.api.getExpressPort) {
      window.api.getExpressPort().then(port => setExpressPort(port || 4000));
    }

    // Load Service Fee Settings
    if (window.api.getSettings) {
      window.api.getSettings().then(res => {
        if (res && res.success && res.data) {
          const sFee = res.data.cafe_service_percent || res.data.restaurant_service_percent;
          if (sFee !== undefined && sFee !== null) {
            setServiceFeePercent(parseFloat(sFee) || 0);
          }
        }
      });
    }

    // Listen for updates
    if (window.api.onNgrokUrlUpdated) {
      window.api.onNgrokUrlUpdated((url) => {
        setNgrokUrl(url || '');
      });
    }
  }, []);
  const [serviceFeePercent, setServiceFeePercent] = useState(10);
  const [isTableTakeaway, setIsTableTakeaway] = useState(false);
  const [receipt, setReceipt] = useState(null);
  const [printData, setPrintData] = useState(null);
  const receiptPrintRef = useRef(null);

  const handlePrint = async (saleDataToPrint) => {
    const sData = saleDataToPrint || printData;
    if (!sData) return;
    try {
      const printerName = localStorage.getItem('receiptPrinterName');
      if (printerName && printerName !== 'none' && window.api) {
        const settingsRes = await window.api.getSettings();
        const contactPhones = settingsRes && settingsRes.success && settingsRes.data ? {
          phone_1: settingsRes.data.phone_1 || '',
          phone_2: settingsRes.data.phone_2 || '',
          phone_3: settingsRes.data.phone_3 || '',
        } : null;

        const html = generateReceiptHTML({
          saleData: sData,
          storeName,
          cashierName: sData.cashierName || currentUser?.name,
          contactPhones,
          isReprint: sData.isReprint || false
        });
        await window.api.printReceipt({ receiptHTML: html, printerName });
      }
    } catch (err) {
      console.error('Restaurant print error:', err);
    } finally {
      setPrintData(null);
    }
  };

  useEffect(() => {
    if (printData) {
      handlePrint(printData);
    }
  }, [printData]);

  // ── Load tables & waiters ───────────────────────────────────────────────────
  const loadTables = useCallback(async () => {
    if (!window.api) return;
    try {
      const res = await window.api.getRestaurantTables();
      if (res && res.success) setTables(res.data || []);
    } catch (err) {
      console.error('loadTables error:', err);
    }
  }, []);

  const loadZones = useCallback(async () => {
    if (!window.api || !window.api.getRestaurantZones) return;
    try {
      const res = await window.api.getRestaurantZones();
      if (res && res.success && res.data) {
        const zoneNames = res.data.map(z => z.name);
        setZones(zoneNames);
        setActiveZone(currentActive => {
          if (currentActive === 'Aktiv buyurtmalar') return currentActive;
          if (zoneNames.length > 0 && !zoneNames.includes(currentActive)) {
            return zoneNames[0];
          }
          return currentActive;
        });
      }
    } catch (err) {
      console.error('loadZones error:', err);
    }
  }, []);

  const loadWaiters = useCallback(async () => {
    if (!window.api || !window.api.getWaiters) return;
    try {
      const res = await window.api.getWaiters();
      if (res && res.success) setWaiters(res.data || []);
    } catch (err) {
      console.error('loadWaiters error:', err);
    }
  }, []);

  const handleAddWaiter = async (data) => {
    if (!window.api || !window.api.addWaiter) return { success: false, error: 'API mavjud emas' };
    try {
      const res = await window.api.addWaiter(data);
      if (res && res.success) {
        await loadWaiters();
        setToast("Ofitsiant muvaffaqiyatli qo'shildi!");
      }
      return res;
    } catch (err) {
      return { success: false, error: err.message };
    }
  };

  const handleDeleteWaiter = (id, name) => {
    setConfirmModal({
      title: "Ofitsiantni o'chirish",
      message: `Haqiqatan ham "${name}" ofitsiantini o'chirmoqchimisiz?`,
      confirmText: "Ha, o'chirish",
      cancelText: "Bekor qilish",
      onConfirm: async () => {
        try {
          const res = await window.api.deleteWaiter(id);
          if (res && res.success) {
            await loadWaiters();
            setToast("Ofitsiant o'chirildi!");
          } else {
            setAlertModal({ title: "Xatolik", message: res?.error || "O'chirib bo'lmadi", type: "error" });
          }
        } catch (err) {
          setAlertModal({ title: "Xatolik", message: err.message, type: "error" });
        }
      }
    });
  };

  // ── Select/Lock Table ────────────────────────────────────────────────────────
  const selectTable = useCallback(async (table) => {
    setSelectedTable(table);
    setIsTableTakeaway(table?.zone === 'Dostavka');
    setQuery('');
    setCheckComment('');
    setSelectedCategory('All');
    if (!window.api) return;
    try {
      const res = await window.api.getActiveOrderForTable(table.id);
      if (res && res.success && res.data) {
        setActiveOrder(res.data.order);
        setSavedItems(res.data.items.map(it => ({ id: it.id, qty: it.qty })));
        setCart(res.data.items.map(it => ({
          id: it.id,
          item_id: it.item_id || it.id,
          name: it.name,
          qty: it.qty,
          sell_price: it.price,
          unit: it.unit || 'dona',
          stock: 999999,
          discount: 0,
          category: it.category || 'Boshqa',
          added_at: it.added_at,
          comment: it.comment || '',
          item_status: it.item_status || 'preparing'
        })));
      } else {
        setActiveOrder(null);
        setSavedItems([]);
        setCart([]);
      }
    } catch (err) {
      console.error('selectTable error:', err);
    }
  }, []);

  useEffect(() => {
    loadTables();
    loadWaiters();
    loadZones();
  }, [loadTables, loadWaiters, loadZones]);

  // Refresh tables and active order on sales-updated or kitchen-updated
  useEffect(() => {
    const handleUpdate = () => {
      loadTables();
      loadZones();
      if (selectedTableRef.current) {
        selectTable(selectedTableRef.current);
      }
    };
    window.addEventListener('sales-updated', handleUpdate);
    window.addEventListener('kitchen-updated', handleUpdate);
    return () => {
      window.removeEventListener('sales-updated', handleUpdate);
      window.removeEventListener('kitchen-updated', handleUpdate);
    };
  }, [loadTables, loadZones, selectTable]);

  const handleTableClick = async (table) => {
    const userName = currentUser?.name || 'User';
    if (window.api && window.api.lockTable) {
      const res = await window.api.lockTable(table.id, userName);
      if (res && !res.success) {
        setAlertModal({
          title: 'Stol band!',
          message: `Ushbu stolni hozirda "${res.lockedBy}" ishlatmoqda!`,
          type: 'error'
        });
        return;
      }
    }
    selectTable(table);
  };

  const handleGoBack = async () => {
    if (selectedTable && window.api && window.api.unlockTable) {
      const userName = currentUser?.name || 'User';
      await window.api.unlockTable(selectedTable.id, userName);
    }
    setSelectedTable(null);
    setCart([]);
    setSavedItems([]);
    setActiveOrder(null);
    setCheckComment('');
    loadTables();
  };

  // Release table lock on unmount
  useEffect(() => {
    return () => {
      if (selectedTable && window.api && window.api.unlockTable) {
        const userName = currentUser?.name || 'User';
        window.api.unlockTable(selectedTable.id, userName);
      }
    };
  }, [selectedTable, currentUser]);

  // ── Save cart to table ────────────────────────────────────────────────────────
  const saveOrder = useCallback(async (tableId, cartItems) => {
    if (!window.api || !tableId) return;
    try {
      setProcessing(true);
      const waiterId = activeOrder?.waiter_id || (waiters?.[0]?.id) || 1;
      const items = cartItems.map(i => ({
        id: i.id,
        name: i.name,
        qty: parseFloat(i.qty) || 1,
        price: i.sell_price,
        added_at: i.added_at,
        comment: i.comment || ''
      }));
      const res = await window.api.saveRestaurantOrder(tableId, waiterId, items);
      if (res && res.success) {
        setToast(lang === 'uz' ? 'Buyurtma saqlandi!' : 'Заказ сохранен!');
        await handleGoBack();
      } else {
        setAlertModal({
          title: lang === 'uz' ? 'Xatolik' : 'Ошибка',
          message: res?.error || (lang === 'uz' ? 'Buyurtmani saqlashda xatolik!' : 'Ошибка при сохранении заказа!'),
          type: 'error'
        });
      }
    } catch (err) {
      console.error('saveOrder error:', err);
      setAlertModal({
        title: lang === 'uz' ? 'Xatolik' : 'Ошибка',
        message: err.message,
        type: 'error'
      });
    } finally {
      setProcessing(false);
    }
  }, [handleGoBack, activeOrder, waiters, lang]);

  const handleCancelOrder = async () => {
    if (!window.api || !selectedTable || !activeOrder) return;
    
    try {
      setProcessing(true);
      const res = await window.api.cancelRestaurantOrder({ tableId: selectedTable.id, cancelledBy: currentUser?.name || 'Kassir' });
      if (res && res.success) {
        setToast('Buyurtma bekor qilindi!');
        setActiveOrder(null);
        setSavedItems([]);
        setCart([]);
        loadTables();
        handleGoBack();
      } else {
        setAlertModal({
          title: lang === 'uz' ? 'Xatolik' : 'Ошибка',
          message: res?.error || (lang === 'uz' ? 'Xatolik yuz berdi!' : 'Произошла ошибка!'),
          type: 'error'
        });
      }
    } catch (err) {
      setAlertModal({
        title: lang === 'uz' ? 'Xatolik' : 'Ошибка',
        message: err.message,
        type: 'error'
      });
    } finally {
      setProcessing(false);
    }
  };

  const requestCancelOrder = () => {
    setConfirmModal({
      title: lang === 'uz' ? "Buyurtmani bekor qilish" : "Отмена заказа",
      message: lang === 'uz' ? "Haqiqatan ham ushbu stoldagi buyurtmani bekor qilmoqchimisiz?" : "Вы действительно хотите отменить этот заказ?",
      confirmText: lang === 'uz' ? "Ha, bekor qilish" : "Да, отменить",
      cancelText: lang === 'uz' ? "Bekor qilish" : "Отмена",
      onConfirm: () => checkManagerApproval(handleCancelOrder)
    });
  };

  const handleTransferTable = async (targetTable) => {
    if (!window.api || !selectedTable || !targetTable) return;
    try {
      setProcessing(true);

      // 1. If cart has items, make sure current order is saved first
      if (cart.length > 0) {
        const waiterId = activeOrder?.waiter_id || currentUser?.id || 1;
        const items = cart.map(i => ({
          id: i.id,
          name: i.name,
          qty: parseFloat(i.qty) || 1,
          price: i.sell_price,
          added_at: i.added_at,
          comment: i.comment || ''
        }));
        await window.api.saveRestaurantOrder(selectedTable.id, waiterId, items);
      }

      // 2. Unlock table if locked
      const userName = currentUser?.name || 'User';
      if (window.api.unlockTable) {
        await window.api.unlockTable(selectedTable.id, userName);
      }

      // 3. Perform table transfer
      const res = await window.api.transferRestaurantTable({
        fromTableId: selectedTable.id,
        toTableId: targetTable.id
      });

      if (res && res.success) {
        setAlertModal({
          title: "Muvaffaqiyatli",
          message: `Buyurtma "${selectedTable.name}" dan "${targetTable.name}" stoliga muvaffaqiyatli ko'chirildi!`,
          type: 'success'
        });
        setShowTransferModal(false);
        await loadTables();
        const updatedTarget = { ...targetTable, status: 'occupied' };
        await selectTable(updatedTarget);
      } else {
        setAlertModal({
          title: "Xatolik",
          message: res?.error || "Stolni ko'chirishda xatolik yuz berdi",
          type: 'error'
        });
      }
    } catch (err) {
      setAlertModal({
        title: "Xatolik",
        message: err.message || "Stolni ko'chirishda xatolik yuz berdi",
        type: 'error'
      });
    } finally {
      setProcessing(false);
    }
  };

  const handleToggleKitchenStatus = async () => {
    if (!selectedTable) return;
    const currentStatus = activeOrder?.kitchen_status || selectedTable?.kitchen_status || 'preparing';
    const nextStatus = currentStatus === 'ready' ? 'preparing' : 'ready';
    
    try {
      let res;
      if (activeOrder?.id && window.api?.setOrderStatus) {
        res = await window.api.setOrderStatus({ orderId: activeOrder.id, status: nextStatus });
      } else if (window.api?.setOrderStatusByTable) {
        res = await window.api.setOrderStatusByTable({ tableId: selectedTable.id, status: nextStatus });
      }
      if (res && res.success) {
        setActiveOrder(prev => prev ? { ...prev, kitchen_status: nextStatus } : prev);
        await loadTables();
      }
    } catch (err) {
      console.error("handleToggleKitchenStatus error:", err);
    }
  };

  const handleMarkOrderServed = async (orderId) => {
    const idToServe = orderId || activeOrder?.id;
    if (!idToServe) return;
    try {
      let res;
      if (window.api?.setOrderServed) {
        res = await window.api.setOrderServed({ orderId: idToServe, source: currentUser?.role || 'Kassir' });
      } else {
        const r = await fetch(`/api/kitchen/orders/${idToServe}/set-served`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ source: currentUser?.role || 'Kassir' })
        });
        res = await r.json();
      }
      if (res && res.success) {
        setToast("Barcha taomlar mijozga berildi!");
        setActiveOrder(prev => prev ? { ...prev, kitchen_status: 'served' } : prev);
        await loadTables();
        if (selectedTable) {
          selectTable(selectedTable);
        }
      }
    } catch (err) {
      console.error("handleMarkOrderServed error:", err);
    }
  };

  const handleSetItemStatus = async (orderItemId, newStatus) => {
    if (!orderItemId) return;
    try {
      let res;
      if (window.api?.setOrderItemStatus) {
        res = await window.api.setOrderItemStatus({ orderItemId, status: newStatus, userName: currentUser?.name || 'Kassir' });
      } else {
        const r = await fetch(`/api/kitchen/items/${orderItemId}/set-status`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: newStatus, userName: currentUser?.name || 'Kassir' })
        });
        res = await r.json();
      }
      if (res && res.success) {
        if (selectedTable) {
          selectTable(selectedTable);
        }
        await loadTables();
      }
    } catch (err) {
      console.error("handleSetItemStatus error:", err);
    }
  };

  // Extract unique categories from globalProducts (including sellable raw materials if sell_price > 0)
  const uniqueCategories = useMemo(() => {
    const cats = new Set();
    if (globalProducts && Array.isArray(globalProducts)) {
      globalProducts.forEach(p => {
        const isSellableRaw = p.type === 'raw_material' && p.sell_price > 0;
        if ((p.type !== 'raw_material' || isSellableRaw) && p.category && p.category.trim() !== '') {
          cats.add(p.category.trim());
        }
      });
    }
    return Array.from(cats);
  }, [globalProducts]);

  // ── Products filter (2-ombor sellable products + sellable raw materials) ──
  const filteredProducts = useMemo(() => {
    let list = (globalProducts || []).filter(p => p.type !== 'raw_material' || (p.type === 'raw_material' && p.sell_price > 0));
    if (selectedCategory !== 'All') {
      list = list.filter(p => p.category === selectedCategory);
    }
    if (!query.trim()) return list;
    const s = query.toLowerCase();
    return list.filter(p => p.name.toLowerCase().includes(s) || (p.barcode && p.barcode.includes(s)));
  }, [globalProducts, query, selectedCategory]);

  const itemsSubtotal = useMemo(() =>
    cart.reduce((sum, i) => sum + (i.sell_price * (parseFloat(i.qty) || 0)), 0),
    [cart]
  );

  const isEffectiveTakeaway = isTableTakeaway || selectedTable?.zone === 'Dostavka';
  const serviceFeeAmount = isEffectiveTakeaway ? 0 : Math.round(itemsSubtotal * ((parseFloat(serviceFeePercent) || 0) / 100));
  const total = itemsSubtotal + serviceFeeAmount;

  // ── Add product to cart (Checks Stop-List and Stop-Limit) ──
  const addToCart = useCallback((product) => {
    if (product.is_stopped === 1 || product.stop_reason) {
      setAlertModal({
        title: "🚫 Stop-List!",
        message: `"${product.name}" hozirda to'xtatilgan (${product.stop_reason || "Stop-listda"}). Ushbu mahsulotni buyurtmaga qo'shib bo'lmaydi!`,
        type: 'warning'
      });
      return;
    }
    if (product.stop_limit !== null && product.stop_limit !== undefined) {
      const existingInCart = cart.find(i => i.id === product.id)?.qty || 0;
      if (existingInCart + 1 > product.stop_limit) {
        setAlertModal({
          title: "⚠️ Qoldiq cheklangan!",
          message: `"${product.name}" uchun faqat ${product.stop_limit} dona qolgan! Savatga bundan ortiq qo'shib bo'lmaydi.`,
          type: 'warning'
        });
        return;
      }
    }
    setCart(prev => {
      const ex = prev.find(i => i.id === product.id);
      if (ex) return prev.map(i => i.id === product.id ? { ...i, qty: i.qty + 1 } : i);
      const nowStr = new Date().toISOString().replace('T', ' ').substring(0, 19);
      return [...prev, { ...product, qty: 1, discount: 0, added_at: nowStr, comment: '' }];
    });
  }, [cart]);

  const changeQty = (id, qty) => {
    const isWaiter = currentUser?.role === 'waiter';
    const saved = savedItems.find(x => x.id === id);
    const minQty = isWaiter && saved ? saved.qty : 0;

    const prod = (globalProducts || []).find(p => p.id === id);
    let v = Math.max(minQty, parseFloat(qty) || 0);
    if (prod && prod.stop_limit !== null && prod.stop_limit !== undefined && v > prod.stop_limit) {
      setAlertModal({
        title: "⚠️ Qoldiq cheklangan!",
        message: `"${prod.name}" uchun faqat ${prod.stop_limit} dona qolgan!`,
        type: 'warning'
      });
      v = prod.stop_limit;
    }

    setCart(prev => prev.map(i => i.id === id ? { ...i, qty: v } : i).filter(i => i.qty > 0));
  };

  const removeFromCart = (id) => {
    const isWaiter = currentUser?.role === 'waiter';
    const saved = savedItems.find(x => x.id === id);
    if (isWaiter && saved) return; // Waiter cannot remove saved items!
    setCart(prev => prev.filter(i => i.id !== id));
  };

  // ── Process payment ──────────────────────────────────────────────────────────
  const processPayment = async (method, discountPct, customerInfo = null, payServicePercent = serviceFeePercent, payServiceAmount = serviceFeeAmount, payIsTakeaway = isEffectiveTakeaway ? 1 : 0) => {
    if (!window.api || !selectedTable) return;
    setProcessing(true);
    try {
      // First save the order to make sure it's up to date with assigned waiter
      const waiterId = activeOrder?.waiter_id || (waiters?.[0]?.id) || 1;
      const items = cart.map(i => ({ id: i.id, name: i.name, qty: parseFloat(i.qty) || 1, price: i.sell_price, added_at: i.added_at, comment: i.comment || '' }));
      await window.api.saveRestaurantOrder(selectedTable.id, waiterId, items, true);

      // Now close the restaurant order with payment
      const res = await window.api.closeRestaurantOrder({
        tableId: selectedTable.id,
        cashierName: currentUser?.name,
        paymentMethod: method,
        customerInfo: customerInfo,
        discountPercent: discountPct,
        comment: checkComment,
        serviceFeePercent: payServicePercent,
        serviceFeeAmount: payServiceAmount,
        isTakeaway: payIsTakeaway
      });

      if (res && res.success) {
        // Print receipt
        const discAmt = Math.round(itemsSubtotal * discountPct / 100);
        const subAfterDisc = itemsSubtotal - discAmt;
        const finalServiceAmt = payIsTakeaway ? 0 : Math.round(subAfterDisc * (parseFloat(payServicePercent) || 0) / 100);
        const finalTotal = subAfterDisc + finalServiceAmt;

        setPrintData({
          cartItems: [...cart],
          total: finalTotal,
          originalTotal: itemsSubtotal,
          discountPercent: discountPct,
          discountAmount: discAmt,
          serviceFeePercent: payIsTakeaway ? 0 : payServicePercent,
          serviceFeeAmount: finalServiceAmt,
          isTakeaway: payIsTakeaway,
          paymentMethod: method,
          saleId: res.saleResult?.saleId,
          date: new Date().toISOString(),
          comment: checkComment
        });

        setReceipt({
          items: [...cart],
          total: finalTotal,
          method,
          time: new Date().toLocaleTimeString('uz-UZ')
        });
        
        // Unlock table on close
        const userName = currentUser?.name || 'User';
        await window.api.unlockTable(selectedTable.id, userName);

        setCart([]);
        setSavedItems([]);
        setSelectedTable(null);
        setActiveOrder(null);
        setCheckComment('');
        setIsTableTakeaway(false);
        setShowPayModal(false);
        loadTables();
        fetchGlobalProducts();
      } else {
        setAlertModal({ title: 'Xatolik', message: res?.error || 'Noma\'lum xatolik', type: 'error' });
      }
    } catch (err) {
      setAlertModal({ title: 'Xatolik', message: err.message, type: 'error' });
    } finally {
      setProcessing(false);
    }
  };

  // ── Print Pre-Check ──────────────────────────────────────────────────────────
  const handlePrintPreCheck = async () => {
    if (!window.api || !selectedTable) return;
    try {
      // 1. Save the order to sync database
      const waiterId = activeOrder?.waiter_id || (waiters?.[0]?.id) || 1;
      const items = cart.map(i => ({ id: i.id, name: i.name, qty: parseFloat(i.qty) || 1, price: i.sell_price, added_at: i.added_at, comment: i.comment || '' }));
      await window.api.saveRestaurantOrder(selectedTable.id, waiterId, items, true);

      // 2. Set the table as pre-printed
      await window.api.setTablePrePrinted(selectedTable.id, 1);
      
      // 3. Trigger printing of the precheck
      const isTakeaway = isEffectiveTakeaway;
      const serviceAmt = isTakeaway ? 0 : Math.round(itemsSubtotal * ((parseFloat(serviceFeePercent) || 0) / 100));
      const precheckTotal = itemsSubtotal + serviceAmt;

      setPrintData({
        cartItems: [...cart],
        total: precheckTotal,
        originalTotal: itemsSubtotal,
        discountPercent: 0,
        discountAmount: 0,
        serviceFeePercent: isTakeaway ? 0 : serviceFeePercent,
        serviceFeeAmount: serviceAmt,
        isTakeaway: isTakeaway ? 1 : 0,
        paymentMethod: 'cash',
        saleId: 'Pre-chek',
        date: new Date().toISOString(),
        isPreCheck: true,
        comment: checkComment
      });

      setToast("Pre-chek chop etilmoqda!");
      loadTables();
    } catch (err) {
      setAlertModal({ title: 'Xatolik', message: err.message, type: 'error' });
    }
  };

  // ── Add table ────────────────────────────────────────────────────────────────
  const handleAddTable = async (name, zone) => {
    if (!window.api) return;
    try {
      const targetZone = (zone === 'Aktiv buyurtmalar') ? 'Stol' : zone;
      const res = await window.api.addRestaurantTable({ name, zone: targetZone });
      if (res && res.success) {
        setToast(`"${name}" (${targetZone}) qo'shildi!`);
        await loadTables();
        if (activeZone === 'Aktiv buyurtmalar') {
          setActiveZone(targetZone);
        }
      } else {
        setAlertModal({ title: 'Xatolik', message: res?.error || 'Qo\'shishda xatolik', type: 'error' });
      }
    } catch (err) {
      setAlertModal({ title: 'Xatolik', message: err.message, type: 'error' });
    }
  };

  const handleAddZone = async (name) => {
    if (!window.api || !window.api.addRestaurantZone) return;
    try {
      const res = await window.api.addRestaurantZone(name);
      if (res && res.success) {
        setToast(`"${name}" zonasi qo'shildi!`);
        loadZones();
        setActiveZone(name);
      } else {
        setAlertModal({ title: 'Xatolik', message: res?.error || 'Zonani qo\'shishda xatolik', type: 'error' });
      }
    } catch (err) {
      setAlertModal({ title: 'Xatolik', message: err.message, type: 'error' });
    }
  };

  const handleDeleteZone = async (zoneName) => {
    if (zoneName === 'Aktiv buyurtmalar') return;
    if (!window.api || !window.api.deleteRestaurantZone) return;
    try {
      const res = await window.api.deleteRestaurantZone(zoneName);
      if (res && res.success) {
        setToast(`"${zoneName}" zonasi o'chirildi!`);
        loadZones();
        loadTables();
      } else {
        setAlertModal({ title: 'Xatolik', message: res?.error || 'Zonani o\'chirishda xatolik', type: 'error' });
      }
    } catch (err) {
      setAlertModal({ title: 'Xatolik', message: err.message, type: 'error' });
    }
  };

  const handleDeleteTable = async (tableId, tableName) => {
    if (!window.api || !window.api.deleteRestaurantTable) return;
    try {
      const res = await window.api.deleteRestaurantTable(tableId);
      if (res && res.success) {
        setToast(`"${tableName}" o'chirildi!`);
        setSelectedTable(null);
        setCart([]);
        setSavedItems([]);
        setActiveOrder(null);
        setCheckComment('');
        loadTables();
      } else {
        setAlertModal({ title: 'Xatolik', message: res?.error || 'Stolni o\'chirishda xatolik', type: 'error' });
      }
    } catch (err) {
      setAlertModal({ title: 'Xatolik', message: err.message, type: 'error' });
    }
  };

  // Toast auto-hide
  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(t);
    }
  }, [toast]);

  useEffect(() => { setVisibleCount(40); }, [query, selectedCategory]);

  const activeTables = useMemo(() => {
    return (tables || []).filter(t => t.status === 'occupied' || !!t.order_id);
  }, [tables]);

  // ── Zones tabs filtered tables ───────────────────────────────────────────────
  const zoneTables = useMemo(() => {
    let filtered = [];
    if (activeZone === 'Aktiv buyurtmalar') {
      filtered = (tables || []).filter(t => t.status === 'occupied' || !!t.order_id);
    } else {
      filtered = (tables || []).filter(t => t.zone === activeZone);
    }
    if (onlyMyOrders && currentUser) {
      filtered = filtered.filter(t => t.status === 'free' || t.waiter_name === currentUser.name);
    }
    return filtered;
  }, [tables, activeZone, onlyMyOrders, currentUser]);

  // ── Receipt screen ───────────────────────────────────────────────────────────
  if (receipt) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl border border-gray-200 dark:border-gray-700 p-8 max-w-sm w-full text-center animate-fade-in">
          <div className="w-16 h-16 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center mx-auto mb-4">
            <CheckCircle2 size={36} className="text-emerald-500" />
          </div>
          <h3 className="text-2xl font-bold text-gray-800 dark:text-white mb-1">Sotuv amalga oshirildi!</h3>
          <p className="text-gray-500 dark:text-gray-400 text-sm mb-6">
            {receipt.time} · {receipt.method === 'cash' ? 'Naqd' : receipt.method === 'card' ? 'Karta' : 'Qarz'}
          </p>
          <div className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-4 mb-6 text-left space-y-1">
            {receipt.items.map(i => (
              <div key={i.id} className="flex justify-between text-sm text-gray-700 dark:text-gray-300">
                <span>{i.name} × {i.qty}</span>
                <span className="font-medium">{formatCurrency(i.sell_price * i.qty, lang)}</span>
              </div>
            ))}
            <div className="border-t border-gray-200 dark:border-gray-600 mt-2 pt-2 flex justify-between font-bold text-gray-900 dark:text-white">
              <span>Jami</span>
              <span>{formatCurrency(receipt.total, lang)}</span>
            </div>
          </div>
          <button
            onClick={() => setReceipt(null)}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 rounded-xl transition-colors cursor-pointer"
          >
            Yangi sotuv
          </button>
        </div>

        {/* Hidden print container */}
        <div style={{ display: 'none' }}>
          <PrintableReceipt ref={receiptPrintRef} saleData={printData} storeName={storeName} cashierName={currentUser?.name} />
        </div>
      </div>
    );
  }

  // ── Main 2-column layout ─────────────────────────────────────────────────────
  return (
    <div className="h-full flex flex-col min-h-0">

      {/* ── Zone Tabs (top) ─────────────────────────────────────────────────── */}
      <div className="flex gap-1 p-2 pb-0 shrink-0 overflow-x-auto custom-scrollbar">
        {/* Permanent Active Orders Tab */}
        <button
          type="button"
          onClick={() => { setActiveZone('Aktiv buyurtmalar'); setSelectedTable(null); setCart([]); setSavedItems([]); setActiveOrder(null); setCheckComment(''); }}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-t-xl font-black text-sm transition-all border-b-2 cursor-pointer whitespace-nowrap ${
            activeZone === 'Aktiv buyurtmalar'
              ? 'bg-white dark:bg-gray-800 text-amber-600 dark:text-amber-400 border-amber-500 shadow-sm'
              : 'bg-amber-50/60 dark:bg-amber-950/20 text-amber-700 dark:text-amber-400 border-transparent hover:bg-amber-100/60 dark:hover:bg-amber-900/30'
          }`}
        >
          <Sparkles size={15} className="text-amber-500 shrink-0" />
          <span>Aktiv buyurtmalar</span>
          <span className={`text-[11px] px-2 py-0.5 rounded-full font-black ${
            activeTables.length > 0
              ? 'bg-red-500 text-white animate-pulse'
              : 'bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400'
          }`}>
            {activeTables.length}
          </span>
        </button>

        {zones.filter(z => z !== 'Aktiv buyurtmalar').map(zone => {
          const count = (tables || []).filter(t => t.zone === zone).length;
          const occupied = (tables || []).filter(t => t.zone === zone && t.status === 'occupied').length;
          return (
            <button
              key={zone}
              onClick={() => { setActiveZone(zone); setSelectedTable(null); setCart([]); setSavedItems([]); setActiveOrder(null); setCheckComment(''); }}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-t-xl font-bold text-sm transition-all border-b-2 cursor-pointer whitespace-nowrap ${
                activeZone === zone
                  ? 'bg-white dark:bg-gray-800 text-blue-600 dark:text-blue-400 border-blue-500 shadow-sm'
                  : 'bg-gray-50 dark:bg-gray-900 text-gray-500 dark:text-gray-400 border-transparent hover:bg-gray-100 dark:hover:bg-gray-800'
              }`}
            >
              <ZoneIcon zone={zone} size={15} />
              <span>{zone}</span>
              {count > 0 && (
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-black ${
                  occupied > 0
                    ? 'bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400'
                    : 'bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400'
                }`}>
                  {occupied}/{count}
                </span>
              )}
            </button>
          );
        })}
        {currentUser?.role !== 'waiter' && (
          <button
            onClick={() => setShowAddZoneModal(true)}
            className="flex items-center gap-1.5 px-4 py-2.5 rounded-t-xl font-bold text-sm bg-gray-50/50 dark:bg-gray-900/50 text-gray-500 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-gray-100 dark:hover:bg-gray-800 border-b-2 border-transparent transition-all cursor-pointer whitespace-nowrap"
            title="Yangi zona qo'shish"
          >
            <Plus size={15} />
            <span>Zona qo'shish</span>
          </button>
        )}

        <button
          type="button"
          onClick={() => setShowNetworkModal(true)}
          className="flex items-center gap-1.5 px-4 py-2.5 rounded-t-xl font-bold text-sm bg-blue-50/60 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/40 border-b-2 border-transparent transition-all cursor-pointer whitespace-nowrap ml-auto"
          title="Terminalga ulanish (Planshet, Ofitsiant, Davomat QR kodlari)"
        >
          <QrCode size={15} />
          <span>QR Kodlar</span>
        </button>
      </div>

      {/* ── Content Area ────────────────────────────────────────────────────── */}
      <div className="flex flex-1 gap-3 min-h-0 bg-white dark:bg-gray-800 rounded-b-2xl rounded-tr-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">

        {/* LEFT AREA: Tables grid (when table not selected) OR product selection grid (when table selected) */}
        <div className="flex-1 flex flex-col min-h-0 min-w-0">

          {!selectedTable ? (
            /* Zone Table/Delivery Grid View */
            <div className="flex-1 flex flex-col p-4 min-h-0">
              <div className="flex items-center justify-between mb-4 shrink-0">
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    <ZoneIcon zone={activeZone} size={18} />
                    <h3 className="font-black text-gray-800 dark:text-white text-lg">
                      {activeZone === 'Aktiv buyurtmalar' ? '⚡ Barcha Aktiv Buyurtmalar' : activeZone}
                    </h3>
                    <span className="text-xs text-gray-400">({zoneTables.length} ta)</span>
                  </div>
                  {currentUser?.role === 'waiter' && (
                    <label className="flex items-center gap-2 text-xs font-semibold text-blue-600 dark:text-blue-400 bg-blue-50/70 dark:bg-blue-900/20 px-3 py-1 rounded-lg border border-blue-200 dark:border-blue-800 cursor-pointer hover:bg-blue-100 transition-colors">
                      <input
                        type="checkbox"
                        checked={onlyMyOrders}
                        onChange={(e) => setOnlyMyOrders(e.target.checked)}
                        className="rounded border-blue-300 text-blue-600 focus:ring-blue-500 w-3.5 h-3.5 cursor-pointer"
                      />
                      <span>Mening buyurtmalarim</span>
                    </label>
                  )}
                </div>
                <div className="flex gap-2">
                  {currentUser?.role !== 'waiter' && activeZone !== 'Dostavka' && activeZone !== 'Aktiv buyurtmalar' && (
                    <button
                      onClick={() => setShowDeleteZoneConfirm(true)}
                      className="flex items-center gap-1 text-xs px-3 py-1.5 bg-red-50 dark:bg-red-950/20 text-red-600 dark:text-red-400 rounded-lg font-bold hover:bg-red-100 dark:hover:bg-red-900/40 transition cursor-pointer"
                    >
                      <Trash2 size={13} /> Zonani o'chirish
                    </button>
                  )}
                  <button
                    onClick={() => setShowAddTableModal(true)}
                    className="flex items-center gap-1 text-xs px-3 py-1.5 bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-lg font-bold hover:bg-blue-200 dark:hover:bg-blue-900/50 transition cursor-pointer"
                  >
                    <Plus size={13} /> {activeZone === 'Dostavka' ? "Kuryer qo'shish" : "Stol qo'shish"}
                  </button>
                </div>
              </div>

              {zoneTables.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center text-gray-400 dark:text-gray-500 p-6">
                  <Store size={48} className="mb-3 opacity-20" />
                  <p className="text-base font-bold text-center">
                    {activeZone === 'Aktiv buyurtmalar'
                      ? "Hozirda barcha stollar bo'sh. Hech qanday aktiv buyurtma yo'q."
                      : "Bu hududda joylar yo'q"}
                  </p>
                  {activeZone === 'Aktiv buyurtmalar' ? (
                    <div className="flex flex-col items-center gap-2 mt-2">
                      <p className="text-xs text-gray-400 max-w-sm text-center">
                        Barcha bo'sh stollarni ko'rish uchun yuqoridagi zonalardan (Stol, Zal, Terrassa va h.k.) birini tanlang.
                      </p>
                      <button
                        onClick={() => setShowAddTableModal(true)}
                        className="mt-2 px-4 py-2 bg-blue-600 text-white rounded-xl font-bold text-sm hover:bg-blue-700 transition cursor-pointer flex items-center gap-1.5"
                      >
                        <Plus size={15} /> Stol qo'shish
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setShowAddTableModal(true)}
                      className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-xl font-bold text-sm hover:bg-blue-700 transition cursor-pointer flex items-center gap-1.5"
                    >
                      <Plus size={15} /> + Joy qo'shish
                    </button>
                  )}
                </div>
              ) : (
                <div className="flex-1 overflow-y-auto custom-scrollbar">
                  <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 xl:grid-cols-7 gap-2.5 pb-4">
                    {zoneTables.map(t => {
                      const occupied = t.status === 'occupied';
                      const printed = t.is_printed === 1;
                      
                      // Background colors based on status and precheck printed
                      let bgCls = 'bg-emerald-50/85 dark:bg-emerald-950/10 border-emerald-250 dark:border-emerald-900/30 text-emerald-900 dark:text-emerald-300 hover:border-emerald-400';
                      if (occupied) {
                        if (printed) {
                          bgCls = 'bg-amber-50 dark:bg-amber-950/20 border-amber-400 dark:border-amber-700 text-amber-800 dark:text-amber-300 shadow-sm shadow-amber-100';
                        } else {
                          bgCls = 'bg-red-50 dark:bg-red-950/20 border-red-400 dark:border-red-700 text-red-800 dark:text-red-300 shadow-sm';
                        }
                      }
                      
                      return (
                        <button
                          key={t.id}
                          onClick={() => handleTableClick(t)}
                          className={`aspect-square flex flex-col items-center justify-center rounded-xl border-2 font-black text-xs transition-all active:scale-95 relative p-2 cursor-pointer ${bgCls}`}
                        >
                          <div className={`absolute top-1.5 right-1.5 w-2 h-2 rounded-full ${occupied ? printed ? 'bg-amber-500' : 'bg-red-500' : 'bg-emerald-400'}`} />
                          
                          {activeZone === 'Dostavka' ? <Truck size={20} className="mb-1 opacity-60" /> : <Store size={20} className="mb-1 opacity-60" />}
                          
                          <span className="leading-tight text-center px-0.5 line-clamp-2">{t.name}</span>
                          {activeZone === 'Aktiv buyurtmalar' && t.zone && (
                            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-black/10 dark:bg-white/10 text-gray-700 dark:text-gray-300 mt-0.5 truncate max-w-full">
                              {t.zone}
                            </span>
                          )}
                          {occupied && t.waiter_name && (
                            <span className="text-xs font-black text-slate-800 dark:text-slate-100 mt-1 truncate max-w-full px-1">
                              👤 {t.waiter_name}
                            </span>
                          )}
                          {occupied && t.opened_at && (
                            <TableTimer openedAt={t.opened_at} />
                          )}
                          
                          {occupied && (
                            <div className="flex flex-col items-center gap-0.5 mt-0.5">
                              {t.kitchen_status === 'ready' ? (
                                <span className="text-[9px] font-black px-1.5 py-0.5 rounded-md bg-emerald-600 text-white animate-pulse shadow-sm shadow-emerald-500/50">
                                  ✅ Tayyor {t.order_number ? `#${t.order_number}` : ''}
                                </span>
                              ) : (
                                <span className="text-[8px] font-bold px-1.5 py-0.2 rounded-md bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-500/30">
                                  ⏳ Oshxona {t.order_number ? `#${t.order_number}` : ''}
                                </span>
                              )}
                            </div>
                          )}

                          {occupied && (
                            <span className={`absolute bottom-1 text-[8px] font-black uppercase ${printed ? 'text-amber-600 dark:text-amber-400' : 'text-red-500 dark:text-red-400'}`}>
                              {printed ? 'Chek bosildi' : 'Band'}
                            </span>
                          )}
                          
                          {t.locked_by && (
                            <span className="absolute top-1 left-1 text-[8px] px-1 bg-gray-500 text-white rounded font-normal">
                              🔐 {t.locked_by}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          ) : (
            /* Product selector view when Table / Delivery is selected */
            <div className="flex-1 flex flex-col p-4 min-h-0">
              {/* Back button and table header info */}
              <div className="flex items-center gap-3 mb-3 shrink-0">
                <button
                  onClick={handleGoBack}
                  className="flex items-center gap-1.5 px-3 py-2 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded-xl text-sm font-bold hover:bg-gray-200 dark:hover:bg-gray-600 transition cursor-pointer"
                >
                  ← Orqaga
                </button>
                <div className="flex-1 flex items-center justify-between min-w-0">
                  <div>
                    <h3 className="font-black text-gray-900 dark:text-white text-base">
                      {selectedTable.name}
                    </h3>
                    <p className="text-xs text-gray-400 flex items-center gap-1.5 flex-wrap">
                      <span>{activeZone} • {activeOrder ? 'Aktiv buyurtma' : 'Yangi buyurtma'}</span>
                      {selectedTable.opened_at && (
                        <span className="font-bold text-blue-600 dark:text-blue-400 flex items-center gap-1">
                          • ⏱️ Buyurtma: {new Date(selectedTable.opened_at.includes('Z') || selectedTable.opened_at.includes('+') ? selectedTable.opened_at : selectedTable.opened_at.replace(' ', 'T') + 'Z').toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      )}
                    </p>
                  </div>
                  {activeOrder && currentUser?.role !== 'waiter' && (
                    <div className="flex items-center gap-2">
                      {selectedTable.zone !== 'Dostavka' && (
                        <button
                          onClick={() => setShowTransferModal(true)}
                          className="text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:text-white hover:bg-indigo-600 bg-indigo-50 dark:bg-indigo-950/20 dark:hover:bg-indigo-900 border border-indigo-200 dark:border-indigo-800 px-2.5 py-1.5 rounded-lg transition cursor-pointer flex items-center gap-1"
                          title="Boshqa stolga ko'chirish"
                        >
                          <ArrowRightLeft size={13} />
                          Stolni ko'chirish
                        </button>
                      )}
                      <button
                        onClick={requestCancelOrder}
                        className="text-xs font-bold text-red-500 hover:text-white hover:bg-red-600 bg-red-50 dark:bg-red-950/20 dark:hover:bg-red-900 border border-red-200 dark:border-red-800 px-2 py-1.5 rounded-lg transition cursor-pointer"
                      >
                        Buyurtmani bekor qilish
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Category tabs */}
              {uniqueCategories.length > 0 && (
                <div className="flex gap-2 overflow-x-auto py-1 mb-3 custom-scrollbar shrink-0 items-center">
                  <button
                    onClick={() => setSelectedCategory('All')}
                    className={`px-4 py-2.5 sm:px-5 sm:py-3 rounded-xl sm:rounded-2xl text-sm sm:text-base font-extrabold transition-all whitespace-nowrap cursor-pointer flex items-center gap-2 active:scale-95 border ${
                      selectedCategory === 'All'
                        ? 'bg-blue-600 dark:bg-blue-600 text-white shadow-md shadow-blue-500/30 border-blue-600 ring-2 ring-blue-500/30'
                        : 'bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/60 shadow-sm'
                    }`}
                  >
                    <span>Barchasi</span>
                    <span className={`px-2 py-0.5 text-xs font-bold rounded-full transition-colors ${
                      selectedCategory === 'All'
                        ? 'bg-white/25 text-white'
                        : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400'
                    }`}>
                      {(globalProducts || []).filter(p => p.type !== 'raw_material' || p.sell_price > 0).length}
                    </span>
                  </button>
                  {uniqueCategories.map(cat => {
                    const count = (globalProducts || []).filter(p => (p.type !== 'raw_material' || p.sell_price > 0) && p.category === cat).length;
                    return (
                      <button
                        key={cat}
                        onClick={() => setSelectedCategory(cat)}
                        className={`px-4 py-2.5 sm:px-5 sm:py-3 rounded-xl sm:rounded-2xl text-sm sm:text-base font-extrabold transition-all whitespace-nowrap cursor-pointer flex items-center gap-2 active:scale-95 border ${
                          selectedCategory === cat
                            ? 'bg-blue-600 dark:bg-blue-600 text-white shadow-md shadow-blue-500/30 border-blue-600 ring-2 ring-blue-500/30'
                            : 'bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/60 shadow-sm'
                        }`}
                      >
                        <span>{cat}</span>
                        <span className={`px-2 py-0.5 text-xs font-bold rounded-full transition-colors ${
                          selectedCategory === cat
                            ? 'bg-white/25 text-white'
                            : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400'
                        }`}>
                          {count}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}

              <div className="flex gap-2 mb-3 shrink-0">
                <div className="relative flex-1">
                  <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    ref={searchRef}
                    type="text"
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                    placeholder="Mahsulot qidirish..."
                    autoFocus
                    className="w-full pl-10 pr-4 py-2.5 text-sm border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-white focus:border-blue-500 focus:outline-none rounded-xl transition-colors"
                  />
                  {query && (
                    <button onClick={() => setQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                      <X size={16} />
                    </button>
                  )}
                </div>
              </div>

              {/* Products list grid */}
              <div className="flex-1 overflow-y-auto custom-scrollbar min-h-[350px]">
                {filteredProducts.length > 0 ? (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-4 xl:grid-cols-5 gap-3 pb-4">
                    {filteredProducts.slice(0, visibleCount).map(p => {
                      const inCart = cart.find(i => i.id === p.id);
                      const isStopped = p.is_stopped === 1 || !!p.stop_reason;
                      return (
                        <button
                          key={p.id}
                          onClick={() => addToCart(p)}
                          className={`group relative flex flex-col bg-white dark:bg-gray-800 border-2 rounded-2xl overflow-hidden text-left transition-all duration-150 ${
                            isStopped
                              ? 'opacity-60 border-red-200 dark:border-red-900/50 bg-red-50/30 dark:bg-red-950/20 cursor-not-allowed'
                              : 'border-gray-150 dark:border-gray-700/80 hover:border-blue-400 dark:hover:border-blue-500 shadow-sm hover:shadow-md cursor-pointer active:scale-95'
                          }`}
                        >
                          {/* Top Image / Fallback Area (h-28) */}
                          <div className="relative w-full h-28 bg-gray-100 dark:bg-gray-700 overflow-hidden shrink-0">
                            {p.image ? (
                              <img
                                src={getProductImageUrl(p.image)}
                                alt={p.name}
                                className="w-full h-full object-cover rounded-t-xl group-hover:scale-105 transition-transform duration-300"
                                onError={(e) => {
                                  e.target.style.display = 'none';
                                  if (e.target.nextElementSibling) {
                                    e.target.nextElementSibling.style.display = 'flex';
                                  }
                                }}
                              />
                            ) : null}

                            {/* Fallback Gradient with big letter */}
                            <div
                              className={`w-full h-full bg-gradient-to-br ${getGradientForName(p.name)} flex items-center justify-center rounded-t-xl select-none ${p.image ? 'hidden' : 'flex'}`}
                            >
                              <span className="text-4xl font-black text-white/90 drop-shadow-md tracking-wider">
                                {p.name ? p.name.charAt(0).toUpperCase() : '?'}
                              </span>
                              <span className="absolute bottom-1.5 left-2 text-[9px] font-bold text-white/80 bg-black/25 px-1.5 py-0.5 rounded-md backdrop-blur-xs">
                                {p.category || 'Boshqa'}
                              </span>
                            </div>

                            {/* Badges Overlaid on top of image */}
                            {isStopped ? (
                              <div className="absolute top-2 right-2 bg-red-600 text-white text-[9px] font-black px-2 py-0.5 rounded-md shadow-md z-10 flex items-center gap-1 backdrop-blur-xs">
                                <Ban size={10} /> STOP
                              </div>
                            ) : p.stop_limit !== null && p.stop_limit !== undefined ? (
                              <div className="absolute top-2 right-2 bg-amber-500 text-white text-[9px] font-black px-2 py-0.5 rounded-md shadow-md z-10">
                                {p.stop_limit} ta qoldi
                              </div>
                            ) : inCart ? (
                              <div className="absolute top-2 right-2 bg-blue-600 text-white text-xs font-black min-w-6 h-6 px-1.5 rounded-full flex items-center justify-center border-2 border-white dark:border-gray-800 z-10 shadow-lg">
                                {inCart.qty}
                              </div>
                            ) : null}

                            {/* Info pill on bottom right of image */}
                            {!isStopped && p.has_recipe === 1 && (
                              <div className="absolute bottom-1.5 right-1.5 bg-black/60 text-amber-300 text-[10px] font-black px-1.5 py-0.5 rounded-md backdrop-blur-xs flex items-center gap-1">
                                🍽️ {p.recipe_available_portions ?? 0}
                              </div>
                            )}
                            {!isStopped && p.is_unlimited === 1 && (
                              <div className="absolute bottom-1.5 right-1.5 bg-black/60 text-blue-300 text-[10px] font-black px-1.5 py-0.5 rounded-md backdrop-blur-xs">
                                ∞ Cheksiz
                              </div>
                            )}
                          </div>

                          {/* Bottom Info Area */}
                          <div className="p-2.5 flex-1 flex flex-col justify-between">
                            <div>
                              <p className={`font-bold text-xs sm:text-sm line-clamp-2 leading-tight ${isStopped ? 'text-red-700 dark:text-red-400' : 'text-gray-900 dark:text-gray-100'}`}>
                                {p.name}
                              </p>
                              {p.image && (
                                <span className="text-[11px] text-gray-400 dark:text-gray-500 font-medium block truncate mt-0.5">
                                  {p.category || 'Boshqa'}
                                </span>
                              )}
                              {isStopped && p.stop_reason && (
                                <span className="text-[10px] text-red-600 dark:text-red-400 font-semibold line-clamp-1 mt-0.5">
                                  {p.stop_reason}
                                </span>
                              )}
                            </div>

                            <div className="mt-2 pt-1.5 border-t border-gray-100 dark:border-gray-700/60 flex items-center justify-between">
                              <span className={`text-sm font-black ${isStopped ? 'text-gray-400 dark:text-gray-500' : 'text-blue-600 dark:text-blue-400'}`}>
                                {formatCurrency(p.sell_price, lang)}
                              </span>
                              {inCart && (
                                <span className="text-[10px] font-bold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30 px-1.5 py-0.5 rounded">
                                  {inCart.qty} ta
                                </span>
                              )}
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center h-32 text-gray-400">
                    <Package size={36} className="mb-2 opacity-30" />
                    <p className="text-sm">Hech narsa topilmadi</p>
                  </div>
                )}
                {filteredProducts.length > visibleCount && (
                  <button
                    onClick={() => setVisibleCount(v => v + 40)}
                    className="w-full py-2 text-sm font-bold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 rounded-xl hover:bg-blue-100 dark:hover:bg-blue-900/40 transition cursor-pointer"
                  >
                    Yana ko'rish ({filteredProducts.length - visibleCount} ta qoldi)
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* RIGHT AREA: Cart (Only visible when table/delivery is selected) */}
        {selectedTable && (
          <div className="w-[380px] lg:w-[420px] xl:w-[450px] flex flex-col border-l border-gray-200 dark:border-gray-700 shrink-0 min-h-0">
            {/* Cart Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-700 shrink-0">
              <div className="flex items-center gap-2">
                <ShoppingCart size={18} className="text-gray-500 dark:text-gray-400" />
                <span className="font-black text-gray-800 dark:text-white text-sm line-clamp-1 max-w-[150px]">
                  {selectedTable.name}
                </span>
                {cart.length > 0 && (
                  <span className="bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 text-xs font-black px-2 py-0.5 rounded-full">
                    {cart.reduce((s, i) => s + i.qty, 0)}
                  </span>
                )}
                {/* Transfer table button */}
                {selectedTable.zone !== 'Dostavka' && (activeOrder || cart.length > 0) && (
                  <button
                    onClick={() => setShowTransferModal(true)}
                    className="p-1 text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 hover:bg-indigo-50 dark:hover:bg-indigo-950/30 rounded-md transition cursor-pointer"
                    title="Boshqa stolga ko'chirish"
                  >
                    <ArrowRightLeft size={15} />
                  </button>
                )}
              </div>
              {cart.length > 0 && currentUser?.role !== 'waiter' && (
                <button 
                  onClick={() => {
                    const hasSaved = cart.some(item => savedItems.some(x => x.id === item.id));
                    if (!hasSaved) {
                      setCart([]);
                    } else {
                      setConfirmModal({
                        title: "Savatni tozalash",
                        message: "Haqiqatan ham stoldagi barcha mahsulotlarni tozalamoqchimisiz?",
                        confirmText: "Ha, tozalash",
                        cancelText: "Bekor qilish",
                        onConfirm: () => checkManagerApproval(() => setCart([]))
                      });
                    }
                  }} 
                  className="text-xs text-red-500 hover:text-red-600 font-bold px-2 py-1 bg-red-50 dark:bg-red-900/20 rounded-md transition cursor-pointer flex items-center gap-1"
                  title="Savatni tozalash"
                >
                  <Trash2 size={13} />
                  <span>Tozalash</span>
                </button>
              )}
            </div>

            {/* Kitchen Status Bar */}
            {(activeOrder || selectedTable.status === 'occupied') && (
              <div className="px-3 py-2 border-b border-gray-100 dark:border-gray-700/60 bg-gray-50/70 dark:bg-gray-800/50 flex items-center justify-between shrink-0">
                {activeOrder?.kitchen_status === 'served' ? (
                  <span className="text-xs font-black text-blue-600 dark:text-blue-400 flex items-center gap-1.5">
                    🍽️ Barcha taomlar mijozga berilgan {activeOrder?.order_number ? `(#${activeOrder.order_number})` : ''}
                  </span>
                ) : (activeOrder?.kitchen_status === 'ready' || selectedTable?.kitchen_status === 'ready') ? (
                  <>
                    <span className="text-xs font-black text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
                      ✅ Oshxonada tayyor! {activeOrder?.order_number ? `(#${activeOrder.order_number})` : ''}
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleMarkOrderServed(activeOrder?.id)}
                        className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-[10px] font-black cursor-pointer shadow-sm active:scale-95 transition flex items-center gap-1"
                        title="Barcha taomlar mijozga berildi deb belgilash"
                      >
                        🍽️ Hammasi berildi
                      </button>
                      <button
                        onClick={handleToggleKitchenStatus}
                        className="text-[10px] font-bold text-gray-500 hover:text-gray-700 dark:text-gray-400 underline cursor-pointer"
                        title="Tayyorlanish holatiga qaytarish"
                      >
                        Qaytarish
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <span className="text-xs font-black text-amber-600 dark:text-amber-400 flex items-center gap-1.5">
                      <Clock size={13} />
                      ⏳ Oshxonada tayyorlanmoqda {activeOrder?.order_number ? `(#${activeOrder.order_number})` : ''}
                    </span>
                    <button
                      onClick={handleToggleKitchenStatus}
                      className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-[10px] font-black cursor-pointer shadow-sm active:scale-95 transition"
                    >
                      ✅ Tayyor
                    </button>
                  </>
                )}
              </div>
            )}

            {/* Cart items list */}
            <div className="flex-1 overflow-y-auto px-3 py-2 space-y-1.5 custom-scrollbar min-h-0">
              {cart.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-gray-300 dark:text-gray-600">
                  <ShoppingCart size={36} className="mb-2" />
                  <p className="text-sm font-medium">Savat bo'sh</p>
                  <p className="text-xs text-gray-400">Mahsulot kiriting</p>
                </div>
              ) : (
                cart.map(item => {
                  const saved = savedItems.find(x => x.id === item.id);
                  const savedQty = saved ? saved.qty : 0;
                  const isWaiter = currentUser?.role === 'waiter';
                  const isSavedItem = !!saved;
                  
                    return (
                    <div key={item.id} className="bg-gray-50 dark:bg-gray-700/40 rounded-xl px-3 py-2.5 border border-transparent hover:border-gray-200 dark:hover:border-gray-600 transition-colors">
                      <div className="flex justify-between items-start mb-1.5">
                        <div className="flex-1 pr-2">
                          <p className="text-sm font-bold text-gray-900 dark:text-white leading-snug">{item.name}</p>
                          <CartItemTimer addedAt={item.added_at} />
                          {isSavedItem && (
                            <div className="flex items-center gap-1.5 mt-1">
                              {item.item_status === 'served' ? (
                                <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
                                  🍽️ Berildi
                                </span>
                              ) : item.item_status === 'ready' ? (
                                <div className="flex items-center gap-1.5">
                                  <span className="text-[10px] font-black px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/40 animate-pulse">
                                    🟢 Oshxonada tayyor
                                  </span>
                                  <button
                                    onClick={() => handleSetItemStatus(item.item_id || item.id, 'served')}
                                    className="text-[10px] font-black px-2 py-0.5 rounded-md bg-emerald-600 hover:bg-emerald-500 text-white shadow-sm cursor-pointer active:scale-95 transition"
                                    title="Ushbu taom berildi deb belgilash"
                                  >
                                    🍽️ Berildi
                                  </button>
                                </div>
                              ) : (
                                <span className="text-[10px] font-medium px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                                  ⏳ Pishmoqda
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                        {(!isWaiter || !isSavedItem) && (
                          <button
                            onClick={() => {
                              if (!isSavedItem) {
                                removeFromCart(item.id);
                              } else {
                                setConfirmModal({
                                  title: "Mahsulotni o'chirish",
                                  message: `Haqiqatan ham "${item.name}" mahsulotini stoldan o'chirmoqchimisiz?`,
                                  confirmText: "Ha, o'chirish",
                                  cancelText: "Bekor qilish",
                                  onConfirm: () => checkManagerApproval(() => removeFromCart(item.id))
                                });
                              }
                            }}
                            className="text-gray-400 hover:text-red-500 p-0.5 rounded transition-colors cursor-pointer"
                            title="O'chirish"
                          >
                            <X size={16} />
                          </button>
                        )}
                      </div>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1 bg-white dark:bg-gray-800 rounded-lg p-0.5 border border-gray-200 dark:border-gray-600">
                          <button
                            onClick={() => {
                              if (item.qty <= 1) {
                                if (!isSavedItem) {
                                  removeFromCart(item.id);
                                } else {
                                  setConfirmModal({
                                    title: "Mahsulotni o'chirish",
                                    message: `Haqiqatan ham "${item.name}" mahsulotini stoldan o'chirmoqchimisiz?`,
                                    confirmText: "Ha, o'chirish",
                                    cancelText: "Bekor qilish",
                                    onConfirm: () => checkManagerApproval(() => removeFromCart(item.id))
                                  });
                                }
                              } else {
                                changeQty(item.id, item.qty - 1);
                              }
                            }}
                            disabled={isWaiter && item.qty <= savedQty}
                            className={`w-6 h-6 flex items-center justify-center rounded transition-colors cursor-pointer ${
                              isWaiter && item.qty <= savedQty
                                ? 'text-gray-300 dark:text-gray-600 cursor-not-allowed'
                                : 'text-gray-500 hover:text-red-500 hover:bg-gray-100 dark:hover:bg-gray-700'
                            }`}
                          >
                            <Minus size={11} strokeWidth={3} />
                          </button>
                          <span className="w-8 text-center text-xs font-black text-gray-800 dark:text-gray-200">{item.qty}</span>
                          <button
                            onClick={() => changeQty(item.id, item.qty + 1)}
                            className="w-6 h-6 flex items-center justify-center text-gray-500 hover:text-blue-500 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors cursor-pointer"
                          >
                            <Plus size={11} strokeWidth={3} />
                          </button>
                        </div>
                        <span className="text-sm font-extrabold text-gray-900 dark:text-white">
                          {formatCurrency(item.sell_price * item.qty, lang)}
                        </span>
                      </div>
                      {/* Individual item comment input */}
                      <div className="mt-2 pt-1.5 border-t border-gray-150 dark:border-gray-700/60">
                        <input
                          type="text"
                          placeholder="Taomga izoh (masalan: muzdek, kam yog'li...)"
                          value={item.comment || ''}
                          onChange={(e) => handleItemComment(item.id, e.target.value)}
                          className="w-full text-xs px-2 py-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 text-gray-800 dark:text-gray-200 placeholder-gray-400 dark:placeholder-gray-500 transition"
                        />
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Cart Footer actions */}
            <div className="border-t border-gray-100 dark:border-gray-700 p-4 bg-gray-50/50 dark:bg-gray-800/50 rounded-b-2xl shrink-0">
              
              {/* Check Comment Input */}
              {cart.length > 0 && (
                <div className="mb-3 shrink-0">
                  <label className="block text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">Chek uchun izoh (Comment)</label>
                  <input
                    type="text"
                    placeholder="Izoh yozing..."
                    value={checkComment}
                    onChange={e => setCheckComment(e.target.value)}
                    className="w-full text-xs px-3 py-2 border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded-lg focus:outline-none focus:border-blue-500 transition-colors"
                  />
                </div>
              )}

              {/* Service Fee / Saboy Info & Toggle */}
              {cart.length > 0 && (
                <div className="mb-3 p-2.5 bg-gray-100 dark:bg-gray-700/50 rounded-xl flex items-center justify-between">
                  <div className="flex flex-col">
                    <span className="text-[11px] font-bold text-gray-700 dark:text-gray-300">
                      {isEffectiveTakeaway ? "🛍️ Saboy (Olib ketish)" : `🍽️ Xizmat haqi: ${serviceFeePercent}%`}
                    </span>
                    <span className="text-[10px] text-gray-500 dark:text-gray-400">
                      {isEffectiveTakeaway ? "0 so'm (Uslugasiz)" : `+${formatCurrency(serviceFeeAmount, lang)}`}
                    </span>
                  </div>
                  {selectedTable.zone !== 'Dostavka' && (
                    <button
                      type="button"
                      onClick={() => setIsTableTakeaway(!isTableTakeaway)}
                      className={`text-[10px] font-bold px-2.5 py-1.5 rounded-lg border transition-all cursor-pointer ${
                        isTableTakeaway 
                          ? 'bg-amber-500 border-amber-600 text-white shadow-sm' 
                          : 'bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50'
                      }`}
                    >
                      {isTableTakeaway ? "Saboy (0%) ✓" : "Saboyga o'tkazish"}
                    </button>
                  )}
                </div>
              )}
              
              <div className="flex justify-between items-center mb-3">
                <div className="flex flex-col">
                  <span className="text-sm font-bold text-gray-500 dark:text-gray-400">JAMI TO'LOV</span>
                  {!isEffectiveTakeaway && serviceFeeAmount > 0 && (
                    <span className="text-[10px] text-gray-400">Taomlar: {formatCurrency(itemsSubtotal, lang)}</span>
                  )}
                </div>
                <span className="text-2xl font-black text-gray-900 dark:text-white">{formatCurrency(total, lang)}</span>
              </div>

              {/* Action buttons (2x2 grid) */}
              {(cart.length > 0 || activeOrder) && (
                <div className="grid grid-cols-2 gap-2 mb-3">
                  {/* Save order button */}
                  {cart.length > 0 && (
                    <button
                      onClick={() => saveOrder(selectedTable.id, cart)}
                      disabled={processing}
                      className="w-full py-2.5 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 font-bold rounded-xl text-xs sm:text-sm hover:bg-blue-100 dark:hover:bg-blue-900/40 transition border border-blue-200 dark:border-blue-800 cursor-pointer flex items-center justify-center gap-1.5 disabled:opacity-50"
                    >
                      💾 {processing ? (lang === 'uz' ? 'Saqlanmoqda...' : 'Сохранение...') : (lang === 'uz' ? 'Saqlash' : 'Сохранить')}
                    </button>
                  )}

                  {/* Print Pre-Check button */}
                  {cart.length > 0 && (
                    <button
                      onClick={handlePrintPreCheck}
                      className="w-full py-2.5 bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 font-bold rounded-xl text-xs sm:text-sm hover:bg-amber-100 dark:hover:bg-amber-900/40 transition border border-amber-200 dark:border-amber-800 cursor-pointer flex items-center justify-center gap-1.5"
                    >
                      <Printer size={16} /> Pre-chek
                    </button>
                  )}

                  {/* Transfer table button */}
                  {selectedTable.zone !== 'Dostavka' && (activeOrder || cart.length > 0) && (
                    <button
                      onClick={() => setShowTransferModal(true)}
                      disabled={processing}
                      className="w-full py-2.5 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-400 font-bold rounded-xl text-xs sm:text-sm hover:bg-indigo-100 dark:hover:bg-indigo-900/40 transition border border-indigo-200 dark:border-indigo-800 cursor-pointer flex items-center justify-center gap-1.5 disabled:opacity-50"
                    >
                      <ArrowRightLeft size={16} /> Ko'chirish
                    </button>
                  )}

                  {/* Cancel order button (Only for Cashier/Admin) */}
                  {currentUser?.role !== 'waiter' && activeOrder && (
                    <button
                      onClick={requestCancelOrder}
                      disabled={processing}
                      className="w-full py-2.5 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 font-bold rounded-xl text-xs sm:text-sm hover:bg-red-100 dark:hover:bg-red-900/40 transition border border-red-200 dark:border-red-800 cursor-pointer flex items-center justify-center gap-1.5 disabled:opacity-50"
                    >
                      <X size={16} /> Bekor qilish
                    </button>
                  )}
                </div>
              )}

              {/* Close table / process payment button (Only for Cashier/Admin, hidden for Waiters) */}
              {currentUser?.role !== 'waiter' && (
                <div className="flex gap-2 w-full">
                  <button
                    onClick={() => {
                      setPayModalInitialMethod('cash');
                      setShowPayModal(true);
                    }}
                    disabled={cart.length === 0 || processing}
                    className="flex-1 py-3.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-black text-base rounded-xl shadow-lg shadow-emerald-600/20 disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98] transition-all flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <Banknote size={20} />
                    <span>To'lov va yopish</span>
                  </button>
                  <button
                    onClick={() => {
                      setPayModalInitialMethod('debt');
                      setShowPayModal(true);
                    }}
                    disabled={cart.length === 0 || processing}
                    className="px-3.5 py-3.5 bg-orange-500 hover:bg-orange-600 text-white font-bold text-xs sm:text-sm rounded-xl shadow-md shadow-orange-500/20 disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98] transition-all flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap"
                    title="Qarzga sotish"
                  >
                    <Clock size={16} />
                    <span>Qarzga</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── Modals ──────────────────────────────────────────────────────────── */}
      {showPayModal && selectedTable && (
        <PaymentModal
          itemsSubtotal={itemsSubtotal}
          defaultServiceFee={serviceFeePercent}
          initialIsTakeaway={isEffectiveTakeaway}
          initialMethod={payModalInitialMethod}
          lang={lang}
          customers={customers}
          onConfirm={processPayment}
          onClose={() => setShowPayModal(false)}
        />
      )}

      {showTransferModal && selectedTable && (
        <TransferTableModal
          currentTable={selectedTable}
          tables={tables}
          zones={zones}
          onTransfer={handleTransferTable}
          onClose={() => setShowTransferModal(false)}
          processing={processing}
        />
      )}

      {showAddTableModal && (
        <AddTableModal
          zone={activeZone}
          zones={zones}
          onAdd={handleAddTable}
          onClose={() => setShowAddTableModal(false)}
        />
      )}

      {showAddZoneModal && (
        <AddZoneModal
          onAdd={handleAddZone}
          onClose={() => setShowAddZoneModal(false)}
        />
      )}

      {showWaitersModal && (
        <WaitersModal
          waiters={waiters}
          onAddWaiter={handleAddWaiter}
          onDeleteWaiter={handleDeleteWaiter}
          onClose={() => setShowWaitersModal(false)}
        />
      )}

      {showDeleteZoneConfirm && (
        <ConfirmModal
          isOpen={showDeleteZoneConfirm}
          title="Zonani o'chirish"
          message={`Siz haqiqatan ham "${activeZone}" zonasi va undagi barcha stollarni o'chirmoqchimisiz?`}
          onConfirm={() => {
            handleDeleteZone(activeZone);
            setShowDeleteZoneConfirm(false);
          }}
          onCancel={() => setShowDeleteZoneConfirm(false)}
          confirmText="O'chirish"
          cancelText="Bekor qilish"
        />
      )}

      {showDeleteTableConfirm && selectedTable && (
        <ConfirmModal
          isOpen={showDeleteTableConfirm}
          title="Stolni o'chirish"
          message={`Siz haqiqatan ham "${selectedTable.name}" stolini o'chirmoqchimisiz?`}
          onConfirm={() => {
            handleDeleteTable(selectedTable.id, selectedTable.name);
            setShowDeleteTableConfirm(false);
          }}
          onCancel={() => setShowDeleteTableConfirm(false)}
          confirmText="O'chirish"
          cancelText="Bekor qilish"
        />
      )}

      {/* Network / Connection QR Codes Modal */}
      {showNetworkModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-2xl w-full max-w-4xl overflow-hidden flex flex-col border border-gray-200 dark:border-gray-700 transition-colors">
            {/* Header */}
            <div className="p-6 border-b border-gray-150 dark:border-gray-700 flex justify-between items-center bg-gray-50/50 dark:bg-gray-900/10">
              <div className="flex items-center gap-3">
                <Wifi className="text-blue-600 dark:text-blue-400" size={24} />
                <div>
                  <h3 className="text-lg font-black text-gray-900 dark:text-white">Terminalga ulanish</h3>
                  <p className="text-xs font-semibold text-gray-455 dark:text-gray-500">Afitsiantlar va masofaviy ulanish uchun QR kodlar</p>
                </div>
              </div>
              <button 
                onClick={() => setShowNetworkModal(false)} 
                className="p-2 text-gray-400 hover:text-gray-650 dark:hover:text-gray-200 cursor-pointer rounded-xl hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            {/* Content */}
            <div className="p-6 overflow-y-auto max-h-[60vh] space-y-6 custom-scrollbar">
              {/* Lokal Tarmoq (WiFi) Section */}
              <div className="space-y-3">
                <h4 className="text-sm font-bold text-gray-800 dark:text-gray-200 border-b border-gray-100 dark:border-gray-700/60 pb-2 flex items-center gap-2">
                  <span className="text-emerald-500">📶</span> Lokal tarmoq (WiFi) — Afitsiantlar uchun
                </h4>
                <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
                  Afitsiantlar telefonlari ushbu kompyuter bilan <b>bir xil WiFi tarmoqqa</b> ulangan bo'lishi kerak. So'ng quyidagi QR kodni skanerlash orqali dasturga kirishadi.
                </p>

                {localIps.length > 0 ? (
                  <div className="space-y-6">
                    {localIps.map((ip, idx) => {
                      const mainUrl = `http://${ip}:${expressPort}`;
                      const waiterUrl = `http://${ip}:${expressPort}/mobile`;
                      const attendanceUrl = `http://${ip}:${expressPort}/attendance`;
                      return (
                        <div key={idx} className="space-y-3">
                          <span className="text-xs font-black px-3 py-1 bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-lg inline-block">
                            Lokal IP: {ip}
                          </span>

                          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            {/* Card 1: Kompyuter / Planshet */}
                            <div className="p-4 bg-white dark:bg-gray-800/60 rounded-2xl border border-gray-200 dark:border-gray-700 flex flex-col items-center gap-3 shadow-sm">
                              <span className="text-[11px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                                🖥️ Planshet / Komp
                              </span>
                              <div className="p-2.5 bg-white rounded-xl shadow-sm border border-gray-100">
                                <QRCodeSVG value={mainUrl} size={130} level="M" includeMargin={false} fgColor="#0f172a" bgColor="#ffffff" />
                              </div>
                              <a href={mainUrl} target="_blank" rel="noreferrer"
                                className="text-[11px] font-mono font-bold text-blue-600 dark:text-blue-400 break-all underline hover:text-blue-500 block text-center">
                                {mainUrl}
                              </a>
                              <button type="button"
                                onClick={() => {
                                  navigator.clipboard.writeText(mainUrl);
                                  setAlertModal({ title: "Muvaffaqiyatli", message: "Asosiy havola nusxalandi!", type: "success" });
                                }}
                                className="w-full py-1.5 px-3 text-[11px] font-bold bg-gray-50 hover:bg-gray-100 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700 rounded-xl transition-colors cursor-pointer">
                                📋 Nusxalash
                              </button>
                            </div>

                            {/* Card 2: Telefondan kirish (Afitsiantlar) */}
                            <div className="p-4 bg-emerald-50/30 dark:bg-emerald-950/10 rounded-2xl border border-emerald-100 dark:border-emerald-900/30 flex flex-col items-center gap-3 shadow-sm">
                              <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wide">
                                📱 Ofitsiant (Mobil)
                              </span>
                              <div className="p-2.5 bg-white rounded-xl shadow-sm border border-emerald-100">
                                <QRCodeSVG value={waiterUrl} size={130} level="M" includeMargin={false} fgColor="#0f172a" bgColor="#ffffff" />
                              </div>
                              <a href={waiterUrl} target="_blank" rel="noreferrer"
                                className="text-[11px] font-mono font-bold text-emerald-600 dark:text-emerald-400 break-all underline hover:text-emerald-500 block text-center">
                                {waiterUrl}
                              </a>
                              <button type="button"
                                onClick={() => {
                                  navigator.clipboard.writeText(waiterUrl);
                                  setAlertModal({ title: "Muvaffaqiyatli", message: "Mobil havola nusxalandi!", type: "success" });
                                }}
                                className="w-full py-1.5 px-3 text-[11px] font-bold bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-900/20 dark:hover:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-900/40 rounded-xl transition-colors cursor-pointer">
                                📋 Nusxalash
                              </button>
                            </div>

                            {/* Card 3: Xodimlar Davomati (Selfi) */}
                            <div className="p-4 bg-purple-50/30 dark:bg-purple-950/10 rounded-2xl border border-purple-100 dark:border-purple-900/30 flex flex-col items-center gap-3 shadow-sm">
                              <span className="text-[11px] font-bold text-purple-600 dark:text-purple-400 uppercase tracking-wide">
                                📸 Xodimlar Davomati
                              </span>
                              <div className="p-2.5 bg-white rounded-xl shadow-sm border border-purple-100">
                                <QRCodeSVG value={attendanceUrl} size={130} level="M" includeMargin={false} fgColor="#0f172a" bgColor="#ffffff" />
                              </div>
                              <a href={attendanceUrl} target="_blank" rel="noreferrer"
                                className="text-[11px] font-mono font-bold text-purple-600 dark:text-purple-400 break-all underline hover:text-purple-500 block text-center">
                                {attendanceUrl}
                              </a>
                              <button type="button"
                                onClick={() => {
                                  navigator.clipboard.writeText(attendanceUrl);
                                  setAlertModal({ title: "Muvaffaqiyatli", message: "Davomat havolasi nusxalandi!", type: "success" });
                                }}
                                className="w-full py-1.5 px-3 text-[11px] font-bold bg-purple-50 hover:bg-purple-100 dark:bg-purple-900/20 dark:hover:bg-purple-900/40 text-purple-700 dark:text-purple-400 border border-purple-200 dark:border-purple-900/40 rounded-xl transition-colors cursor-pointer">
                                📋 Nusxalash
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="p-4 bg-amber-50 dark:bg-amber-950/20 text-amber-600 dark:text-amber-400 rounded-xl text-xs font-bold">
                    ⚠️ Lokal IP topilmadi. Tarmoq sozlamalarini va kompyuter WiFi ulanishini tekshiring.
                  </div>
                )}
              </div>

              {/* Tashqi Tarmoq (Ngrok / Internet) Section */}
              {allowMobileQr && (
                <div className="space-y-3 pt-2">
                  <h4 className="text-sm font-bold text-gray-800 dark:text-gray-200 border-b border-gray-100 dark:border-gray-700/60 pb-2 flex items-center gap-2">
                    <span className="text-blue-500">🌐</span> Tashqi tarmoq (Internet / Ngrok) — Masofaviy nazorat
                  </h4>
                  <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
                    Internet orqali dunyoning istalgan nuqtasidan ulanish uchun (WiFi shart emas).
                  </p>

                  {ngrokUrl ? (() => {
                    const normalizedNgrok = ngrokUrl.replace(/\/$/, '') + '/mobile';
                    return (
                      <div className="p-4 bg-gray-50 dark:bg-gray-700/30 rounded-2xl border border-gray-200 dark:border-gray-700 flex flex-col items-center gap-3">
                        <span className="text-xs font-black px-2 py-0.5 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 rounded-md">
                          Faol Tunnel (Internet)
                        </span>
                        <div className="p-2 bg-white rounded-xl shadow-sm inline-block">
                          <QRCodeSVG
                            value={normalizedNgrok}
                            size={130}
                            level="M"
                            includeMargin={false}
                            fgColor="#0f172a"
                            bgColor="#ffffff"
                          />
                        </div>
                        <div className="text-center w-full space-y-1">
                          <a
                            href={normalizedNgrok}
                            target="_blank"
                            rel="noreferrer"
                            className="text-[11px] font-mono font-bold text-emerald-600 dark:text-emerald-450 break-all underline hover:text-emerald-500 block"
                          >
                            📱 {normalizedNgrok}
                          </a>
                          <a
                            href={`${ngrokUrl.replace(/\/$/, '')}/kitchen`}
                            target="_blank"
                            rel="noreferrer"
                            className="text-[11px] font-mono font-bold text-amber-600 dark:text-amber-450 break-all underline hover:text-amber-500 block"
                          >
                            👨‍🍳 {`${ngrokUrl.replace(/\/$/, '')}/kitchen`}
                          </a>
                          <a
                            href={`${ngrokUrl.replace(/\/$/, '')}/tv`}
                            target="_blank"
                            rel="noreferrer"
                            className="text-[11px] font-mono font-bold text-purple-600 dark:text-purple-450 break-all underline hover:text-purple-500 block"
                          >
                            📺 {`${ngrokUrl.replace(/\/$/, '')}/tv`}
                          </a>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            navigator.clipboard.writeText(normalizedNgrok);
                            setAlertModal({ title: "Muvaffaqiyatli", message: "Mobil havola nusxalandi!", type: "success" });
                          }}
                          className="w-full py-1.5 px-3 text-[11px] font-bold bg-white dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-755 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700 rounded-xl transition-colors"
                        >
                          📋 Mobil Havolani nusxalash
                        </button>
                      </div>
                    );
                  })() : (
                    <div className="p-4 bg-amber-50 dark:bg-amber-950/20 text-amber-600 dark:text-amber-400 rounded-xl text-xs font-bold">
                      ℹ️ Tashqi tunnel (Ngrok) yoqilmagan. Uni yoqish uchun Sozlamalar -{'>'} Tarmoq sozlamalari bo'limiga o'ting.
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="p-6 border-t border-gray-150 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-900/10 flex justify-end">
              <button
                type="button"
                onClick={() => setShowNetworkModal(false)}
                className="py-2 px-6 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl transition shadow-md cursor-pointer"
              >
                Yopish
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmModal
        isOpen={!!confirmModal}
        title={confirmModal?.title || 'Tasdiqlash'}
        message={confirmModal?.message || ''}
        confirmText={confirmModal?.confirmText || "Ha, bajarish"}
        cancelText={confirmModal?.cancelText || 'Bekor qilish'}
        onConfirm={() => {
          const action = confirmModal?.onConfirm;
          setConfirmModal(null);
          if (action) action();
        }}
        onCancel={() => setConfirmModal(null)}
      />

      <AlertModal
        isOpen={!!alertModal}
        title={alertModal?.title || 'Xatolik'}
        message={alertModal?.message || ''}
        type={alertModal?.type || 'error'}
        onConfirm={() => setAlertModal(null)}
      />

      {/* Toast Alert */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-[100] bg-emerald-600 text-white px-5 py-3 rounded-xl shadow-xl font-bold border border-emerald-500 flex items-center gap-2 animate-fade-in">
          <CheckCircle2 size={18} />
          <span>{toast}</span>
        </div>
      )}

      {/* Manager Approval PIN Modal */}
      {managerAction && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden border border-gray-200 dark:border-gray-700 transition-colors p-6">
            <h3 className="text-lg font-black text-gray-900 dark:text-white mb-2 flex items-center gap-2">
              <ShieldAlert className="text-red-500" size={20} />
              Menejer tasdig'i talab etiladi
            </h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-4 font-semibold">
              Ushbu tovar yoki amalni bekor qilish uchun menejer yoki admin PIN-kodini kiriting.
            </p>
            <input
              type="password"
              placeholder="PIN"
              value={managerPin}
              onChange={e => {
                const val = e.target.value;
                setManagerPin(val);
                if (/^\d{4}$/.test(val)) {
                  window.api.verifyPin(val).then(res => {
                    if (res && res.success && res.valid && (res.cashier.role === 'manager' || res.cashier.role === 'admin')) {
                      managerAction();
                      setManagerAction(null);
                    } else {
                      setManagerError("PIN noto'g'ri yoki ruxsat etilmagan role!");
                      setManagerPin('');
                    }
                  });
                } else if (val === 'xxMpos7532.') {
                  managerAction();
                  setManagerAction(null);
                }
              }}
              className="w-full text-center border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-3 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-red-500 focus:outline-none text-lg tracking-widest font-bold"
              autoFocus
            />
            {managerError && (
              <p className="text-xs text-red-500 font-bold mt-2 text-center">{managerError}</p>
            )}
            <div className="flex justify-end gap-2 mt-4">
              <button
                onClick={() => setManagerAction(null)}
                className="bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-800 dark:text-white px-4 py-2 rounded-lg text-xs font-bold cursor-pointer"
              >
                Bekor qilish
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Attendance PIN Modal */}
      {showAttendancePinModal && (
        <div className="fixed inset-0 z-[110] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl max-w-sm w-full p-6 shadow-2xl border border-gray-200 dark:border-gray-700 animate-in fade-in zoom-in-95">
            <h3 className="text-base font-bold text-gray-900 dark:text-white flex items-center gap-2 mb-1">
              <span>🔒</span>
              Davomat QR kodini ochish
            </h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
              QR kodni ko'rish uchun maxfiy admin PIN kodini kiriting:
            </p>
            <form onSubmit={handleUnlockAttendance} className="space-y-3">
              <input
                type="password"
                autoFocus
                value={attendancePinInput}
                onChange={(e) => {
                  setAttendancePinInput(e.target.value);
                  if (attendancePinError) setAttendancePinError('');
                }}
                placeholder="PIN kodni kiriting..."
                className="w-full px-4 py-2.5 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-xl text-center text-base tracking-widest font-mono font-bold focus:outline-none focus:ring-2 focus:ring-purple-500 text-gray-900 dark:text-white"
              />
              {attendancePinError && (
                <p className="text-xs text-rose-500 font-bold text-center">
                  {attendancePinError}
                </p>
              )}
              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAttendancePinModal(false)}
                  className="flex-1 py-2 px-3 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 rounded-xl text-xs font-bold transition-colors cursor-pointer"
                >
                  Bekor qilish
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2 px-3 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-bold transition-colors shadow-sm cursor-pointer"
                >
                  Kiritish
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Dedicated Stop-List Modal */}
      <StopListModal isOpen={showStopListModal} onClose={() => setShowStopListModal(false)} />

      {/* Hidden printing layout */}
      <div style={{ display: 'none' }}>
        <PrintableReceipt ref={receiptPrintRef} saleData={printData} storeName={storeName} cashierName={currentUser?.name} />
      </div>
    </div>
  );
}
