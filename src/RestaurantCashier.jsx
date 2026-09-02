import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import {
  Search, ShoppingCart, Trash2, Plus, Minus, Banknote, CreditCard, Clock,
  X, CheckCircle2, AlertCircle, Store, Truck, ChevronRight, Users, Package, Printer, Wifi, ShieldAlert
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { useApp } from './context/AppContext';
import { formatCurrency, formatThousands } from './utils';
import { useReactToPrint } from 'react-to-print';
import { PrintableReceipt } from './components/PrintableReceipt';
import { AlertModal, ConfirmModal } from './components/Modals';

const DEFAULT_ZONES = ['Stol', 'Zal', 'Terrassa', 'Chorpoya', '2-qavat', 'Podval', 'Banket', 'Dostavka'];

/* ── Zone icon helper ──────────────────────────────────────────────────────── */
function ZoneIcon({ zone, size = 16 }) {
  if (zone === 'Dostavka') return <Truck size={size} />;
  if (zone === 'Chorpoya') return <Store size={size} />;
  return <Users size={size} />;
}

/* ── Table Timer component ─────────────────────────────────────────────────── */
function TableTimer({ openedAt }) {
  const [elapsed, setElapsed] = useState('');

  useEffect(() => {
    if (!openedAt) return;
    
    const calculateElapsed = () => {
      try {
        const openedTime = new Date(openedAt.includes('Z') || openedAt.includes('+') ? openedAt : openedAt.replace(' ', 'T') + 'Z');
        const now = new Date();
        const diffMs = now - openedTime;
        if (isNaN(diffMs) || diffMs < 0) return '';
        
        const diffMins = Math.floor(diffMs / 60000);
        const hours = Math.floor(diffMins / 60);
        const mins = diffMins % 60;
        
        if (hours > 0) {
          return `${hours}s ${mins}m`;
        }
        return `${mins}m`;
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
    <span className="text-[9px] font-black text-gray-500 dark:text-gray-400 mt-0.5">
      ⏳ {elapsed}
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
      const ss = String(dateObj.getSeconds()).padStart(2, '0');
      setFormattedTime(`${hh}:${mm}:${ss}`);
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
          setElapsed('0s');
          return;
        }
        
        const diffSecs = Math.floor(diffMs / 1000);
        const mins = Math.floor(diffSecs / 60);
        const secs = diffSecs % 60;
        
        if (mins > 0) {
          setElapsed(`${mins}m ${secs}s`);
        } else {
          setElapsed(`${secs}s`);
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
function PaymentModal({ total, onConfirm, onClose, lang, customers }) {
  const [method, setMethod] = useState('cash');
  const [tendered, setTendered] = useState('');
  const [discount, setDiscount] = useState(0);

  // Debt customer states
  const [customerSearch, setCustomerSearch] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [newCustomerName, setNewCustomerName] = useState('');
  const [newCustomerPhone, setNewCustomerPhone] = useState('');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  const discountAmt = Math.round(total * discount / 100);
  const finalTotal = total - discountAmt;
  const change = parseFloat(String(tendered).replace(/\s/g, '')) - finalTotal;

  const fmt = (v) => formatThousands(v);

  const filteredCustomers = useMemo(() => {
    if (!customerSearch.trim()) return [];
    const q = customerSearch.toLowerCase();
    return (customers || []).filter(c => c.name.toLowerCase().includes(q) || (c.phone && c.phone.includes(q)));
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
    onConfirm(method, discount, customerInfo);
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
          {/* Discount */}
          <div>
            <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">Chegirma</label>
            <div className="flex gap-2 flex-wrap">
              {[0, 5, 10, 15, 20].map(pct => (
                <button
                  key={pct}
                  onClick={() => setDiscount(pct)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-bold transition-all border ${
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

          {/* Total */}
          <div className="bg-gray-50 dark:bg-gray-700/40 rounded-xl p-4">
            {discount > 0 ? (
              <>
                <div className="flex justify-between text-sm text-gray-400 mb-1">
                  <span>Jami:</span>
                  <span className="line-through">{formatCurrency(total, lang)}</span>
                </div>
                <div className="flex justify-between text-sm text-red-500 mb-1">
                  <span>Chegirma ({discount}%):</span>
                  <span>-{formatCurrency(discountAmt, lang)}</span>
                </div>
                <div className="flex justify-between text-xl font-black text-gray-900 dark:text-white">
                  <span>To'lov:</span>
                  <span>{formatCurrency(finalTotal, lang)}</span>
                </div>
              </>
            ) : (
              <div className="flex justify-between text-2xl font-black text-gray-900 dark:text-white">
                <span>Jami:</span>
                <span>{formatCurrency(total, lang)}</span>
              </div>
            )}
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
function AddTableModal({ zone, onAdd, onClose }) {
  const [name, setName] = useState('');
  const handleSubmit = (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    onAdd(name.trim(), zone);
    onClose();
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-sm border border-gray-200 dark:border-gray-700 p-6">
        <h3 className="text-lg font-black text-gray-900 dark:text-white mb-4">
          Yangi {zone} joyi/stoli qo'shish
        </h3>
        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            type="text"
            autoFocus
            placeholder="Nomi (mas: Stol 31)"
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

/* ── Restaurant Cashier (main component) ───────────────────────────────────── */
export default function RestaurantCashier({ isActive }) {
  const { t, lang, currentUser, storeName, globalProducts, fetchGlobalProducts, globalCustomers: customers, allowMobileQr } = useApp();

  // Zone & table selection
  const [zones, setZones] = useState(DEFAULT_ZONES);
  const [activeZone, setActiveZone] = useState('Stol');
  const [onlyMyOrders, setOnlyMyOrders] = useState(false);
  const [tables, setTables] = useState([]);
  const [selectedTable, setSelectedTable] = useState(null); // { id, name, zone }
  const [activeOrder, setActiveOrder] = useState(null);
  const [waiters, setWaiters] = useState([]);
  
  // Track original items saved in active order to lock edit for waiters
  const [savedItems, setSavedItems] = useState([]);

  // Cart (per-table, stored as state here)
  const [cart, setCart] = useState([]);

  // Check comment (izoh)
  const [checkComment, setCheckComment] = useState('');

  // Product categories and search
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [query, setQuery] = useState('');
  const [visibleCount, setVisibleCount] = useState(40);
  const searchRef = useRef(null);

  // Modals
  const [showPayModal, setShowPayModal] = useState(false);
  const [showAddTableModal, setShowAddTableModal] = useState(false);
  const [showAddZoneModal, setShowAddZoneModal] = useState(false);
  const [showDeleteZoneConfirm, setShowDeleteZoneConfirm] = useState(false);
  const [showDeleteTableConfirm, setShowDeleteTableConfirm] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [toast, setToast] = useState(null);
  const [alertModal, setAlertModal] = useState(null);

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

    // Listen for updates
    if (window.api.onNgrokUrlUpdated) {
      window.api.onNgrokUrlUpdated((url) => {
        setNgrokUrl(url || '');
      });
    }
  }, []);
  const [receipt, setReceipt] = useState(null);
  const [printData, setPrintData] = useState(null);
  const receiptPrintRef = useRef(null);

  const handlePrint = useReactToPrint({
    contentRef: receiptPrintRef,
    print: async (iframe) => {
      try {
        const html = iframe.contentDocument.documentElement.outerHTML;
        const printerName = localStorage.getItem('receiptPrinterName');
        if (printerName && printerName !== 'none') {
          await window.api.printReceipt({ receiptHTML: html, printerName });
        }
      } catch (_) {}
      finally { setPrintData(null); }
    }
  });

  useEffect(() => {
    if (printData) {
      const timer = setTimeout(() => handlePrint(), 50);
      return () => clearTimeout(timer);
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

  useEffect(() => {
    loadTables();
    loadWaiters();
    loadZones();
  }, [loadTables, loadWaiters, loadZones]);

  // Refresh tables on sales-updated
  useEffect(() => {
    const h = () => {
      loadTables();
      loadZones();
    };
    window.addEventListener('sales-updated', h);
    return () => window.removeEventListener('sales-updated', h);
  }, [loadTables, loadZones]);

  // ── Select/Lock Table ────────────────────────────────────────────────────────
  const selectTable = useCallback(async (table) => {
    setSelectedTable(table);
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
          id: it.id, name: it.name, qty: it.qty,
          sell_price: it.price, unit: it.unit || 'dona', stock: 999999, discount: 0,
          category: it.category || 'Boshqa',
          added_at: it.added_at
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
    if (!window.api) return;
    try {
      const waiterId = (waiters?.[0]?.id) || 1;
      const items = cartItems.map(i => ({ id: i.id, name: i.name, qty: parseFloat(i.qty) || 1, price: i.sell_price, added_at: i.added_at }));
      const res = await window.api.saveRestaurantOrder(tableId, waiterId, items);
      if (res && res.success) {
        setToast('Buyurtma saqlandi!');
        loadTables();
      }
    } catch (err) {
      console.error('saveOrder error:', err);
    }
  }, [loadTables, waiters]);

  const handleCancelOrder = async () => {
    if (!window.api || !selectedTable || !activeOrder) return;
    if (!confirm(lang === 'uz' ? 'Haqiqatan ham ushbu buyurtmani bekor qilmoqchimisiz?' : 'Вы действительно хотите отменить этот заказ?')) return;
    
    try {
      setProcessing(true);
      const res = await window.api.cancelRestaurantOrder({ tableId: selectedTable.id, cancelledBy: currentUser?.name || 'Kassir' });
      if (res && res.success) {
        setToast('Buyurtma bekor qilindi!');
        setActiveOrder(null);
        setSavedItems([]);
        setCart([]);
        loadTables();
      } else {
        alert(lang === 'uz' ? 'Xatolik yuz berdi!' : 'Произошла ошибка!');
      }
    } catch (err) {
      console.error(err);
    } finally {
      setProcessing(false);
    }
  };

  // Extract unique categories from globalProducts
  const uniqueCategories = useMemo(() => {
    const cats = new Set();
    if (globalProducts && Array.isArray(globalProducts)) {
      globalProducts.forEach(p => {
        if (p.category && p.category.trim() !== '') {
          cats.add(p.category.trim());
        }
      });
    }
    return Array.from(cats);
  }, [globalProducts]);

  // ── Products filter ──────────────────────────────────────────────────────────
  const filteredProducts = useMemo(() => {
    let list = globalProducts || [];
    if (selectedCategory !== 'All') {
      list = list.filter(p => p.category === selectedCategory);
    }
    if (!query.trim()) return list;
    const s = query.toLowerCase();
    return list.filter(p => p.name.toLowerCase().includes(s) || (p.barcode && p.barcode.includes(s)));
  }, [globalProducts, query, selectedCategory]);

  const total = useMemo(() =>
    cart.reduce((sum, i) => sum + (i.sell_price * (parseFloat(i.qty) || 0)), 0),
    [cart]
  );

  // ── Add product to cart ──────────────────────────────────────────────────────
  const addToCart = useCallback((product) => {
    setCart(prev => {
      const ex = prev.find(i => i.id === product.id);
      if (ex) return prev.map(i => i.id === product.id ? { ...i, qty: i.qty + 1 } : i);
      const nowStr = new Date().toISOString().replace('T', ' ').substring(0, 19);
      return [...prev, { ...product, qty: 1, discount: 0, added_at: nowStr }];
    });
  }, []);

  const changeQty = (id, qty) => {
    const isWaiter = currentUser?.role === 'waiter';
    const saved = savedItems.find(x => x.id === id);
    const minQty = isWaiter && saved ? saved.qty : 0;

    const v = Math.max(minQty, parseFloat(qty) || 0);
    setCart(prev => prev.map(i => i.id === id ? { ...i, qty: v } : i).filter(i => i.qty > 0));
  };

  const removeFromCart = (id) => {
    const isWaiter = currentUser?.role === 'waiter';
    const saved = savedItems.find(x => x.id === id);
    if (isWaiter && saved) return; // Waiter cannot remove saved items!
    setCart(prev => prev.filter(i => i.id !== id));
  };

  // ── Process payment ──────────────────────────────────────────────────────────
  const processPayment = async (method, discountPct, customerInfo = null) => {
    if (!window.api || !selectedTable) return;
    setProcessing(true);
    try {
      // First save the order to make sure it's up to date
      const waiterId = (waiters?.[0]?.id) || 1;
      const items = cart.map(i => ({ id: i.id, name: i.name, qty: parseFloat(i.qty) || 1, price: i.sell_price, added_at: i.added_at }));
      await window.api.saveRestaurantOrder(selectedTable.id, waiterId, items);

      // Now close the restaurant order with payment
      const res = await window.api.closeRestaurantOrder({
        tableId: selectedTable.id,
        cashierName: currentUser?.name,
        paymentMethod: method,
        customerInfo: customerInfo,
        discountPercent: discountPct,
        comment: checkComment
      });

      if (res && res.success) {
        // Print receipt
        const discAmt = Math.round(total * discountPct / 100);
        const finalTotal = total - discAmt;
        setPrintData({
          cartItems: [...cart],
          total: finalTotal,
          originalTotal: total,
          discountPercent: discountPct,
          discountAmount: discAmt,
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
      const waiterId = (waiters?.[0]?.id) || 1;
      const items = cart.map(i => ({ id: i.id, name: i.name, qty: parseFloat(i.qty) || 1, price: i.sell_price, added_at: i.added_at }));
      await window.api.saveRestaurantOrder(selectedTable.id, waiterId, items);

      // 2. Set the table as pre-printed
      await window.api.setTablePrePrinted(selectedTable.id, 1);
      
      // 3. Trigger printing of the precheck
      setPrintData({
        cartItems: [...cart],
        total: total,
        originalTotal: total,
        discountPercent: 0,
        discountAmount: 0,
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
      const res = await window.api.addRestaurantTable({ name, zone });
      if (res && res.success) {
        setToast(`"${name}" qo'shildi!`);
        loadTables();
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

  // ── Zones tabs filtered tables ───────────────────────────────────────────────
  const zoneTables = useMemo(() => {
    let filtered = (tables || []).filter(t => t.zone === activeZone);
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
        {zones.map(zone => {
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
                    <h3 className="font-black text-gray-800 dark:text-white text-lg">{activeZone}</h3>
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
                  {currentUser?.role !== 'waiter' && activeZone !== 'Dostavka' && (
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
                <div className="flex-1 flex flex-col items-center justify-center text-gray-300 dark:text-gray-600">
                  <Store size={48} className="mb-3 opacity-20" />
                  <p className="text-base font-medium">Bu hududda joylar yo'q</p>
                  <button
                    onClick={() => setShowAddTableModal(true)}
                    className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-xl font-bold text-sm hover:bg-blue-700 transition"
                  >
                    + Joy qo'shish
                  </button>
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
                          
                          <span className="leading-tight text-center px-0.5 line-clamp-3">{t.name}</span>
                          {occupied && t.waiter_name && (
                            <span className="text-xs font-black text-slate-800 dark:text-slate-100 mt-1 truncate max-w-full px-1">
                              👤 {t.waiter_name}
                            </span>
                          )}
                          {occupied && t.opened_at && (
                            <TableTimer openedAt={t.opened_at} />
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
                    <p className="text-xs text-gray-400">{activeZone} • {activeOrder ? 'Aktiv buyurtma' : 'Yangi buyurtma'}</p>
                  </div>
                  {activeOrder && currentUser?.role !== 'waiter' && (
                    <button
                      onClick={() => checkManagerApproval(async () => {
                        if (!confirm("Ushbu buyurtmani rostdan ham bekor qilmoqchimisiz?")) return;
                        setProcessing(true);
                        try {
                          const res = await window.api.cancelRestaurantOrder({ tableId: selectedTable.id, cancelledBy: currentUser?.name });
                          if (res && res.success) {
                            setToast("Buyurtma bekor qilindi!");
                            handleGoBack();
                          } else {
                            setAlertModal({ title: 'Xatolik', message: res?.error || 'Noma\'lum xatolik', type: 'error' });
                          }
                        } catch (err) {
                          setAlertModal({ title: 'Xatolik', message: err.message, type: 'error' });
                        } finally {
                          setProcessing(false);
                        }
                      })}
                      className="text-xs font-bold text-red-500 hover:text-white hover:bg-red-600 bg-red-50 dark:bg-red-950/20 dark:hover:bg-red-900 border border-red-200 dark:border-red-800 px-2 py-1.5 rounded-lg transition cursor-pointer"
                    >
                      Buyurtmani bekor qilish
                    </button>
                  )}
                </div>
              </div>

              {/* Category tabs */}
              {uniqueCategories.length > 0 && (
                <div className="flex gap-1.5 overflow-x-auto pb-2 mb-2 custom-scrollbar shrink-0">
                  <button
                    onClick={() => setSelectedCategory('All')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
                      selectedCategory === 'All'
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-150 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                    }`}
                  >
                    Barchasi
                  </button>
                  {uniqueCategories.map(cat => (
                    <button
                      key={cat}
                      onClick={() => setSelectedCategory(cat)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
                        selectedCategory === cat
                          ? 'bg-blue-600 text-white'
                          : 'bg-gray-150 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
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

                <button
                  type="button"
                  onClick={() => setShowNetworkModal(true)}
                  title="Ulanish QR kodlari (Afitsiantlar va boshqalar)"
                  className="px-3 bg-white dark:bg-gray-805 hover:bg-gray-50 dark:hover:bg-gray-700 border border-gray-200 dark:border-gray-700 text-blue-650 dark:text-blue-400 rounded-xl flex items-center justify-center transition-colors cursor-pointer shadow-sm active:scale-95"
                >
                  <Wifi size={18} />
                </button>
              </div>

              {/* Products list grid */}
              <div className="flex-1 overflow-y-auto custom-scrollbar min-h-[350px]">
                {filteredProducts.length > 0 ? (
                  <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-4 gap-2 pb-4">
                    {filteredProducts.slice(0, visibleCount).map(p => {
                      const inCart = cart.find(i => i.id === p.id);
                      return (
                        <button
                          key={p.id}
                          onClick={() => addToCart(p)}
                          className="relative flex flex-col bg-white dark:bg-gray-800 border-2 border-gray-100 dark:border-gray-700 hover:border-blue-450 dark:hover:border-blue-500 rounded-xl p-3 text-left transition-all active:scale-[0.97] cursor-pointer"
                        >
                          {inCart && (
                            <div className="absolute -top-2 -right-2 bg-blue-500 text-white text-xs font-bold w-5 h-5 rounded-full flex items-center justify-center border-2 border-white dark:border-gray-800 z-10">
                              {inCart.qty}
                            </div>
                          )}
                          <p className="font-bold text-gray-800 dark:text-gray-100 text-xs line-clamp-2 mb-1">{p.name}</p>
                          <span className="text-xs text-gray-400 dark:text-gray-500">{p.category || 'Boshqa'}</span>
                          <span className="text-sm font-black text-blue-600 dark:text-blue-400 mt-2">
                            {formatCurrency(p.sell_price, lang)}
                          </span>
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
          <div className="w-[320px] flex flex-col border-l border-gray-200 dark:border-gray-700 shrink-0 min-h-0">
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
                {currentUser?.role !== 'waiter' && selectedTable.status === 'free' && selectedTable.zone !== 'Dostavka' && (
                  <button
                    onClick={() => setShowDeleteTableConfirm(true)}
                    className="p-1 text-red-500 hover:text-red-750 hover:bg-red-50 dark:hover:bg-red-950/20 rounded-md transition cursor-pointer"
                    title="Stolni o'chirish"
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
              {cart.length > 0 && currentUser?.role !== 'waiter' && (
                <button onClick={() => checkManagerApproval(() => setCart([]))} className="text-xs text-red-500 hover:text-red-600 font-bold px-2 py-1 bg-red-50 dark:bg-red-900/20 rounded-md transition cursor-pointer">
                  Tozalash
                </button>
              )}
            </div>

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
                          <p className="text-xs font-semibold text-gray-800 dark:text-gray-200 leading-snug">{item.name}</p>
                          <CartItemTimer addedAt={item.added_at} />
                        </div>
                        {(!isWaiter || !isSavedItem) && (
                          <button
                            onClick={() => checkManagerApproval(() => removeFromCart(item.id))}
                            className="text-gray-400 hover:text-red-500 p-0.5 rounded transition-colors cursor-pointer"
                          >
                            <X size={14} />
                          </button>
                        )}
                      </div>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1 bg-white dark:bg-gray-800 rounded-lg p-0.5 border border-gray-200 dark:border-gray-600">
                          <button
                            onClick={() => changeQty(item.id, item.qty - 1)}
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
                        <span className="text-sm font-black text-gray-900 dark:text-white">
                          {formatCurrency(item.sell_price * item.qty, lang)}
                        </span>
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
                    className="w-full px-3 py-2 text-xs border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              )}
              
              <div className="flex justify-between items-center mb-3">
                <span className="text-sm font-bold text-gray-500 dark:text-gray-400">JAMI</span>
                <span className="text-2xl font-black text-gray-900 dark:text-white">{formatCurrency(total, lang)}</span>
              </div>

              {/* Save order button */}
              {cart.length > 0 && (
                <button
                  onClick={() => saveOrder(selectedTable.id, cart)}
                  className="w-full py-2.5 mb-2 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 font-bold rounded-xl text-sm hover:bg-blue-100 dark:hover:bg-blue-900/40 transition border border-blue-200 dark:border-blue-800 cursor-pointer flex items-center justify-center gap-1.5"
                >
                  💾 Buyurtmani saqlash
                </button>
              )}

              {/* Print Pre-Check button */}
              {cart.length > 0 && (
                <button
                  onClick={handlePrintPreCheck}
                  className="w-full py-2.5 mb-2 bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 font-bold rounded-xl text-sm hover:bg-amber-100 dark:hover:bg-amber-900/40 transition border border-amber-200 dark:border-amber-800 cursor-pointer flex items-center justify-center gap-1.5"
                >
                  <Printer size={16} /> Pre-chek chop etish
                </button>
              )}

              {/* Cancel order button (Only for Cashier/Admin) */}
              {currentUser?.role !== 'waiter' && activeOrder && (
                <button
                  onClick={() => checkManagerApproval(handleCancelOrder)}
                  disabled={processing}
                  className="w-full py-2.5 mb-2 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 font-bold rounded-xl text-sm hover:bg-red-100 dark:hover:bg-red-900/40 transition border border-red-200 dark:border-red-800 cursor-pointer flex items-center justify-center gap-1.5 disabled:opacity-50"
                >
                  <X size={16} /> Buyurtmani bekor qilish
                </button>
              )}

              {/* Close table / process payment button (Only for Cashier/Admin, hidden for Waiters) */}
              {currentUser?.role !== 'waiter' && (
                <button
                  onClick={() => setShowPayModal(true)}
                  disabled={cart.length === 0 || processing}
                  className="w-full py-4 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-black text-lg rounded-xl shadow-lg shadow-emerald-600/20 disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98] transition-all flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Banknote size={22} />
                  Stolni yopish va to'lov
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── Modals ──────────────────────────────────────────────────────────── */}
      {showPayModal && selectedTable && (
        <PaymentModal
          total={total}
          lang={lang}
          customers={customers}
          onConfirm={processPayment}
          onClose={() => setShowPayModal(false)}
        />
      )}

      {showAddTableModal && (
        <AddTableModal
          zone={activeZone}
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
          <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col border border-gray-200 dark:border-gray-700 transition-colors">
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
                      return (
                        <div key={idx} className="space-y-3">
                          <span className="text-xs font-black px-3 py-1 bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-lg inline-block">
                            Lokal IP: {ip}
                          </span>

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {/* Card 1: Kompyuter / Planshet (Har doim turaveradi) */}
                            <div className="p-4 bg-white dark:bg-gray-800/60 rounded-2xl border border-gray-200 dark:border-gray-700 flex flex-col items-center gap-3 shadow-sm">
                              <span className="text-[11px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                                🖥️ Planshet / Komp
                              </span>
                              <div className="p-2.5 bg-white rounded-xl shadow-sm border border-gray-100">
                                <QRCodeSVG value={mainUrl} size={140} level="M" includeMargin={false} fgColor="#0f172a" bgColor="#ffffff" />
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
                            {allowMobileQr ? (
                              <div className="p-4 bg-orange-50/30 dark:bg-orange-950/10 rounded-2xl border border-orange-100 dark:border-orange-900/30 flex flex-col items-center gap-3 shadow-sm">
                                <span className="text-[11px] font-bold text-orange-600 dark:text-orange-400 uppercase tracking-wide">
                                  📱 Telefondan kirish (Afitsiant)
                                </span>
                                <div className="p-2.5 bg-white rounded-xl shadow-sm border border-orange-100">
                                  <QRCodeSVG value={waiterUrl} size={140} level="M" includeMargin={false} fgColor="#0f172a" bgColor="#ffffff" />
                                </div>
                                <a href={waiterUrl} target="_blank" rel="noreferrer"
                                  className="text-[11px] font-mono font-bold text-orange-600 dark:text-orange-400 break-all underline hover:text-orange-500 block text-center">
                                  {waiterUrl}
                                </a>
                                <button type="button"
                                  onClick={() => {
                                    navigator.clipboard.writeText(waiterUrl);
                                    setAlertModal({ title: "Muvaffaqiyatli", message: "Mobil havola nusxalandi!", type: "success" });
                                  }}
                                  className="w-full py-1.5 px-3 text-[11px] font-bold bg-orange-50 hover:bg-orange-100 dark:bg-orange-900/20 dark:hover:bg-orange-900/40 text-orange-700 dark:text-orange-400 border border-orange-200 dark:border-orange-900/40 rounded-xl transition-colors cursor-pointer">
                                  📋 Nusxalash
                                </button>
                              </div>
                            ) : (
                              <div className="p-4 bg-gray-50 dark:bg-gray-800/40 rounded-2xl border border-dashed border-gray-200 dark:border-gray-700 flex flex-col items-center justify-center text-center gap-2">
                                <span className="text-2xl">🔒</span>
                                <span className="text-xs font-bold text-gray-500 dark:text-gray-400">
                                  Telefondan kirish QR kodi yashiringan
                                </span>
                                <p className="text-[10px] text-gray-400 dark:text-gray-500">
                                  Sozlamalardan xxMpos7532. PIN kodi orqali ruxsat berilganda ko'rinadi.
                                </p>
                              </div>
                            )}
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
                          Faol Tunnel
                        </span>
                        <div className="p-2 bg-white rounded-xl shadow-sm inline-block">
                          <QRCodeSVG
                            value={normalizedNgrok}
                            size={140}
                            level="M"
                            includeMargin={false}
                            fgColor="#0f172a"
                            bgColor="#ffffff"
                          />
                        </div>
                        <div className="text-center w-full">
                          <a
                            href={normalizedNgrok}
                            target="_blank"
                            rel="noreferrer"
                            className="text-[11px] font-mono font-bold text-emerald-600 dark:text-emerald-450 break-all underline hover:text-emerald-500 block"
                          >
                            {normalizedNgrok}
                          </a>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            navigator.clipboard.writeText(normalizedNgrok);
                            setAlertModal({ title: "Muvaffaqiyatli", message: "Havola nusxalandi!", type: "success" });
                          }}
                          className="w-full py-1.5 px-3 text-[11px] font-bold bg-white dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-755 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700 rounded-xl transition-colors"
                        >
                          📋 Havolani nusxalash
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

      {/* Hidden printing layout */}
      <div style={{ display: 'none' }}>
        <PrintableReceipt ref={receiptPrintRef} saleData={printData} storeName={storeName} cashierName={currentUser?.name} />
      </div>
    </div>
  );
}
