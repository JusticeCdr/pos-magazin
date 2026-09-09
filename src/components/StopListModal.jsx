import { useState, useMemo } from 'react';
import { X, Search, Ban, AlertTriangle, ChefHat, Package, Play, RefreshCw } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { formatCurrency } from '../utils';

export default function StopListModal({ isOpen, onClose }) {
  const { globalProducts, fetchGlobalProducts, currentUser, lang } = useApp();
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [limitInputs, setLimitInputs] = useState({});
  const [updatingId, setUpdatingId] = useState(null);
  const [toast, setToast] = useState(null);

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  // Only restaurant dishes and sellable items (including sellable raw materials)
  const restaurantItems = useMemo(() => {
    return (globalProducts || []).filter(p => 
      p.business_type === 'restaurant' || !p.business_type || p.type === 'ready_dish'
    );
  }, [globalProducts]);

  const categories = useMemo(() => {
    const cats = new Set();
    restaurantItems.forEach(p => {
      if (p.category && p.category.trim() !== '') {
        cats.add(p.category.trim());
      }
    });
    return Array.from(cats);
  }, [restaurantItems]);

  const filteredItems = useMemo(() => {
    return restaurantItems.filter(p => {
      const matchCat = selectedCategory === 'All' || p.category === selectedCategory;
      const s = search.toLowerCase().trim();
      const matchSearch = !s || p.name.toLowerCase().includes(s) || (p.category && p.category.toLowerCase().includes(s));
      return matchCat && matchSearch;
    });
  }, [restaurantItems, selectedCategory, search]);

  const stoppedCount = useMemo(() => {
    return restaurantItems.filter(p => p.is_stopped === 1 || !!p.stop_reason).length;
  }, [restaurantItems]);

  const handleToggleStop = async (product) => {
    if (!window.api) return;
    setUpdatingId(product.id);
    const newStatus = product.is_stopped ? 0 : 1;
    try {
      const res = await window.api.setProductStopWithLimit({
        productId: product.id,
        isStopped: newStatus === 1,
        limit: null,
        reason: newStatus === 1 ? 'Kassa Stop-List oynasidan' : '',
        userName: currentUser?.name || 'Kassir'
      });
      if (res && res.success) {
        showToast(
          newStatus === 1 ? `"${product.name}" stop-listga kiritildi!` : `"${product.name}" stop-listdan chiqarildi!`,
          newStatus === 1 ? 'error' : 'success'
        );
        fetchGlobalProducts();
      } else {
        showToast(res?.error || "Xatolik yuz berdi", 'error');
      }
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setUpdatingId(null);
    }
  };

  const handleSetLimit = async (product) => {
    if (!window.api) return;
    const inputVal = limitInputs[product.id];
    const limitNum = parseFloat(inputVal);
    if (isNaN(limitNum) || limitNum <= 0) {
      showToast("Qoldiq miqdorini musbat son shaklida kiriting!", 'error');
      return;
    }

    setUpdatingId(product.id);
    try {
      const res = await window.api.setProductStopWithLimit({
        productId: product.id,
        isStopped: false,
        limit: limitNum,
        reason: `Qoldiq limit: ${limitNum} dona`,
        userName: currentUser?.name || 'Kassir'
      });
      if (res && res.success) {
        showToast(`"${product.name}" uchun limit (${limitNum} dona) belgilandi!`, 'success');
        setLimitInputs(prev => ({ ...prev, [product.id]: '' }));
        fetchGlobalProducts();
      } else {
        showToast(res?.error || "Xatolik yuz berdi", 'error');
      }
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setUpdatingId(null);
    }
  };

  const handleClearLimit = async (product) => {
    if (!window.api) return;
    setUpdatingId(product.id);
    try {
      const res = await window.api.setProductStopWithLimit({
        productId: product.id,
        isStopped: false,
        limit: null,
        reason: "Limit bekor qilindi",
        userName: currentUser?.name || 'Kassir'
      });
      if (res && res.success) {
        showToast(`"${product.name}" limiti bekor qilindi!`, 'success');
        fetchGlobalProducts();
      } else {
        showToast(res?.error || "Xatolik yuz berdi", 'error');
      }
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setUpdatingId(null);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/60 backdrop-blur-sm animate-fade-in">
      <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-2xl border border-gray-100 dark:border-gray-700 w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden">
        
        {/* Header */}
        <div className="p-5 border-b border-gray-100 dark:border-gray-700/80 bg-gray-50/50 dark:bg-gray-900/40 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 flex items-center justify-center font-black shadow-inner">
              <Ban size={24} />
            </div>
            <div>
              <h2 className="text-lg font-black text-gray-900 dark:text-white flex items-center gap-2">
                Stop-List Boshqaruvi
                {stoppedCount > 0 && (
                  <span className="text-xs bg-red-600 text-white font-black px-2 py-0.5 rounded-full animate-pulse">
                    {stoppedCount} ta to'xtatilgan
                  </span>
                )}
              </h2>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Taomlarni to'liq to'xtatish yoki donabay mahsulotlar uchun qolgan porsiya limitini belgilash
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors cursor-pointer"
          >
            <X size={20} />
          </button>
        </div>

        {/* Toast Alert */}
        {toast && (
          <div className={`px-4 py-2.5 text-xs font-bold text-white text-center transition-all ${
            toast.type === 'error' ? 'bg-red-600' : 'bg-emerald-600'
          }`}>
            {toast.msg}
          </div>
        )}

        {/* Search & Category Filter */}
        <div className="p-4 border-b border-gray-100 dark:border-gray-700 space-y-3 shrink-0 bg-white dark:bg-gray-800">
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Taom yoki mahsulot nomini qidirish..."
              className="w-full pl-10 pr-4 py-2.5 bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600 rounded-xl text-sm font-medium focus:ring-2 focus:ring-blue-500 focus:outline-none"
            />
          </div>

          {/* Category Badges */}
          <div className="flex gap-2 overflow-x-auto pb-1 custom-scrollbar">
            <button
              onClick={() => setSelectedCategory('All')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${
                selectedCategory === 'All'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
              }`}
            >
              Hammasi ({restaurantItems.length})
            </button>
            {categories.map(cat => {
              const count = restaurantItems.filter(p => p.category === cat).length;
              return (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${
                    selectedCategory === cat
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                  }`}
                >
                  {cat} ({count})
                </button>
              );
            })}
          </div>
        </div>

        {/* Items List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2.5 custom-scrollbar">
          {filteredItems.length === 0 ? (
            <div className="text-center py-12 text-gray-400 dark:text-gray-500">
              <Ban size={40} className="mx-auto mb-2 opacity-30" />
              <p className="text-sm font-bold">Mahsulotlar topilmadi</p>
            </div>
          ) : (
            filteredItems.map(product => {
              const isStopped = product.is_stopped === 1 || !!product.stop_reason;
              const hasRecipe = product.has_recipe === 1;
              const isUnlimited = product.is_unlimited === 1;
              const hasLimit = product.stop_limit !== null && product.stop_limit !== undefined;

              return (
                <div
                  key={product.id}
                  className={`p-3.5 rounded-2xl border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                    isStopped
                      ? 'bg-red-50/50 dark:bg-red-950/20 border-red-200 dark:border-red-900/40'
                      : hasLimit
                      ? 'bg-amber-50/40 dark:bg-amber-950/20 border-amber-200 dark:border-amber-900/40'
                      : 'bg-white dark:bg-gray-800/80 border-gray-200/80 dark:border-gray-700/80 hover:border-blue-200'
                  }`}
                >
                  {/* Left info */}
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                      isStopped
                        ? 'bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-400'
                        : hasRecipe
                        ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'
                        : 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300'
                    }`}>
                      {hasRecipe ? <ChefHat size={20} /> : <Package size={20} />}
                    </div>

                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="text-sm font-black text-gray-900 dark:text-white truncate">
                          {product.name}
                        </h4>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300">
                          {product.category || 'Boshqa'}
                        </span>
                        <span className="text-xs font-extrabold text-blue-600 dark:text-blue-400">
                          {formatCurrency(product.sell_price, lang)}
                        </span>
                      </div>

                      {/* Status / Residual Info */}
                      <div className="flex items-center gap-2 mt-1 text-xs flex-wrap">
                        {isStopped ? (
                          <span className="inline-flex items-center gap-1 font-black text-red-600 dark:text-red-400 bg-red-100 dark:bg-red-900/40 px-2 py-0.5 rounded-md text-[11px]">
                            <Ban size={12} />
                            {product.stop_reason || 'Stop-listda (Sotuv taqiqlangan)'}
                          </span>
                        ) : hasLimit ? (
                          <span className="inline-flex items-center gap-1 font-black text-amber-700 dark:text-amber-400 bg-amber-100 dark:bg-amber-900/40 px-2 py-0.5 rounded-md text-[11px]">
                            <AlertTriangle size={12} />
                            Cheklangan qoldiq: {product.stop_limit} {product.unit || 'dona'}
                          </span>
                        ) : hasRecipe ? (
                          <span className="inline-flex items-center gap-1 font-bold text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 px-2 py-0.5 rounded-md text-[11px]">
                            <ChefHat size={12} />
                            Mavjud: {product.recipe_available_portions ?? 0} porsiya (xom-ashyodan)
                          </span>
                        ) : isUnlimited ? (
                          <span className="inline-flex items-center gap-1 font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded-md text-[11px]">
                            ∞ Cheksiz miqdor
                          </span>
                        ) : (
                          <span className="text-gray-500 dark:text-gray-400 font-medium text-[11px]">
                            Omborda: {product.stock} {product.unit || 'dona'}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Right Actions */}
                  <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                    
                    {/* Limit setting: Only for non-recipe dishes (donabay) */}
                    {!hasRecipe && (
                      <div className="flex items-center gap-1.5">
                        {hasLimit ? (
                          <div className="flex items-center gap-1">
                            <span className="text-[11px] font-black text-purple-700 dark:text-purple-300 bg-purple-100 dark:bg-purple-900/40 px-2 py-1 rounded-lg">
                              Limit: {product.stop_limit} {product.unit || 'dona'}
                            </span>
                            <button
                              type="button"
                              disabled={updatingId === product.id}
                              onClick={() => handleClearLimit(product)}
                              className="text-[11px] font-bold px-2 py-1 rounded-lg border border-red-200 dark:border-red-800 hover:bg-red-50 dark:hover:bg-red-950/40 text-red-600 dark:text-red-400 transition-colors cursor-pointer"
                              title="Limitni bekor qilish"
                            >
                              Bekor qilish
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1">
                            <input
                              type="number"
                              min="1"
                              step="1"
                              placeholder="N dona..."
                              value={limitInputs[product.id] || ''}
                              onChange={e => setLimitInputs(prev => ({ ...prev, [product.id]: e.target.value }))}
                              className="w-16 px-2 py-1 text-xs border border-gray-200 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-700 font-bold text-center focus:outline-none focus:ring-1 focus:ring-blue-500"
                            />
                            <button
                              type="button"
                              disabled={updatingId === product.id || !limitInputs[product.id]}
                              onClick={() => handleSetLimit(product)}
                              className="px-2.5 py-1 text-xs font-bold bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white rounded-lg transition-colors cursor-pointer"
                              title="Qoldiq limitini kiritish"
                            >
                              Limitlash
                            </button>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Toggle Stop Button */}
                    <button
                      type="button"
                      disabled={updatingId === product.id}
                      onClick={() => handleToggleStop(product)}
                      className={`px-3.5 py-1.5 rounded-xl text-xs font-black flex items-center gap-1.5 transition-all cursor-pointer shadow-sm ${
                        isStopped
                          ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                          : 'bg-red-600 hover:bg-red-700 text-white ring-1 ring-red-400'
                      }`}
                    >
                      {updatingId === product.id ? (
                        <RefreshCw size={14} className="animate-spin" />
                      ) : isStopped ? (
                        <>
                          <Play size={14} />
                          <span>Stopdan olish</span>
                        </>
                      ) : (
                        <>
                          <Ban size={14} />
                          <span>Stopga qo'yish</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-gray-100 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-900/30 flex justify-between items-center text-xs text-gray-400 shrink-0">
          <span>* Barcha to'xtatishlar Harakatlar jurnaliga qayd etiladi.</span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 font-bold rounded-xl text-gray-700 dark:text-gray-200 transition-colors cursor-pointer"
          >
            Yopish
          </button>
        </div>

      </div>
    </div>
  );
}
