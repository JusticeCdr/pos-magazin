import { useState, useEffect, useMemo, useRef, memo } from 'react';
import { Calendar, Search, Filter, ArrowUpCircle, ArrowDownCircle, RefreshCw, Minus, ChevronLeft, ChevronRight, Plus, Lock, Unlock, Smartphone, Monitor, Sparkles } from 'lucide-react';
import { useApp } from './context/AppContext';
import { formatCurrency } from './utils';
import { AlertModal } from './components/Modals';

// ── Action meta ───────────────────────────────────────────────────────────────
const ACTION_META = {
  kirim:      { label: 'Kirim',              color: 'text-emerald-600 dark:text-emerald-400',  bg: 'bg-emerald-50 dark:bg-emerald-900/30',  icon: ArrowUpCircle },
  sotuv:      { label: 'Sotuv',              color: 'text-blue-600   dark:text-blue-400',      bg: 'bg-blue-50   dark:bg-blue-900/30',      icon: ArrowDownCircle },
  sotuv_qarz: { label: 'Sotuv (Qarzga)',     color: 'text-orange-600 dark:text-orange-400',    bg: 'bg-orange-50 dark:bg-orange-900/30',    icon: ArrowDownCircle },
  qarz_tulov: { label: 'Qarz to\'lovi',      color: 'text-green-600  dark:text-green-400',     bg: 'bg-green-50  dark:bg-green-900/30',     icon: ArrowUpCircle },
  vozvrat:    { label: 'Qaytarish',          color: 'text-amber-600  dark:text-amber-400',     bg: 'bg-amber-50  dark:bg-amber-900/30',     icon: RefreshCw },
  spisaniya:  { label: 'Hisobdan chiqarish', color: 'text-red-600    dark:text-red-400',       bg: 'bg-red-50    dark:bg-red-900/30',       icon: Minus },
  ochirildi:  { label: 'O\'chirildi',        color: 'text-red-700    dark:text-red-500',       bg: 'bg-red-100   dark:bg-red-950/40',       icon: Minus },
  tahrirlash: { label: 'Tahrirlash',         color: 'text-purple-600 dark:text-purple-400',    bg: 'bg-purple-50 dark:bg-purple-900/30',    icon: Filter },
  smena_yopildi: { label: 'Smena yopildi',   color: 'text-rose-600   dark:text-rose-400',      bg: 'bg-rose-50   dark:bg-rose-900/30',      icon: Lock },
  smena_ochildi: { label: 'Smena ochildi',   color: 'text-emerald-600 dark:text-emerald-400',  bg: 'bg-emerald-50 dark:bg-emerald-900/30',  icon: Unlock },
};

const PAGE_SIZE = 50;

export default memo(function InventoryHistory({ isActive }) {
  const { lang } = useApp();

  // ── Filter state ──────────────────────────────────────────────────────────
  const [startDate, setStartDate]     = useState('');
  const [endDate, setEndDate]         = useState('');
  const [actionType, setActionType]   = useState('');
  const [productSearch, setProductSearch] = useState('');

  // ── Data state ────────────────────────────────────────────────────────────
  const [logs, setLogs]       = useState([]);
  const [total, setTotal]     = useState(0);
  const [page, setPage]       = useState(1);
  const [loading, setLoading] = useState(false);
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const [error, setError]     = useState(null);
  const [alertState, setAlertState] = useState({ isOpen: false, title: '', message: '' });

  useEffect(() => {
    if (startDate && endDate && startDate.length === 10 && endDate.length === 10) {
      if (startDate > endDate) {
        setAlertState({
          isOpen: true,
          title: "Sana diapazoni noto'g'ri",
          message: "Boshlanish sanasi tugash sanasidan keyin bo'lishi mumkin emas!"
        });
        setEndDate(startDate);
      }
    }
  }, [startDate, endDate]);

  // ── Fetch ─────────────────────────────────────────────────────────────────
  const lastFiltersRef = useRef({ startDate: '', endDate: '', actionType: '', productSearch: '' });

  const fetchLogs = async (p = 1, append = false, showLoader = false) => {
    if (!window.api) return;
    if (showLoader || isInitialLoad) {
      setLoading(true);
    }
    setError(null);
    try {
      const res = await window.api.getInventoryLogs({
        page: p,
        pageSize: PAGE_SIZE,
        startDate,
        endDate,
        actionType,
        productSearch,
      });
      if (res && res.success) {
        if (append) {
          setLogs(prev => [...prev, ...res.data]);
        } else {
          setLogs(res.data);
        }
        setTotal(res.total);
        setPage(p);
      } else {
        setError(res?.error || 'Xatolik yuz berdi');
      }
    } catch (err) {
      setError('IPC xatosi: ' + err.message);
    } finally {
      setIsInitialLoad(false);
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isActive) {
      lastFiltersRef.current = { startDate, endDate, actionType, productSearch };
      fetchLogs(1, false, false);
    }
  }, [isActive, startDate, endDate, actionType, productSearch]);

  useEffect(() => {
    const handleRefreshLogs = () => {
      if (isActive) {
        fetchLogs(1, false, false);
      }
    };
    window.addEventListener('products-updated', handleRefreshLogs);
    window.addEventListener('sales-updated', handleRefreshLogs);
    return () => {
      window.removeEventListener('products-updated', handleRefreshLogs);
      window.removeEventListener('sales-updated', handleRefreshLogs);
    };
  }, [isActive, startDate, endDate, actionType, productSearch]);

  // ── Logs are fetched server-side including search keyword ──────────────────
  const filteredLogs = logs;

  // ── Formatters ────────────────────────────────────────────────────────────
  const fmtDate = (sqliteStr) => {
    if (!sqliteStr) return '—';
    const d = new Date(sqliteStr.includes('T') ? sqliteStr : sqliteStr.replace(' ', 'T') + 'Z');
    return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' })
      + ' ' + d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  };

  const clearFilters = () => {
    setStartDate('');
    setEndDate('');
    setActionType('');
    setProductSearch('');
  };

  // ── Clear + Refresh ──
  const handleRefreshClick = () => {
    fetchLogs(page, false, true);
  };
  
  const hasFilters = !!(startDate || endDate || actionType || productSearch);

  const inputCls = 'border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-colors';

  return (
    <div className="h-full flex flex-col gap-4 transition-colors">

      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-gray-800 dark:text-white">Harakatlar jurnali</h2>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mt-0.5">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Omboringizning to'liq kirim-chiqim tarixi
          </p>
          <span className="text-[11px] font-bold text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-950/20 px-3 py-1 rounded-md border border-orange-100 dark:border-orange-900/30 w-fit shrink-0">
            * Tizimda yozuvlar 3 oy (90 kun) davomida saqlanadi va undan keyin avtomatik tarzda o'chib ketadi.
          </span>
        </div>
      </div>

      {/* ── Filters ── */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm p-4 flex flex-wrap gap-3 items-end">

        {/* Date From */}
        <div>
          <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-1">Dan</label>
          <div className="relative">
            <Calendar size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
              className={inputCls + ' pl-8 w-36'} />
          </div>
        </div>

        {/* Date To */}
        <div>
          <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-1">Gacha</label>
          <div className="relative">
            <Calendar size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
              className={inputCls + ' pl-8 w-36'} />
          </div>
        </div>

        {/* Product search */}
        <div className="flex-1 min-w-[180px]">
          <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-1">Mahsulot</label>
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input type="text" placeholder="Mahsulot nomi..."
              value={productSearch} onChange={e => setProductSearch(e.target.value)}
              className={inputCls + ' pl-8 w-full'} />
          </div>
        </div>

        {/* Action type */}
        <div>
          <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-1">Harakat turi</label>
          <div className="relative">
            <Filter size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <select value={actionType} onChange={e => setActionType(e.target.value)}
              className={inputCls + ' pl-8 pr-8 appearance-none cursor-pointer min-w-[180px]'}>
              <option value="">Barchasi</option>
              <option value="kirim">Kirim (Приход)</option>
              <option value="sotuv">Sotuv (Продажа)</option>
              <option value="sotuv_qarz">Sotuv (Qarzga)</option>
              <option value="qarz_tulov">Qarz to'lovi</option>
              <option value="vozvrat">Qaytarish (Возврат)</option>
              <option value="spisaniya">Hisobdan chiqarish</option>
              <option value="ochirildi">O'chirildi (Удалено)</option>
              <option value="smena_yopildi">Smena yopilishi</option>
              <option value="smena_ochildi">Smena ochilishi</option>
            </select>
          </div>
        </div>

        {/* Clear + Refresh */}
        <div className="flex gap-2 ml-auto">
          {hasFilters && (
            <button onClick={clearFilters}
              className="px-3 py-2 text-sm font-semibold text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/40 rounded-lg transition-colors flex items-center gap-1.5">
              <Minus size={14} /> Tozalash
            </button>
          )}
          <button onClick={handleRefreshClick}
            className="px-3 py-2 text-sm font-semibold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/20 hover:bg-indigo-100 dark:hover:bg-indigo-900/40 rounded-lg transition-colors flex items-center gap-1.5">
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Yangilash
          </button>
        </div>
      </div>

      {/* ── Stats pills ── */}
      <div className="flex flex-wrap gap-2">
        {Object.entries(ACTION_META).map(([key, meta]) => {
          const count = filteredLogs.filter(r => r.action_type === key).length;
          const Icon = meta.icon;
          return (
            <button key={key} onClick={() => setActionType(actionType === key ? '' : key)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${
                actionType === key
                  ? `${meta.bg} ${meta.color} border-current ring-2 ring-current/20`
                  : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-gray-300'
              }`}>
              <Icon size={12} />
              {meta.label}
              <span className="ml-0.5 font-bold">{count}</span>
            </button>
          );
        })}
        <span className="ml-auto text-xs text-gray-400 dark:text-gray-500 self-center">
          Jami: {total} ta yozuv
        </span>
      </div>

      {/* ── Table ── */}
      <div className="flex-1 flex flex-col bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden min-h-0">

        {/* Error */}
        {error && (
          <div className="m-4 p-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700 rounded-lg text-sm text-red-700 dark:text-red-400">
            {error}
          </div>
        )}

        <div className="overflow-auto flex-1 custom-scrollbar">
          <table className="w-full text-left border-collapse">
            <thead className="bg-gray-50 dark:bg-gray-700/50 border-b border-gray-200 dark:border-gray-700 sticky top-0 z-10">
              <tr>
                <th className="py-3 px-4 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider w-[160px]">Sana / Vaqt</th>
                <th className="py-3 px-4 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Mahsulot nomi</th>
                <th className="py-3 px-4 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Harakat turi</th>
                <th className="py-3 px-4 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider text-right">Soni</th>
                <th className="py-3 px-4 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider text-right">Qoldiq</th>
                <th className="py-3 px-4 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Kassir</th>
                <th className="py-3 px-4 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Izoh</th>
              </tr>
            </thead>
            <tbody className={`divide-y divide-gray-100 dark:divide-gray-700 transition-opacity duration-150 ${loading ? 'opacity-60 pointer-events-none' : ''}`}>
              {logs.length === 0 && loading && (
                <tr>
                  <td colSpan="7" className="py-16 text-center">
                    <div className="flex items-center justify-center gap-2 text-gray-400">
                      <RefreshCw size={18} className="animate-spin" />
                      <span className="text-sm">Yuklanmoqda...</span>
                    </div>
                  </td>
                </tr>
              )}
              {logs.length === 0 && !loading && (
                <tr>
                  <td colSpan="7" className="py-16 text-center">
                    <p className="text-sm text-gray-400 dark:text-gray-500">Yozuvlar topilmadi</p>
                    {hasFilters && (
                      <button onClick={clearFilters}
                        className="mt-2 text-xs text-indigo-500 hover:underline">
                        Filtrlarni tozalash
                      </button>
                    )}
                  </td>
                </tr>
              )}
              {filteredLogs.map(row => {
                const meta = ACTION_META[row.action_type] || ACTION_META.kirim;
                const Icon = meta.icon;
                const isPositive = row.quantity_changed > 0;
                return (
                  <tr key={row.id}
                    className="hover:bg-gray-50 dark:hover:bg-gray-700/40 transition-colors group">
                    {/* Date / Time */}
                    <td className="py-2.5 px-4 text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap font-mono">
                      {fmtDate(row.created_at)}
                    </td>
                    {/* Product name */}
                    <td className="py-2.5 px-4 text-sm font-medium text-gray-800 dark:text-gray-200 max-w-[220px] truncate">
                      {row.product_name}
                    </td>
                    {/* Action badge */}
                    <td className="py-2.5 px-4">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold ${meta.bg} ${meta.color}`}>
                        <Icon size={11} />
                        {meta.label}
                      </span>
                    </td>
                    {/* Qty */}
                    <td className={`py-2.5 px-4 text-sm font-bold text-right whitespace-nowrap ${
                      row.product_id === 0 ? 'text-gray-500' : isPositive ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'
                    }`}>
                      {row.product_id === 0 ? '—' : (isPositive ? '+' : '') + row.quantity_changed}
                    </td>
                    {/* Balance after */}
                    <td className="py-2.5 px-4 text-sm text-right text-gray-700 dark:text-gray-300 font-mono whitespace-nowrap">
                      {row.product_id === 0 || row.action_type === 'qarz_tulov' ? '—' : row.balance_after}
                    </td>
                    {/* Cashier */}
                    <td className="py-2.5 px-4 text-xs text-gray-500 dark:text-gray-400">
                      {(() => {
                        const name = row.user_name || '—';
                        if (name.includes('(Mobil)')) {
                          const cleanName = name.replace('(Mobil)', '').trim();
                          return (
                            <span className="inline-flex items-center gap-1 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 px-2.5 py-0.5 rounded-full font-semibold">
                              <Smartphone size={11} className="shrink-0" />
                              {cleanName} (Mobil)
                            </span>
                          );
                        } else if (name.includes('(AI)')) {
                          const cleanName = name.replace('(AI)', '').trim();
                          return (
                            <span className="inline-flex items-center gap-1 bg-purple-50 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400 px-2.5 py-0.5 rounded-full font-semibold">
                              <Sparkles size={11} className="shrink-0" />
                              {cleanName} (AI dan kirim)
                            </span>
                          );
                        } else {
                          return (
                            <span className="inline-flex items-center gap-1 bg-gray-100 dark:bg-gray-700/50 text-gray-700 dark:text-gray-300 px-2.5 py-0.5 rounded-full">
                              <Monitor size={11} className="shrink-0 opacity-70" />
                              {name}
                            </span>
                          );
                        }
                      })()}
                    </td>
                    {/* Note */}
                    <td className="py-2.5 px-4 text-xs text-gray-600 dark:text-gray-400 max-w-[320px] whitespace-normal break-words font-normal" title={row.note || '—'}>
                      {row.note ? (
                        <span className="inline-flex items-center gap-1.5 flex-wrap">
                          <span>{row.note}</span>
                          {row.note.includes('Skidka') && (
                            <span className="shrink-0 text-[10px] bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400 px-1.5 py-0.2 rounded font-black uppercase">
                              %
                            </span>
                          )}
                        </span>
                      ) : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* ── Load More / Yana Ko'rish ── */}
        {logs.length < total && (
          <div className="border-t border-gray-200 dark:border-gray-700 px-4 py-3 flex items-center justify-between shrink-0 bg-gray-50/50 dark:bg-gray-800/50">
            <span className="text-xs text-gray-500 dark:text-gray-400 font-semibold">
              Ko'rsatilmoqda: {logs.length} / {total} ta yozuv
            </span>
            <button 
              onClick={() => fetchLogs(page + 1, true)}
              disabled={loading}
              className="flex items-center gap-1.5 px-5 py-2 text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <RefreshCw size={12} className="animate-spin" />
              ) : (
                <Plus size={12} />
              )}
              Yana ko'rish
            </button>
          </div>
        )}
        {logs.length >= total && total > 0 && (
          <div className="border-t border-gray-200 dark:border-gray-700 px-4 py-3 text-center text-xs text-gray-400 dark:text-gray-500 bg-gray-50/50 dark:bg-gray-800/50 font-medium">
            Barcha {total} ta yozuv ko'rsatildi
          </div>
        )}
      </div>

      <AlertModal
        isOpen={alertState.isOpen}
        title={alertState.title}
        message={alertState.message}
        onConfirm={() => setAlertState({ ...alertState, isOpen: false })}
      />
    </div>
  );
});
