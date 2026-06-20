import { useState, useEffect, memo } from 'react';
import { DatabaseBackup, Download, Upload, Users, Store, Trash2, Plus, RefreshCw, Printer, AlertTriangle, Phone } from 'lucide-react';
import { useApp } from './context/AppContext';

export default memo(function Settings() {
  const { t, storeName, setStoreName } = useApp();

  const [cashiers, setCashiers] = useState([]);
  const [newStoreName, setNewStoreName] = useState(storeName);
  const [loading, setLoading] = useState(false);
  const [phone1, setPhone1] = useState('');
  const [phone2, setPhone2] = useState('');
  const [phone3, setPhone3] = useState('');

  const [shopLocation, setShopLocation] = useState(() => localStorage.getItem('shopLocation') || '');
  const [telegramQr, setTelegramQr] = useState(() => localStorage.getItem('telegramQrCode') || '');
  const [instagramQr, setInstagramQr] = useState(() => localStorage.getItem('instagramQrCode') || '');

  const handleQrUpload = (e, storageKey, stateSetter) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (event) => {
      const base64Str = event.target.result;
      stateSetter(base64Str);
      localStorage.setItem(storageKey, base64Str);
      if (window.api) {
        const dbKey = storageKey === 'telegramQrCode' ? 'telegram_qr' : 'instagram_qr';
        await window.api.updateSetting({ key: dbKey, value: base64Str });
      }
      setToastMsg('QR-kod muvaffaqiyatli yuklandi!');
    };
    reader.readAsDataURL(file);
  };
  const [printers, setPrinters] = useState([]);
  const [selectedPrinter, setSelectedPrinter] = useState(() => {
    return localStorage.getItem('receiptPrinterName') || '';
  });
  const [selectedLabelPrinter, setSelectedLabelPrinter] = useState(() => {
    return localStorage.getItem('labelPrinterName') || '';
  });
  
  const [printerWidth, setPrinterWidth] = useState(() => {
    return localStorage.getItem('printer_width') || '58';
  });

  const [labelWidth, setLabelWidth] = useState(() => {
    return localStorage.getItem('label_width') || '60';
  });
  const [labelHeight, setLabelHeight] = useState(() => {
    return localStorage.getItem('label_height') || '30';
  });

  // New Cashier Form
  const [cashierName, setCashierName] = useState('');
  const [cashierPin, setCashierPin] = useState('');

  // Editing PIN State
  const [editingId, setEditingId] = useState(null);
  const [editPin, setEditPin] = useState('');
  const [deletingId, setDeletingId] = useState(null); // tracks which cashier is being deleted

  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [clearPin, setClearPin] = useState('');
  const [isClearing, setIsClearing] = useState(false);
  const [showImportConfirm, setShowImportConfirm] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  const [toastMsg, setToastMsg] = useState(null); // Custom notification string to avoid native alert() bugs

  const [isBaseLoaded, setIsBaseLoaded] = useState(true); // default true to avoid flicker
  const [baseLoading, setBaseLoading] = useState(false);
  const [showBaseConfirm, setShowBaseConfirm] = useState(null); // 'grocery' | 'hardware' | null

  // Ngrok states
  const [ngrokToken, setNgrokToken] = useState('');
  const [ngrokDomain, setNgrokDomain] = useState('');
  const [ngrokUrl, setNgrokUrl] = useState('');
  const [ngrokError, setNgrokError] = useState('');
  const [ngrokLoading, setNgrokLoading] = useState(false); // true while tunnel is starting
  const [geminiApiKey, setGeminiApiKey] = useState('');

  const loadCashiers = async () => {
    if (!window.api) return;
    const res = await window.api.getCashiers();
    if (res && res.success) {
      setCashiers(res.data);
    }
  };

  useEffect(() => {
    loadCashiers();
    loadPrinters();
    checkBase();

    if (window.api) {
      if (window.api.onNgrokUrlUpdated) {
        window.api.onNgrokUrlUpdated((url) => {
          setNgrokUrl(url);
        });
      }
      if (window.api.onNgrokUrlSuccess) {
        window.api.onNgrokUrlSuccess((url) => {
          setNgrokUrl(url);
          setNgrokError('');
          setNgrokLoading(false);
        });
      }
      if (window.api.onNgrokUrlError) {
        window.api.onNgrokUrlError((err) => {
          setNgrokUrl('');
          setNgrokError(err);
          setNgrokLoading(false);
        });
      }
      if (window.api.onNgrokUrlUpdated) {
        window.api.onNgrokUrlUpdated((url) => {
          setNgrokUrl(url);
          setNgrokLoading(false);
        });
      }
      // Restore any already-running tunnel URL immediately
      if (window.api.getNgrokUrl) {
        window.api.getNgrokUrl().then(url => {
          if (url) setNgrokUrl(url);
        });
      }
    }
  }, []);

  useEffect(() => {
    setNewStoreName(storeName);
  }, [storeName]);

  const checkBase = async () => {
    if (!window.api) return;
    try {
      const res = await window.api.checkBaseLoaded();
      if (res && res.success) {
        setIsBaseLoaded(res.loaded);
      }
    } catch (err) {
    }
  };

  const handleLoadBase = async () => {
    if (!window.api || !showBaseConfirm) return;
    setBaseLoading(true);
    const type = showBaseConfirm;
    setShowBaseConfirm(null);
    try {
      const res = await window.api.loadInitialBase(type);
      if (res && res.success) {
        setIsBaseLoaded(true);
        setToastMsg('База успешно загружена!');
      } else {
        setToastMsg('Ошибка загрузки базы: ' + res?.error);
      }
    } catch (err) {
      setToastMsg('IPC ошибка: ' + err.message);
    } finally {
      setBaseLoading(false);
    }
  };

  const loadPrinters = async () => {
    if (!window.api) return;
    try {
      const prns = await window.api.getPrinters();
      setPrinters(prns || []);
      
      // Load selected printer names from localStorage
      const receiptPrinter = localStorage.getItem('receiptPrinterName') || '';
      const labelPrinter = localStorage.getItem('labelPrinterName') || '';
      setSelectedPrinter(receiptPrinter);
      setSelectedLabelPrinter(labelPrinter);
      
      const res = await window.api.getSettings();
      if (res && res.success && res.data) {
        if (res.data.phone_1) setPhone1(res.data.phone_1);
        if (res.data.phone_2) setPhone2(res.data.phone_2);
        if (res.data.phone_3) setPhone3(res.data.phone_3);
        if (res.data.ngrok_token) setNgrokToken(res.data.ngrok_token);
        if (res.data.ngrok_domain) setNgrokDomain(res.data.ngrok_domain);
        if (res.data.gemini_api_key) setGeminiApiKey(res.data.gemini_api_key);
        
        // Sync SQLite settings to state & localStorage
        if (res.data.receipt_printer_name) {
          setSelectedPrinter(res.data.receipt_printer_name);
          localStorage.setItem('receiptPrinterName', res.data.receipt_printer_name);
        }
        if (res.data.label_printer_name) {
          setSelectedLabelPrinter(res.data.label_printer_name);
          localStorage.setItem('labelPrinterName', res.data.label_printer_name);
        }
        if (res.data.printer_width) {
          setPrinterWidth(res.data.printer_width);
          localStorage.setItem('printer_width', res.data.printer_width);
        }
        if (res.data.label_width) {
          setLabelWidth(res.data.label_width);
          localStorage.setItem('label_width', res.data.label_width);
        }
        if (res.data.label_height) {
          setLabelHeight(res.data.label_height);
          localStorage.setItem('label_height', res.data.label_height);
        }
        if (res.data.shop_location) {
          setShopLocation(res.data.shop_location);
          localStorage.setItem('shopLocation', res.data.shop_location);
        }
        if (res.data.telegram_qr) {
          setTelegramQr(res.data.telegram_qr);
          localStorage.setItem('telegramQrCode', res.data.telegram_qr);
        }
        if (res.data.instagram_qr) {
          setInstagramQr(res.data.instagram_qr);
          localStorage.setItem('instagramQrCode', res.data.instagram_qr);
        }
      }
    } catch (err) {
    }
  };

  const handleSavePrinter = async (printerName) => {
    setSelectedPrinter(printerName);
    localStorage.setItem('receiptPrinterName', printerName);
    if (window.api) {
      await window.api.updateSetting({ key: 'receipt_printer_name', value: printerName });
    }
  };

  const handleSaveLabelPrinter = async (printerName) => {
    setSelectedLabelPrinter(printerName);
    localStorage.setItem('labelPrinterName', printerName);
    if (window.api) {
      await window.api.updateSetting({ key: 'label_printer_name', value: printerName });
    }
  };

  const handleSavePrintersConfig = async () => {
    localStorage.setItem('receiptPrinterName', selectedPrinter);
    localStorage.setItem('labelPrinterName', selectedLabelPrinter);
    localStorage.setItem('label_width', labelWidth);
    localStorage.setItem('label_height', labelHeight);
    if (window.api) {
      await window.api.updateSetting({ key: 'receipt_printer_name', value: selectedPrinter });
      await window.api.updateSetting({ key: 'label_printer_name', value: selectedLabelPrinter });
      await window.api.updateSetting({ key: 'label_width', value: labelWidth });
      await window.api.updateSetting({ key: 'label_height', value: labelHeight });
    }
    setToastMsg(t('printersSaved'));
  };

  const handleSaveStoreName = async () => {
    if (!window.api || !newStoreName.trim()) return;
    setLoading(true);
    try {
      const res = await window.api.updateSetting({ key: 'store_name', value: newStoreName.trim() });
      if (res && res.success) {
        setStoreName(newStoreName.trim());
      }
    } catch (err) {
    } finally {
      setLoading(false);
    }
  };

  const handleSavePhones = async () => {
    if (!window.api) return;
    setLoading(true);
    try {
      await window.api.updateSetting({ key: 'phone_1', value: phone1.trim() });
      await window.api.updateSetting({ key: 'phone_2', value: phone2.trim() });
      await window.api.updateSetting({ key: 'phone_3', value: phone3.trim() });
      setToastMsg('Telefon raqamlari saqlandi!');
    } catch (err) {
      setToastMsg('Xatolik yuz berdi: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveNgrok = async () => {
    if (!window.api) return;
    const token  = ngrokToken.trim();
    const domain = ngrokDomain.trim();
    if (!token || !domain) {
      setNgrokError('Token va domain kiritish majburiy!');
      return;
    }
    setLoading(true);
    setNgrokError('');
    try {
      // 1. Save to DB (also done inside start-ngrok handler, but do it here too for safety)
      await window.api.updateSetting({ key: 'ngrok_token',  value: token });
      await window.api.updateSetting({ key: 'ngrok_domain', value: domain });

      // 2. Launch / restart the tunnel via main process
      setNgrokLoading(true);
      setNgrokUrl('');  // clear old URL while reconnecting
      const res = await window.api.saveNgrokSettings({ token, domain });
      if (res && res.success) {
        setToastMsg('Ngrok sozlamalari saqlandi! Ulagich ishga tushmoqda...');
      } else {
        setNgrokError(res?.error || 'Ngrok ishga tushirishda xatolik');
        setNgrokLoading(false);
      }
    } catch (err) {
      setNgrokError('Xatolik yuz berdi: ' + err.message);
      setNgrokLoading(false);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveGeminiKey = async () => {
    if (!window.api) return;
    try {
      await window.api.updateSetting({ key: 'gemini_api_key', value: geminiApiKey.trim() });
      setToastMsg('Gemini API kaliti saqlandi!');
    } catch (err) {
      setToastMsg('Kalitni saqlashda xatolik: ' + err.message);
    }
  };

  const handleAddCashier = async (e) => {
    e.preventDefault();
    if (!window.api || cashierPin.length !== 4) return;
    try {
      const res = await window.api.addCashier({ name: cashierName, pin: cashierPin });
      if (res && res.success) {
        setCashierName('');
        setCashierPin('');
        await loadCashiers();
      } else if (res?.error === 'pin_exists') {
        setToastMsg(t('pinExists'));
      } else {
        setToastMsg('Xatolik: ' + res?.error);
      }
    } catch (err) {
      setToastMsg('IPC xatosi: ' + err.message);
    }
    // Note: no loading spinner for add, form remains usable
  };
  const handleDeleteCashier = async (id) => {
    if (!window.api || deletingId !== null) return; // prevent double-clicks
    setDeletingId(id);
    // Close any open PIN edit row first to avoid stale state
    setEditingId(null);
    setEditPin('');
    try {
      const res = await window.api.deleteCashier(id);
      if (res && res.success) {
        await loadCashiers();
      } else if (res?.error === 'last_cashier') {
        setToastMsg(t('lastCashierError'));
      } else {
        setToastMsg('Xatolik: ' + res?.error);
      }
    } catch (err) {
      setToastMsg('IPC xatosi: ' + err.message);
    } finally {
      // Always reset blocking state — the UI must remain interactive
      setDeletingId(null);
    }
  };

  const handleUpdatePin = async (id) => {
    if (!window.api || editPin.length !== 4) return;
    try {
      const res = await window.api.updateCashierPin({ id, newPin: editPin });
      if (res && res.success) {
        setEditingId(null);
        setEditPin('');
        await loadCashiers();
      } else if (res?.error === 'pin_exists') {
        setToastMsg(t('pinExists'));
      } else {
        setToastMsg('Xatolik: ' + res?.error);
      }
    } catch (err) {
      setToastMsg('IPC xatosi: ' + err.message);
    } finally {
      // Always ensure edit row closes and UI is interactive
      setEditingId(null);
      setEditPin('');
    }
  };

  const handleClearTestData = async () => {
    if (!window.api || isClearing) return;
    if (clearPin !== '7532') {
      setToastMsg('Maxfiy PIN kod xato!');
      return;
    }
    setIsClearing(true);
    try {
      const result = await window.api.clearTestData();
      if (result && result.success) {
        setToastMsg(t('clearedSuccess') || 'История продаж успешно очищена');
        setShowClearConfirm(false);
        setClearPin('');
        window.location.reload();
      } else {
        setToastMsg('Ошибка: ' + result?.error);
      }
    } catch (err) {
      setToastMsg('Ошибка IPC: ' + err.message);
    } finally {
      setIsClearing(false);
      setShowClearConfirm(false);
    }
  };
  const handleExport = async () => {
    if (!window.api || isExporting) return;
    setIsExporting(true);
    try {
      const result = await window.api.exportDB();
      if (result && result.success) {
        setToastMsg('База данных успешно экспортирована: ' + result.filePath);
      } else if (result && !result.cancelled) {
        setToastMsg('Ошибка экспорта: ' + result.error);
      }
    } catch (err) {
      setToastMsg('IPC error: ' + err.message);
    } finally {
      setIsExporting(false);
    }
  };

  const handleImport = async () => {
    if (!window.api || isImporting) return;
    setIsImporting(true);
    try {
      const result = await window.api.importDB();
      if (result && !result.success && !result.cancelled) {
        setToastMsg('Ошибка импорта: ' + result.error);
      }
    } catch (err) {
      setToastMsg('IPC error: ' + err.message);
    } finally {
      setIsImporting(false);
      setShowImportConfirm(false);
    }
  };

  // Auto hide toast after 3 seconds
  useEffect(() => {
    if (toastMsg) {
      const timer = setTimeout(() => setToastMsg(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [toastMsg]);

  return (
    <div className="flex flex-col gap-6 transition-colors pb-6 relative">
      {/* Toast Notification (Replaces alert()) */}
      {toastMsg && (
        <div className="absolute top-4 left-1/2 transform -translate-x-1/2 z-[100] bg-gray-900 text-white px-6 py-3 rounded-lg shadow-2xl font-medium animate-bounce">
          {toastMsg}
        </div>
      )}

      {/* Clear Data Confirmation Modal */}
      {showClearConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-xl max-w-sm w-full mx-4 border border-gray-200 dark:border-gray-700">
            <div className="flex items-center gap-3 mb-4 text-red-600 dark:text-red-400">
              <AlertTriangle size={24} />
              <h3 className="text-lg font-bold">Очистка истории</h3>
            </div>
            <p className="text-gray-600 dark:text-gray-300 mb-6 text-sm">
              Вы уверены, что хотите удалить всю историю продаж и долги? Товары, ассортимент и пароли сохранятся. <strong>Это действие необратимо!</strong>
            </p>
            <div className="mb-6">
              <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">Maxfiy PIN kodni kiriting:</label>
              <input 
                type="password" 
                maxLength={4}
                value={clearPin}
                onChange={e => setClearPin(e.target.value.replace(/\D/g, ''))}
                className="w-full bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg px-4 py-3 text-center tracking-[1em] font-bold text-lg focus:outline-none focus:ring-2 focus:ring-red-500"
                placeholder="****"
                autoFocus
              />
            </div>
            <div className="flex justify-end gap-3">
              <button
                disabled={isClearing}
                onClick={() => { setShowClearConfirm(false); setClearPin(''); }}
                className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 rounded-md transition-colors disabled:opacity-50"
              >
                Отмена
              </button>
              <button
                disabled={isClearing}
                onClick={handleClearTestData}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-md transition-colors shadow-sm disabled:opacity-50 flex items-center gap-2"
              >
                {isClearing && <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                {isClearing ? 'Очистка...' : 'Да, очистить'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Import Database Confirmation Modal */}
      {showImportConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-xl max-w-sm w-full mx-4 border border-gray-200 dark:border-gray-700">
            <div className="flex items-center gap-3 mb-4 text-red-600 dark:text-red-400">
              <AlertTriangle size={24} />
              <h3 className="text-lg font-bold">Импорт базы данных</h3>
            </div>
            <p className="text-gray-600 dark:text-gray-300 mb-6 text-sm">
              ВНИМАНИЕ! Текущая база данных будет удалена и заменена на загруженную. Программа будет перезапущена. <strong>Продолжить?</strong>
            </p>
            <div className="flex justify-end gap-3">
              <button
                disabled={isImporting}
                onClick={() => setShowImportConfirm(false)}
                className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 rounded-md transition-colors disabled:opacity-50"
              >
                Отмена
              </button>
              <button
                disabled={isImporting}
                onClick={handleImport}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-md transition-colors shadow-sm disabled:opacity-50 flex items-center gap-2"
              >
                {isImporting && <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                {isImporting ? 'Загрузка...' : 'Да, импортировать'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Load Base Confirmation Modal */}
      {showBaseConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-xl max-w-sm w-full mx-4 border border-gray-200 dark:border-gray-700">
            <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2">Boshlang'ich bazani yuklash</h3>
            <p className="text-gray-600 dark:text-gray-300 mb-6 text-sm">
              Siz haqiqatan ham namunaviy oziq-ovqat tovarlari bazasini yuklamoqchimisiz?
            </p>
            <div className="flex justify-end gap-3">
              <button
                disabled={baseLoading}
                onClick={() => setShowBaseConfirm(null)}
                className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 rounded-md transition-colors disabled:opacity-50"
              >
                Bekor qilish / Отмена
              </button>
              <button
                disabled={baseLoading}
                onClick={handleLoadBase}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md transition-colors shadow-sm disabled:opacity-50"
              >
                Yuklash / Загрузить
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-gray-800 dark:text-white">{t('settings')}</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{t('settingsSubtitle')}</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        
        {/* Left Column: General & Backup */}
        <div className="space-y-6">
          {/* Initial Base Loader */}
          {!isBaseLoaded && (
            <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 border-2 border-dashed border-blue-300 dark:border-blue-900/60 bg-blue-50/30 dark:bg-blue-900/10 shadow-sm transition-colors">
              <h3 className="text-lg font-bold text-blue-700 dark:text-blue-400 mb-2">
                Boshlang'ich bazani yuklash
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                Dasturni tezroq boshlash uchun namunaviy tovarlar ro'yxatini yuklashingiz mumkin.
              </p>
              <div className="flex flex-col sm:flex-row gap-3">
                <button
                  onClick={() => setShowBaseConfirm('grocery')}
                  disabled={baseLoading}
                  className="w-full flex items-center justify-center gap-2 bg-blue-500 hover:bg-blue-600 disabled:opacity-50 text-white px-4 py-3 rounded-xl font-bold transition-all shadow-sm"
                >
                  <DatabaseBackup size={18} /> Taxminiy bazani yuklash
                </button>
              </div>
            </div>
          )}

          {/* Store Name Configuration */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 border border-gray-200 dark:border-gray-700 shadow-sm transition-colors">
            <h3 className="text-lg font-bold text-gray-800 dark:text-white mb-6 flex items-center gap-2">
              <Store className="text-emerald-500" size={20} />
              {t('storeNameLabel')}
            </h3>
            
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">{t('storeNameDesc')}</p>
              <div className="flex gap-2">
                <input 
                  type="text" 
                  value={newStoreName}
                  onChange={e => setNewStoreName(e.target.value)}
                  className="flex-1 border border-gray-300 dark:border-gray-600 rounded-lg px-4 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-emerald-500 focus:outline-none transition-colors"
                />
                <button 
                  onClick={handleSaveStoreName}
                  disabled={loading || newStoreName === storeName}
                  className="bg-emerald-500 hover:bg-emerald-600 disabled:bg-emerald-300 text-white px-4 py-2 rounded-lg font-semibold transition-colors"
                >
                  {t('save')}
                </button>
              </div>
            </div>

            <div className="mt-6 border-t border-gray-100 dark:border-gray-700 pt-6">
              <h4 className="font-semibold text-gray-800 dark:text-gray-200 mb-2 flex items-center gap-2">
                <Printer size={16} />
                {t('receiptPrinterLabel') || 'Принтер чеков'}
              </h4>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">
                {t('receiptPrinterDesc') || 'Выберите принтер (58мм) для автоматической печати чеков'}
              </p>
              <select
                value={selectedPrinter}
                onChange={(e) => handleSavePrinter(e.target.value)}
                className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-4 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-emerald-500 focus:outline-none transition-colors"
              >
                <option value="">-- {t('none') || 'Не печатать'} --</option>
                {printers.map((p, idx) => (
                  <option key={idx} value={p.name}>
                    {p.name}
                  </option>
                ))}
              </select>

              <div className="mt-4">
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                  Chek qog'ozi kengligi
                </label>
                <select
                  value={printerWidth}
                  onChange={async (e) => {
                    const val = e.target.value;
                    setPrinterWidth(val);
                    localStorage.setItem('printer_width', val);
                    if (window.api) {
                      await window.api.updateSetting({ key: 'printer_width', value: val });
                    }
                  }}
                  className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-4 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-emerald-500 focus:outline-none transition-colors"
                >
                  <option value="58">Kichik (58mm)</option>
                  <option value="80">Katta (80mm)</option>
                </select>
              </div>

              {/* Label Printer Selection */}
              <div className="mt-6 border-t border-gray-100 dark:border-gray-700 pt-6">
                <h4 className="font-semibold text-gray-800 dark:text-gray-200 mb-2 flex items-center gap-2">
                  <Printer size={16} />
                  {t('labelPrinterLabel')}
                </h4>
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">
                  {t('labelPrinterDesc')}
                </p>
                <select
                  value={selectedLabelPrinter}
                  onChange={(e) => handleSaveLabelPrinter(e.target.value)}
                  className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-4 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-emerald-500 focus:outline-none transition-colors"
                >
                  <option value="">-- {t('none')} --</option>
                  {printers.map((p, idx) => (
                    <option key={idx} value={p.name}>
                      {p.name}
                    </option>
                  ))}
                </select>

                <div className="mt-4 grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-1">
                      Stiker kengligi (mm)
                    </label>
                    <input
                      type="number"
                      value={labelWidth}
                      onChange={(e) => {
                        const val = e.target.value;
                        setLabelWidth(val);
                        localStorage.setItem('label_width', val);
                      }}
                      placeholder="Masalan: 60"
                      className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-emerald-500 focus:outline-none transition-colors"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-1">
                      Stiker balandligi (mm)
                    </label>
                    <input
                      type="number"
                      value={labelHeight}
                      onChange={(e) => {
                        const val = e.target.value;
                        setLabelHeight(val);
                        localStorage.setItem('label_height', val);
                      }}
                      placeholder="Masalan: 30"
                      className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-emerald-500 focus:outline-none transition-colors"
                    />
                  </div>
                </div>

                <div className="mt-4 flex justify-end">
                  <button
                    onClick={handleSavePrintersConfig}
                    className="bg-emerald-500 hover:bg-emerald-600 text-white px-5 py-2 rounded-lg font-semibold transition-colors text-sm cursor-pointer"
                  >
                    {t('savePrinters') || 'Сохранить настройки принтеров'}
                  </button>
                </div>
              </div>

              {/* Contact Phone Numbers */}
              <div className="mt-6 border-t border-gray-100 dark:border-gray-700 pt-6">
                <h4 className="font-semibold text-gray-800 dark:text-gray-200 mb-2 flex items-center gap-2">
                  <Phone size={16} />
                  Murojaat uchun telefonlar (Maks. 3 ta)
                </h4>
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                  Ushbu raqamlar chekning oxirida murojaat uchun deb ko'rsatiladi.
                </p>
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Telefon 1</label>
                    <input 
                      type="text" 
                      value={phone1}
                      onChange={e => setPhone1(e.target.value)}
                      placeholder="+998 (90) 123-45-67"
                      className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-4 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-emerald-500 focus:outline-none transition-colors"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Telefon 2</label>
                    <input 
                      type="text" 
                      value={phone2}
                      onChange={e => setPhone2(e.target.value)}
                      placeholder="+998 (90) 123-45-67"
                      className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-4 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-emerald-500 focus:outline-none transition-colors"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Telefon 3</label>
                    <input 
                      type="text" 
                      value={phone3}
                      onChange={e => setPhone3(e.target.value)}
                      placeholder="+998 (90) 123-45-67"
                      className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-4 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-emerald-500 focus:outline-none transition-colors"
                    />
                  </div>
                  <button 
                    onClick={handleSavePhones}
                    disabled={loading}
                    className="w-full mt-2 bg-emerald-500 hover:bg-emerald-600 text-white py-2 rounded-lg font-semibold transition-colors flex items-center justify-center gap-2"
                  >
                    Saqlash
                  </button>
                </div>
              </div>

              {/* Masofaviy boshqaruv (Telefon uchun) */}
              <div className="mt-6 border-t border-gray-100 dark:border-gray-700 pt-6">
                <h4 className="font-semibold text-gray-800 dark:text-gray-200 mb-2 flex items-center gap-2">
                  <span className="text-blue-500">📱</span>
                  Masofaviy boshqaruv (Telefon uchun)
                </h4>
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                  Telefon orqali sotuv va skladni boshqarish uchun Ngrok sozlamalarini kiriting.
                </p>
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Ngrok Token</label>
                    <input 
                      type="text" 
                      value={ngrokToken}
                      onChange={e => setNgrokToken(e.target.value)}
                      placeholder="Authtoken kiriting..."
                      className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-4 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:outline-none transition-colors"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Ngrok Havolasi (Static Domain)</label>
                    <input 
                      type="text" 
                      value={ngrokDomain}
                      onChange={e => setNgrokDomain(e.target.value)}
                      placeholder="Masalan: pasty-overcook-reckless.ngrok-free.dev"
                      className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-4 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:outline-none transition-colors"
                    />
                  </div>
                  <button 
                    onClick={handleSaveNgrok}
                    disabled={loading || ngrokLoading}
                    className={`w-full mt-2 py-2 rounded-lg font-semibold transition-all flex items-center justify-center gap-2 cursor-pointer ${
                      ngrokLoading
                        ? 'bg-blue-400 text-white cursor-not-allowed'
                        : 'bg-blue-500 hover:bg-blue-600 text-white'
                    }`}
                  >
                    {ngrokLoading ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                        <span>Ulanmoqda...</span>
                      </>
                    ) : (
                      <span>Saqlash va Ulashtirish</span>
                    )}
                  </button>

                  {ngrokLoading && (
                    <div className="mt-3 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-900/30 rounded-xl">
                      <p className="text-xs text-blue-600 dark:text-blue-400 flex items-center gap-2 font-medium">
                        <div className="w-3 h-3 border-2 border-blue-400/40 border-t-blue-500 rounded-full animate-spin shrink-0" />
                        Ngrok tunneli ishga tushmoqda, iltimos kuting...
                      </p>
                    </div>
                  )}

                  {ngrokUrl && !ngrokLoading && (
                    <div className="mt-4 p-3 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-900/30 rounded-xl">
                      <p className="text-xs font-bold text-emerald-700 dark:text-emerald-400 flex items-center gap-2 mb-1">
                        <span>✅</span>
                        Tunnel faol! Telefon orqali kirish havolasi:
                      </p>
                      <a 
                        href={ngrokUrl} 
                        target="_blank" 
                        rel="noreferrer"
                        className="text-xs font-mono font-bold text-emerald-700 dark:text-emerald-300 break-all underline block hover:text-emerald-500"
                      >
                        {ngrokUrl}
                      </a>
                    </div>
                  )}

                  {ngrokError && !ngrokLoading && (
                    <div className="mt-4 p-3 bg-red-50 dark:bg-red-950/20 border border-red-100 dark:border-red-900/30 rounded-xl">
                      <p className="text-xs font-bold text-red-600 dark:text-red-400 flex items-center gap-2">
                        <span>⚠️</span>
                        Ngrok xatoligi:
                      </p>
                      <p className="text-xs font-mono font-bold text-red-700 dark:text-red-300 break-all mt-1">
                        {ngrokError}
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* Sun'iy Intellekt Sozlamalari (Gemini) */}
              <div className="mt-6 border-t border-gray-100 dark:border-gray-700 pt-6">
                <h4 className="font-semibold text-gray-800 dark:text-gray-200 mb-2 flex items-center gap-2">
                  <span className="text-purple-500">✨</span>
                  Sun'iy Intellekt (Google Gemini API)
                </h4>
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                  Telefon kamerasidan chek va yuk xatlarini (nakladnoy) avtomatik o'qish hamda internetdan tovar shtrix-kodlarini qidirish uchun Google Gemini API kalitini kiriting.
                </p>
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Google Gemini API Key</label>
                    <input 
                      type="password" 
                      value={geminiApiKey}
                      onChange={e => setGeminiApiKey(e.target.value)}
                      placeholder="API kalitini kiriting (AIzaSy...)"
                      className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-4 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-purple-500 focus:outline-none transition-colors"
                    />
                  </div>
                  <button 
                    onClick={handleSaveGeminiKey}
                    className="w-full py-2 bg-purple-600 hover:bg-purple-700 text-white font-semibold rounded-lg transition-all flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <span>Gemini API Kalitini Saqlash</span>
                  </button>
                </div>
              </div>

            </div>
          </div>

          {/* Chek sozlamalari (Настройки чека) */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 border border-gray-200 dark:border-gray-700 shadow-sm transition-colors">
            <h3 className="text-lg font-bold text-gray-800 dark:text-white mb-6 flex items-center gap-2">
              <Store className="text-blue-500" size={20} />
              Chek sozlamalari (Настройки чека)
            </h3>
            
            <div className="space-y-4">


              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                  Magazin manzili (Адрес / Локация)
                </label>
                <textarea 
                  value={shopLocation}
                  onChange={async (e) => {
                    setShopLocation(e.target.value);
                    localStorage.setItem('shopLocation', e.target.value);
                    if (window.api) {
                      await window.api.updateSetting({ key: 'shop_location', value: e.target.value });
                    }
                  }}
                  className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-4 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-emerald-500 focus:outline-none transition-colors"
                  placeholder="Toshkent sh., Yunusobod t."
                  rows={2}
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                  Telegram QR-kod
                </label>
                <input 
                  type="file" 
                  accept="image/*"
                  onChange={e => handleQrUpload(e, 'telegramQrCode', setTelegramQr)}
                  className="w-full text-sm text-gray-500 dark:text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 dark:file:bg-gray-700 dark:file:text-gray-200"
                />
                {telegramQr && (
                  <div className="mt-2 flex items-center gap-2">
                    <img src={telegramQr} className="w-16 h-16 object-contain border rounded p-1 bg-white" />
                    <button 
                      type="button" 
                      onClick={async () => {
                        setTelegramQr(''); 
                        localStorage.removeItem('telegramQrCode'); 
                        if (window.api) {
                          await window.api.updateSetting({ key: 'telegram_qr', value: '' });
                        }
                      }}
                      className="text-xs text-red-500 hover:underline cursor-pointer"
                    >
                      O'chirish (Удалить)
                    </button>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                  Instagram QR-kod
                </label>
                <input 
                  type="file" 
                  accept="image/*"
                  onChange={e => handleQrUpload(e, 'instagramQrCode', setInstagramQr)}
                  className="w-full text-sm text-gray-500 dark:text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 dark:file:bg-gray-700 dark:file:text-gray-200"
                />
                {instagramQr && (
                  <div className="mt-2 flex items-center gap-2">
                    <img src={instagramQr} className="w-16 h-16 object-contain border rounded p-1 bg-white" />
                    <button 
                      type="button" 
                      onClick={async () => {
                        setInstagramQr(''); 
                        localStorage.removeItem('instagramQrCode'); 
                        if (window.api) {
                          await window.api.updateSetting({ key: 'instagram_qr', value: '' });
                        }
                      }}
                      className="text-xs text-red-500 hover:underline cursor-pointer"
                    >
                      O'chirish (Удалить)
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Backup & Restore */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 border border-gray-200 dark:border-gray-700 shadow-sm transition-colors">
            <h3 className="text-lg font-bold text-gray-800 dark:text-white mb-6 flex items-center gap-2">
              <DatabaseBackup className="text-blue-500" size={20} />
              {t('dataManagement')}
            </h3>

            <div className="space-y-4">
              <div className="p-4 rounded-xl border border-gray-100 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-900/20 flex flex-col sm:flex-row justify-between sm:items-center gap-4">
                <div>
                  <h4 className="font-semibold text-gray-900 dark:text-gray-100">{t('exportDb')}</h4>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{t('exportDesc')}</p>
                </div>
                <button disabled={isExporting} onClick={handleExport} className="flex items-center gap-2 bg-blue-500 hover:bg-blue-600 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-semibold transition-colors whitespace-nowrap">
                  {isExporting ? <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Download size={16} />}
                  Export
                </button>
              </div>

              <div className="p-4 rounded-xl border border-red-100 dark:border-red-900/30 bg-red-50/30 dark:bg-red-900/10 flex flex-col sm:flex-row justify-between sm:items-center gap-4">
                <div>
                  <h4 className="font-semibold text-red-700 dark:text-red-400">{t('importDb')}</h4>
                  <p className="text-sm text-red-500/80 dark:text-red-400/80 mt-1">{t('importDesc')}</p>
                </div>
                <button disabled={isImporting} onClick={() => setShowImportConfirm(true)} className="flex items-center gap-2 bg-red-500 hover:bg-red-600 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-semibold transition-colors whitespace-nowrap">
                  {isImporting ? <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Upload size={16} />}
                  Import
                </button>
              </div>

            </div>

            {/* Factory Reset */}
            <div className="mt-4 p-4 rounded-xl border-2 border-dashed border-red-300 dark:border-red-900/60 bg-red-50/30 dark:bg-red-900/10">
              <div className="flex items-start gap-3 mb-4">
                <div className="p-2 bg-red-100 dark:bg-red-900/40 rounded-lg">
                  <AlertTriangle className="text-red-600 dark:text-red-400" size={20} />
                </div>
                <div>
                  <h4 className="font-bold text-red-700 dark:text-red-400">
                    {t('clearDataTitle') || 'Очистить историю продаж'}
                  </h4>
                  <p className="text-sm text-red-500/80 dark:text-red-400/80 mt-1">
                    {t('clearDataDesc') || 'Удаляет все продажи и обнуляет долги. Товары и настройки сохраняются.'}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowClearConfirm(true)}
                className="w-full flex items-center justify-center gap-2 bg-red-600 hover:bg-red-700 active:bg-red-800 text-white px-4 py-3 rounded-lg text-sm font-bold transition-colors"
              >
                <Trash2 size={16} />
                {t('clearDataBtn') || 'Очистить историю продаж (Сброс)'}
              </button>
            </div>
          </div>
        </div>

        {/* Right Column: Cashiers */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 border border-gray-200 dark:border-gray-700 shadow-sm transition-colors">
          <h3 className="text-lg font-bold text-gray-800 dark:text-white mb-6 flex items-center gap-2">
            <Users className="text-orange-500" size={20} />
            {t('cashiersManagement')}
          </h3>

          <form onSubmit={handleAddCashier} className="flex gap-2 mb-6">
            <input 
              type="text" 
              placeholder={t('cashierName')}
              required
              value={cashierName}
              onChange={e => setCashierName(e.target.value)}
              className="flex-1 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-orange-500 focus:outline-none"
            />
            <input 
              type="password" 
              maxLength={4}
              placeholder="PIN"
              required
              value={cashierPin}
              onChange={e => setCashierPin(e.target.value.replace(/\D/, ''))}
              className="w-24 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-orange-500 focus:outline-none text-center tracking-widest"
            />
            <button type="submit" className="bg-orange-500 hover:bg-orange-600 text-white px-3 py-2 rounded-lg transition-colors flex items-center justify-center">
              <Plus size={20} />
            </button>
          </form>

          <div className="space-y-2">
            {cashiers.map(c => (
              <div key={c.id} className="flex items-center justify-between p-3 rounded-xl border border-gray-100 dark:border-gray-700/50 bg-gray-50/50 dark:bg-gray-800/50">
                <span className="font-semibold text-gray-800 dark:text-gray-200">{c.name}</span>
                
                <div className="flex items-center gap-2">
                  {editingId === c.id ? (
                    <div className="flex items-center gap-1">
                      <input 
                        type="password"
                        maxLength={4}
                        placeholder="New PIN"
                        value={editPin}
                        onChange={e => setEditPin(e.target.value.replace(/\D/, ''))}
                        className="w-20 border border-gray-300 dark:border-gray-600 rounded-md px-2 py-1 text-sm bg-white dark:bg-gray-700 text-center tracking-widest focus:outline-none focus:ring-1 focus:ring-orange-500"
                        autoFocus
                      />
                      <button onClick={() => handleUpdatePin(c.id)} className="p-1.5 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/30 rounded-md">
                        <RefreshCw size={16} />
                      </button>
                      <button onClick={() => setEditingId(null)} className="p-1.5 text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-md text-xs font-bold">
                        X
                      </button>
                    </div>
                  ) : (
                    <button 
                      onClick={() => { setEditingId(c.id); setEditPin(''); }}
                      className="text-xs px-2 py-1 rounded bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
                    >
                      PIN
                    </button>
                  )}
                  
                  <button
                    onClick={() => handleDeleteCashier(c.id)}
                    disabled={deletingId === c.id}
                    className="p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-md transition-colors ml-1 disabled:opacity-40 disabled:cursor-not-allowed"
                    title={t('delete')}
                  >
                    {deletingId === c.id
                      ? <RefreshCw size={16} className="animate-spin" />
                      : <Trash2 size={16} />}
                  </button>
                </div>
              </div>
            ))}
          </div>

        </div>
      </div>
    </div>
  );
});
