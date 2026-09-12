import { useState, useEffect, useCallback, useMemo } from 'react';
import { 
  ClipboardCheck, Search, Filter, Zap, RefreshCw, AlertTriangle, 
  CheckCircle2, ArrowDownRight, ArrowUpRight, Scale, History, 
  FileText, Calendar, User, Eye, X, Printer, Sparkles, Check, ChevronRight,
  FileSpreadsheet
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { useApp } from './context/AppContext';
import { formatCurrency, formatThousands, formatQuantity } from './utils';

export default function InventoryAudit({ isActive }) {
  const { t, lang, currentUser, fetchGlobalProducts, businessType } = useApp();

  // ── Navigation & Tabs ─────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState('audit'); // 'audit' | 'history'

  // ── Audit Form State ──────────────────────────────────────────────────────
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [notes, setNotes] = useState('');
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all'); // 'all' | 'ingredient' | 'product'
  const [diffFilter, setDiffFilter] = useState('all'); // 'all' | 'diff_only' | 'shortage' | 'surplus'

  // ── Modals & Notifications ────────────────────────────────────────────────
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [successResult, setSuccessResult] = useState(null);
  const [toastMsg, setToastMsg] = useState('');

  // ── History State ─────────────────────────────────────────────────────────
  const [historyList, setHistoryList] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [selectedAuditDetails, setSelectedAuditDetails] = useState(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [historySearch, setHistorySearch] = useState('');

  const showToast = (msg) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(''), 4000);
  };

  // ── Fetch prepare items ───────────────────────────────────────────────────
  const loadPrepareItems = useCallback(async () => {
    setLoading(true);
    try {
      let data = null;
      if (window.api && window.api.getInventoryAuditPrepare) {
        const res = await window.api.getInventoryAuditPrepare();
        if (res && res.success) data = res.items;
      } else {
        const resp = await fetch('/api/inventory/audit/prepare');
        const res = await resp.json();
        if (res && res.success) data = res.items;
      }

      if (data && Array.isArray(data)) {
        setItems(data.map(it => ({
          ...it,
          actual_qty: '' // initially empty, user can type or click auto-fill
        })));
      }
    } catch (err) {
      console.error('Failed to load audit prepare items:', err);
      showToast('Tovarlar ro\'yxatini yuklashda xatolik yuz berdi');
    } finally {
      setLoading(false);
    }
  }, []);

  // ── Fetch history ─────────────────────────────────────────────────────────
  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      let data = null;
      if (window.api && window.api.getInventoryAudits) {
        const res = await window.api.getInventoryAudits();
        if (res && res.success) data = res.audits;
      } else {
        const resp = await fetch('/api/inventory/audits');
        const res = await resp.json();
        if (res && res.success) data = res.audits;
      }

      if (data && Array.isArray(data)) {
        setHistoryList(data);
      }
    } catch (err) {
      console.error('Failed to load audit history:', err);
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  // ── Load audit details for modal ──────────────────────────────────────────
  const openAuditDetails = async (auditId) => {
    setDetailsLoading(true);
    try {
      let data = null;
      if (window.api && window.api.getInventoryAuditDetails) {
        const res = await window.api.getInventoryAuditDetails(auditId);
        if (res && res.success) data = res;
      } else {
        const resp = await fetch(`/api/inventory/audits/${auditId}`);
        const res = await resp.json();
        if (res && res.success) data = res;
      }

      if (data && data.success) {
        setSelectedAuditDetails(data);
      } else {
        showToast('Tafsilotlarni yuklab bo\'lmadi');
      }
    } catch (err) {
      console.error('Failed to load audit details:', err);
      showToast('Tafsilotlarni yuklashda xatolik');
    } finally {
      setDetailsLoading(false);
    }
  };

  useEffect(() => {
    if (isActive) {
      if (activeTab === 'audit' && items.length === 0) {
        loadPrepareItems();
      } else if (activeTab === 'history') {
        loadHistory();
      }
    }
  }, [isActive, activeTab, loadPrepareItems, loadHistory, items.length]);

  // ── Auto Fill Expected Qty ────────────────────────────────────────────────
  const handleAutoFillExpected = () => {
    setItems(prev => prev.map(it => ({
      ...it,
      actual_qty: formatQuantity(it.expected_qty)
    })));
    showToast('Barcha tovarlar dasturdagi qoldiq bilan to\'ldirildi. Farqli pozitsiyalarni o\'zgartiring.');
  };

  // ── Clear Actual Qty ──────────────────────────────────────────────────────
  const handleClearActual = () => {
    setItems(prev => prev.map(it => ({
      ...it,
      actual_qty: ''
    })));
    showToast('Faktik qoldiqlar tozalandi.');
  };

  // ── Update individual item quantity ───────────────────────────────────────
  const handleActualQtyChange = (itemId, val) => {
    let formattedVal = val;
    if (val && (val.includes('.') || val.includes(','))) {
      const cleanVal = val.replace(',', '.');
      const parts = cleanVal.split('.');
      if (parts[1] && parts[1].length > 3) {
        formattedVal = parts[0] + '.' + parts[1].slice(0, 3);
      } else {
        formattedVal = cleanVal;
      }
    }
    setItems(prev => prev.map(it => {
      if (it.item_id === itemId) {
        return { ...it, actual_qty: formattedVal };
      }
      return it;
    }));
  };

  // ── Calculations ──────────────────────────────────────────────────────────
  const calculations = useMemo(() => {
    let totalShortage = 0; // negative
    let totalSurplus = 0;  // positive
    let filledCount = 0;
    let shortageCount = 0;
    let surplusCount = 0;
    let matchedCount = 0;

    for (const it of items) {
      if (it.actual_qty !== '' && !isNaN(parseFloat(it.actual_qty))) {
        filledCount++;
        const act = parseFloat(it.actual_qty);
        const exp = parseFloat(it.expected_qty) || 0;
        const diff = act - exp;
        const cost = parseFloat(it.cost_price) || 0;
        const totalDiffCost = Math.round(diff * cost);

        if (diff < -0.0001) {
          totalShortage += totalDiffCost;
          shortageCount++;
        } else if (diff > 0.0001) {
          totalSurplus += totalDiffCost;
          surplusCount++;
        } else {
          matchedCount++;
        }
      }
    }

    const netDifference = totalSurplus + totalShortage;

    return {
      totalShortage,
      totalSurplus,
      netDifference,
      filledCount,
      shortageCount,
      surplusCount,
      matchedCount,
      totalCount: items.length
    };
  }, [items]);

  // ── Filtered items list ───────────────────────────────────────────────────
  const filteredItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter(it => {
      // Search filter
      if (q) {
        const nameMatch = (it.item_name || '').toLowerCase().includes(q);
        const barcodeMatch = (it.barcode || '').toLowerCase().includes(q);
        const catMatch = (it.category || '').toLowerCase().includes(q);
        if (!nameMatch && !barcodeMatch && !catMatch) return false;
      }

      // Type filter
      if (typeFilter === 'ingredient' && it.item_type !== 'ingredient') return false;
      if (typeFilter === 'product' && it.item_type !== 'product') return false;

      // Difference filter
      if (diffFilter !== 'all') {
        const isFilled = it.actual_qty !== '' && !isNaN(parseFloat(it.actual_qty));
        if (!isFilled) return false;
        const diff = parseFloat(it.actual_qty) - (parseFloat(it.expected_qty) || 0);
        if (diffFilter === 'diff_only' && Math.abs(diff) < 0.0001) return false;
        if (diffFilter === 'shortage' && diff >= -0.0001) return false;
        if (diffFilter === 'surplus' && diff <= 0.0001) return false;
      }

      return true;
    });
  }, [items, search, typeFilter, diffFilter]);

  // ── Submit Audit ──────────────────────────────────────────────────────────
  const handleConfirmSubmit = async () => {
    setShowConfirmModal(false);
    setSubmitting(true);

    try {
      // Prepare payload: only items with valid actual_qty (or default to expected_qty if untouched)
      const payloadItems = items.map(it => {
        const act = it.actual_qty !== '' && !isNaN(parseFloat(it.actual_qty))
          ? parseFloat(it.actual_qty)
          : parseFloat(it.expected_qty) || 0;
        
        return {
          item_id: it.item_id,
          item_name: it.item_name,
          item_type: it.item_type,
          unit: it.unit,
          expected_qty: parseFloat(it.expected_qty) || 0,
          actual_qty: act,
          cost_price: parseFloat(it.cost_price) || 0
        };
      });

      const payload = {
        notes: notes.trim() || (lang === 'ru' ? 'Инвентаризация склада' : 'Ombor reviziyasi'),
        items: payloadItems,
        created_by: currentUser?.name || 'Admin'
      };

      let res = null;
      if (window.api && window.api.completeInventoryAudit) {
        res = await window.api.completeInventoryAudit(payload);
      } else {
        const resp = await fetch('/api/inventory/audit/complete', {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'Authorization': currentUser?.pin || ''
          },
          body: JSON.stringify(payload)
        });
        res = await resp.json();
      }

      if (res && res.success) {
        setSuccessResult({
          audit_id: res.audit_id,
          notes: payload.notes,
          shortage: res.total_shortage_sum,
          surplus: res.total_surplus_sum,
          net: res.net_difference_sum,
          count: payloadItems.length
        });
        
        // Refresh products globally so cashier/warehouse has fresh stock
        if (fetchGlobalProducts) {
          fetchGlobalProducts();
        }

        // Reset form
        setNotes('');
        loadPrepareItems();
      } else {
        showToast(res?.error || 'Reviziyani saqlashda xatolik yuz berdi');
      }
    } catch (err) {
      console.error('Failed to submit inventory audit:', err);
      showToast('Tizim xatoligi: ' + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  // ── Print Audit Summary ───────────────────────────────────────────────────
  const handlePrintAudit = (audit, auditItems) => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Reviziya Dalolatnomasi #${audit.id || audit.audit_id}</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; padding: 20px; color: #111; font-size: 12px; }
          h2 { margin: 0 0 4px; font-size: 18px; text-align: center; }
          p { margin: 2px 0; }
          .header { text-align: center; margin-bottom: 20px; border-bottom: 1px dashed #ccc; padding-bottom: 10px; }
          table { width: 100%; border-collapse: collapse; margin-top: 15px; }
          th, td { border: 1px solid #ddd; padding: 6px 8px; text-align: left; }
          th { background: #f4f4f4; font-weight: bold; }
          .num { text-align: right; font-mono; }
          .shortage { color: #dc2626; font-weight: bold; }
          .surplus { color: #2563eb; font-weight: bold; }
          .summary-box { margin-top: 20px; border: 1px solid #333; padding: 10px; border-radius: 6px; }
          .signatures { margin-top: 40px; display: flex; justify-content: space-between; }
        </style>
      </head>
      <body>
        <div class="header">
          <h2>OMBOR REVIZIYASI DALOLATNOMASI #${audit.id || audit.audit_id}</h2>
          <p>Sana: ${audit.audit_date || new Date().toLocaleString()}</p>
          <p>Mas'ul shaxs: ${audit.created_by || 'Admin'}</p>
          <p>Izoh: ${audit.notes || '-'}</p>
        </div>

        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Tovar / Xom-ashyo nomi</th>
              <th>Birlik</th>
              <th class="num">Kutilgan</th>
              <th class="num">Haqiqiy</th>
              <th class="num">Farq</th>
              <th class="num">Tannarx</th>
              <th class="num">Farq summasi</th>
            </tr>
          </thead>
          <tbody>
            ${(auditItems || []).map((it, idx) => {
              const diff = it.diff_qty !== undefined ? it.diff_qty : ((parseFloat(it.actual_qty) || 0) - (parseFloat(it.expected_qty) || 0));
              const diffCost = it.total_cost_diff !== undefined ? it.total_cost_diff : Math.round(diff * (it.cost_price || 0));
              const diffClass = diff < 0 ? 'shortage' : (diff > 0 ? 'surplus' : '');
              return `
                <tr>
                  <td>${idx + 1}</td>
                  <td><strong>${it.item_name}</strong></td>
                  <td>${it.unit}</td>
                  <td class="num">${formatQuantity(it.expected_qty)}</td>
                  <td class="num">${formatQuantity(it.actual_qty)}</td>
                  <td class="num ${diffClass}">${diff > 0 ? '+' : ''}${formatQuantity(diff)}</td>
                  <td class="num">${Number(it.cost_price).toLocaleString()} so'm</td>
                  <td class="num ${diffClass}">${diffCost > 0 ? '+' : ''}${Number(diffCost).toLocaleString()} so'm</td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>

        <div class="summary-box">
          <p><strong>Jami kamomad (zarar):</strong> <span class="shortage">${Number(audit.total_shortage_sum || audit.shortage || 0).toLocaleString()} so'm</span></p>
          <p><strong>Jami ortiqchalik:</strong> <span class="surplus">+${Number(audit.total_surplus_sum || audit.surplus || 0).toLocaleString()} so'm</span></p>
          <p><strong>Yakuniy sof balans:</strong> <strong>${Number(audit.net_difference_sum || audit.net || 0).toLocaleString()} so'm</strong></p>
        </div>

        <div class="signatures">
          <div>Komissiya a'zosi: ____________________</div>
          <div>Moddiy javobgar shaxs: ____________________</div>
        </div>

        <script>
          window.onload = function() { window.print(); window.close(); }
        </script>
      </body>
      </html>
    `;

    printWindow.document.write(html);
    printWindow.document.close();
  };

  // ── Excel Export Audit Summary ──────────────────────────────────────────
  const handleExportExcel = (audit, auditItems) => {
    try {
      const wb = XLSX.utils.book_new();

      const shortageSum = Number(audit.total_shortage_sum || 0);
      const surplusSum = Number(audit.total_surplus_sum || 0);
      const netSum = Number(audit.net_difference_sum || 0);

      const rows = [
        ["REVIZIYA DALOLATNOMASI #" + (audit.id || audit.audit_id || '')],
        ["Sana:", audit.audit_date || new Date().toLocaleDateString(), "Mas'ul xodim:", audit.created_by || 'Admin'],
        ["Kamomad summasi:", shortageSum.toLocaleString() + " so'm"],
        ["Ortiqchalik summasi:", "+" + surplusSum.toLocaleString() + " so'm"],
        ["Sof balans:", (netSum > 0 ? "+" : "") + netSum.toLocaleString() + " so'm"],
        audit.notes ? ["Izoh:", audit.notes] : [],
        [],
        ["#", "Tovar / Xomashyo nomi", "Turi", "Birlik", "Kutilgan qoldiq", "Haqiqiy qoldiq", "Farq", "Tannarx (so'm)", "Farq summasi (so'm)"]
      ];

      (auditItems || []).forEach((it, idx) => {
        const diff = it.diff_qty !== undefined ? Number(it.diff_qty) : ((parseFloat(it.actual_qty) || 0) - (parseFloat(it.expected_qty) || 0));
        const costPrice = Number(it.cost_price) || 0;
        const diffCost = it.total_cost_diff !== undefined ? Number(it.total_cost_diff) : Math.round(diff * costPrice);

        rows.push([
          idx + 1,
          it.item_name || it.name || '',
          it.item_type === 'ingredient' ? "Xomashyo" : "Tayyor taom / Mahsulot",
          it.unit || 'dona',
          parseFloat(it.expected_qty) || 0,
          parseFloat(it.actual_qty) || 0,
          diff,
          costPrice,
          diffCost
        ]);
      });

      const ws = XLSX.utils.aoa_to_sheet(rows);

      ws['!cols'] = [
        { wch: 6 },
        { wch: 32 },
        { wch: 24 },
        { wch: 10 },
        { wch: 16 },
        { wch: 16 },
        { wch: 14 },
        { wch: 16 },
        { wch: 20 }
      ];

      XLSX.utils.book_append_sheet(wb, ws, "Reviziya_" + (audit.id || audit.audit_id || ''));

      const dateStr = (audit.audit_date || '').replace(/[^0-9-]/g, '_');
      const fileName = `Reviziya_${audit.id || audit.audit_id || 'hisobot'}_${dateStr || 'fayl'}.xlsx`;
      XLSX.writeFile(wb, fileName);
    } catch (err) {
      console.error("handleExportExcel error:", err);
      alert("Excel faylini yuklashda xatolik yuz berdi: " + err.message);
    }
  };

  return (
    <div className="flex flex-col h-full bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100 overflow-hidden">
      {/* ── Toast Notification ────────────────────────────────────────────── */}
      {toastMsg && (
        <div className="fixed top-6 right-6 z-50 bg-gray-900/90 dark:bg-white/90 text-white dark:text-gray-900 px-5 py-3 rounded-2xl shadow-2xl backdrop-blur-md flex items-center gap-3 border border-gray-700/50 animate-fade-in text-sm font-semibold">
          <span>🔔</span>
          <span>{toastMsg}</span>
        </div>
      )}

      {/* ── Top Header & Tab Switcher ──────────────────────────────────────── */}
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shrink-0 shadow-sm">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-2xl">
              <ClipboardCheck size={26} />
            </div>
            <div>
              <h1 className="text-xl font-black tracking-tight text-gray-900 dark:text-white flex items-center gap-2">
                Ombor Inventarizatsiyasi (Reviziya)
                <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300">
                  {items.length} ta pozitsiya
                </span>
              </h1>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                Dasturdagi qoldiqni haqiqiy qoldiq bilan solishtirish, kamomad va ortiqchaliklarni hisoblash
              </p>
            </div>
          </div>
        </div>

        {/* Tab Toggle: Yangi Reviziya vs Tarix */}
        <div className="flex items-center gap-2 bg-gray-100 dark:bg-gray-700/60 p-1 rounded-xl">
          <button
            type="button"
            onClick={() => setActiveTab('audit')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              activeTab === 'audit'
                ? 'bg-white dark:bg-gray-800 text-blue-600 dark:text-blue-400 shadow-sm'
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
            }`}
          >
            <ClipboardCheck size={16} />
            <span>Yangi Reviziya</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveTab('history');
              loadHistory();
            }}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              activeTab === 'history'
                ? 'bg-white dark:bg-gray-800 text-blue-600 dark:text-blue-400 shadow-sm'
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
            }`}
          >
            <History size={16} />
            <span>Reviziyalar Tarixi</span>
          </button>
        </div>
      </div>

      {/* ── TAB 1: ACTIVE AUDIT FORM ────────────────────────────────────────── */}
      {activeTab === 'audit' && (
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
          {/* Controls Bar: Search, Type Filter, Diff Filter, Quick Actions */}
          <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-3 shrink-0 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-3 flex-1 min-w-[280px]">
              {/* Quick Search */}
              <div className="relative flex-1 min-w-[200px] max-w-md">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Tovar yoki xom-ashyoni izlash (nom, shtrix-kod)..."
                  className="w-full pl-9 pr-3 py-2 text-xs font-medium rounded-xl border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700/50 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:outline-none transition-colors"
                />
                {search && (
                  <button 
                    onClick={() => setSearch('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-xs"
                  >
                    ✕
                  </button>
                )}
              </div>

              {/* Type Filter Buttons */}
              <div className="flex items-center gap-1 bg-gray-100 dark:bg-gray-700/60 p-1 rounded-xl text-xs font-bold">
                <button
                  onClick={() => setTypeFilter('all')}
                  className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
                    typeFilter === 'all'
                      ? 'bg-white dark:bg-gray-800 text-gray-900 dark:text-white shadow-sm'
                      : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                  }`}
                >
                  Barchasi ({items.length})
                </button>
                {businessType === 'restaurant' && (
                  <button
                    onClick={() => setTypeFilter('ingredient')}
                    className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 ${
                      typeFilter === 'ingredient'
                        ? 'bg-amber-500 text-white shadow-sm'
                        : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                    }`}
                  >
                    <span>🥦</span>
                    <span>Oshxona xomashyolari ({items.filter(i => i.item_type === 'ingredient').length})</span>
                  </button>
                )}
                <button
                  onClick={() => setTypeFilter('product')}
                  className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 ${
                    typeFilter === 'product'
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                  }`}
                >
                  <span>🍹</span>
                  <span>{businessType === 'restaurant' ? 'Bar / Ichimliklar' : 'Tovarlar'} ({items.filter(i => i.item_type === 'product').length})</span>
                </button>
              </div>

              {/* Diff status filter */}
              <select
                value={diffFilter}
                onChange={e => setDiffFilter(e.target.value)}
                className="text-xs font-semibold py-2 px-3 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
              >
                <option value="all">Barcha holatlar</option>
                <option value="diff_only">Faqat farqi borlar ({calculations.shortageCount + calculations.surplusCount})</option>
                <option value="shortage">Faqat kamomad ({calculations.shortageCount})</option>
                <option value="surplus">Faqat ortiqchalik ({calculations.surplusCount})</option>
              </select>
            </div>

            {/* Quick action buttons */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleAutoFillExpected}
                className="px-3.5 py-2 bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/30 dark:hover:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all shadow-sm active:scale-95 cursor-pointer"
                title="Barcha haqiqiy qoldiq maydonlarini dasturdagi sonlar bilan to'ldiradi"
              >
                <Zap size={15} className="text-emerald-600 dark:text-emerald-400" />
                <span>⚡ Dasturdagidek to'ldirish</span>
              </button>

              <button
                type="button"
                onClick={handleClearActual}
                className="px-3 py-2 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 rounded-xl text-xs font-semibold transition-colors cursor-pointer"
                title="Kiritilgan barcha faktik sonlarni tozalaydi"
              >
                Tozalash
              </button>

              <button
                type="button"
                onClick={loadPrepareItems}
                disabled={loading}
                className="p-2 text-gray-500 hover:text-gray-700 dark:hover:text-gray-200 bg-gray-100 dark:bg-gray-700/60 rounded-xl transition-colors cursor-pointer"
                title="Qayta yuklash"
              >
                <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
              </button>
            </div>
          </div>

          {/* Interactive Audit Table */}
          <div className="flex-1 overflow-y-auto custom-scrollbar px-6 py-4">
            {loading ? (
              <div className="h-64 flex flex-col items-center justify-center gap-3 text-gray-500">
                <RefreshCw size={28} className="animate-spin text-blue-500" />
                <p className="text-sm font-semibold">Ombordagi tovarlar ro'yxati tayyorlanmoqda...</p>
              </div>
            ) : filteredItems.length === 0 ? (
              <div className="h-64 flex flex-col items-center justify-center gap-3 text-gray-400 bg-white dark:bg-gray-800 rounded-2xl border border-dashed border-gray-300 dark:border-gray-700 p-8">
                <Search size={36} className="text-gray-300 dark:text-gray-600" />
                <p className="text-sm font-bold">Mos tovarlar topilmadi</p>
                <p className="text-xs text-gray-400">Qidiruv yoki filtr shartlarini o'zgartirib ko'ring</p>
              </div>
            ) : (
              <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-gray-100/75 dark:bg-gray-700/50 border-b border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 font-bold uppercase tracking-wider">
                        <th className="py-3 px-4 w-12 text-center">#</th>
                        <th className="py-3 px-4">Tovar / Xomashyo nomi</th>
                        <th className="py-3 px-3 text-center w-24">Birlik</th>
                        <th className="py-3 px-4 text-right w-36">Dasturdagi qoldiq</th>
                        <th className="py-3 px-4 text-center w-48 bg-blue-50/50 dark:bg-blue-950/20 text-blue-700 dark:text-blue-300">
                          Haqiqiy qoldiq (Fakt)
                        </th>
                        <th className="py-3 px-4 text-right w-36">Farq</th>
                        <th className="py-3 px-4 text-right w-32">Tannarx</th>
                        <th className="py-3 px-4 text-right w-40">Farq summasi</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-gray-700/60 font-medium">
                      {filteredItems.map((it, idx) => {
                        const isFilled = it.actual_qty !== '' && !isNaN(parseFloat(it.actual_qty));
                        const actualNum = isFilled ? parseFloat(it.actual_qty) : null;
                        const expectedNum = parseFloat(it.expected_qty) || 0;
                        const diff = actualNum !== null ? actualNum - expectedNum : null;
                        const cost = parseFloat(it.cost_price) || 0;
                        const diffCost = diff !== null ? Math.round(diff * cost) : null;

                        // Row styling based on discrepancy
                        const isShortage = diff !== null && diff < -0.0001;
                        const isSurplus = diff !== null && diff > 0.0001;
                        const isMatch = diff !== null && Math.abs(diff) <= 0.0001;

                        let rowBg = 'hover:bg-gray-100/70 dark:hover:bg-gray-700/50';
                        if (isShortage) rowBg = 'bg-rose-50/40 dark:bg-rose-950/20 hover:bg-rose-100/60 dark:hover:bg-rose-900/40';
                        else if (isSurplus) rowBg = 'bg-amber-50/40 dark:bg-amber-950/20 hover:bg-amber-100/60 dark:hover:bg-amber-900/40';

                        return (
                          <tr key={it.item_id} className={`transition-colors ${rowBg}`}>
                            <td className="py-2.5 px-4 text-center text-gray-400 font-mono text-[11px]">
                              {idx + 1}
                            </td>

                            <td className="py-2.5 px-4">
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-gray-900 dark:text-white text-sm">
                                  {it.item_name}
                                </span>
                                {it.item_type === 'ingredient' && (
                                  <span className="px-2 py-0.5 rounded-md text-[10px] font-black bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300">
                                    Xomashyo
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-2 mt-0.5 text-[11px] text-gray-400">
                                {it.category && <span>{it.category}</span>}
                                {it.barcode && <span>• Barcode: {it.barcode}</span>}
                              </div>
                            </td>

                            <td className="py-2.5 px-3 text-center">
                              <span className="px-2 py-0.5 rounded-lg bg-gray-100 dark:bg-gray-700 font-bold text-gray-600 dark:text-gray-300 text-xs">
                                {it.unit}
                              </span>
                            </td>

                            <td className="py-2.5 px-4 text-right font-mono font-bold text-gray-700 dark:text-gray-300">
                              {formatQuantity(expectedNum)}
                            </td>

                            {/* Active Input: Actual Qty */}
                            <td className="py-2.5 px-4 bg-blue-50/30 dark:bg-blue-950/10">
                              <div className="flex items-center justify-center">
                                <input
                                  type="number"
                                  step="any"
                                  min="0"
                                  value={it.actual_qty}
                                  onChange={e => handleActualQtyChange(it.item_id, e.target.value)}
                                  placeholder={formatQuantity(expectedNum)}
                                  className={`w-36 text-center font-mono font-black text-sm px-3 py-1.5 rounded-xl border transition-all focus:outline-none focus:ring-2 ${
                                    isShortage
                                      ? 'border-rose-300 dark:border-rose-800 bg-rose-50/80 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 focus:ring-rose-500'
                                      : isSurplus
                                      ? 'border-amber-300 dark:border-amber-800 bg-amber-50/80 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 focus:ring-amber-500'
                                      : isMatch
                                      ? 'border-emerald-300 dark:border-emerald-800 bg-emerald-50/80 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 focus:ring-emerald-500'
                                      : 'border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-blue-500'
                                  }`}
                                />
                              </div>
                            </td>

                            {/* Difference in Qty */}
                            <td className="py-2.5 px-4 text-right font-mono font-bold">
                              {diff !== null ? (
                                <span className={`inline-flex items-center gap-0.5 px-2 py-0.5 rounded-lg text-xs font-black ${
                                  isShortage
                                    ? 'bg-rose-100 dark:bg-rose-900/50 text-rose-700 dark:text-rose-300'
                                    : isSurplus
                                    ? 'bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300'
                                    : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400'
                                }`}>
                                  {isShortage && <ArrowDownRight size={13} />}
                                  {isSurplus && <ArrowUpRight size={13} />}
                                  {diff > 0 ? `+${formatQuantity(diff)}` : formatQuantity(diff)} {it.unit}
                                </span>
                              ) : (
                                <span className="text-gray-400">-</span>
                              )}
                            </td>

                            {/* Cost Price */}
                            <td className="py-2.5 px-4 text-right font-mono text-gray-500 dark:text-gray-400">
                              {Number(cost).toLocaleString()} so'm
                            </td>

                            {/* Difference in Total Sum */}
                            <td className="py-2.5 px-4 text-right font-mono font-black text-sm">
                              {diffCost !== null ? (
                                <span className={
                                  isShortage
                                    ? 'text-rose-600 dark:text-rose-400'
                                    : isSurplus
                                    ? 'text-blue-600 dark:text-blue-400'
                                    : 'text-gray-400 dark:text-gray-500 font-normal'
                                }>
                                  {diffCost > 0 ? `+${diffCost.toLocaleString()}` : diffCost.toLocaleString()} so'm
                                </span>
                              ) : (
                                <span className="text-gray-400 font-normal">-</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>

          {/* ── Fixed Bottom Summary Card (Сводка) ─────────────────────────── */}
          <div className="bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 px-6 py-4 shrink-0 shadow-lg flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-4">
              {/* Kamomad Box */}
              <div className="px-4 py-2.5 rounded-2xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/50 flex items-center gap-3">
                <div className="p-2 rounded-xl bg-rose-100 dark:bg-rose-900/50 text-rose-600 dark:text-rose-400">
                  <ArrowDownRight size={20} />
                </div>
                <div>
                  <div className="text-[11px] font-bold text-rose-600 dark:text-rose-400 uppercase tracking-wider">
                    🔴 Jami kamomad (Zarar)
                  </div>
                  <div className="text-base font-black text-rose-700 dark:text-rose-300 font-mono">
                    {calculations.totalShortage.toLocaleString()} so'm
                  </div>
                </div>
              </div>

              {/* Ortiqchalik Box */}
              <div className="px-4 py-2.5 rounded-2xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/50 flex items-center gap-3">
                <div className="p-2 rounded-xl bg-amber-100 dark:bg-amber-900/50 text-amber-600 dark:text-amber-400">
                  <ArrowUpRight size={20} />
                </div>
                <div>
                  <div className="text-[11px] font-bold text-amber-600 dark:text-amber-400 uppercase tracking-wider">
                    🟡 Jami ortiqchalik
                  </div>
                  <div className="text-base font-black text-amber-700 dark:text-amber-300 font-mono">
                    +{calculations.totalSurplus.toLocaleString()} so'm
                  </div>
                </div>
              </div>

              {/* Net Balance Box */}
              <div className={`px-4 py-2.5 rounded-2xl border flex items-center gap-3 ${
                calculations.netDifference < 0
                  ? 'bg-red-50/60 dark:bg-red-950/20 border-red-200 dark:border-red-900/50'
                  : 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-900/50'
              }`}>
                <div className={`p-2 rounded-xl ${
                  calculations.netDifference < 0
                    ? 'bg-red-100 dark:bg-red-900/50 text-red-600 dark:text-red-400'
                    : 'bg-emerald-100 dark:bg-emerald-900/50 text-emerald-600 dark:text-emerald-400'
                }`}>
                  <Scale size={20} />
                </div>
                <div>
                  <div className="text-[11px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    ⚖️ Umumiy balans
                  </div>
                  <div className={`text-base font-black font-mono ${
                    calculations.netDifference < 0
                      ? 'text-red-600 dark:text-red-400'
                      : 'text-emerald-600 dark:text-emerald-400'
                  }`}>
                    {calculations.netDifference > 0 ? `+${calculations.netDifference.toLocaleString()}` : calculations.netDifference.toLocaleString()} so'm
                  </div>
                </div>
              </div>
            </div>

            {/* Notes input & Submit button */}
            <div className="flex items-center gap-3 w-full md:w-auto">
              <input
                type="text"
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="Reviziya izohi (masalan: Oylik reviziya)..."
                className="w-full md:w-64 px-3 py-2.5 text-xs rounded-xl border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />

              <button
                type="button"
                onClick={() => setShowConfirmModal(true)}
                disabled={submitting || items.length === 0}
                className="px-6 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-xl font-bold text-sm shadow-md hover:shadow-lg transition-all duration-200 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap cursor-pointer flex items-center gap-2"
              >
                <span>💾</span>
                <span>Reviziyani yakunlash</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── TAB 2: AUDIT HISTORY ────────────────────────────────────────────── */}
      {activeTab === 'history' && (
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden p-6">
          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-4 mb-4 flex items-center justify-between gap-4 shrink-0 shadow-sm">
            <div className="relative flex-1 max-w-md">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={historySearch}
                onChange={e => setHistorySearch(e.target.value)}
                placeholder="Izoh yoki xodim nomi bo'yicha izlash..."
                className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700/50 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <button
              type="button"
              onClick={loadHistory}
              disabled={historyLoading}
              className="px-4 py-2 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 rounded-xl text-xs font-bold flex items-center gap-2 transition-colors cursor-pointer"
            >
              <RefreshCw size={14} className={historyLoading ? 'animate-spin' : ''} />
              <span>Yangilash</span>
            </button>
          </div>

          <div className="flex-1 overflow-y-auto custom-scrollbar bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm">
            {historyLoading ? (
              <div className="h-64 flex flex-col items-center justify-center gap-3 text-gray-500">
                <RefreshCw size={28} className="animate-spin text-blue-500" />
                <p className="text-sm font-semibold">Tarix yuklanmoqda...</p>
              </div>
            ) : historyList.length === 0 ? (
              <div className="h-64 flex flex-col items-center justify-center gap-3 text-gray-400 p-8">
                <History size={36} className="text-gray-300 dark:text-gray-600" />
                <p className="text-sm font-bold">Hozircha reviziyalar o'tkazilmagan</p>
                <p className="text-xs text-gray-400">Yangi reviziya o'tkazgach, uning natijalari shu yerda saqlanadi</p>
              </div>
            ) : (
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-gray-100/75 dark:bg-gray-700/50 border-b border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 font-bold uppercase tracking-wider">
                    <th className="py-3 px-4 w-12 text-center">#</th>
                    <th className="py-3 px-4">Sana va Vaqt</th>
                    <th className="py-3 px-4">Mas'ul xodim</th>
                    <th className="py-3 px-4">Izoh</th>
                    <th className="py-3 px-4 text-center">Pozitsiyalar</th>
                    <th className="py-3 px-4 text-right text-rose-600">Kamomad (Zarar)</th>
                    <th className="py-3 px-4 text-right text-blue-600">Ortiqchalik</th>
                    <th className="py-3 px-4 text-right">Umumiy balans</th>
                    <th className="py-3 px-4 text-center w-28">Amal</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-700/60 font-medium">
                  {historyList
                    .filter(a => {
                      if (!historySearch) return true;
                      const q = historySearch.toLowerCase();
                      return (a.notes || '').toLowerCase().includes(q) || (a.created_by || '').toLowerCase().includes(q);
                    })
                    .map((a, idx) => (
                      <tr key={a.id} className="hover:bg-gray-100/70 dark:hover:bg-gray-700/50 transition-colors">
                        <td className="py-3 px-4 text-center text-gray-400 font-mono font-bold">
                          {a.id}
                        </td>
                        <td className="py-3 px-4 font-bold text-gray-900 dark:text-white">
                          <div className="flex items-center gap-1.5">
                            <Calendar size={13} className="text-blue-500" />
                            <span>{a.audit_date}</span>
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-1.5 text-gray-700 dark:text-gray-300">
                            <User size={13} className="text-gray-400" />
                            <span>{a.created_by}</span>
                          </div>
                        </td>
                        <td className="py-3 px-4 text-gray-600 dark:text-gray-300 max-w-xs truncate">
                          {a.notes || '-'}
                        </td>
                        <td className="py-3 px-4 text-center">
                          <span className="px-2 py-0.5 bg-gray-100 dark:bg-gray-700 rounded-md font-bold text-gray-700 dark:text-gray-300">
                            {a.items_count} ta
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right font-mono font-bold text-rose-600 dark:text-rose-400">
                          {Number(a.total_shortage_sum).toLocaleString()} so'm
                        </td>
                        <td className="py-3 px-4 text-right font-mono font-bold text-blue-600 dark:text-blue-400">
                          +{Number(a.total_surplus_sum).toLocaleString()} so'm
                        </td>
                        <td className="py-3 px-4 text-right font-mono font-black">
                          <span className={a.net_difference_sum < 0 ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'}>
                            {a.net_difference_sum > 0 ? `+${Number(a.net_difference_sum).toLocaleString()}` : Number(a.net_difference_sum).toLocaleString()} so'm
                          </span>
                        </td>
                        <td className="py-3 px-4 text-center">
                          <button
                            type="button"
                            onClick={() => openAuditDetails(a.id)}
                            className="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 dark:bg-blue-900/30 dark:hover:bg-blue-900/50 text-blue-600 dark:text-blue-400 rounded-lg text-xs font-bold transition-colors flex items-center gap-1.5 mx-auto cursor-pointer"
                          >
                            <Eye size={13} />
                            <span>Ko'rish</span>
                          </button>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* ── CONFIRMATION MODAL ──────────────────────────────────────────────── */}
      {showConfirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in">
          <div className="bg-white dark:bg-gray-800 rounded-3xl p-6 max-w-md w-full shadow-2xl border border-gray-200 dark:border-gray-700">
            <div className="flex items-center gap-3 text-amber-500 mb-4">
              <div className="p-3 bg-amber-50 dark:bg-amber-900/30 rounded-2xl">
                <AlertTriangle size={28} />
              </div>
              <div>
                <h3 className="text-lg font-black text-gray-900 dark:text-white">
                  Reviziyani Tasdiqlash
                </h3>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Ombor qoldiqlarini yangilash
                </p>
              </div>
            </div>

            <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed mb-4">
              <strong>Diqqat!</strong> Ushbu amal ombordagi barcha tovar va xom-ashyolar qoldiqlarini kiritilgan faktik sonlarga tenglashtiradi. Davom etasizmi?
            </p>

            <div className="p-3 bg-gray-50 dark:bg-gray-700/40 rounded-2xl space-y-2 mb-6 text-xs font-semibold">
              <div className="flex justify-between">
                <span className="text-gray-500 dark:text-gray-400">Kamomad summasi:</span>
                <span className="font-bold text-rose-600 font-mono">{calculations.totalShortage.toLocaleString()} so'm</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500 dark:text-gray-400">Ortiqchalik summasi:</span>
                <span className="font-bold text-blue-600 font-mono">+{calculations.totalSurplus.toLocaleString()} so'm</span>
              </div>
              <div className="flex justify-between pt-1 border-t border-gray-200 dark:border-gray-600 text-sm">
                <span className="font-bold text-gray-800 dark:text-gray-200">Sof balans:</span>
                <span className={`font-black font-mono ${calculations.netDifference < 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                  {calculations.netDifference > 0 ? `+${calculations.netDifference.toLocaleString()}` : calculations.netDifference.toLocaleString()} so'm
                </span>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setShowConfirmModal(false)}
                className="flex-1 py-3 px-4 rounded-xl font-bold text-xs bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 transition-colors cursor-pointer"
              >
                Bekor qilish
              </button>
              <button
                type="button"
                onClick={handleConfirmSubmit}
                disabled={submitting}
                className="flex-1 py-3 px-4 rounded-xl font-bold text-xs bg-blue-600 hover:bg-blue-700 text-white transition-all shadow-md cursor-pointer flex items-center justify-center gap-2"
              >
                {submitting ? <RefreshCw size={14} className="animate-spin" /> : <Check size={14} />}
                <span>Tasdiqlash va saqlash</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── SUCCESS RESULT MODAL ────────────────────────────────────────────── */}
      {successResult && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in">
          <div className="bg-white dark:bg-gray-800 rounded-3xl p-6 max-w-md w-full shadow-2xl border border-gray-200 dark:border-gray-700 text-center">
            <div className="w-16 h-16 bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400 rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle2 size={36} />
            </div>

            <h3 className="text-xl font-black text-gray-900 dark:text-white mb-1">
              Reviziya muvaffaqiyatli yakunlandi!
            </h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-6">
              Dalolatnoma #{successResult.audit_id} rasmiylashtirildi va ombor qoldiqlari yangilandi
            </p>

            <div className="p-4 bg-gray-50 dark:bg-gray-700/40 rounded-2xl space-y-2 mb-6 text-xs text-left">
              <div className="flex justify-between">
                <span className="text-gray-500 dark:text-gray-400">Pozitsiyalar soni:</span>
                <span className="font-bold">{successResult.count} ta</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500 dark:text-gray-400">Kamomad (Zarar):</span>
                <span className="font-bold text-rose-600 font-mono">{Number(successResult.shortage).toLocaleString()} so'm</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500 dark:text-gray-400">Ortiqchalik:</span>
                <span className="font-bold text-blue-600 font-mono">+{Number(successResult.surplus).toLocaleString()} so'm</span>
              </div>
              <div className="flex justify-between pt-1 border-t border-gray-200 dark:border-gray-600 text-sm">
                <span className="font-bold text-gray-900 dark:text-white">Sof balans:</span>
                <span className={`font-black font-mono ${successResult.net < 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                  {successResult.net > 0 ? `+${Number(successResult.net).toLocaleString()}` : Number(successResult.net).toLocaleString()} so'm
                </span>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setSuccessResult(null)}
                className="flex-1 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-xs shadow-md transition-colors cursor-pointer"
              >
                Tushunarli
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── AUDIT DETAILS MODAL ─────────────────────────────────────────────── */}
      {selectedAuditDetails && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in">
          <div className="bg-white dark:bg-gray-800 rounded-3xl max-w-4xl w-full max-h-[90vh] flex flex-col shadow-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
            {/* Modal Header */}
            <div className="p-6 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between shrink-0 bg-gray-50 dark:bg-gray-800">
              <div>
                <h3 className="text-lg font-black text-gray-900 dark:text-white flex items-center gap-2">
                  <FileText size={20} className="text-blue-500" />
                  Reviziya Dalolatnomasi #{selectedAuditDetails.audit.id}
                </h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                  Sana: {selectedAuditDetails.audit.audit_date} • Mas'ul: {selectedAuditDetails.audit.created_by}
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleExportExcel(selectedAuditDetails.audit, selectedAuditDetails.items)}
                  className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition shadow-sm cursor-pointer"
                  title="Excel formatida yuklab olish"
                >
                  <FileSpreadsheet size={15} />
                  <span>Excelda yuklab olish</span>
                </button>
                <button
                  type="button"
                  onClick={() => handlePrintAudit(selectedAuditDetails.audit, selectedAuditDetails.items)}
                  className="px-3.5 py-2 bg-blue-50 hover:bg-blue-100 dark:bg-blue-900/30 dark:hover:bg-blue-900/50 text-blue-600 dark:text-blue-400 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Printer size={15} />
                  <span>Chop etish</span>
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedAuditDetails(null)}
                  className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors cursor-pointer"
                >
                  <X size={20} />
                </button>
              </div>
            </div>

            {/* Modal Content Table */}
            <div className="flex-1 overflow-y-auto custom-scrollbar p-6">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
                <div className="p-3.5 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/50">
                  <div className="text-[11px] font-bold text-rose-600 dark:text-rose-400 uppercase">Kamomad summasi</div>
                  <div className="text-base font-black font-mono text-rose-700 dark:text-rose-300 mt-1">
                    {Number(selectedAuditDetails.audit.total_shortage_sum).toLocaleString()} so'm
                  </div>
                </div>
                <div className="p-3.5 rounded-2xl bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900/50">
                  <div className="text-[11px] font-bold text-blue-600 dark:text-blue-400 uppercase">Ortiqchalik summasi</div>
                  <div className="text-base font-black font-mono text-blue-700 dark:text-blue-300 mt-1">
                    +{Number(selectedAuditDetails.audit.total_surplus_sum).toLocaleString()} so'm
                  </div>
                </div>
                <div className="p-3.5 rounded-2xl bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600">
                  <div className="text-[11px] font-bold text-gray-500 dark:text-gray-300 uppercase">Sof balans</div>
                  <div className={`text-base font-black font-mono mt-1 ${selectedAuditDetails.audit.net_difference_sum < 0 ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                    {selectedAuditDetails.audit.net_difference_sum > 0 ? `+${Number(selectedAuditDetails.audit.net_difference_sum).toLocaleString()}` : Number(selectedAuditDetails.audit.net_difference_sum).toLocaleString()} so'm
                  </div>
                </div>
              </div>

              {selectedAuditDetails.audit.notes && (
                <div className="mb-4 p-3 bg-gray-50 dark:bg-gray-700/40 rounded-xl text-xs text-gray-700 dark:text-gray-200 border border-gray-200 dark:border-gray-600">
                  <strong>Izoh:</strong> {selectedAuditDetails.audit.notes}
                </div>
              )}

              <div className="rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-gray-100 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200 font-bold uppercase tracking-wider">
                      <th className="py-2.5 px-3 w-10 text-center text-gray-500 dark:text-gray-400">#</th>
                      <th className="py-2.5 px-4 text-gray-800 dark:text-gray-200">Tovar / Xomashyo</th>
                      <th className="py-2.5 px-3 text-center text-gray-800 dark:text-gray-200">Birlik</th>
                      <th className="py-2.5 px-3 text-right text-gray-800 dark:text-gray-200">Kutilgan</th>
                      <th className="py-2.5 px-3 text-right text-gray-800 dark:text-gray-200">Haqiqiy</th>
                      <th className="py-2.5 px-3 text-right text-gray-800 dark:text-gray-200">Farq</th>
                      <th className="py-2.5 px-3 text-right text-gray-800 dark:text-gray-200">Tannarx</th>
                      <th className="py-2.5 px-4 text-right text-gray-800 dark:text-gray-200">Farq summasi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-700/60 font-medium">
                    {selectedAuditDetails.items.map((it, idx) => {
                      const isShortage = it.diff_qty < -0.0001;
                      const isSurplus = it.diff_qty > 0.0001;
                      return (
                        <tr key={it.id} className={isShortage ? 'bg-rose-50/40 dark:bg-rose-950/30 hover:bg-rose-100/60 dark:hover:bg-rose-900/40' : (isSurplus ? 'bg-blue-50/40 dark:bg-blue-950/30 hover:bg-blue-100/60 dark:hover:bg-blue-900/40' : 'hover:bg-gray-100/70 dark:hover:bg-gray-700/50')}>
                          <td className="py-2.5 px-3 text-center text-gray-400 dark:text-gray-400 font-mono">{idx + 1}</td>
                          <td className="py-2.5 px-4 font-bold text-gray-900 dark:text-white">
                            {it.item_name}
                            {it.item_type === 'ingredient' && (
                              <span className="ml-2 text-[10px] font-semibold text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/30 px-1.5 py-0.5 rounded">
                                (Xomashyo)
                              </span>
                            )}
                          </td>
                          <td className="py-2.5 px-3 text-center text-gray-600 dark:text-gray-300 font-medium">{it.unit}</td>
                          <td className="py-2.5 px-3 text-right font-mono text-gray-700 dark:text-gray-300">{formatQuantity(it.expected_qty)}</td>
                          <td className="py-2.5 px-3 text-right font-mono font-bold text-gray-900 dark:text-white">{formatQuantity(it.actual_qty)}</td>
                          <td className="py-2.5 px-3 text-right font-mono font-bold">
                            <span className={isShortage ? 'text-rose-600 dark:text-rose-400' : (isSurplus ? 'text-blue-600 dark:text-blue-400' : 'text-gray-400 dark:text-gray-500')}>
                              {it.diff_qty > 0 ? `+${formatQuantity(it.diff_qty)}` : formatQuantity(it.diff_qty)} {it.unit}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono text-gray-700 dark:text-gray-300">
                            {Number(it.cost_price || 0).toLocaleString()} so'm
                          </td>
                          <td className="py-2.5 px-4 text-right font-mono font-bold">
                            <span className={isShortage ? 'text-rose-600 dark:text-rose-400' : (isSurplus ? 'text-blue-600 dark:text-blue-400' : 'text-gray-400 dark:text-gray-500')}>
                              {it.diff_cost > 0 ? `+${Number(it.diff_cost).toLocaleString()}` : Number(it.diff_cost).toLocaleString()} so'm
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 flex justify-end">
              <button
                type="button"
                onClick={() => setSelectedAuditDetails(null)}
                className="px-5 py-2.5 bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-800 dark:text-gray-200 rounded-xl text-xs font-bold transition-colors cursor-pointer"
              >
                Yopish
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
