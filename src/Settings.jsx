import { useState, useEffect, memo } from 'react';
import { DatabaseBackup, Download, Upload, Users, Store, Trash2, Plus, RefreshCw, Printer, AlertTriangle, Phone, Eye, EyeOff } from 'lucide-react';
import { useApp } from './context/AppContext';
import { QRCodeCanvas } from 'qrcode.react';

export default memo(function Settings() {
  const { t, storeName, setStoreName, currentUser, shopLogo, setShopLogo, receiptLogo, setReceiptLogo, terminalMode, updateTerminalMode, businessType, setBusinessType, lang, fetchGlobalProducts } = useApp();
  const isAdmin = currentUser?.pin === 'xxMpos7532.' || currentUser?.role === 'admin';

  const [cashiers, setCashiers] = useState([]);
  const [waiters, setWaiters] = useState([]);
  const [newStoreName, setNewStoreName] = useState(storeName);
  const [loading, setLoading] = useState(false);
  const [isUnlocked, setIsUnlocked] = useState(true);
  const [unlockPin, setUnlockPin] = useState('');
  const [unlockError, setUnlockError] = useState(false);
  const [phone1, setPhone1] = useState('');
  const [phone2, setPhone2] = useState('');
  const [phone3, setPhone3] = useState('');

  // Waiter Form States
  const [waiterName, setWaiterName] = useState('');
  const [waiterPin, setWaiterPin] = useState('');
  const [waiterPercentage, setWaiterPercentage] = useState(10);
  const [waiterSalary, setWaiterSalary] = useState('');
  const [deletingWaiterId, setDeletingWaiterId] = useState(null);

  // Editing Waiter States
  const [editingWaiterId, setEditingWaiterId] = useState(null);
  const [editWaiterName, setEditWaiterName] = useState('');
  const [editWaiterPin, setEditWaiterPin] = useState('');
  const [editWaiterPercentage, setEditWaiterPercentage] = useState(10);
  const [editWaiterSalary, setEditWaiterSalary] = useState('');

  // PIN visibility states
  const [revealedCashiers, setRevealedCashiers] = useState({});
  const [revealedWaiters, setRevealedWaiters] = useState({});

  const [shopLocation, setShopLocation] = useState(() => localStorage.getItem('shopLocation') || '');

  const updateShopLocation = (val) => {
    setShopLocation(val);
    localStorage.setItem('shopLocation', val);
    if (window.api) {
      window.api.updateSetting({ key: 'shop_location', value: val });
    }
  };

  const updateTelegramUrl = (url) => {
    setTelegramUrl(url);
    if (window.api) {
      window.api.updateSetting({ key: 'telegram_url', value: url });
    }
    if (!url) {
      localStorage.removeItem('telegramQrCode');
      if (window.api) {
        window.api.updateSetting({ key: 'telegram_qr', value: '' });
      }
      return;
    }
    setTimeout(() => {
      const canvas = document.getElementById('tg-qr-canvas');
      if (canvas) {
        const base64 = canvas.toDataURL('image/png');
        localStorage.setItem('telegramQrCode', base64);
        if (window.api) {
          window.api.updateSetting({ key: 'telegram_qr', value: base64 });
        }
      }
    }, 200);
  };

  const updateInstagramUrl = (url) => {
    setInstagramUrl(url);
    if (window.api) {
      window.api.updateSetting({ key: 'instagram_url', value: url });
    }
    if (!url) {
      localStorage.removeItem('instagramQrCode');
      if (window.api) {
        window.api.updateSetting({ key: 'instagram_qr', value: '' });
      }
      return;
    }
    setTimeout(() => {
      const canvas = document.getElementById('ig-qr-canvas');
      if (canvas) {
        const base64 = canvas.toDataURL('image/png');
        localStorage.setItem('instagramQrCode', base64);
        if (window.api) {
          window.api.updateSetting({ key: 'instagram_qr', value: base64 });
        }
      }
    }, 200);
  };
  const handleLogoUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (event) => {
      const base64Str = event.target.result;
      setShopLogo(base64Str);
      if (window.api) {
        await window.api.updateSetting({ key: 'shop_logo', value: base64Str });
      }
      setToastMsg('Logotip muvaffaqiyatli yuklandi!');
    };
    reader.readAsDataURL(file);
  };
  const handleReceiptLogoUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (event) => {
      const base64Str = event.target.result;
      setReceiptLogo(base64Str);
      if (window.api) {
        await window.api.updateSetting({ key: 'receipt_logo', value: base64Str });
      }
      setToastMsg('Chek logotopi muvaffaqiyatli yuklandi!');
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
  const [cashierRole, setCashierRole] = useState('cashier');
  const [cashierSalary, setCashierSalary] = useState('');

  // Editing PIN State
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState('');
  const [editPin, setEditPin] = useState('');
  const [editRole, setEditRole] = useState('cashier');
  const [editSalary, setEditSalary] = useState('');
  const [deletingId, setDeletingId] = useState(null); // tracks which cashier is being deleted

  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [clearPin, setClearPin] = useState('');
  const [isClearing, setIsClearing] = useState(false);
  const [showClearWarehouseConfirm, setShowClearWarehouseConfirm] = useState(false);
  const [clearWarehousePin, setClearWarehousePin] = useState('');
  const [isClearingWarehouse, setIsClearingWarehouse] = useState(false);
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
  const [localIp, setLocalIp] = useState('');
  const [geminiApiKey, setGeminiApiKey] = useState('');
  const [telegramUrl, setTelegramUrl] = useState('');
  const [instagramUrl, setInstagramUrl] = useState('');
  const [selectedKitchenPrinter, setSelectedKitchenPrinter] = useState('');
  const [selectedBarPrinter, setSelectedBarPrinter] = useState('');
  const [selectedColdPrinter, setSelectedColdPrinter] = useState('');
  const [oshxona1Printer, setOshxona1Printer] = useState('');
  const [oshxona2Printer, setOshxona2Printer] = useState('');
  const [oshxona3Printer, setOshxona3Printer] = useState('');
  const [bar1Printer, setBar1Printer] = useState('');
  const [bar2Printer, setBar2Printer] = useState('');
  const [bar3Printer, setBar3Printer] = useState('');
  const [xolodniy1Printer, setXolodniy1Printer] = useState('');
  const [xolodniy2Printer, setXolodniy2Printer] = useState('');
  const [xolodniy3Printer, setXolodniy3Printer] = useState('');
  const [receiptLang, setReceiptLang] = useState('uz');
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [resetPin, setResetPin] = useState('');
  const [isResetting, setIsResetting] = useState(false);

  const loadCashiers = async () => {
    if (!window.api) return;
    const res = await window.api.getCashiers();
    if (res && res.success) {
      setCashiers(res.data);
    }
  };

  const loadWaiters = async () => {
    if (!window.api || !window.api.getWaiters) return;
    try {
      const res = await window.api.getWaiters();
      if (res && res.success) {
        setWaiters(res.data || []);
      }
    } catch {
      // Ignore
    }
  };

  const handleAddWaiter = async (e) => {
    e.preventDefault();
    if (!window.api || waiterPin.length !== 4) return;
    try {
      const res = await window.api.addWaiter({
        name: waiterName,
        pinCode: waiterPin,
        percentage: Number(waiterPercentage),
        salary: Number(waiterSalary) || 0
      });
      if (res && res.success) {
        setWaiterName('');
        setWaiterPin('');
        setWaiterPercentage(10);
        setWaiterSalary('');
        await loadWaiters();
      } else if (res?.error === 'pin_exists') {
        setToastMsg(t('pinExists'));
      } else {
        setToastMsg('Xatolik: ' + res?.error);
      }
    } catch (err) {
      setToastMsg('IPC xatosi: ' + err.message);
    }
  };

  const handleDeleteWaiter = async (id) => {
    if (!window.api || deletingWaiterId !== null) return;
    setDeletingWaiterId(id);
    try {
      const res = await window.api.deleteWaiter(id);
      if (res && res.success) {
        await loadWaiters();
      } else {
        setToastMsg('Xatolik: ' + res?.error);
      }
    } catch (err) {
      setToastMsg('IPC xatosi: ' + err.message);
    } finally {
      setDeletingWaiterId(null);
    }
  };

  useEffect(() => {
    loadCashiers();
    if (businessType === 'restaurant') {
      loadWaiters();
    }
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
      if (window.api.getLocalIPs) {
        window.api.getLocalIPs().then(ips => {
          if (ips && ips.length > 0) {
            setLocalIp(ips[0]);
          } else {
            setLocalIp('');
          }
        });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    } catch {
      // Ignore
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
        setToastMsg(lang === 'uz' ? 'Baza muvaffaqiyatli yuklandi!' : 'База успешно загружена!');
      } else {
        setToastMsg((lang === 'uz' ? 'Baza yuklashda xatolik: ' : 'Ошибка загрузки базы: ') + res?.error);
      }
    } catch (err) {
      setToastMsg((lang === 'uz' ? 'IPC xatoligi: ' : 'IPC ошибка: ') + err.message);
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
          localStorage.setItem('telegramQrCode', res.data.telegram_qr);
        }
        if (res.data.instagram_qr) {
          localStorage.setItem('instagramQrCode', res.data.instagram_qr);
        }
        if (res.data.telegram_url) {
          setTelegramUrl(res.data.telegram_url);
        }
        if (res.data.instagram_url) {
          setInstagramUrl(res.data.instagram_url);
        }
        if (res.data.kitchen_printer_name) {
          setSelectedKitchenPrinter(res.data.kitchen_printer_name);
        }
        if (res.data.bar_printer_name) {
          setSelectedBarPrinter(res.data.bar_printer_name);
        }
        if (res.data.cold_printer_name) {
          setSelectedColdPrinter(res.data.cold_printer_name);
        }
        if (res.data.oshxona_1_printer) {
          setOshxona1Printer(res.data.oshxona_1_printer);
        }
        if (res.data.oshxona_2_printer) {
          setOshxona2Printer(res.data.oshxona_2_printer);
        }
        if (res.data.oshxona_3_printer) {
          setOshxona3Printer(res.data.oshxona_3_printer);
        }
        if (res.data.bar_1_printer) {
          setBar1Printer(res.data.bar_1_printer);
        }
        if (res.data.bar_2_printer) {
          setBar2Printer(res.data.bar_2_printer);
        }
        if (res.data.bar_3_printer) {
          setBar3Printer(res.data.bar_3_printer);
        }
        if (res.data.xolodniy_1_printer) {
          setXolodniy1Printer(res.data.xolodniy_1_printer);
        }
        if (res.data.xolodniy_2_printer) {
          setXolodniy2Printer(res.data.xolodniy_2_printer);
        }
        if (res.data.xolodniy_3_printer) {
          setXolodniy3Printer(res.data.xolodniy_3_printer);
        }
        if (res.data.receipt_lang) {
          setReceiptLang(res.data.receipt_lang);
          localStorage.setItem('receipt_lang', res.data.receipt_lang);
        }
        if (res.data.shop_logo) {
          setShopLogo(res.data.shop_logo);
        }
      }
    } catch {
      // Ignore
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
    localStorage.setItem('receipt_lang', receiptLang);
    if (window.api) {
      await window.api.updateSetting({ key: 'receipt_printer_name', value: selectedPrinter });
      await window.api.updateSetting({ key: 'label_printer_name', value: selectedLabelPrinter });
      await window.api.updateSetting({ key: 'kitchen_printer_name', value: selectedKitchenPrinter });
      await window.api.updateSetting({ key: 'bar_printer_name', value: selectedBarPrinter });
      await window.api.updateSetting({ key: 'cold_printer_name', value: selectedColdPrinter });
      await window.api.updateSetting({ key: 'oshxona_1_printer', value: oshxona1Printer });
      await window.api.updateSetting({ key: 'oshxona_2_printer', value: oshxona2Printer });
      await window.api.updateSetting({ key: 'oshxona_3_printer', value: oshxona3Printer });
      await window.api.updateSetting({ key: 'bar_1_printer', value: bar1Printer });
      await window.api.updateSetting({ key: 'bar_2_printer', value: bar2Printer });
      await window.api.updateSetting({ key: 'bar_3_printer', value: bar3Printer });
      await window.api.updateSetting({ key: 'xolodniy_1_printer', value: xolodniy1Printer });
      await window.api.updateSetting({ key: 'xolodniy_2_printer', value: xolodniy2Printer });
      await window.api.updateSetting({ key: 'xolodniy_3_printer', value: xolodniy3Printer });
      await window.api.updateSetting({ key: 'receipt_lang', value: receiptLang });
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
    } catch {
      // Ignore
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
      const res = await window.api.addCashier({
        name: cashierName,
        pin: cashierPin,
        role: cashierRole,
        salary: Number(cashierSalary) || 0
      });
      if (res && res.success) {
        setCashierName('');
        setCashierPin('');
        setCashierRole('cashier');
        setCashierSalary('');
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

  const handleUpdateCashier = async (id) => {
    if (!window.api || editPin.length !== 4) return;
    try {
      const res = await window.api.updateCashier({
        id,
        name: editName,
        pin: editPin,
        role: editRole,
        salary: Number(editSalary) || 0
      });
      if (res && res.success) {
        setEditingId(null);
        await loadCashiers();
      } else if (res?.error === 'pin_exists') {
        setToastMsg(t('pinExists'));
      } else {
        setToastMsg('Xatolik: ' + res?.error);
      }
    } catch (err) {
      setToastMsg('IPC xatosi: ' + err.message);
    } finally {
      setEditingId(null);
    }
  };

  const handleUpdateWaiter = async (id) => {
    if (!window.api || editWaiterPin.length !== 4) return;
    try {
      const res = await window.api.updateWaiter({
        id,
        name: editWaiterName,
        pinCode: editWaiterPin,
        percentage: Number(editWaiterPercentage) || 0,
        salary: Number(editWaiterSalary) || 0
      });
      if (res && res.success) {
        setEditingWaiterId(null);
        await loadWaiters();
      } else if (res?.error === 'pin_exists') {
        setToastMsg(t('pinExists'));
      } else {
        setToastMsg('Xatolik: ' + res?.error);
      }
    } catch (err) {
      setToastMsg('IPC xatosi: ' + err.message);
    } finally {
      setEditingWaiterId(null);
    }
  };

  const handleSaveBusinessType = async (type) => {
    if (!window.api) {
      setBusinessType(type);
      return;
    }
    setLoading(true);
    try {
      const res = await window.api.updateSetting({ key: 'business_type', value: type });
      if (res && res.success) {
        setBusinessType(type);
        setToastMsg(lang === 'uz' ? 'Biznes turi muvaffaqiyatli yangilandi!' : 'Тип бизнеса успешно обновлен!');
      } else {
        setToastMsg('Xatolik: ' + res?.error);
      }
    } catch (err) {
      setToastMsg('IPC xatosi: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleClearTestData = async () => {
    if (!window.api || isClearing) return;
    if (clearPin !== 'xxMpos7532.') {
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
        setToastMsg((lang === 'uz' ? 'Xatolik: ' : 'Ошибка: ') + result?.error);
      }
    } catch (err) {
      setToastMsg((lang === 'uz' ? 'IPC xatoligi: ' : 'Ошибка IPC: ') + err.message);
    } finally {
      setIsClearing(false);
      setShowClearConfirm(false);
    }
  };
  const handleClearWarehouse = async () => {
    if (!window.api || isClearingWarehouse) return;
    if (clearWarehousePin !== 'xxMpos7532.') {
      setToastMsg('Maxfiy PIN kod xato!');
      return;
    }
    setIsClearingWarehouse(true);
    try {
      const result = await window.api.clearWarehouse();
      if (result && result.success) {
        setToastMsg(lang === 'uz' ? 'Ombor muvaffaqiyatli tozalandi!' : 'Склад успешно очищен!');
        setShowClearWarehouseConfirm(false);
        setClearWarehousePin('');
        if (fetchGlobalProducts) fetchGlobalProducts();
      } else {
        setToastMsg((lang === 'uz' ? 'Xatolik: ' : 'Ошибка: ') + result?.error);
      }
    } catch (err) {
      setToastMsg((lang === 'uz' ? 'IPC xatoligi: ' : 'Ошибка IPC: ') + err.message);
    } finally {
      setIsClearingWarehouse(false);
      setShowClearWarehouseConfirm(false);
    }
  };
  const handleResetFactoryData = async () => {
    if (!window.api || isResetting) return;
    if (resetPin !== 'xxMpos7532.') {
      setToastMsg('Maxfiy PIN kod xato!');
      return;
    }
    setIsResetting(true);
    try {
      const result = await window.api.resetFactoryData();
      if (result && result.success) {
        setToastMsg(lang === 'uz' ? 'Zavod sozlamalari muvaffaqiyatli tiklandi!' : 'Заводские настройки успешно восстановлены!');
        setShowResetConfirm(false);
        setResetPin('');
        localStorage.clear();
        window.location.reload();
      } else {
        setToastMsg((lang === 'uz' ? 'Xatolik: ' : 'Ошибка: ') + result?.error);
      }
    } catch (err) {
      setToastMsg((lang === 'uz' ? 'IPC xatoligi: ' : 'Ошибка IPC: ') + err.message);
    } finally {
      setIsResetting(false);
      setShowResetConfirm(false);
    }
  };

  const handleExport = async () => {
    if (!window.api || isExporting) return;
    setIsExporting(true);
    try {
      const result = await window.api.exportDB();
      if (result && result.success) {
        setToastMsg((lang === 'uz' ? 'Baza muvaffaqiyatli eksport qilindi: ' : 'База данных успешно экспортирована: ') + result.filePath);
      } else if (result && !result.cancelled) {
        setToastMsg((lang === 'uz' ? 'Eksport xatoligi: ' : 'Ошибка экспорта: ') + result.error);
      }
    } catch (err) {
      setToastMsg((lang === 'uz' ? 'IPC xatoligi: ' : 'IPC error: ') + err.message);
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
        setToastMsg((lang === 'uz' ? 'Import xatoligi: ' : 'Ошибка импорта: ') + result.error);
      }
    } catch (err) {
      setToastMsg((lang === 'uz' ? 'IPC xatoligi: ' : 'IPC error: ') + err.message);
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
              <h3 className="text-lg font-bold">{lang === 'uz' ? 'Tarixni tozalash' : 'Очистка истории'}</h3>
            </div>
            <p className="text-gray-600 dark:text-gray-300 mb-6 text-sm">
              {lang === 'uz' ? (
                <>Barcha savdo tarixi va qarzlarni o'chirishni xohlaysizmi? Tovar, assortiment va parollar saqlanadi. <strong>Ushbu amalni ortga qaytarib bo'lmaydi!</strong></>
              ) : (
                <>Вы уверены, что хотите удалить всю историю продаж и долги? Товары, ассортимент and пароли сохранятся. <strong>Это действие необратимо!</strong></>
              )}
            </p>
            <div className="mb-6">
              <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">Maxfiy parolni kiriting (xxMpos7532.):</label>
              <input 
                type="password" 
                value={clearPin}
                onChange={e => setClearPin(e.target.value)}
                className="w-full bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg px-4 py-3 text-center font-bold text-lg focus:outline-none focus:ring-2 focus:ring-red-500"
                placeholder="Parol"
                autoFocus
              />
            </div>
            <div className="flex justify-end gap-3">
              <button
                disabled={isClearing}
                onClick={() => { setShowClearConfirm(false); setClearPin(''); }}
                className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 rounded-md transition-colors disabled:opacity-50"
              >
                {lang === 'uz' ? 'Bekor qilish' : 'Отмена'}
              </button>
              <button
                disabled={isClearing}
                onClick={handleClearTestData}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-md transition-colors shadow-sm disabled:opacity-50 flex items-center gap-2"
              >
                {isClearing && <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                {isClearing ? (lang === 'uz' ? 'Tozalanmoqda...' : 'Очистка...') : (lang === 'uz' ? 'Ha, tozalash' : 'Да, очистить')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Clear Warehouse Confirmation Modal */}
      {showClearWarehouseConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-xl max-w-sm w-full mx-4 border border-gray-200 dark:border-gray-700">
            <div className="flex items-center gap-3 mb-4 text-amber-600 dark:text-amber-400">
              <AlertTriangle size={24} />
              <h3 className="text-lg font-bold">{lang === 'uz' ? 'Omborni tozalash' : 'Очистка склада'}</h3>
            </div>
            <p className="text-gray-600 dark:text-gray-300 mb-6 text-sm">
              {lang === 'uz' ? (
                <>Haqiqatan ham ombordagi barcha tovarlar va ularning reseptlarini o'chirmoqchimisiz? Sotuvlar va qarzlarga ta'sir qilmaydi. <strong>Ushbu amalni ortga qaytarib bo'lmaydi!</strong></>
              ) : (
                <>Вы уверены, что хотите удалить все товары на складе и их рецепты? Это не повлияет на продажи и долги. <strong>Это действие необратимо!</strong></>
              )}
            </p>
            <div className="mb-6">
              <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">Maxfiy parolni kiriting (xxMpos7532.):</label>
              <input 
                type="password" 
                value={clearWarehousePin}
                onChange={e => setClearWarehousePin(e.target.value)}
                className="w-full bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg px-4 py-3 text-center font-bold text-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
                placeholder="Parol"
                autoFocus
              />
            </div>
            <div className="flex justify-end gap-3">
              <button
                disabled={isClearingWarehouse}
                onClick={() => { setShowClearWarehouseConfirm(false); setClearWarehousePin(''); }}
                className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 rounded-md transition-colors disabled:opacity-50"
              >
                {lang === 'uz' ? 'Bekor qilish' : 'Отмена'}
              </button>
              <button
                disabled={isClearingWarehouse}
                onClick={handleClearWarehouse}
                className="px-4 py-2 text-sm font-medium text-white bg-amber-600 hover:bg-amber-700 rounded-md transition-colors shadow-sm disabled:opacity-50 flex items-center gap-2"
              >
                {isClearingWarehouse && <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                {isClearingWarehouse ? (lang === 'uz' ? 'Tozalanmoqda...' : 'Очистка...') : (lang === 'uz' ? 'Ha, tozalash' : 'Да, очистить')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Factory Reset Confirmation Modal */}
      {showResetConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-xl max-w-sm w-full mx-4 border border-gray-200 dark:border-gray-700">
            <div className="flex items-center gap-3 mb-4 text-red-600 dark:text-red-400">
              <AlertTriangle size={24} className="animate-pulse" />
              <h3 className="text-lg font-bold">{lang === 'uz' ? 'Butunlay tozalash (Zavod holati)' : 'Полный сброс (Factory Reset)'}</h3>
            </div>
            <p className="text-gray-600 dark:text-gray-300 mb-6 text-sm">
              {lang === 'uz' ? (
                <><strong>DIQQAT! Barcha ma'lumotlar o'chib ketadi!</strong> Sotuvlar, tovarlar, kassirlar, ofitsiantlar va barcha sozlamalar butunlay o'chiriladi. Dastur zavod sozlamalariga qaytariladi va qayta yoqiladi.</>
              ) : (
                <><strong>ВНИМАНИЕ! Все данные будут удалены!</strong> Продажи, товары, кассиры, официанты и все настройки будут полностью стёрты. Приложение вернётся к заводскому состоянию и перезапустится.</>
              )}
            </p>
            <div className="mb-6">
              <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">Maxfiy parolni kiriting (xxMpos7532.):</label>
              <input 
                type="password" 
                value={resetPin}
                onChange={e => setResetPin(e.target.value)}
                className="w-full bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg px-4 py-3 text-center font-bold text-lg focus:outline-none focus:ring-2 focus:ring-red-500"
                placeholder="Parol"
                autoFocus
              />
            </div>
            <div className="flex justify-end gap-3">
              <button
                disabled={isResetting}
                onClick={() => { setShowResetConfirm(false); setResetPin(''); }}
                className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 rounded-md transition-colors disabled:opacity-50"
              >
                {lang === 'uz' ? 'Bekor qilish' : 'Отмена'}
              </button>
              <button
                disabled={isResetting}
                onClick={handleResetFactoryData}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-md transition-colors shadow-sm disabled:opacity-50 flex items-center gap-2"
              >
                {isResetting && <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                {isResetting ? (lang === 'uz' ? 'O\'chirilmoqda...' : 'Сброс...') : (lang === 'uz' ? 'Butunlay o\'chirish' : 'Полный сброс')}
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
              <h3 className="text-lg font-bold">{lang === 'uz' ? 'Baza importi' : 'Импорт базы данных'}</h3>
            </div>
            <p className="text-gray-600 dark:text-gray-300 mb-6 text-sm">
              {lang === 'uz' ? (
                <>DIQQAT! Joriy ma'lumotlar bazasi o'chiriladi va yuklangan baza bilan almashtiriladi. Dastur qayta ishga tushadi. <strong>Davom etamizmi?</strong></>
              ) : (
                <>ВНИМАНИЕ! Текущая база данных будет удалена и заменена на загруженную. Программа будет перезапущена. <strong>Продолжить?</strong></>
              )}
            </p>
            <div className="flex justify-end gap-3">
              <button
                disabled={isImporting}
                onClick={() => setShowImportConfirm(false)}
                className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 rounded-md transition-colors disabled:opacity-50"
              >
                {lang === 'uz' ? 'Bekor qilish' : 'Отмена'}
              </button>
              <button
                disabled={isImporting}
                onClick={handleImport}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-md transition-colors shadow-sm disabled:opacity-50 flex items-center gap-2"
              >
                {isImporting && <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                {isImporting ? (lang === 'uz' ? 'Yuklanmoqda...' : 'Загрузка...') : (lang === 'uz' ? 'Ha, import qilish' : 'Да, импортировать')}
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
                {lang === 'uz' ? 'Bekor qilish' : 'Отмена'}
              </button>
              <button
                disabled={baseLoading}
                onClick={handleLoadBase}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md transition-colors shadow-sm disabled:opacity-50"
              >
                {lang === 'uz' ? 'Yuklash' : 'Загрузить'}
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

      <div className={(businessType === 'restaurant' || isAdmin) ? "grid grid-cols-1 lg:grid-cols-2 gap-6 items-start" : "max-w-2xl mx-auto w-full"}>
        
        {/* Left Column: General & Backup */}
        {(businessType === 'restaurant' || isAdmin) && (
          <div className="space-y-6">
            <>
          {/* Initial Base Loader */}
          {isUnlocked && !isBaseLoaded && (
            <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 border-2 border-dashed border-blue-300 dark:border-blue-900/60 bg-blue-50/30 dark:bg-blue-900/10 shadow-sm transition-colors">
              <h3 className="text-lg font-bold text-blue-700 dark:text-blue-400 mb-2">
                Boshlang'ich bazani yuklash
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                Dasturni tezroq boshlash uchun namunaviy tovarlar ro'yxatini yuklashingiz mumkin.
              </p>
              <div className="flex flex-col sm:flex-row gap-3">
                <button
                  onClick={() => setShowBaseConfirm(businessType === 'restaurant' ? 'restaurant' : 'grocery')}
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

            {/* ── Logo Upload Section ── */}
            <div className="mt-6 pt-6 border-t border-gray-100 dark:border-gray-700">
              <h4 className="font-bold text-gray-800 dark:text-white mb-1 flex items-center gap-2">
                <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 0 0 1.5-1.5V6a1.5 1.5 0 0 0-1.5-1.5H3.75A1.5 1.5 0 0 0 2.25 6v12a1.5 1.5 0 0 0 1.5 1.5Zm10.5-11.25h.008v.008h-.008V8.25Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z" />
                </svg>
                Biznes logotipi
              </h4>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
                Bu logo qulflangan ekranda va barcha sahifalarda ko'rinadi. PNG, JPG yoki SVG rasmni yuklang.
              </p>
              <div className="flex items-start gap-4">
                {/* Logo Preview */}
                <div className="w-24 h-24 rounded-2xl border-2 border-dashed border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-900/40 flex items-center justify-center overflow-hidden shrink-0 relative group">
                  {shopLogo ? (
                    <>
                      <img src={shopLogo} alt="Logo" className="w-full h-full object-contain p-2" />
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity rounded-2xl flex items-center justify-center">
                        <span className="text-white text-[10px] font-bold">Hozirgi logo</span>
                      </div>
                    </>
                  ) : (
                    <div className="text-center">
                      <svg xmlns="http://www.w3.org/2000/svg" className="w-8 h-8 text-gray-300 dark:text-gray-600 mx-auto mb-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 0 0 1.5-1.5V6a1.5 1.5 0 0 0-1.5-1.5H3.75A1.5 1.5 0 0 0 2.25 6v12a1.5 1.5 0 0 0 1.5 1.5Zm10.5-11.25h.008v.008h-.008V8.25Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z" />
                      </svg>
                      <span className="text-[10px] text-gray-400 dark:text-gray-500 font-medium">Logo yo'q</span>
                    </div>
                  )}
                </div>

                {/* Upload / Delete Buttons */}
                <div className="flex flex-col gap-2 flex-1">
                  <label className="flex items-center justify-center gap-2 px-4 py-3 bg-blue-50 hover:bg-blue-100 dark:bg-blue-900/20 dark:hover:bg-blue-900/40 text-blue-600 dark:text-blue-400 font-semibold text-sm rounded-xl border border-blue-200 dark:border-blue-800/50 cursor-pointer transition-all">
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5" />
                    </svg>
                    Rasm yuklash
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleLogoUpload}
                      className="hidden"
                    />
                  </label>
                  {shopLogo && (
                    <button
                      onClick={async () => {
                        setShopLogo('');
                        if (window.api) {
                          await window.api.updateSetting({ key: 'shop_logo', value: '' });
                        }
                        setToastMsg("Logotip o'chirildi, standart logo qaytarildi.");
                      }}
                      className="flex items-center justify-center gap-2 px-4 py-2.5 bg-red-50 hover:bg-red-100 dark:bg-red-950/20 dark:hover:bg-red-900/30 text-red-600 dark:text-red-400 font-semibold text-sm rounded-xl border border-red-200 dark:border-red-900/40 transition-all cursor-pointer"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                      </svg>
                      Logotipni o'chirish
                    </button>
                  )}
                  <p className="text-[11px] text-gray-400 dark:text-gray-500 leading-relaxed">
                    Rasm avtomatik saqlanadi va qulflangan ekranda ham ko'rinadi.
                  </p>
                </div>
              </div>
            </div>

            {/* ── Receipt Logo Upload Section ── */}
            <div className="mt-6 pt-6 border-t border-gray-100 dark:border-gray-700">
              <h4 className="font-bold text-gray-800 dark:text-white mb-1 flex items-center gap-2">
                <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 0 0 1.5-1.5V6a1.5 1.5 0 0 0-1.5-1.5H3.75A1.5 1.5 0 0 0 2.25 6v12a1.5 1.5 0 0 0 1.5 1.5Zm10.5-11.25h.008v.008h-.008V8.25Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z" />
                </svg>
                Chek logotopi (Qora-oq)
              </h4>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
                Chekda chop etiladigan alohida logotip. Agar bu yuklanmasa, asosiy biznes logotipi ishlatiladi. Printerda sifatli chiqishi uchun yuqori kontrastli qora-oq logotip yuklash tavsiya etiladi.
              </p>
              <div className="flex items-start gap-4">
                {/* Receipt Logo Preview */}
                <div className="w-24 h-24 rounded-2xl border-2 border-dashed border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-900/40 flex items-center justify-center overflow-hidden shrink-0 relative group">
                  {receiptLogo ? (
                    <>
                      <img src={receiptLogo} alt="Receipt Logo" className="w-full h-full object-contain p-2" />
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity rounded-2xl flex items-center justify-center">
                        <span className="text-white text-[10px] font-bold">Chek logotipi</span>
                      </div>
                    </>
                  ) : (
                    <div className="text-center">
                      <svg xmlns="http://www.w3.org/2000/svg" className="w-8 h-8 text-gray-300 dark:text-gray-600 mx-auto mb-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 0 0 1.5-1.5V6a1.5 1.5 0 0 0-1.5-1.5H3.75A1.5 1.5 0 0 0 2.25 6v12a1.5 1.5 0 0 0 1.5 1.5Zm10.5-11.25h.008v.008h-.008V8.25Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z" />
                      </svg>
                      <span className="text-[10px] text-gray-400 dark:text-gray-500 font-medium">Asosiy logo ishlatiladi</span>
                    </div>
                  )}
                </div>

                {/* Upload / Delete Buttons */}
                <div className="flex flex-col gap-2 flex-1">
                  <label className="flex items-center justify-center gap-2 px-4 py-3 bg-blue-50 hover:bg-blue-100 dark:bg-blue-900/20 dark:hover:bg-blue-900/40 text-blue-600 dark:text-blue-400 font-semibold text-sm rounded-xl border border-blue-200 dark:border-blue-800/50 cursor-pointer transition-all">
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5" />
                    </svg>
                    Chek uchun rasm yuklash
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleReceiptLogoUpload}
                      className="hidden"
                    />
                  </label>
                  {receiptLogo && (
                    <button
                      onClick={async () => {
                        setReceiptLogo('');
                        if (window.api) {
                          await window.api.updateSetting({ key: 'receipt_logo', value: '' });
                        }
                        setToastMsg("Chek logotopi o'chirildi, standart logo qaytarildi.");
                      }}
                      className="flex items-center justify-center gap-2 px-4 py-2.5 bg-red-50 hover:bg-red-100 dark:bg-red-950/20 dark:hover:bg-red-900/30 text-red-600 dark:text-red-400 font-semibold text-sm rounded-xl border border-red-200 dark:border-red-900/40 transition-all cursor-pointer"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                      </svg>
                      Chek logotopini o'chirish
                    </button>
                  )}
                </div>
              </div>
            </div>

            {isUnlocked && (
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
                  disabled={businessType === 'restaurant'}
                  value={businessType === 'restaurant' ? '80' : printerWidth}
                  onChange={async (e) => {
                    const val = e.target.value;
                    setPrinterWidth(val);
                    localStorage.setItem('printer_width', val);
                    if (window.api) {
                      await window.api.updateSetting({ key: 'printer_width', value: val });
                    }
                  }}
                  className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-4 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-emerald-500 focus:outline-none transition-colors disabled:opacity-75 disabled:bg-gray-100 dark:disabled:bg-gray-800"
                >
                  <option value="58">Kichik (58mm)</option>
                  <option value="80">Katta (80mm)</option>
                </select>
                {businessType === 'restaurant' && (
                  <p className="text-[10px] text-amber-600 dark:text-amber-400 mt-1 font-semibold">
                    * Kafe rejimi uchun chek qog'ozi o'lchami 80mm ga qulflangan.
                  </p>
                )}
              </div>

              <div className="mt-4">
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                  Chek chop etish tili
                </label>
                <select
                  value={receiptLang}
                  onChange={(e) => setReceiptLang(e.target.value)}
                  className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-4 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-emerald-500 focus:outline-none transition-colors"
                >
                  <option value="uz">O'zbekcha</option>
                  <option value="ru">Русский</option>
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

                {businessType === 'restaurant' && (
                  <div className="mt-6 border-t border-gray-100 dark:border-gray-700 pt-6 space-y-4">
                    <h4 className="font-bold text-gray-800 dark:text-gray-200 flex items-center gap-2">
                      <Printer size={18} className="text-emerald-500" />
                      <span>Taomlar chop etish printerlari 🍽️</span>
                    </h4>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      Oshxona, Bar va Xolodniy bo'limlari uchun alohida printerlarni tanlang:
                    </p>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                      {/* Oshxona Printerlari */}
                      <div className="space-y-3 bg-gray-50/50 dark:bg-gray-800/40 p-4 rounded-2xl border border-gray-200/50 dark:border-gray-700/50">
                        <h5 className="font-bold text-xs uppercase tracking-wider text-gray-600 dark:text-gray-400 border-b pb-1">Oshxona bo'limi</h5>
                        <div>
                          <label className="block text-[11px] font-semibold text-gray-500 dark:text-gray-400 mb-1">Oshxona-1 printeri</label>
                          <select value={oshxona1Printer} onChange={(e) => setOshxona1Printer(e.target.value)} className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-1.5 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-none">
                            <option value="">-- {t('none') || 'Не печатать'} --</option>
                            {printers.map((p, idx) => <option key={idx} value={p.name}>{p.name}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className="block text-[11px] font-semibold text-gray-500 dark:text-gray-400 mb-1">Oshxona-2 printeri</label>
                          <select value={oshxona2Printer} onChange={(e) => setOshxona2Printer(e.target.value)} className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-1.5 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-none">
                            <option value="">-- {t('none') || 'Не печатать'} --</option>
                            {printers.map((p, idx) => <option key={idx} value={p.name}>{p.name}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className="block text-[11px] font-semibold text-gray-500 dark:text-gray-400 mb-1">Oshxona-3 printeri</label>
                          <select value={oshxona3Printer} onChange={(e) => setOshxona3Printer(e.target.value)} className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-1.5 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-none">
                            <option value="">-- {t('none') || 'Не печатать'} --</option>
                            {printers.map((p, idx) => <option key={idx} value={p.name}>{p.name}</option>)}
                          </select>
                        </div>
                      </div>

                      {/* Bar Printerlari */}
                      <div className="space-y-3 bg-gray-50/50 dark:bg-gray-800/40 p-4 rounded-2xl border border-gray-200/50 dark:border-gray-700/50">
                        <h5 className="font-bold text-xs uppercase tracking-wider text-gray-600 dark:text-gray-400 border-b pb-1">Bar bo'limi</h5>
                        <div>
                          <label className="block text-[11px] font-semibold text-gray-500 dark:text-gray-400 mb-1">Bar-1 printeri</label>
                          <select value={bar1Printer} onChange={(e) => setBar1Printer(e.target.value)} className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-1.5 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-none">
                            <option value="">-- {t('none') || 'Не печатать'} --</option>
                            {printers.map((p, idx) => <option key={idx} value={p.name}>{p.name}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className="block text-[11px] font-semibold text-gray-500 dark:text-gray-400 mb-1">Bar-2 printeri</label>
                          <select value={bar2Printer} onChange={(e) => setBar2Printer(e.target.value)} className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-1.5 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-none">
                            <option value="">-- {t('none') || 'Не печатать'} --</option>
                            {printers.map((p, idx) => <option key={idx} value={p.name}>{p.name}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className="block text-[11px] font-semibold text-gray-500 dark:text-gray-400 mb-1">Bar-3 printeri</label>
                          <select value={bar3Printer} onChange={(e) => setBar3Printer(e.target.value)} className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-1.5 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-none">
                            <option value="">-- {t('none') || 'Не печатать'} --</option>
                            {printers.map((p, idx) => <option key={idx} value={p.name}>{p.name}</option>)}
                          </select>
                        </div>
                      </div>

                      {/* Xolodniy Printerlari */}
                      <div className="space-y-3 bg-gray-50/50 dark:bg-gray-800/40 p-4 rounded-2xl border border-gray-200/50 dark:border-gray-700/50">
                        <h5 className="font-bold text-xs uppercase tracking-wider text-gray-600 dark:text-gray-400 border-b pb-1">Xolodniy bo'limi</h5>
                        <div>
                          <label className="block text-[11px] font-semibold text-gray-500 dark:text-gray-400 mb-1">Xolodniy-1 printeri</label>
                          <select value={xolodniy1Printer} onChange={(e) => setXolodniy1Printer(e.target.value)} className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-1.5 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-none">
                            <option value="">-- {t('none') || 'Не печатать'} --</option>
                            {printers.map((p, idx) => <option key={idx} value={p.name}>{p.name}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className="block text-[11px] font-semibold text-gray-500 dark:text-gray-400 mb-1">Xolodniy-2 printeri</label>
                          <select value={xolodniy2Printer} onChange={(e) => setXolodniy2Printer(e.target.value)} className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-1.5 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-none">
                            <option value="">-- {t('none') || 'Не печатать'} --</option>
                            {printers.map((p, idx) => <option key={idx} value={p.name}>{p.name}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className="block text-[11px] font-semibold text-gray-500 dark:text-gray-400 mb-1">Xolodniy-3 printeri</label>
                          <select value={xolodniy3Printer} onChange={(e) => setXolodniy3Printer(e.target.value)} className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-1.5 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-none">
                            <option value="">-- {t('none') || 'Не печатать'} --</option>
                            {printers.map((p, idx) => <option key={idx} value={p.name}>{p.name}</option>)}
                          </select>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                <div className="mt-4 flex justify-end">
                  <button
                    onClick={handleSavePrintersConfig}
                    className="bg-emerald-500 hover:bg-emerald-600 text-white px-5 py-2 rounded-lg font-semibold transition-colors text-sm cursor-pointer"
                  >
                    {t('savePrinters') || 'Сохранить настройки принтеров'}
                  </button>
                </div>
              </div>
            </div>
          )}

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
              {isUnlocked && (
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
                        href={businessType === 'restaurant' ? `${ngrokUrl}/mobile` : ngrokUrl} 
                        target="_blank" 
                        rel="noreferrer"
                        className="text-xs font-mono font-bold text-emerald-700 dark:text-emerald-300 break-all underline block hover:text-emerald-500"
                      >
                        {businessType === 'restaurant' ? `${ngrokUrl}/mobile` : ngrokUrl}
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

                  {/* ── Local connection (Wi-Fi) Section ── */}
                  {localIp && (
                    <div className="mt-6 pt-6 border-t border-gray-100 dark:border-gray-700">
                      <h4 className="font-bold text-gray-800 dark:text-white mb-2 flex items-center gap-2 text-sm">
                        <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M8.288 15.038a5.25 5.25 0 0 1 7.424 0M5.106 11.856a9 9 0 0 1 13.788 0M1.924 8.674a12.75 12.75 0 0 1 20.152 0M12.53 18.22a1.5 1.5 0 1 1-1.06-1.06 1.5 1.5 0 0 1 1.06 1.06Z" />
                        </svg>
                        Lokal tarmoq (Wi-Fi) orqali ulanish
                      </h4>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mb-4 leading-relaxed">
                        Telefoningizni ushbu kompyuter ulangan Wi-Fi tarmog'iga ulang va quyidagi QR-kodni skanerlang:
                      </p>
                      <div className="flex flex-col sm:flex-row items-center gap-6 p-4 bg-emerald-50/40 dark:bg-emerald-950/10 border border-emerald-100 dark:border-emerald-900/30 rounded-2xl">
                        {/* QR Code */}
                        <div className="shrink-0 bg-white p-2.5 rounded-2xl border border-emerald-100 shadow-sm flex items-center justify-center">
                          <QRCodeCanvas
                            value={businessType === 'restaurant' ? `http://${localIp}:4000/mobile` : `http://${localIp}:4000`}
                            size={128}
                            className="bg-white"
                          />
                        </div>
                        
                        {/* Connection Details */}
                        <div className="flex-1 text-center sm:text-left space-y-2">
                          <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Lokal Havola</p>
                          <a
                            href={businessType === 'restaurant' ? `http://${localIp}:4000/mobile` : `http://${localIp}:4000`}
                            target="_blank"
                            rel="noreferrer"
                            className="text-base font-mono font-black text-emerald-700 dark:text-emerald-300 break-all underline hover:text-emerald-500 block"
                          >
                            {businessType === 'restaurant' ? `http://${localIp}:4000/mobile` : `http://${localIp}:4000`}
                          </a>
                          <p className="text-xs text-gray-400 dark:text-gray-500 leading-relaxed">
                            Bu havola internet talab qilmaydi, faqat mahalliy Wi-Fi tarmog'i orqali ma'lumotlarni juda tez uzatadi.
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

              {/* Sun'iy Intellekt Sozlamalari (Gemini) */}
              {isUnlocked && (
                <div className="mt-6 border-t border-gray-100 dark:border-gray-700 pt-6">
                  <h4 className="font-semibold text-gray-800 dark:text-gray-200 mb-2 flex items-center gap-2">
                    <span className="text-purple-500">✨</span>
                    Sun'iy Intellekt (Google Gemini API)
                  </h4>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                    Telefon kamerasidan chek va yuk xatlarini (nakladnoy) avtomatik o'qish hamda internetdan tovar shtrix-kodlarini qidirish uchun Google Gemini API kalitini kiriting.
                  </p>
                  <div className="space-y-3">
                    <input 
                      type="password" 
                      value={geminiApiKey}
                      onChange={e => setGeminiApiKey(e.target.value)}
                      placeholder="AI API kalitini kiriting..."
                      className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-4 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-purple-500 focus:outline-none transition-colors"
                    />
                    <button
                      onClick={handleSaveGeminiKey}
                      className="w-full py-2 bg-purple-600 hover:bg-purple-700 text-white font-semibold rounded-lg transition-colors"
                    >
                      Gemini API kalitini saqlash
                    </button>
                  </div>
                </div>
              )}

              </div>

              {/* Biznes turi sozlamalari */}
              {isUnlocked && (
                <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 border border-gray-200 dark:border-gray-700 shadow-sm transition-colors">
                  <h3 className="text-lg font-bold text-gray-800 dark:text-white mb-4 flex items-center gap-2">
                    <Store className="text-blue-500" size={20} />
                    {lang === 'uz' ? 'Biznes Turi' : 'Тип Бизнеса'}
                  </h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
                    {lang === 'uz' 
                      ? 'Kassa tizimi ish rejimini tanlang (Magazin yoki Kafe/Restoran)' 
                      : 'Выберите режим работы системы кассы (Магазин или Кафе/Ресторан)'}
                  </p>
                  <div className="flex gap-4">
                    <button
                      type="button"
                      onClick={() => handleSaveBusinessType('retail')}
                      className={`flex-1 py-3 px-4 rounded-xl font-bold border-2 transition-all cursor-pointer ${
                        businessType === 'retail' 
                          ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 border-blue-500' 
                          : 'bg-white dark:bg-gray-800 text-gray-500 dark:text-gray-400 border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-750'
                      }`}
                    >
                      🛍️ Do'kon (Retail)
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSaveBusinessType('restaurant')}
                      className={`flex-1 py-3 px-4 rounded-xl font-bold border-2 transition-all cursor-pointer ${
                        businessType === 'restaurant' 
                          ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 border-blue-500' 
                          : 'bg-white dark:bg-gray-800 text-gray-500 dark:text-gray-400 border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-750'
                      }`}
                    >
                      🍽️ Restoran / Kafe
                    </button>
                  </div>
                </div>
              )}

              {/* Yordamchi terminal rejimi settings */}
              {isUnlocked && (
                <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 border border-gray-200 dark:border-gray-700 shadow-sm transition-colors">
                  <h3 className="text-lg font-bold text-gray-800 dark:text-white mb-4 flex items-center gap-2">
                    <span className="text-blue-500">🖥️</span>
                    Yordamchi Terminal Rejimi
                  </h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
                    Ushbu rejim yoqilganda dastur faqat ofitsiantlar va menejer parolini tan oladi (kassir parollari ishlamaydi). Dastur to'g'ridan-to'g'ri stol tanlash oynasida ochiladi va chap panel butunlay yashiriladi.
                  </p>
                  <label className="flex items-center gap-3 cursor-pointer group select-none">
                    <input 
                      type="checkbox"
                      checked={terminalMode}
                      onChange={(e) => {
                        updateTerminalMode(e.target.checked);
                        setToastMsg(e.target.checked ? "Yordamchi terminal rejimi yoqildi!" : "Yordamchi terminal rejimi o'chirildi!");
                      }}
                      className="w-5 h-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                    />
                    <span className="text-sm font-bold text-gray-700 dark:text-gray-300 group-hover:text-gray-900 dark:group-hover:text-white transition-colors">
                      Yordamchi Terminal Rejimini Faollashtirish (Terminal Mode)
                    </span>
                  </label>
                </div>
              )}

              {/* Ijtimoiy Tarmoqlar & Manzil Sozlamalari (Check uchun QR kodlar) */}
              <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 border border-gray-200 dark:border-gray-700 shadow-sm transition-colors">
                <h3 className="text-lg font-bold text-gray-800 dark:text-white mb-6 flex items-center gap-2">
                  <span className="text-blue-500">📍</span>
                  Ijtimoiy Tarmoqlar & Manzil (Chek uchun)
                </h3>
                
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                      Manzil (Chekda manzil yozuvi chiqadi)
                    </label>
                    <input 
                      type="text" 
                      value={shopLocation}
                      onChange={e => updateShopLocation(e.target.value)}
                      placeholder="Toshkent sh., Yunusobod tumani..."
                      className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-4 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-emerald-500 focus:outline-none transition-colors"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                      Telegram Havolasi (Chekda QR-kod chiqadi)
                    </label>
                    <input 
                      type="text" 
                      value={telegramUrl}
                      onChange={e => updateTelegramUrl(e.target.value)}
                      placeholder="https://t.me/xxmpos"
                      className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-4 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-emerald-500 focus:outline-none transition-colors"
                    />
                    <QRCodeCanvas id="tg-qr-canvas" value={telegramUrl || ' '} style={{ display: 'none' }} size={256} />
                    {telegramUrl && (
                      <div className="mt-2 flex items-center gap-4 p-2 bg-gray-50 dark:bg-gray-800 rounded-xl border border-gray-150 dark:border-gray-700 max-w-xs">
                        <QRCodeCanvas value={telegramUrl} size={64} className="border rounded p-1 bg-white" />
                        <div>
                          <div className="text-xs font-bold text-gray-700 dark:text-gray-300">Telegram QR Preview</div>
                          <button 
                            type="button" 
                            onClick={() => updateTelegramUrl('')}
                            className="text-xs text-red-500 hover:underline cursor-pointer font-bold mt-1 block"
                          >
                            {lang === 'uz' ? 'O\'chirish' : 'Удалить'}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                      Instagram Havolasi (Chekda QR-kod chiqadi)
                    </label>
                    <input 
                      type="text" 
                      value={instagramUrl}
                      onChange={e => updateInstagramUrl(e.target.value)}
                      placeholder="https://instagram.com/xxmpos"
                      className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-4 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-emerald-500 focus:outline-none transition-colors"
                    />
                    <QRCodeCanvas id="ig-qr-canvas" value={instagramUrl || ' '} style={{ display: 'none' }} size={256} />
                    {instagramUrl && (
                      <div className="mt-2 flex items-center gap-4 p-2 bg-gray-50 dark:bg-gray-800 rounded-xl border border-gray-150 dark:border-gray-700 max-w-xs">
                        <QRCodeCanvas value={instagramUrl} size={64} className="border rounded p-1 bg-white" />
                        <div>
                          <div className="text-xs font-bold text-gray-700 dark:text-gray-300">Instagram QR Preview</div>
                          <button 
                            type="button" 
                            onClick={() => updateInstagramUrl('')}
                            className="text-xs text-red-500 hover:underline cursor-pointer font-bold mt-1 block"
                          >
                            {lang === 'uz' ? 'O\'chirish' : 'Удалить'}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Backup & Restore */}
              {isUnlocked && (
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

                {/* Clear Sales History */}
                <div className="mt-4 p-4 rounded-xl border border-red-200 dark:border-red-905 bg-red-50/10 dark:bg-red-900/5">
                  <div className="flex items-start gap-3 mb-4">
                    <div className="p-2 bg-red-100 dark:bg-red-900/40 rounded-lg">
                      <Trash2 className="text-red-600 dark:text-red-400" size={20} />
                    </div>
                    <div>
                      <h4 className="font-bold text-red-700 dark:text-red-400">
                        {t('clearDataTitle') || 'Savdo tarixini tozalash'}
                      </h4>
                      <p className="text-xs text-red-500/80 dark:text-red-400/80 mt-1">
                        {t('clearDataDesc') || "Barcha sotuvlarni o'chiradi va qarzlarni nollaydi. Tovarlar, kassirlar va sozlamalar saqlanadi."}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => setShowClearConfirm(true)}
                    className="w-full flex items-center justify-center gap-2 bg-red-600/10 hover:bg-red-600/20 active:bg-red-600/30 text-red-600 dark:text-red-450 px-4 py-2.5 rounded-lg text-sm font-bold transition-colors border border-red-250 dark:border-red-900/30 cursor-pointer"
                  >
                    <Trash2 size={16} />
                    {t('clearDataBtn') || 'Savdo tarixini tozalash (Reset)'}
                  </button>
                </div>

                {/* Clear Warehouse */}
                <div className="mt-4 p-4 rounded-xl border border-amber-200 dark:border-amber-900 bg-amber-50/10 dark:bg-amber-900/5">
                  <div className="flex items-start gap-3 mb-4">
                    <div className="p-2 bg-amber-100 dark:bg-amber-900/40 rounded-lg">
                      <Trash2 className="text-amber-600 dark:text-amber-400" size={20} />
                    </div>
                    <div>
                      <h4 className="font-bold text-amber-700 dark:text-amber-400">
                        Omborni tozalash
                      </h4>
                      <p className="text-xs text-amber-500/80 dark:text-amber-400/80 mt-1">
                        Barcha tovarlar va ularning reseptlarini o'chirib yuboradi. Sotuvlar va qarzlarga ta'sir qilmaydi.
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => setShowClearWarehouseConfirm(true)}
                    className="w-full flex items-center justify-center gap-2 bg-amber-600/10 hover:bg-amber-600/20 active:bg-amber-600/30 text-amber-600 dark:text-amber-450 px-4 py-2.5 rounded-lg text-sm font-bold transition-colors border border-amber-200 dark:border-amber-900/30 cursor-pointer"
                  >
                    <Trash2 size={16} />
                    Omborni tozalash
                  </button>
                </div>

                {/* Factory Reset */}
                <div className="mt-4 p-4 rounded-xl border-2 border-dashed border-red-500 dark:border-red-950/60 bg-red-50/30 dark:bg-red-950/10">
                  <div className="flex items-start gap-3 mb-4">
                    <div className="p-2 bg-red-100 dark:bg-red-900/40 rounded-lg">
                      <AlertTriangle className="text-red-600 dark:text-red-400" size={20} />
                    </div>
                    <div>
                      <h4 className="font-bold text-red-700 dark:text-red-400">
                        {lang === 'uz' ? 'Butunlay tozalash (Factory Reset)' : 'Полный сброс (Factory Reset)'}
                      </h4>
                      <p className="text-xs text-red-500/80 dark:text-red-400/80 mt-1">
                        {lang === 'uz' ? "Tizimdagi barcha tovarlar, sotuvlar, xodimlar va sozlamalarni o'chirib yuboradi va dasturni boshlang'ich holatiga qaytaradi." : 'Удаляет все товары, продажи, сотрудников и настройки. Сбрасывает приложение к начальному состоянию.'}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => setShowResetConfirm(true)}
                    className="w-full flex items-center justify-center gap-2 bg-red-600 hover:bg-red-700 active:bg-red-800 text-white px-4 py-3 rounded-lg text-sm font-bold transition-colors shadow-md shadow-red-650/10 cursor-pointer"
                  >
                    <AlertTriangle size={16} />
                    {lang === 'uz' ? 'Butunlay tozalash (Factory Reset)' : 'Полный сброс (Factory Reset)'}
                  </button>
            </div>
          </div>
          )}
            </>
          </div>
        )}

        {/* Right Column: Cashiers */}
        <div className="space-y-6">
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 border border-gray-200 dark:border-gray-700 shadow-sm transition-colors">
            <h3 className="text-lg font-bold text-gray-800 dark:text-white mb-6 flex items-center gap-2">
              <Users className="text-orange-500" size={20} />
              {t('cashiersManagement')}
            </h3>

            {currentUser?.role !== 'waiter' && (
              <form onSubmit={handleAddCashier} className="space-y-3 mb-6 border-b border-gray-100 dark:border-gray-700 pb-6">
                <div className="flex gap-2">
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
                    onChange={e => setCashierPin(e.target.value.replace(/\D/g, ''))}
                    className="w-24 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-orange-500 focus:outline-none text-center tracking-widest"
                  />
                  {businessType !== 'restaurant' && (
                    <button type="submit" className="bg-orange-500 hover:bg-orange-600 text-white px-4 py-2 rounded-lg transition-colors flex items-center justify-center h-10 cursor-pointer shrink-0">
                      <Plus size={20} />
                    </button>
                  )}
                </div>
                {businessType === 'restaurant' && (
                  <div className="flex gap-2 items-center">
                    <select
                      value={cashierRole}
                      onChange={e => setCashierRole(e.target.value)}
                      className="flex-1 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-orange-500 focus:outline-none"
                    >
                      <option value="cashier">Kassir</option>
                      <option value="manager">Menejer</option>
                      <option value="admin">Asosiy Admin</option>
                    </select>
                    <input
                      type="number"
                      placeholder="Oylik maosh"
                      value={cashierSalary}
                      onChange={e => setCashierSalary(e.target.value)}
                      className="w-32 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-orange-500 focus:outline-none"
                    />
                    <button type="submit" className="bg-orange-500 hover:bg-orange-600 text-white px-4 py-2 rounded-lg transition-colors flex items-center justify-center h-10 cursor-pointer">
                      <Plus size={20} />
                    </button>
                  </div>
                )}
              </form>
            )}

            <div className="space-y-2">
              {cashiers.map(c => {
                const canReveal = true;
                const canEdit = currentUser?.role !== 'waiter' && (c.pin !== 'xxMpos7532.' || currentUser?.pin === 'xxMpos7532.');
                const isRevealed = revealedCashiers[c.id];

                return (
                  <div key={c.id}>
                    {editingId === c.id ? (
                      <div className="w-full space-y-3 p-3 bg-gray-50 dark:bg-gray-700/30 rounded-xl border border-orange-500/30 mb-2">
                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={editName}
                            onChange={e => setEditName(e.target.value)}
                            className="flex-1 border border-gray-300 dark:border-gray-600 rounded-md px-2 py-1 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none"
                            placeholder="Ism"
                            required
                          />
                          <input 
                            type="password"
                            maxLength={4}
                            placeholder="PIN"
                            value={editPin}
                            onChange={e => setEditPin(e.target.value.replace(/\D/g, ''))}
                            className="w-20 border border-gray-300 dark:border-gray-600 rounded-md px-2 py-1 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-center tracking-widest focus:outline-none"
                            required
                          />
                          {businessType !== 'restaurant' && (
                            <>
                              <button
                                onClick={() => handleUpdateCashier(c.id)}
                                className="px-3 py-1 bg-emerald-600 text-white rounded text-sm font-semibold hover:bg-emerald-700 h-8 cursor-pointer shrink-0"
                              >
                                Saqlash
                              </button>
                              <button
                                onClick={() => setEditingId(null)}
                                className="px-2 py-1 bg-gray-300 dark:bg-gray-600 text-gray-800 dark:text-gray-300 rounded text-sm hover:bg-gray-400 h-8 cursor-pointer shrink-0"
                              >
                                X
                              </button>
                            </>
                          )}
                        </div>
                        {businessType === 'restaurant' && (
                          <div className="flex gap-2 items-center">
                            <select
                              value={editRole}
                              onChange={e => setEditRole(e.target.value)}
                              className="flex-1 border border-gray-300 dark:border-gray-600 rounded-md px-2 py-1 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none"
                            >
                              <option value="cashier">Kassir</option>
                              <option value="manager">Menejer</option>
                              <option value="admin">Asosiy Admin</option>
                            </select>
                            <input
                              type="number"
                              value={editSalary}
                              onChange={e => setEditSalary(e.target.value)}
                              className="w-28 border border-gray-300 dark:border-gray-600 rounded-md px-2 py-1 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none"
                              placeholder="Oylik"
                            />
                            <button
                              onClick={() => handleUpdateCashier(c.id)}
                              className="px-3 py-1 bg-emerald-600 text-white rounded text-sm font-semibold hover:bg-emerald-700 h-8 cursor-pointer"
                            >
                              Saqlash
                            </button>
                            <button
                              onClick={() => setEditingId(null)}
                              className="px-2 py-1 bg-gray-300 dark:bg-gray-600 text-gray-800 dark:text-gray-300 rounded text-sm hover:bg-gray-400 h-8 cursor-pointer"
                            >
                              X
                            </button>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="flex items-center justify-between p-3 rounded-xl border border-gray-100 dark:border-gray-700/50 bg-gray-50/50 dark:bg-gray-800/50 mb-2">
                        <div className="flex flex-col">
                          <span className="font-semibold text-gray-800 dark:text-gray-200">
                            {c.name} {businessType === 'restaurant' && (
                              <span className="text-xs font-normal text-orange-500 font-semibold px-1.5 py-0.5 rounded bg-orange-50 dark:bg-orange-950/30 border border-orange-100 dark:border-orange-900/30 ml-1.5">
                                {c.role === 'admin' ? 'Admin' : c.role === 'manager' ? 'Menejer' : 'Kassir'}
                              </span>
                            )}
                          </span>
                          <div className="flex gap-4 mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                            <span>PIN: {canReveal ? (isRevealed ? c.pin : '••••') : '••••'}</span>
                            {businessType === 'restaurant' && c.salary > 0 && (
                              <span>Oylik: {Number(c.salary).toLocaleString()} so'm</span>
                            )}
                          </div>
                        </div>
                        
                        <div className="flex items-center gap-2">
                          {canReveal && (
                            <button 
                              onClick={() => setRevealedCashiers(prev => ({ ...prev, [c.id]: !prev[c.id] }))}
                              className="p-1.5 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 rounded-md transition-colors"
                              title={isRevealed ? "Yashirish" : "Ko'rsatish"}
                            >
                              {isRevealed ? <EyeOff size={16} /> : <Eye size={16} />}
                            </button>
                          )}

                          {canEdit && (
                            <button 
                              onClick={() => {
                                setEditingId(c.id);
                                setEditName(c.name);
                                setEditPin(c.pin);
                                setEditRole(c.role || 'cashier');
                                setEditSalary(c.salary || '');
                              }}
                              className="text-xs px-2 py-1 rounded bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
                            >
                              Tahrirlash
                            </button>
                          )}
                          
                          {canEdit && (
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
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Waiters Management Card */}
          {businessType === 'restaurant' && (
            <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 border border-gray-200 dark:border-gray-700 shadow-sm transition-colors">
              <h3 className="text-lg font-bold text-gray-800 dark:text-white mb-6 flex items-center gap-2">
                <Users className="text-blue-500" size={20} />
                Ofitsiantlar (Waiters)
              </h3>

              {currentUser?.role !== 'waiter' && (
                <form onSubmit={handleAddWaiter} className="space-y-3 mb-6 border-b border-gray-100 dark:border-gray-700/50 pb-6">
                  <div className="flex gap-2">
                    <input 
                      type="text" 
                      placeholder="Ismi (Name)"
                      required
                      value={waiterName}
                      onChange={e => setWaiterName(e.target.value)}
                      className="flex-1 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    />
                    <input 
                      type="password" 
                      maxLength={4}
                      placeholder="PIN"
                      required
                      value={waiterPin}
                      onChange={e => setWaiterPin(e.target.value.replace(/\D/g, ''))}
                      className="w-24 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:outline-none text-center tracking-widest"
                    />
                  </div>
                  <div className="flex gap-2 items-center">
                    <div className="flex-1">
                      <label className="block text-[11px] text-gray-500 dark:text-gray-400 mb-0.5">
                        Xizmat foizi (%)
                      </label>
                      <input 
                        type="number" 
                        min={0}
                        max={100}
                        value={waiterPercentage}
                        onChange={e => setWaiterPercentage(e.target.value)}
                        className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
                      />
                    </div>
                    <div className="flex-1">
                      <label className="block text-[11px] text-gray-500 dark:text-gray-400 mb-0.5">
                        Oylik maosh
                      </label>
                      <input 
                        type="number" 
                        value={waiterSalary}
                        onChange={e => setWaiterSalary(e.target.value)}
                        className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
                      />
                    </div>
                    <button type="submit" className="h-10 bg-blue-500 hover:bg-blue-600 text-white px-4 rounded-lg transition-colors flex items-center justify-center self-end">
                      Qo'shish <Plus size={16} className="ml-1" />
                    </button>
                  </div>
                </form>
              )}

              <div className="space-y-2">
                {waiters.map(w => {
                  const isRevealed = revealedWaiters[w.id];
                  return (
                    <div key={w.id}>
                      {editingWaiterId === w.id ? (
                        <div className="space-y-3 p-3 bg-gray-50 dark:bg-gray-700/30 rounded-xl border border-blue-500/30 mb-2">
                          <div className="flex gap-2">
                            <input
                              type="text"
                              value={editWaiterName}
                              onChange={e => setEditWaiterName(e.target.value)}
                              className="flex-1 border border-gray-300 dark:border-gray-600 rounded-md px-2 py-1 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none"
                              placeholder="Ismi"
                              required
                            />
                            <input
                              type="password"
                              maxLength={4}
                              placeholder="PIN"
                              value={editWaiterPin}
                              onChange={e => setEditWaiterPin(e.target.value.replace(/\D/g, ''))}
                              className="w-20 border border-gray-300 dark:border-gray-600 rounded-md px-2 py-1 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-center tracking-widest focus:outline-none"
                              required
                            />
                          </div>
                          <div className="flex gap-2 items-center">
                            <div className="flex-1">
                              <label className="block text-[10px] text-gray-500">Foiz (%)</label>
                              <input
                                type="number"
                                min={0}
                                max={100}
                                value={editWaiterPercentage}
                                onChange={e => setEditWaiterPercentage(e.target.value)}
                                className="w-full border border-gray-300 dark:border-gray-600 rounded-md px-2 py-1 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none"
                                required
                              />
                            </div>
                            <div className="flex-1">
                              <label className="block text-[10px] text-gray-500">Oylik</label>
                              <input
                                type="number"
                                value={editWaiterSalary}
                                onChange={e => setEditWaiterSalary(e.target.value)}
                                className="w-full border border-gray-300 dark:border-gray-600 rounded-md px-2 py-1 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none"
                              />
                            </div>
                            <button
                              onClick={() => handleUpdateWaiter(w.id)}
                              className="px-3 py-1 bg-emerald-600 text-white rounded text-sm font-semibold hover:bg-emerald-700 self-end h-8"
                            >
                              Saqlash
                            </button>
                            <button
                              onClick={() => setEditingWaiterId(null)}
                              className="px-2 py-1 bg-gray-300 dark:bg-gray-600 text-gray-800 dark:text-gray-300 rounded text-sm hover:bg-gray-400 self-end h-8"
                            >
                              X
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center justify-between p-3 rounded-xl border border-gray-100 dark:border-gray-700/50 bg-gray-50/50 dark:bg-gray-800/50 mb-2">
                          <div className="flex flex-col">
                            <span className="font-semibold text-gray-800 dark:text-gray-200">
                              {w.name} <span className="text-xs font-normal text-blue-500 font-semibold px-1.5 py-0.5 rounded bg-blue-50 dark:bg-blue-950/30 border border-blue-100 dark:border-blue-900/30 ml-1.5">
                                {w.percentage}% xizmat
                              </span>
                            </span>
                            <div className="flex gap-4 mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                              <span>PIN: {isRevealed ? w.pin_code : '••••'}</span>
                              {w.salary > 0 && (
                                <span>Oylik: {Number(w.salary).toLocaleString()} so'm</span>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            <button 
                              type="button"
                              onClick={() => setRevealedWaiters(prev => ({ ...prev, [w.id]: !prev[w.id] }))}
                              className="p-1.5 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 rounded-md transition-colors"
                              title={isRevealed ? "Yashirish" : "Ko'rsatish"}
                            >
                              {isRevealed ? <EyeOff size={16} /> : <Eye size={16} />}
                            </button>

                            {currentUser?.role !== 'waiter' && (
                              <button 
                                type="button"
                                onClick={() => {
                                  setEditingWaiterId(w.id);
                                  setEditWaiterName(w.name);
                                  setEditWaiterPin(w.pin_code);
                                  setEditWaiterPercentage(w.percentage || 10);
                                  setEditWaiterSalary(w.salary || '');
                                }}
                                className="text-xs px-2 py-1 rounded bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
                              >
                                Tahrirlash
                              </button>
                            )}

                            {currentUser?.role !== 'waiter' && (
                              <button
                                type="button"
                                onClick={() => handleDeleteWaiter(w.id)}
                                disabled={deletingWaiterId === w.id}
                                className="p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-md transition-colors disabled:opacity-40 disabled:cursor-not-allowed ml-1"
                                title={t('delete')}
                              >
                                {deletingWaiterId === w.id
                                  ? <RefreshCw size={16} className="animate-spin" />
                                  : <Trash2 size={16} />}
                              </button>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
});
