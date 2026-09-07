import { useState, useEffect, memo } from 'react';
import { 
  DatabaseBackup, Download, Upload, Users, Store, Trash2, Plus, RefreshCw, 
  Printer, AlertTriangle, Phone, Eye, EyeOff, Percent, ChefHat, Tv, ExternalLink, 
  Copy, Check, Smartphone, Wifi, Globe, Monitor, ShieldCheck, CheckCircle2, AlertCircle, Camera, UserCheck, Clock
} from 'lucide-react';
import { useApp } from './context/AppContext';
import { QRCodeCanvas } from 'qrcode.react';

export default memo(function Settings() {
  const { t, storeName, setStoreName, currentUser, shopLogo, setShopLogo, receiptLogo, setReceiptLogo, terminalMode, updateTerminalMode, businessType, setBusinessType, lang, fetchGlobalProducts, usdRate, setUsdRate, allowMobileQr, updateAllowMobileQr, allowAttendanceQr, updateAllowAttendanceQr } = useApp();
  const [isMasterUnlocked, setIsMasterUnlocked] = useState(false);
  const [showMasterUnlockModal, setShowMasterUnlockModal] = useState(false);
  const [masterPinInput, setMasterPinInput] = useState('');
  const [masterPinError, setMasterPinError] = useState('');

  const isMasterAdmin = currentUser?.pin === 'xxMpos7532.' || isMasterUnlocked;
  const isAdmin = currentUser?.pin === 'xxMpos7532.' || isMasterAdmin;

  useEffect(() => {
    setIsMasterUnlocked(false);
  }, [currentUser]);

  const [cashiers, setCashiers] = useState([]);
  const [waiters, setWaiters] = useState([]);
  const [newStoreName, setNewStoreName] = useState(storeName);
  const [newUsdRate, setNewUsdRate] = useState(usdRate);
  const [loading, setLoading] = useState(false);
  const [isUnlocked, setIsUnlocked] = useState(true);
  const [unlockPin, setUnlockPin] = useState('');
  const [unlockError, setUnlockError] = useState(false);
  const [phone1, setPhone1] = useState('');
  const [phone2, setPhone2] = useState('');
  const [phone3, setPhone3] = useState('');
  const [autoUsdRate, setAutoUsdRate] = useState(true);

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
  const [cashierPercentage, setCashierPercentage] = useState('');

  // Editing PIN State
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState('');
  const [editPin, setEditPin] = useState('');
  const [editRole, setEditRole] = useState('cashier');
  const [editSalary, setEditSalary] = useState('');
  const [editPercentage, setEditPercentage] = useState('');
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
  const [telegramBotToken, setTelegramBotToken] = useState('8621843458:AAGBnjR3LwNDWfnKnnKmB9EQpqlm57tnr84');
  const [telegramChatId, setTelegramChatId] = useState('');
  const [isSendingTelegramBackup, setIsSendingTelegramBackup] = useState(false);
  const [isDetectingTelegramChatId, setIsDetectingTelegramChatId] = useState(false);

  // Multi-venue Attendance Telegram Bot states
  const [cafeName, setCafeName] = useState('');
  const [telegramAttendanceToken, setTelegramAttendanceToken] = useState('8621843458:AAGBnjR3LwNDWfnKnnKmB9EQpqlm57tnr84');
  const [telegramAttendanceChatId, setTelegramAttendanceChatId] = useState('');
  const [isTestingAttendanceTg, setIsTestingAttendanceTg] = useState(false);
  const [attendanceTgStatus, setAttendanceTgStatus] = useState(null); // { success: boolean, message: string }
  const [isDetectingAttendanceChatId, setIsDetectingAttendanceChatId] = useState(false);
  const [workStartTime, setWorkStartTime] = useState('09:00');
  const [workEndTime, setWorkEndTime] = useState('18:00');
  const [lateGraceMinutes, setLateGraceMinutes] = useState('5');
  const [appVersion, setAppVersion] = useState('v1.5.0');
  const [updateState, setUpdateState] = useState('idle'); // 'idle' | 'checking' | 'available' | 'not-available' | 'downloading' | 'downloaded' | 'error'
  const [updateInfo, setUpdateInfo] = useState(null);
  const [downloadPercent, setDownloadPercent] = useState(0);
  const [updateError, setUpdateError] = useState('');
  const [showMobileQrPinModal, setShowMobileQrPinModal] = useState(false);
  const [mobileQrPinInput, setMobileQrPinInput] = useState('');
  const [mobileQrPinError, setMobileQrPinError] = useState('');
  const [showAttendanceQrPinModal, setShowAttendanceQrPinModal] = useState(false);
  const [attendanceQrPinInput, setAttendanceQrPinInput] = useState('');
  const [attendanceQrPinError, setAttendanceQrPinError] = useState('');
  const [localIp, setLocalIp] = useState('');
  const [copiedLink, setCopiedLink] = useState('');

  const copyToClipboard = (text, key) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedLink(key);
    setToastMsg("Havola nusxalandi!");
    setTimeout(() => setCopiedLink(''), 3000);
  };
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
  const [cafeServiceFee, setCafeServiceFee] = useState('10');

  useEffect(() => {
    if (window.api && window.api.getSettings) {
      window.api.getSettings().then(res => {
        if (res && res.success && res.data) {
          const val = res.data.cafe_service_percent || res.data.restaurant_service_percent;
          if (val) setCafeServiceFee(String(val));
        }
      });
    }
  }, []);

  const handleSaveCafeServiceFee = async () => {
    if (window.api && window.api.updateSetting) {
      await window.api.updateSetting({ key: 'cafe_service_percent', value: String(cafeServiceFee) });
      await window.api.updateSetting({ key: 'restaurant_service_percent', value: String(cafeServiceFee) });
      localStorage.setItem('cafe_service_percent', String(cafeServiceFee));
      setToastMsg("Kafe xizmat foiz stavkasi saqlandi!");
    }
  };

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
        await loadCashiers();
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
        await loadCashiers();
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
    if (businessType === 'restaurant' || isMasterAdmin) {
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
        if (res.data.telegram_bot_token) setTelegramBotToken(res.data.telegram_bot_token);
        if (res.data.telegram_chat_id) setTelegramChatId(res.data.telegram_chat_id);
        if (res.data.cafe_name) setCafeName(res.data.cafe_name);
        else if (res.data.store_name) setCafeName(res.data.store_name);
        if (res.data.telegram_attendance_token) setTelegramAttendanceToken(res.data.telegram_attendance_token);
        if (res.data.telegram_attendance_chat_id) setTelegramAttendanceChatId(res.data.telegram_attendance_chat_id);
        if (res.data.work_start_time) setWorkStartTime(res.data.work_start_time);
        if (res.data.work_end_time) setWorkEndTime(res.data.work_end_time);
        if (res.data.late_grace_minutes) setLateGraceMinutes(res.data.late_grace_minutes);
        if (res.data.usd_rate) setNewUsdRate(res.data.usd_rate);
        if (res.data.auto_usd_rate) setAutoUsdRate(res.data.auto_usd_rate === '1');
        
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

  const handleSaveUsdRate = async () => {
    if (!window.api || !newUsdRate) return;
    const rate = parseFloat(newUsdRate);
    if (isNaN(rate) || rate <= 0) return;
    setLoading(true);
    try {
      const res = await window.api.updateSetting({ key: 'usd_rate', value: String(rate) });
      if (res && res.success) {
        setUsdRate(rate);
        setToastMsg('Dollar kursi saqlandi!');
      }
    } catch (err) {
      setToastMsg('Xatolik: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSyncUsdRate = async () => {
    if (!window.api) return;
    setLoading(true);
    try {
      const res = await window.api.syncUsdRate();
      if (res && res.success) {
        setUsdRate(res.rate);
        setNewUsdRate(res.rate);
        setToastMsg(`Dollar kursi internetdan yangilandi: ${res.rate} so'm!`);
      } else {
        setToastMsg(`Xatolik: ${res.error || "Internet ulanishini tekshiring"}`);
      }
    } catch (err) {
      setToastMsg('Xatolik: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleToggleAutoUsdRate = async (enabled) => {
    setAutoUsdRate(enabled);
    if (window.api) {
      try {
        await window.api.updateSetting({ key: 'auto_usd_rate', value: enabled ? '1' : '0' });
      } catch (err) {
        setToastMsg('Xatolik: ' + err.message);
      }
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

  const handleConfirmMobileQrPin = async () => {
    if (mobileQrPinInput !== 'xxMpos7532.') {
      setMobileQrPinError('Maxfiy PIN kod noto\'g\'ri!');
      return;
    }
    const newStatus = !allowMobileQr;
    await updateAllowMobileQr(newStatus);
    setShowMobileQrPinModal(false);
    setMobileQrPinInput('');
    setMobileQrPinError('');
    setToastMsg(
      newStatus
        ? 'Telefondan kirish QR kodiga ruxsat berildi! Kassa oynasida ko\'rinadi.'
        : 'Telefondan kirish QR kodi taqiqlandi! Kassa oynasidan yashirildi.'
    );
  };

  const handleConfirmAttendanceQrPin = async () => {
    if (attendanceQrPinInput !== 'xxMpos7532.') {
      setAttendanceQrPinError('Maxfiy PIN kod noto\'g\'ri!');
      return;
    }
    const newStatus = !allowAttendanceQr;
    await updateAllowAttendanceQr(newStatus);
    setShowAttendanceQrPinModal(false);
    setAttendanceQrPinInput('');
    setAttendanceQrPinError('');
    setToastMsg(
      newStatus
        ? 'Xodimlar davomati QR kodiga ruxsat berildi! Kassa oynasida ko\'rinadi.'
        : 'Xodimlar davomati QR kodi taqiqlandi! Kassa oynasidan yashirildi.'
    );
  };

  const handleConfirmMasterUnlock = () => {
    if (masterPinInput.trim() === 'xxMpos7532.') {
      setIsMasterUnlocked(true);
      setShowMasterUnlockModal(false);
      setMasterPinInput('');
      setMasterPinError('');
      setToastMsg("Asosiy Admin rejimi faollashtirildi! Barcha sozlamalar ochildi.");
    } else {
      setMasterPinError("Maxfiy PIN kod noto'g'ri!");
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

  const handleSaveTelegramBackupSettings = async () => {
    if (!window.api) return;
    try {
      await window.api.updateSetting({ key: 'telegram_bot_token', value: telegramBotToken.trim() });
      await window.api.updateSetting({ key: 'telegram_chat_id', value: telegramChatId.trim() });
      setToastMsg('Telegram sozlamalari saqlandi!');
    } catch (err) {
      setToastMsg('Sozlamalarni saqlashda xatolik: ' + err.message);
    }
  };

  const handleSaveAttendanceSettings = async () => {
    if (!window.api || !window.api.updateSetting) return;
    try {
      await window.api.updateSetting({ key: 'cafe_name', value: cafeName.trim() });
      await window.api.updateSetting({ key: 'telegram_attendance_token', value: telegramAttendanceToken.trim() });
      await window.api.updateSetting({ key: 'telegram_attendance_chat_id', value: telegramAttendanceChatId.trim() });
      await window.api.updateSetting({ key: 'work_start_time', value: workStartTime });
      await window.api.updateSetting({ key: 'work_end_time', value: workEndTime });
      await window.api.updateSetting({ key: 'late_grace_minutes', value: String(lateGraceMinutes) });
      setToastMsg(lang === 'uz' ? "Davomat va ish grafigi sozlamalari saqlandi!" : "Настройки посещаемости и графика сохранены!");
    } catch (err) {
      setToastMsg("Xatolik: " + err.message);
    }
  };

  const handleDetectAttendanceChatId = async () => {
    if (!window.api || !window.api.getTelegramChatId) return;
    setIsDetectingAttendanceChatId(true);
    setAttendanceTgStatus(null);
    try {
      const res = await window.api.getTelegramChatId(telegramAttendanceToken.trim());
      if (res && res.success && res.chatId) {
        setTelegramAttendanceChatId(res.chatId);
        await window.api.updateSetting({ key: 'telegram_attendance_chat_id', value: res.chatId });
        await window.api.updateSetting({ key: 'telegram_attendance_token', value: telegramAttendanceToken.trim() });
        setToastMsg(`Guruh ID si topildi va saqlandi: ${res.chatId} (${res.chatTitle || ''})`);
      } else {
        setToastMsg(res?.error || "Guruh ID topilmadi. Botni guruhga qo'shib /id deb yuboring.");
      }
    } catch (err) {
      setToastMsg("ID aniqlashda xatolik: " + err.message);
    } finally {
      setIsDetectingAttendanceChatId(false);
    }
  };

  const handleTestAttendanceTelegram = async () => {
    if (!window.api || !window.api.sendAttendanceTestMessage) return;
    const chat = telegramAttendanceChatId.trim();
    if (!chat) {
      setAttendanceTgStatus({ success: false, message: "Telegram Guruh Chat ID kiritilmagan!" });
      setToastMsg("Telegram Guruh Chat ID kiritilmagan!");
      return;
    }
    setIsTestingAttendanceTg(true);
    setAttendanceTgStatus(null);
    try {
      await window.api.updateSetting({ key: 'cafe_name', value: cafeName.trim() });
      await window.api.updateSetting({ key: 'telegram_attendance_token', value: telegramAttendanceToken.trim() });
      await window.api.updateSetting({ key: 'telegram_attendance_chat_id', value: chat });

      const res = await window.api.sendAttendanceTestMessage({
        token: telegramAttendanceToken.trim(),
        chatId: chat,
        cafeName: cafeName.trim() || storeName || 'Kafe'
      });

      if (res && res.success) {
        setAttendanceTgStatus({ success: true, message: "Guruhga ulandi!" });
        setToastMsg("✅ Guruhga test xabar yuborildi: Aloqa o'rnatildi!");
      } else {
        setAttendanceTgStatus({ success: false, message: res?.error || "Xabar yuborishda xatolik yuz berdi" });
        setToastMsg("Xatolik: " + (res?.error || "Xabar yuborilmadi"));
      }
    } catch (err) {
      setAttendanceTgStatus({ success: false, message: err.message });
      setToastMsg("Xatolik: " + err.message);
    } finally {
      setIsTestingAttendanceTg(false);
    }
  };

  const handleDetectTelegramChatId = async () => {
    if (!window.api) return;
    setIsDetectingTelegramChatId(true);
    try {
      const res = await window.api.getTelegramChatId(telegramBotToken.trim());
      if (res && res.success && res.chatId) {
        setTelegramChatId(res.chatId);
        await window.api.updateSetting({ key: 'telegram_chat_id', value: res.chatId });
        await window.api.updateSetting({ key: 'telegram_bot_token', value: telegramBotToken.trim() });
        setToastMsg(`Guruh ID si topildi va saqlandi: ${res.chatId} (${res.chatTitle || ''})`);
      } else {
        setToastMsg(res?.error || "Guruh ID si topilmadi. Botni guruhga qo'shib /id deb yuboring.");
      }
    } catch (err) {
      setToastMsg("ID aniqlashda xatolik: " + err.message);
    } finally {
      setIsDetectingTelegramChatId(false);
    }
  };

  const handleSendTelegramBackup = async () => {
    if (!window.api || isSendingTelegramBackup) return;
    setIsSendingTelegramBackup(true);
    try {
      await window.api.updateSetting({ key: 'telegram_bot_token', value: telegramBotToken.trim() });
      await window.api.updateSetting({ key: 'telegram_chat_id', value: telegramChatId.trim() });

      const res = await window.api.sendTelegramBackup({
        botToken: telegramBotToken.trim(),
        chatId: telegramChatId.trim()
      });

      if (res && res.success) {
        setToastMsg("Baza muvaffaqiyatli Telegram guruhga yuborildi!");
      } else {
        setToastMsg("Xatolik: " + (res?.error || "Telegramga yuborib bo'lmadi"));
      }
    } catch (err) {
      setToastMsg("IPC xatoligi: " + err.message);
    } finally {
      setIsSendingTelegramBackup(false);
    }
  };

  useEffect(() => {
    if (window.api && window.api.getAppVersion) {
      window.api.getAppVersion().then(ver => {
        if (ver) setAppVersion(`v${ver}`);
      }).catch(() => {});
    }

    if (window.api && window.api.onUpdateStatus) {
      window.api.onUpdateStatus((status, data) => {
        if (status === 'checking-for-update') {
          setUpdateState('checking');
          setUpdateError('');
        } else if (status === 'update-available') {
          setUpdateState('available');
          setUpdateInfo(data);
          setUpdateError('');
        } else if (status === 'update-not-available') {
          setUpdateState('not-available');
          setUpdateError('');
        } else if (status === 'download-progress') {
          setUpdateState('downloading');
          setDownloadPercent(typeof data === 'number' ? data : (data?.percent || 0));
        } else if (status === 'update-downloaded') {
          setUpdateState('downloaded');
        } else if (status === 'update-error') {
          setUpdateState('error');
          setUpdateError(typeof data === 'string' ? data : (data?.message || 'Xatolik yuz berdi'));
        }
      });
    }

    // Auto-check for updates when Settings screen opens
    if (window.api && window.api.checkUpdate) {
      setUpdateState('checking');
      window.api.checkUpdate().catch(() => {});
    }
  }, []);

  const handleCheckForUpdates = async () => {
    if (!window.api || !window.api.checkUpdate) {
      setToastMsg("Kassa versiyasi brauzer rejimida auto-update qila olmaydi");
      return;
    }
    setUpdateState('checking');
    setUpdateError('');

    // Safety timeout: if server doesn't respond within 4s, stop spinning and show latest version
    const timeoutId = setTimeout(() => {
      setUpdateState(prev => (prev === 'checking' ? 'not-available' : prev));
    }, 4000);

    try {
      const res = await window.api.checkUpdate();
      if (res && res.success && res.updateInfo) {
        setUpdateState('available');
        setUpdateInfo(res.updateInfo);
      } else {
        // No update info or dev mode -> latest version
        setTimeout(() => {
          setUpdateState(prev => (prev === 'checking' ? 'not-available' : prev));
        }, 500);
      }
    } catch (err) {
      setUpdateState('not-available');
    } finally {
      clearTimeout(timeoutId);
    }
  };

  const handleStartDownload = async () => {
    if (!window.api || !window.api.startDownload) return;
    setUpdateState('downloading');
    setDownloadPercent(0);
    try {
      const res = await window.api.startDownload();
      if (!res.success) {
        setUpdateState('error');
        setUpdateError(res.error || "Yuklab olishni boshlashda xatolik");
      }
    } catch (err) {
      setUpdateState('error');
      setUpdateError(err.message);
    }
  };

  const handleInstallUpdate = async () => {
    if (!window.api || !window.api.installUpdate) return;
    try {
      await window.api.installUpdate();
    } catch (err) {
      setToastMsg("O'rnatishda xatolik: " + err.message);
    }
  };

  const handleAddCashier = async (e) => {
    e.preventDefault();
    if (!window.api || cashierPin.length !== 4) return;
    try {
      if (cashierRole === 'waiter') {
        const res = await window.api.addWaiter({
          name: cashierName,
          pinCode: cashierPin,
          percentage: Number(cashierPercentage) || 10,
          salary: Number(cashierSalary) || 0
        });
        if (res && res.success) {
          setCashierName('');
          setCashierPin('');
          setCashierRole('cashier');
          setCashierSalary('');
          setCashierPercentage('');
          await loadWaiters();
          await loadCashiers();
        } else if (res?.error === 'pin_exists') {
          setToastMsg(t('pinExists'));
        } else {
          setToastMsg('Xatolik: ' + res?.error);
        }
        return;
      }
      const res = await window.api.addCashier({
        name: cashierName,
        pin: cashierPin,
        role: cashierRole,
        salary: Number(cashierSalary) || 0,
        percentage: Number(cashierPercentage) || 0
      });
      if (res && res.success) {
        setCashierName('');
        setCashierPin('');
        setCashierRole('cashier');
        setCashierSalary('');
        setCashierPercentage('');
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
        salary: Number(editSalary) || 0,
        percentage: Number(editPercentage) || 0
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
      {/* Mobile QR Connection Permission PIN Modal */}
      {showMobileQrPinModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-2xl max-w-sm w-full mx-4 border border-gray-200 dark:border-gray-700">
            <div className="flex items-center gap-3 mb-4 text-blue-600 dark:text-blue-400">
              <span className="text-2xl">🔐</span>
              <h3 className="text-lg font-black text-gray-900 dark:text-white">
                Telefondan kirish ruxsati
              </h3>
            </div>
            <p className="text-gray-600 dark:text-gray-300 mb-4 text-sm font-medium">
              {allowMobileQr
                ? "Telefondan kirish QR kodi va havolasini KASSA OYNASIDAN YASHIRISH uchun maxfiy PIN kodni kiriting:"
                : "Telefondan kirish QR kodi va havolasini KASSA OYNASIDA KO'RSATISH uchun maxfiy PIN kodni kiriting:"}
            </p>
            <div className="mb-4">
              <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-2">
                Maxfiy PIN kod:
              </label>
              <input 
                type="password" 
                value={mobileQrPinInput}
                onChange={e => {
                  setMobileQrPinInput(e.target.value);
                  setMobileQrPinError('');
                }}
                onKeyDown={e => {
                  if (e.key === 'Enter') handleConfirmMobileQrPin();
                }}
                className="w-full bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-xl px-4 py-3 text-center font-bold text-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-white"
                placeholder="PIN kod..."
                autoFocus
              />
              {mobileQrPinError && (
                <p className="text-xs text-rose-500 font-bold mt-2 text-center">
                  {mobileQrPinError}
                </p>
              )}
            </div>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => {
                  setShowMobileQrPinModal(false);
                  setMobileQrPinInput('');
                  setMobileQrPinError('');
                }}
                className="flex-1 py-2.5 text-sm font-bold text-gray-700 dark:text-gray-300 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 rounded-xl transition-colors cursor-pointer"
              >
                Bekor qilish
              </button>
              <button
                onClick={handleConfirmMobileQrPin}
                className="flex-1 py-2.5 text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition-colors shadow-md cursor-pointer"
              >
                Tasdiqlash
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Attendance QR Permission PIN Modal */}
      {showAttendanceQrPinModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 w-full max-w-sm shadow-2xl border border-gray-100 dark:border-gray-700">
            <div className="flex items-center gap-3 mb-4 text-indigo-600 dark:text-indigo-400">
              <Camera size={28} />
              <h3 className="font-bold text-lg text-gray-900 dark:text-white">
                Davomat QR ruxsati
              </h3>
            </div>
            <p className="text-gray-600 dark:text-gray-300 mb-4 text-sm font-medium">
              {allowAttendanceQr
                ? "Xodimlar davomati QR kodini KASSA OYNASIDAN YASHIRISH uchun maxfiy PIN kodni kiriting:"
                : "Xodimlar davomati QR kodini KASSA OYNASIDA KO'RSATISH uchun maxfiy PIN kodni kiriting:"}
            </p>
            <div className="mb-4">
              <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-2">
                Maxfiy PIN kod:
              </label>
              <input 
                type="password" 
                value={attendanceQrPinInput}
                onChange={e => {
                  setAttendanceQrPinInput(e.target.value);
                  setAttendanceQrPinError('');
                }}
                onKeyDown={e => {
                  if (e.key === 'Enter') handleConfirmAttendanceQrPin();
                }}
                className="w-full bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-xl px-4 py-3 text-center font-bold text-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-gray-900 dark:text-white"
                placeholder="PIN kod..."
                autoFocus
              />
              {attendanceQrPinError && (
                <p className="text-xs text-rose-500 font-bold mt-2 text-center">
                  {attendanceQrPinError}
                </p>
              )}
            </div>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => {
                  setShowAttendanceQrPinModal(false);
                  setAttendanceQrPinInput('');
                  setAttendanceQrPinError('');
                }}
                className="flex-1 py-2.5 text-sm font-bold text-gray-700 dark:text-gray-300 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 rounded-xl transition-colors cursor-pointer"
              >
                Bekor qilish
              </button>
              <button
                onClick={handleConfirmAttendanceQrPin}
                className="flex-1 py-2.5 text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl transition-colors shadow-md cursor-pointer"
              >
                Tasdiqlash
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Master Admin Unlock Modal */}
      {showMasterUnlockModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-2xl max-w-sm w-full mx-4 border border-gray-200 dark:border-gray-700">
            <div className="flex items-center gap-3 mb-4 text-amber-500">
              <span className="text-2xl">👑</span>
              <div>
                <h3 className="text-lg font-black text-gray-900 dark:text-white">
                  Asosiy Admin Rejimi
                </h3>
                <p className="text-xs text-gray-500 dark:text-gray-400">Barcha maxfiy sozlamalarni ochish</p>
              </div>
            </div>
            <p className="text-gray-600 dark:text-gray-300 mb-4 text-sm font-medium">
              Do'kon/Kafe almashtirish, bazani qayta yuklash va barcha to'liq sozlamalarni ochish uchun maxfiy PIN kodni kiriting:
            </p>
            <div className="mb-4">
              <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-2">
                Maxfiy PIN kod:
              </label>
              <input 
                type="password" 
                value={masterPinInput}
                onChange={e => {
                  setMasterPinInput(e.target.value);
                  setMasterPinError('');
                }}
                onKeyDown={e => {
                  if (e.key === 'Enter') handleConfirmMasterUnlock();
                }}
                className="w-full bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-xl px-4 py-3 text-center font-bold text-lg focus:outline-none focus:ring-2 focus:ring-amber-500 text-gray-900 dark:text-white"
                placeholder="PIN kod..."
                autoFocus
              />
              {masterPinError && (
                <p className="text-xs text-rose-500 font-bold mt-2 text-center">
                  {masterPinError}
                </p>
              )}
            </div>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => {
                  setShowMasterUnlockModal(false);
                  setMasterPinInput('');
                  setMasterPinError('');
                }}
                className="flex-1 py-2.5 text-sm font-bold text-gray-700 dark:text-gray-300 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 rounded-xl transition-colors cursor-pointer"
              >
                Bekor qilish
              </button>
              <button
                onClick={handleConfirmMasterUnlock}
                className="flex-1 py-2.5 text-sm font-bold text-white bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 rounded-xl transition-colors shadow-md cursor-pointer"
              >
                Ochish
              </button>
            </div>
          </div>
        </div>
      )}
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
              <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">Maxfiy parolni kiriting:</label>
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
              <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">Maxfiy parolni kiriting:</label>
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
              <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">Maxfiy parolni kiriting:</label>
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
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-800 dark:text-white">{t('settings')}</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{t('settingsSubtitle')}</p>
        </div>

        {isMasterAdmin && (
          <div className="flex items-center gap-2">
            <div className="px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-amber-500/20 to-orange-500/20 border border-amber-500/40 text-amber-600 dark:text-amber-400 font-bold text-xs flex items-center gap-2 shadow-sm">
              <span>👑</span>
              <span>Asosiy Admin (Barcha sozlamalar ochiq)</span>
            </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        
        {/* Left Column: General & Backup */}
        <div className="space-y-6">
          {/* Initial Base Loader */}
          {isMasterAdmin && !isBaseLoaded && (
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

          {/* USD Rate Configuration (Har doim ko'rinadi - oddiy PIN uchun ham, Asosiy Admin uchun ham) */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 border border-gray-200 dark:border-gray-700 shadow-sm transition-colors">
            <h3 className="text-lg font-bold text-gray-800 dark:text-white mb-2 flex items-center gap-2">
              <span className="text-emerald-500 font-extrabold text-lg">$</span>
              Dollar kursi (USD Exchange Rate)
            </h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
              Dollar kursining so'mdagi qiymati. Omborda xarid narxini dollarda kiritishda konvertatsiya uchun ishlatiladi.
            </p>
            <div className="flex items-center gap-2 mb-3">
              <input 
                type="checkbox"
                id="checkbox-auto-usd"
                checked={autoUsdRate}
                onChange={e => handleToggleAutoUsdRate(e.target.checked)}
                className="w-4 h-4 text-emerald-600 border-gray-300 rounded focus:ring-emerald-500 cursor-pointer"
              />
              <label htmlFor="checkbox-auto-usd" className="text-xs text-gray-700 dark:text-gray-300 font-semibold cursor-pointer">
                Dastur yoqilganda dollar kursini internetdan (Markaziy Bankdan) avtomatik yangilash
              </label>
            </div>
            <div className="flex gap-2 max-w-md">
              <input 
                type="number" 
                value={newUsdRate}
                onChange={e => setNewUsdRate(e.target.value)}
                placeholder="Masalan: 12800"
                className="flex-1 border border-gray-300 dark:border-gray-600 rounded-lg px-4 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-emerald-500 focus:outline-none transition-colors"
              />
              <button 
                onClick={handleSaveUsdRate}
                disabled={loading || String(newUsdRate) === String(usdRate)}
                className="bg-emerald-500 hover:bg-emerald-600 disabled:bg-emerald-300 text-white px-4 py-2 rounded-lg font-semibold transition-colors cursor-pointer"
              >
                {t('save')}
              </button>
              <button 
                type="button"
                onClick={handleSyncUsdRate}
                disabled={loading}
                className="bg-blue-500 hover:bg-blue-600 disabled:bg-blue-300 text-white px-4 py-2 rounded-lg font-semibold transition-colors flex items-center gap-1.5 cursor-pointer"
              >
                🌐 Internetdan olish
              </button>
            </div>
          </div>

          {/* Store Name & Printers & Remote Configuration (Faqat Asosiy Admin) */}
          {isMasterAdmin && (
            <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 border border-gray-200 dark:border-gray-700 shadow-sm transition-colors">
              <h3 className="text-lg font-bold text-gray-800 dark:text-white mb-6 flex items-center gap-2">
                <Store className="text-emerald-500" size={20} />
                {businessType === 'restaurant' ? 'Kafe / Restoran nomi' : t('storeNameLabel')}
              </h3>
              
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">
                  {businessType === 'restaurant' ? "Cheklarda va dasturda ko'rinadigan nom" : t('storeNameDesc')}
                </p>
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
                    className="bg-emerald-500 hover:bg-emerald-600 disabled:bg-emerald-300 text-white px-4 py-2 rounded-lg font-semibold transition-colors cursor-pointer"
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

            {/* Receipt Printer Selection */}
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
              {(isMasterAdmin || businessType !== 'restaurant') && (
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
                </div>
              )}

              {(businessType === 'restaurant' || isMasterAdmin) && (
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

              {/* Telefondan kirish QR kodi va havolasi ruxsati */}
              <div className="mt-6 border-t border-gray-100 dark:border-gray-700 pt-6">
                <div className="flex items-center justify-between gap-3 mb-2">
                  <h4 className="font-semibold text-gray-800 dark:text-gray-200 flex items-center gap-2">
                    <span className="text-blue-500">📲</span>
                    Telefondan kirish QR kodi (Kassa oynasida ko'rsatish)
                  </h4>
                  <span className={`text-xs px-2.5 py-1 font-bold rounded-lg shrink-0 ${allowMobileQr ? 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300' : 'bg-rose-100 dark:bg-rose-900/40 text-rose-700 dark:text-rose-300'}`}>
                    {allowMobileQr ? 'Ruxsat berilgan' : 'Ruxsat berilmagan'}
                  </span>
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
                  Kassa va restoran oyna panellarida telefondan ulanish QR kodi va havolasi tugmasini ko'rsatish yoki yashirish. Sozlamani o'zgartirish uchun maxfiy PIN kod talab etiladi.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setShowMobileQrPinModal(true);
                    setMobileQrPinInput('');
                    setMobileQrPinError('');
                  }}
                  className={`w-full py-2.5 px-4 rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2 cursor-pointer ${
                    allowMobileQr
                      ? 'bg-rose-50 hover:bg-rose-100 dark:bg-rose-900/20 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-800'
                      : 'bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800'
                  }`}
                >
                  {allowMobileQr ? "Ruxsatni bekor qilish va yashirish" : "Ruxsat berish va ko'rsatish"}
                </button>
              </div>

              {/* Xodimlar Davomati QR kodi va havolasi ruxsati */}
              <div className="mt-6 border-t border-gray-100 dark:border-gray-700 pt-6">
                <div className="flex items-center justify-between gap-3 mb-2">
                  <h4 className="font-semibold text-gray-800 dark:text-gray-200 flex items-center gap-2">
                    <span className="text-purple-500">📸</span>
                    Xodimlar Davomati QR kodi (Kassa oynasida ko'rsatish)
                  </h4>
                  <span className={`text-xs px-2.5 py-1 font-bold rounded-lg shrink-0 ${allowAttendanceQr ? 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300' : 'bg-rose-100 dark:bg-rose-900/40 text-rose-700 dark:text-rose-300'}`}>
                    {allowAttendanceQr ? 'Ruxsat berilgan' : 'Ruxsat berilmagan'}
                  </span>
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
                  Kassa va restoran oyna panellarida xodimlarning keldi/ketdi davomatini selfi orqali qayd etish QR kodini ko'rsatish yoki yashirish. O'zgartirish uchun maxfiy PIN kod talab etiladi.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setShowAttendanceQrPinModal(true);
                    setAttendanceQrPinInput('');
                    setAttendanceQrPinError('');
                  }}
                  className={`w-full py-2.5 px-4 rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2 cursor-pointer ${
                    allowAttendanceQr
                      ? 'bg-rose-50 hover:bg-rose-100 dark:bg-rose-900/20 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-800'
                      : 'bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800'
                  }`}
                >
                  {allowAttendanceQr ? "Ruxsatni bekor qilish va yashirish" : "Ruxsat berish va ko'rsatish"}
                </button>
              </div>

              {/* Masofaviy boshqaruv (Telefon uchun) */}
              {(isMasterAdmin || allowMobileQr) && (
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
                    <div className="mt-4 p-4 bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900/30 rounded-2xl">
                      <p className="text-xs font-bold text-emerald-700 dark:text-emerald-400 flex items-center gap-2 mb-2">
                        <span>✅</span>
                        Tunnel faol! Tashqi internet orqali ulanish havolalari:
                      </p>
                      <div className="space-y-2">
                        <div className="flex items-center justify-between gap-2 p-2 bg-white dark:bg-gray-800 rounded-xl border border-emerald-100 dark:border-emerald-900/40">
                          <span className="text-xs font-bold text-gray-700 dark:text-gray-300">📱 Mobil / Ofitsiant:</span>
                          <div className="flex items-center gap-2">
                            <a 
                              href={`${ngrokUrl.replace(/\/$/, '')}/mobile`} 
                              target="_blank" 
                              rel="noreferrer"
                              className="text-xs font-mono font-bold text-emerald-700 dark:text-emerald-400 underline"
                            >
                              {`${ngrokUrl.replace(/\/$/, '')}/mobile`}
                            </a>
                            <button
                              type="button"
                              onClick={() => copyToClipboard(`${ngrokUrl.replace(/\/$/, '')}/mobile`, 'ngrok-mobile')}
                              className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded text-gray-500"
                              title="Nusxalash"
                            >
                              {copiedLink === 'ngrok-mobile' ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
                            </button>
                          </div>
                        </div>

                        {businessType === 'restaurant' && (
                          <>
                            <div className="flex items-center justify-between gap-2 p-2 bg-white dark:bg-gray-800 rounded-xl border border-emerald-100 dark:border-emerald-900/40">
                              <span className="text-xs font-bold text-amber-700 dark:text-amber-400">👨‍🍳 Oshxona (KDS):</span>
                              <div className="flex items-center gap-2">
                                <a 
                                  href={`${ngrokUrl.replace(/\/$/, '')}/kitchen`} 
                                  target="_blank" 
                                  rel="noreferrer"
                                  className="text-xs font-mono font-bold text-amber-700 dark:text-amber-400 underline"
                                >
                                  {`${ngrokUrl.replace(/\/$/, '')}/kitchen`}
                                </a>
                                <button
                                  type="button"
                                  onClick={() => copyToClipboard(`${ngrokUrl.replace(/\/$/, '')}/kitchen`, 'ngrok-kitchen')}
                                  className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded text-gray-500"
                                  title="Nusxalash"
                                >
                                  {copiedLink === 'ngrok-kitchen' ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
                                </button>
                              </div>
                            </div>

                            <div className="flex items-center justify-between gap-2 p-2 bg-white dark:bg-gray-800 rounded-xl border border-emerald-100 dark:border-emerald-900/40">
                              <span className="text-xs font-bold text-purple-700 dark:text-purple-400">📺 TV Tablo:</span>
                              <div className="flex items-center gap-2">
                                <a 
                                  href={`${ngrokUrl.replace(/\/$/, '')}/tv`} 
                                  target="_blank" 
                                  rel="noreferrer"
                                  className="text-xs font-mono font-bold text-purple-700 dark:text-purple-400 underline"
                                >
                                  {`${ngrokUrl.replace(/\/$/, '')}/tv`}
                                </a>
                                <button
                                  type="button"
                                  onClick={() => copyToClipboard(`${ngrokUrl.replace(/\/$/, '')}/tv`, 'ngrok-tv')}
                                  className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded text-gray-500"
                                  title="Nusxalash"
                                >
                                  {copiedLink === 'ngrok-tv' ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
                                </button>
                              </div>
                            </div>
                          </>
                        )}
                      </div>
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

                  {/* ── Local connection & Screen Links Section ── */}
                  <div className="mt-6 pt-6 border-t border-gray-100 dark:border-gray-700 space-y-4">
                    <div className="flex items-center justify-between">
                      <h4 className="font-bold text-gray-800 dark:text-white flex items-center gap-2 text-sm">
                        <Wifi className="w-4 h-4 text-emerald-500" />
                        Lokal tarmoq (Wi-Fi) va Ekran Havolalari
                      </h4>
                      {isMasterAdmin && (
                        <span className="text-[10px] bg-amber-500 text-white px-2 py-0.5 rounded-full font-black flex items-center gap-1">
                          <ShieldCheck size={12} />
                          Admin
                        </span>
                      )}
                    </div>
                    
                    <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
                      Qurilmalarni (Smart TV, Planshet, Telefon) bir xil Wi-Fi tarmog'iga ulang va quyidagi ekran havolalarini brauzerda oching yoki QR-kodni skanerlang:
                    </p>

                    {/* Grid of Screen Links */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      
                      {/* Card 1: Asosiy Web Kassa / Planshet Terminal (Har doim ochiq) */}
                      <div className="p-4 bg-blue-50/40 dark:bg-blue-950/10 border border-blue-200/80 dark:border-blue-900/40 rounded-2xl flex flex-col justify-between gap-3 shadow-sm hover:shadow-md transition-shadow">
                        <div>
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-xs font-bold text-blue-800 dark:text-blue-300 flex items-center gap-1.5 uppercase tracking-wide">
                              <Monitor size={16} className="text-blue-600 dark:text-blue-400" />
                              Web Kassa (Planshet / Komp)
                            </span>
                            <span className="text-[10px] bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 font-black px-2 py-0.5 rounded-md">
                              /
                            </span>
                          </div>
                          <p className="text-[11px] text-gray-500 dark:text-gray-400 mb-3">
                            Planshet yoki tarmoqdagi boshqa kompyuter orqali kassa oynasiga kirish.
                          </p>
                          
                          <div className="flex items-center gap-3">
                            <div className="shrink-0 bg-white p-2 rounded-xl border border-blue-200/60 shadow-sm flex items-center justify-center">
                              <QRCodeCanvas
                                value={`http://${localIp || 'localhost'}:4000`}
                                size={76}
                                className="bg-white"
                              />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-[10px] uppercase font-bold text-gray-400">Lokal Havola</p>
                              <a
                                href={`http://${localIp || 'localhost'}:4000`}
                                target="_blank"
                                rel="noreferrer"
                                className="text-xs font-mono font-bold text-blue-600 dark:text-blue-400 break-all underline hover:text-blue-500 block"
                              >
                                {`http://${localIp || 'localhost'}:4000`}
                              </a>
                            </div>
                          </div>
                        </div>

                        <div className="flex gap-2 pt-2 border-t border-blue-100 dark:border-blue-900/30">
                          <button
                            type="button"
                            onClick={() => copyToClipboard(`http://${localIp || 'localhost'}:4000`, 'loc-main')}
                            className="flex-1 py-1.5 px-2 bg-white dark:bg-gray-800 hover:bg-blue-100 dark:hover:bg-blue-900/30 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                          >
                            {copiedLink === 'loc-main' ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
                            <span>Nusxalash</span>
                          </button>
                          <a
                            href={`http://${localIp || 'localhost'}:4000`}
                            target="_blank"
                            rel="noreferrer"
                            className="py-1.5 px-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-colors"
                          >
                            <ExternalLink size={14} />
                            <span>Ochish</span>
                          </a>
                        </div>
                      </div>

                      {/* Card 2: Ofitsiant / Mobil Kassa (Faqat ruxsat berilganda) */}
                      {allowMobileQr && (
                        <div className="p-4 bg-emerald-50/40 dark:bg-emerald-950/10 border border-emerald-200/80 dark:border-emerald-900/40 rounded-2xl flex flex-col justify-between gap-3 shadow-sm hover:shadow-md transition-shadow">
                          <div>
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-xs font-bold text-emerald-800 dark:text-emerald-300 flex items-center gap-1.5 uppercase tracking-wide">
                                <Smartphone size={16} className="text-emerald-600 dark:text-emerald-400" />
                                {businessType === 'restaurant' ? 'Ofitsiant Mobil Ilovasi' : 'Mobil Kassa & Sklad'}
                              </span>
                              <span className="text-[10px] bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 font-black px-2 py-0.5 rounded-md">
                                /mobile
                              </span>
                            </div>
                            <p className="text-[11px] text-gray-500 dark:text-gray-400 mb-3">
                              {businessType === 'restaurant'
                                ? 'Ofitsiantlar telefon orqali stollarga buyurtma olishi va oshxonaga yuborishi uchun.'
                                : 'Telefondan tovarlarni qidirish, skladni tekshirish va savdo qilish uchun.'}
                            </p>
                            
                            <div className="flex items-center gap-3">
                              <div className="shrink-0 bg-white p-2 rounded-xl border border-emerald-200/60 shadow-sm flex items-center justify-center">
                                <QRCodeCanvas
                                  value={`http://${localIp || 'localhost'}:4000/mobile`}
                                  size={76}
                                  className="bg-white"
                                />
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-[10px] uppercase font-bold text-gray-400">Lokal Havola</p>
                                <a
                                  href={`http://${localIp || 'localhost'}:4000/mobile`}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-xs font-mono font-bold text-emerald-700 dark:text-emerald-400 break-all underline hover:text-emerald-600 block"
                                >
                                  {`http://${localIp || 'localhost'}:4000/mobile`}
                                </a>
                              </div>
                            </div>
                          </div>

                          <div className="flex gap-2 pt-2 border-t border-emerald-100 dark:border-emerald-900/30">
                            <button
                              type="button"
                              onClick={() => copyToClipboard(`http://${localIp || 'localhost'}:4000/mobile`, 'loc-mobile')}
                              className="flex-1 py-1.5 px-2 bg-white dark:bg-gray-800 hover:bg-emerald-100 dark:hover:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                            >
                              {copiedLink === 'loc-mobile' ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
                              <span>Nusxalash</span>
                            </button>
                            <a
                              href={`http://${localIp || 'localhost'}:4000/mobile`}
                              target="_blank"
                              rel="noreferrer"
                              className="py-1.5 px-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-colors"
                            >
                              <ExternalLink size={14} />
                              <span>Ochish</span>
                            </a>
                          </div>
                        </div>
                      )}

                      {/* Card 3: Oshxona ekrani (KDS) - Faqat Asosiy Admin */}
                      {isMasterAdmin && businessType === 'restaurant' && (
                        <div className="p-4 bg-amber-50/40 dark:bg-amber-950/10 border border-amber-200/80 dark:border-amber-900/40 rounded-2xl flex flex-col justify-between gap-3 shadow-sm hover:shadow-md transition-shadow">
                          <div>
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-xs font-bold text-amber-800 dark:text-amber-300 flex items-center gap-1.5 uppercase tracking-wide">
                                <ChefHat size={16} className="text-amber-600 dark:text-amber-400" />
                                Oshxona Monitori (KDS)
                              </span>
                              <span className="text-[10px] bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 font-black px-2 py-0.5 rounded-md">
                                /kitchen
                              </span>
                            </div>
                            <p className="text-[11px] text-gray-500 dark:text-gray-400 mb-3">
                              Oshpazlar uchun buyurtmalarni qabul qilish va tayyor bo'lganini belgilash ekrani.
                            </p>
                            
                            <div className="flex items-center gap-3">
                              <div className="shrink-0 bg-white p-2 rounded-xl border border-amber-200/60 shadow-sm flex items-center justify-center">
                                <QRCodeCanvas
                                  value={`http://${localIp || 'localhost'}:4000/kitchen`}
                                  size={76}
                                  className="bg-white"
                                />
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-[10px] uppercase font-bold text-gray-400">Lokal Havola</p>
                                <a
                                  href={`http://${localIp || 'localhost'}:4000/kitchen`}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-xs font-mono font-bold text-amber-700 dark:text-amber-400 break-all underline hover:text-amber-600 block"
                                >
                                  {`http://${localIp || 'localhost'}:4000/kitchen`}
                                </a>
                              </div>
                            </div>
                          </div>

                          <div className="flex gap-2 pt-2 border-t border-amber-100 dark:border-amber-900/30">
                            <button
                              type="button"
                              onClick={() => copyToClipboard(`http://${localIp || 'localhost'}:4000/kitchen`, 'loc-kitchen')}
                              className="flex-1 py-1.5 px-2 bg-white dark:bg-gray-800 hover:bg-amber-100 dark:hover:bg-amber-900/30 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                            >
                              {copiedLink === 'loc-kitchen' ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
                              <span>Nusxalash</span>
                            </button>
                            <a
                              href={`http://${localIp || 'localhost'}:4000/kitchen`}
                              target="_blank"
                              rel="noreferrer"
                              className="py-1.5 px-3 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-colors"
                            >
                              <ExternalLink size={14} />
                              <span>Ochish</span>
                            </a>
                          </div>
                        </div>
                      )}

                      {/* Card 4: TV Tablo ekrani - Faqat Asosiy Admin */}
                      {isMasterAdmin && businessType === 'restaurant' && (
                        <div className="p-4 bg-purple-50/40 dark:bg-purple-950/10 border border-purple-200/80 dark:border-purple-900/40 rounded-2xl flex flex-col justify-between gap-3 shadow-sm hover:shadow-md transition-shadow">
                          <div>
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-xs font-bold text-purple-800 dark:text-purple-300 flex items-center gap-1.5 uppercase tracking-wide">
                                <Tv size={16} className="text-purple-600 dark:text-purple-400" />
                                TV Tablo (Navbat ekrani)
                              </span>
                              <span className="text-[10px] bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300 font-black px-2 py-0.5 rounded-md">
                                /tv
                              </span>
                            </div>
                            <p className="text-[11px] text-gray-500 dark:text-gray-400 mb-3">
                              Zaldagi Smart TV yoki monitor uchun tayyor va tayyorlanayotgan taomlar ekrani.
                            </p>
                            
                            <div className="flex items-center gap-3">
                              <div className="shrink-0 bg-white p-2 rounded-xl border border-purple-200/60 shadow-sm flex items-center justify-center">
                                <QRCodeCanvas
                                  value={`http://${localIp || 'localhost'}:4000/tv`}
                                  size={76}
                                  className="bg-white"
                                />
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-[10px] uppercase font-bold text-gray-400">Lokal Havola</p>
                                <a
                                  href={`http://${localIp || 'localhost'}:4000/tv`}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-xs font-mono font-bold text-purple-700 dark:text-purple-400 break-all underline hover:text-purple-600 block"
                                >
                                  {`http://${localIp || 'localhost'}:4000/tv`}
                                </a>
                              </div>
                            </div>
                          </div>

                          <div className="flex gap-2 pt-2 border-t border-purple-100 dark:border-purple-900/30">
                            <button
                              type="button"
                              onClick={() => copyToClipboard(`http://${localIp || 'localhost'}:4000/tv`, 'loc-tv')}
                              className="flex-1 py-1.5 px-2 bg-white dark:bg-gray-800 hover:bg-purple-100 dark:hover:bg-purple-900/30 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                            >
                              {copiedLink === 'loc-tv' ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
                              <span>Nusxalash</span>
                            </button>
                            <a
                              href={`http://${localIp || 'localhost'}:4000/tv`}
                              target="_blank"
                              rel="noreferrer"
                              className="py-1.5 px-3 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-colors"
                            >
                              <ExternalLink size={14} />
                              <span>Ochish</span>
                            </a>
                          </div>
                        </div>
                      )}

                      {/* Card 5: Xodimlar Davomati (Keldi-Ketdi QR) - Asosiy Admin sozlamalarida */}
                      <div className="p-4 bg-indigo-50/40 dark:bg-indigo-950/10 border border-indigo-200/80 dark:border-indigo-900/40 rounded-2xl flex flex-col justify-between gap-3 shadow-sm hover:shadow-md transition-shadow">
                        <div>
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-xs font-bold text-indigo-800 dark:text-indigo-300 flex items-center gap-1.5 uppercase tracking-wide">
                              <Camera size={16} className="text-indigo-600 dark:text-indigo-400" />
                              Xodimlar Davomati (Selfi)
                            </span>
                            <span className="text-[10px] bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 font-black px-2 py-0.5 rounded-md">
                              /attendance
                            </span>
                          </div>
                          <p className="text-[11px] text-gray-500 dark:text-gray-400 mb-3">
                            Xodimlar ishga kelganida va ketganida telefon kamerasida selfi rasmga tushib davomat qilish havolasi.
                          </p>
                          
                          <div className="flex items-center gap-3">
                            <div className="shrink-0 bg-white p-2 rounded-xl border border-indigo-200/60 shadow-sm flex items-center justify-center">
                              <QRCodeCanvas
                                value={`http://${localIp || 'localhost'}:4000/attendance`}
                                size={76}
                                className="bg-white"
                              />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-[10px] uppercase font-bold text-gray-400">Lokal Havola</p>
                              <a
                                href={`http://${localIp || 'localhost'}:4000/attendance`}
                                target="_blank"
                                rel="noreferrer"
                                className="text-xs font-mono font-bold text-indigo-700 dark:text-indigo-400 break-all underline hover:text-indigo-600 block"
                              >
                                {`http://${localIp || 'localhost'}:4000/attendance`}
                              </a>
                            </div>
                          </div>
                        </div>

                        <div className="flex gap-2 pt-2 border-t border-indigo-100 dark:border-indigo-900/30">
                          <button
                            type="button"
                            onClick={() => copyToClipboard(`http://${localIp || 'localhost'}:4000/attendance`, 'loc-attendance')}
                            className="flex-1 py-1.5 px-2 bg-white dark:bg-gray-800 hover:bg-indigo-100 dark:hover:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                          >
                            {copiedLink === 'loc-attendance' ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
                            <span>Nusxalash</span>
                          </button>
                          <a
                            href={`http://${localIp || 'localhost'}:4000/attendance`}
                            target="_blank"
                            rel="noreferrer"
                            className="py-1.5 px-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-colors"
                          >
                            <ExternalLink size={14} />
                            <span>Ochish</span>
                          </a>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

              {/* Sun'iy Intellekt Sozlamalari (Gemini) */}
              {(isMasterAdmin || businessType !== 'restaurant') && (
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
          )}

              {/* Biznes turi sozlamalari (Faqat Asosiy Admin) */}
              {isMasterAdmin && (
                <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 border border-gray-200 dark:border-gray-700 shadow-sm transition-colors">
                  <h3 className="text-lg font-bold text-gray-800 dark:text-white mb-4 flex items-center gap-2">
                    <Store className="text-blue-500" size={20} />
                    {lang === 'uz' ? 'Biznes Turi' : 'Тип Бизнеса'}
                    <span className="text-[10px] bg-amber-500 text-white px-2 py-0.5 rounded-full font-black">Admin</span>
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
              {isMasterAdmin && (
                <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 border border-gray-200 dark:border-gray-700 shadow-sm transition-colors">
                  <h3 className="text-lg font-bold text-gray-800 dark:text-white mb-4 flex items-center gap-2">
                    <span className="text-blue-500">🖥️</span>
                    Yordamchi Terminal Rejimi
                    <span className="text-[10px] bg-amber-500 text-white px-2 py-0.5 rounded-full font-black">Admin</span>
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

              {/* Ijtimoiy Tarmoqlar & Manzil Sozlamalari (Check uchun QR kodlar - Faqat Asosiy Admin) */}
              {isMasterAdmin && (
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
              )}

              {/* Backup & Restore (Faqat Asosiy Admin) */}
              {isMasterAdmin && (
                <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 border border-gray-200 dark:border-gray-700 shadow-sm transition-colors">
                  <h3 className="text-lg font-bold text-gray-800 dark:text-white mb-6 flex items-center gap-2">
                    <DatabaseBackup className="text-blue-500" size={20} />
                    {t('dataManagement')}
                  </h3>

                <div className="space-y-4">
                  {/* Telegram & Bildirishnomalar (Davomat Boti - Multi-Kafe) */}
                  <div className="p-4 rounded-xl border border-indigo-200 dark:border-indigo-800 bg-indigo-50/40 dark:bg-indigo-900/10 space-y-4">
                    <div className="flex items-center justify-between gap-3 border-b border-indigo-100 dark:border-indigo-900/30 pb-3">
                      <div className="flex items-center gap-2">
                        <span className="text-xl">📸</span>
                        <div>
                          <h4 className="font-bold text-gray-900 dark:text-white text-sm">
                            Telegram & Bildirishnomalar (Davomat Boti)
                          </h4>
                          <p className="text-xs text-gray-500 dark:text-gray-400">
                            Xodimlar selfi fotosi va kelgan vaqti to'g'ridan-to'g'ri filial Telegram guruhiga yuboriladi.
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-3">
                      <div>
                        <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
                          Kafe/Restoran nomi:
                        </label>
                        <input
                          type="text"
                          value={cafeName}
                          onChange={e => setCafeName(e.target.value)}
                          placeholder="Masalan: Oqtepa Kattaqo'rg'on"
                          className="w-full bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-xs text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
                            Davomat Boti Tokeni:
                          </label>
                          <input
                            type="text"
                            value={telegramAttendanceToken}
                            onChange={e => setTelegramAttendanceToken(e.target.value)}
                            placeholder="8621843458:AAGBnjR3Lw..."
                            className="w-full bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-xs text-gray-900 dark:text-white font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500"
                          />
                        </div>

                        <div>
                          <div className="flex justify-between items-center mb-1">
                            <label className="block text-xs font-bold text-gray-700 dark:text-gray-300">
                              Telegram Guruh Chat ID:
                            </label>
                            <button
                              type="button"
                              disabled={isDetectingAttendanceChatId}
                              onClick={handleDetectAttendanceChatId}
                              className="text-[11px] font-bold text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1 cursor-pointer disabled:opacity-50"
                            >
                              {isDetectingAttendanceChatId ? (
                                <span className="w-3 h-3 border border-indigo-500 border-t-transparent rounded-full animate-spin" />
                              ) : (
                                <span>🔍 ID ni aniqlash (/id)</span>
                              )}
                            </button>
                          </div>
                          <input
                            type="text"
                            value={telegramAttendanceChatId}
                            onChange={e => setTelegramAttendanceChatId(e.target.value)}
                            placeholder="Masalan: -100xxxxxxxxxx"
                            className="w-full bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-xs text-gray-900 dark:text-white font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500"
                          />
                        </div>
                      </div>

                      {/* Standart Ish Grafigi (Kelish / Ketish vaqti & Kechikish nazorati) */}
                      <div className="pt-3 border-t border-indigo-100 dark:border-indigo-900/30">
                        <h5 className="text-xs font-bold text-gray-800 dark:text-gray-200 mb-2 flex items-center gap-1.5">
                          <Clock size={14} className="text-indigo-600 dark:text-indigo-400" />
                          Standart Ish Grafigi (Kechikkanlarni avtomatik hisoblash):
                        </h5>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                          <div>
                            <label className="block text-[11px] font-bold text-gray-600 dark:text-gray-400 mb-1">
                              Ish boshlanish vaqti (Kelish):
                            </label>
                            <input
                              type="time"
                              value={workStartTime}
                              onChange={e => setWorkStartTime(e.target.value)}
                              className="w-full bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-xs font-bold text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            />
                          </div>

                          <div>
                            <label className="block text-[11px] font-bold text-gray-600 dark:text-gray-400 mb-1">
                              Ish tugash vaqti (Ketish):
                            </label>
                            <input
                              type="time"
                              value={workEndTime}
                              onChange={e => setWorkEndTime(e.target.value)}
                              className="w-full bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-xs font-bold text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            />
                          </div>

                          <div>
                            <label className="block text-[11px] font-bold text-gray-600 dark:text-gray-400 mb-1">
                              Kechikish chegarasi (daqiqa):
                            </label>
                            <input
                              type="number"
                              min="0"
                              max="60"
                              value={lateGraceMinutes}
                              onChange={e => setLateGraceMinutes(e.target.value)}
                              placeholder="5"
                              className="w-full bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-xs font-bold text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            />
                          </div>
                        </div>
                        <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-1.5">
                          💡 Agar xodim belgilangan vaqtdan ({workStartTime || '09:00'}) {lateGraceMinutes || 5} daqiqadan ko'proq kech kelsa, hisobotlarda dastur avtomatik ravishda kechikkanini va qancha daqiqa kechikkanini hisoblab ko'rsatadi.
                        </p>
                      </div>
                    </div>

                    {attendanceTgStatus && (
                      <div className={`p-3 rounded-xl text-xs font-bold flex items-center gap-2 ${
                        attendanceTgStatus.success
                          ? 'bg-emerald-100 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700'
                          : 'bg-red-100 dark:bg-red-950/50 text-red-800 dark:text-red-300 border border-red-300 dark:border-red-700'
                      }`}>
                        {attendanceTgStatus.success ? (
                          <>
                            <CheckCircle2 size={16} className="text-emerald-600 dark:text-emerald-400 shrink-0" />
                            <span>Guruhga ulandi!</span>
                          </>
                        ) : (
                          <>
                            <AlertCircle size={16} className="text-red-600 dark:text-red-400 shrink-0" />
                            <span>{attendanceTgStatus.message}</span>
                          </>
                        )}
                      </div>
                    )}

                    <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
                      <p className="text-[11px] text-gray-500 dark:text-gray-400">
                        💡 Guruhga botni qo'shib admin qiling, so'ng test xabar yuborib tekshiring.
                      </p>

                      <div className="flex gap-2 w-full sm:w-auto shrink-0">
                        <button
                          type="button"
                          onClick={handleSaveAttendanceSettings}
                          className="px-3.5 py-2 text-xs font-bold text-gray-700 dark:text-gray-300 bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 rounded-lg transition-colors cursor-pointer"
                        >
                          Saqlash
                        </button>
                        <button
                          type="button"
                          disabled={isTestingAttendanceTg}
                          onClick={handleTestAttendanceTelegram}
                          className="px-4 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 rounded-lg transition-colors flex items-center justify-center gap-2 shadow-md cursor-pointer whitespace-nowrap"
                        >
                          {isTestingAttendanceTg ? (
                            <>
                              <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                              <span>Tekshirilmoqda...</span>
                            </>
                          ) : (
                            <>
                              <span>🧪 Guruhga test xabar yuborish</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>

                    {/* Davomat QR kodini chop etish va ko'rish */}
                    <div className="pt-4 border-t border-indigo-100 dark:border-indigo-900/30">
                      <div className="bg-white dark:bg-gray-800/80 p-4 rounded-xl border border-indigo-200 dark:border-indigo-800/60 flex flex-col md:flex-row items-center gap-5">
                        <div className="shrink-0 bg-white p-3 rounded-2xl border-2 border-indigo-300 shadow-md flex flex-col items-center justify-center">
                          <QRCodeCanvas
                            id="attendance-qr-canvas"
                            value={`http://${localIp || 'localhost'}:4000/attendance`}
                            size={120}
                            className="bg-white"
                          />
                          <span className="text-[10px] font-bold text-indigo-700 mt-1 uppercase tracking-wider">Davomat QR</span>
                        </div>
                        <div className="flex-1 min-w-0 text-center md:text-left">
                          <h5 className="font-bold text-sm text-gray-900 dark:text-white flex items-center justify-center md:justify-start gap-2">
                            <span>📸</span>
                            Devorga ilish uchun Davomat QR kodi
                          </h5>
                          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 mb-2">
                            Ushbu QR kodni chop etib, xodimlar kirish eshigiga yoki kassa yoniga ilib qo'ying. Xodimlar telefon kamerasida skaner qilib selfi tushadi.
                          </p>
                          <div className="font-mono text-xs font-bold text-indigo-600 dark:text-indigo-400 break-all bg-indigo-50 dark:bg-indigo-950/40 px-3 py-1.5 rounded-lg inline-block">
                            {`http://${localIp || 'localhost'}:4000/attendance`}
                          </div>
                        </div>
                        <div className="flex flex-wrap md:flex-col gap-2 shrink-0 w-full md:w-auto">
                          <button
                            type="button"
                            onClick={() => copyToClipboard(`http://${localIp || 'localhost'}:4000/attendance`, 'att-tg-link')}
                            className="flex-1 md:flex-initial py-2 px-3 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-900/30 dark:hover:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                          >
                            {copiedLink === 'att-tg-link' ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
                            <span>Nusxalash</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              const printWindow = window.open('', '_blank');
                              if (printWindow) {
                                printWindow.document.write(`
                                  <!DOCTYPE html>
                                  <html>
                                  <head>
                                    <title>Xodimlar Davomati QR - ${storeName || 'POS'}</title>
                                    <style>
                                      body { font-family: 'Segoe UI', Arial, sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 90vh; margin: 0; text-align: center; }
                                      .card { border: 4px solid #4f46e5; border-radius: 24px; padding: 40px; max-width: 420px; box-shadow: 0 10px 25px rgba(0,0,0,0.1); }
                                      h1 { font-size: 26px; color: #1e1b4b; margin: 0 0 8px 0; }
                                      h2 { font-size: 18px; color: #4f46e5; margin: 0 0 20px 0; }
                                      .qr-box { background: white; padding: 16px; border-radius: 16px; display: inline-block; border: 2px dashed #6366f1; margin-bottom: 20px; }
                                      p { font-size: 14px; color: #4b5563; margin: 6px 0; line-height: 1.5; }
                                      .url { font-family: monospace; font-size: 12px; color: #6b7280; margin-top: 15px; word-break: break-all; }
                                      @media print { button { display: none; } }
                                    </style>
                                  </head>
                                  <body>
                                    <div class="card">
                                      <h1>${storeName || 'KORXONA'}</h1>
                                      <h2>📸 XODIMLAR DAVOMATI</h2>
                                      <div class="qr-box">
                                        <img src="https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(`http://${localIp || 'localhost'}:4000/attendance`)}" width="250" height="250" alt="QR Code" />
                                      </div>
                                      <p><strong>1. Telefon kamerasini QR kodga qarating</strong></p>
                                      <p><strong>2. Ismingizni tanlab, selfi rasmga tushing</strong></p>
                                      <p><strong>3. "Keldim" yoki "Ketdim" tugmasini bosing</strong></p>
                                      <div class="url">http://${localIp || 'localhost'}:4000/attendance</div>
                                    </div>
                                    <script>
                                      window.onload = function() { window.print(); }
                                    </script>
                                  </body>
                                  </html>
                                `);
                                printWindow.document.close();
                              }
                            }}
                            className="flex-1 md:flex-initial py-2 px-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer shadow-sm"
                          >
                            <Printer size={14} />
                            <span>QR Chop etish</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Telegram Guruhga Zaxiralash */}
                  <div className="p-4 rounded-xl border border-blue-200 dark:border-blue-800 bg-blue-50/40 dark:bg-blue-900/10 space-y-4">
                    <div className="flex items-center justify-between gap-3 border-b border-blue-100 dark:border-blue-900/30 pb-3">
                      <div className="flex items-center gap-2">
                        <span className="text-xl">✈️</span>
                        <div>
                          <h4 className="font-bold text-gray-900 dark:text-white text-sm">
                            Telegram guruhga zaxiralash (Telegram Bot API)
                          </h4>
                          <p className="text-xs text-gray-500 dark:text-gray-400">
                            SQLite baza faylini avtomatik Telegram guruhga yuborish.
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
                          Telegram Bot Token:
                        </label>
                        <input
                          type="text"
                          value={telegramBotToken}
                          onChange={e => setTelegramBotToken(e.target.value)}
                          placeholder="8621843458:AAGBnjR3Lw..."
                          className="w-full bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-xs text-gray-900 dark:text-white font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>

                      <div>
                        <div className="flex justify-between items-center mb-1">
                          <label className="block text-xs font-bold text-gray-700 dark:text-gray-300">
                            Telegram Group Chat ID:
                          </label>
                          <button
                            type="button"
                            disabled={isDetectingTelegramChatId}
                            onClick={handleDetectTelegramChatId}
                            className="text-[11px] font-bold text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1 cursor-pointer disabled:opacity-50"
                          >
                            {isDetectingTelegramChatId ? (
                              <span className="w-3 h-3 border border-blue-500 border-t-transparent rounded-full animate-spin" />
                            ) : (
                              <span>🔍 ID ni aniqlash (/id)</span>
                            )}
                          </button>
                        </div>
                        <input
                          type="text"
                          value={telegramChatId}
                          onChange={e => setTelegramChatId(e.target.value)}
                          placeholder="Masalan: -100xxxxxxxxxx"
                          className="w-full bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-xs text-gray-900 dark:text-white font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                    </div>

                    <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
                      <p className="text-[11px] text-gray-500 dark:text-gray-400">
                        💡 Guruh ID sini avto-aniqlash uchun: botni Telegram guruhga qo'shib, guruhda <code className="bg-gray-200 dark:bg-gray-700 px-1 rounded font-bold text-blue-600 dark:text-blue-400">/id</code> yuboring va "ID ni aniqlash" tugmasini bosing.
                      </p>

                      <div className="flex gap-2 w-full sm:w-auto shrink-0">
                        <button
                          type="button"
                          onClick={handleSaveTelegramBackupSettings}
                          className="px-3 py-2 text-xs font-bold text-gray-700 dark:text-gray-300 bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 rounded-lg transition-colors cursor-pointer"
                        >
                          Saqlash
                        </button>
                        <button
                          type="button"
                          disabled={isSendingTelegramBackup}
                          onClick={handleSendTelegramBackup}
                          className="px-4 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-lg transition-colors flex items-center justify-center gap-2 shadow-md cursor-pointer whitespace-nowrap"
                        >
                          {isSendingTelegramBackup ? (
                            <>
                              <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                              <span>Yuborilmoqda...</span>
                            </>
                          ) : (
                            <>
                              <span>✈️ Telegram guruhga zaxiralash</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  </div>

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

                {/* Clear Sales History (Faqat Asosiy Admin) */}
                {isMasterAdmin && (
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
                )}

                {/* Clear Warehouse (Faqat Asosiy Admin) */}
                {isMasterAdmin && (
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
                )}

                {/* Factory Reset (Faqat Asosiy Admin) */}
                {isMasterAdmin && (
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
                )}
              </div>
            )}
        </div>

        {/* Right Column: Cashiers & AutoUpdater */}
        <div className="space-y-6">
          {/* Dastur versiyasi va avto-yangilanish (AutoUpdater) */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 border border-gray-200 dark:border-gray-700 shadow-sm transition-colors space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-xl">
                  <RefreshCw size={22} className={updateState === 'checking' ? 'animate-spin' : ''} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-gray-900 dark:text-white">
                    Dastur versiyasi va avto-yangilanish
                  </h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Joriy versiya: <span className="font-mono font-bold text-blue-600 dark:text-blue-400">{appVersion}</span>
                  </p>
                </div>
              </div>

              <button
                type="button"
                disabled={updateState === 'checking' || updateState === 'downloading'}
                onClick={handleCheckForUpdates}
                className="px-4 py-2 bg-blue-50 hover:bg-blue-100 dark:bg-blue-900/20 dark:hover:bg-blue-900/40 disabled:opacity-50 text-blue-600 dark:text-blue-400 text-xs font-bold rounded-xl transition-colors cursor-pointer whitespace-nowrap flex items-center gap-1.5"
              >
                <RefreshCw size={14} className={updateState === 'checking' ? 'animate-spin' : ''} />
                <span>{updateState === 'checking' ? "Tekshirilmoqda..." : "Yangilanishlarni tekshirish"}</span>
              </button>
            </div>

            {/* Status Messages */}
            {updateState === 'checking' && (
              <div className="p-3 bg-gray-50 dark:bg-gray-900/30 border border-gray-200 dark:border-gray-700 rounded-xl flex items-center gap-3 text-xs font-medium text-gray-600 dark:text-gray-300">
                <span className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                <span>Tekshirilmoqda...</span>
              </div>
            )}

            {updateState === 'not-available' && (
              <div className="p-3 bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900/40 rounded-xl text-xs font-bold text-emerald-600 dark:text-emerald-400 flex items-center justify-between">
                <span>✅ Sizda eng so'nggi versiya o'rnatilgan ({appVersion})</span>
                <button
                  type="button"
                  onClick={handleCheckForUpdates}
                  className="text-[11px] underline hover:opacity-80"
                >
                  Qayta tekshirish
                </button>
              </div>
            )}

            {updateState === 'available' && (
              <div className="p-4 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/40 rounded-xl space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-xs font-bold text-amber-800 dark:text-amber-300 block">
                      🚀 Yangi versiya mavjud: v{updateInfo?.version || 'yangi'}!
                    </span>
                    <p className="text-[11px] text-amber-600 dark:text-amber-400 mt-0.5">
                      Dasturga yangi imkoniyatlar va xavfsizlik yangilanishlari qo'shilgan.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleStartDownload}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow-md transition-all cursor-pointer whitespace-nowrap"
                  >
                    Yuklab olish
                  </button>
                </div>
              </div>
            )}

            {updateState === 'downloading' && (
              <div className="p-4 bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900/40 rounded-xl space-y-2">
                <div className="flex justify-between text-xs font-bold text-blue-700 dark:text-blue-300">
                  <span>Yuklanmoqda: {downloadPercent}%...</span>
                  <span>{downloadPercent}%</span>
                </div>
                <div className="w-full bg-blue-200 dark:bg-blue-900/50 rounded-full h-2 overflow-hidden">
                  <div
                    className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${downloadPercent}%` }}
                  />
                </div>
              </div>
            )}

            {updateState === 'downloaded' && (
              <div className="p-4 bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900/40 rounded-xl flex items-center justify-between gap-3">
                <div>
                  <span className="text-xs font-bold text-emerald-800 dark:text-emerald-300 block">
                    🎉 Yangilanish yuklab olindi!
                  </span>
                  <p className="text-[11px] text-emerald-600 dark:text-emerald-400">
                    Dasturni qayta ishga tushirib yangi versiyaga o'tishingiz mumkin. Ma'lumotlaringiz to'liq saqlanadi.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleInstallUpdate}
                  className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-md transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5"
                >
                  <span>O'rnatish va qayta ishga tushirish</span>
                </button>
              </div>
            )}

            {updateState === 'error' && (
              <div className="p-3 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/40 rounded-xl text-xs text-red-600 dark:text-red-400 flex items-center justify-between">
                <span>❌ Xatolik: {updateError}</span>
                <button
                  type="button"
                  onClick={handleCheckForUpdates}
                  className="text-[11px] font-bold underline hover:opacity-80 shrink-0"
                >
                  Qayta urinish
                </button>
              </div>
            )}
          </div>

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
                  {businessType !== 'restaurant' && !isMasterAdmin && (
                    <button type="submit" className="bg-orange-500 hover:bg-orange-600 text-white px-4 py-2 rounded-lg transition-colors flex items-center justify-center h-10 cursor-pointer shrink-0">
                      <Plus size={20} />
                    </button>
                  )}
                </div>
                {(businessType === 'restaurant' || isMasterAdmin) && (
                  <div className="flex flex-wrap gap-2 items-center">
                    <select
                      value={cashierRole}
                      onChange={e => setCashierRole(e.target.value)}
                      className="flex-1 min-w-[130px] border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-orange-500 focus:outline-none text-sm"
                    >
                      <option value="cashier">Kassir</option>
                      <option value="manager">Menejer</option>
                      <option value="cook">Oshpaz</option>
                      <option value="waiter">Ofitsiant</option>
                      <option value="worker">Ishchi</option>
                      <option value="admin">Asosiy Admin</option>
                    </select>
                    <input
                      type="number"
                      placeholder="Fiksa oylik (so'm)"
                      value={cashierSalary}
                      onChange={e => setCashierSalary(e.target.value)}
                      className="flex-1 min-w-[120px] border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-orange-500 focus:outline-none text-sm"
                    />
                    <input
                      type="number"
                      min={0}
                      max={100}
                      placeholder="Foiz (%)"
                      value={cashierPercentage}
                      onChange={e => setCashierPercentage(e.target.value)}
                      className="w-24 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-orange-500 focus:outline-none text-sm"
                    />
                    <button type="submit" className="bg-orange-500 hover:bg-orange-600 text-white px-4 py-2 rounded-lg transition-colors flex items-center justify-center h-10 cursor-pointer font-bold text-sm shrink-0">
                      Qo'shish <Plus size={16} className="ml-1" />
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
                          {(!isMasterAdmin && businessType !== 'restaurant') && (
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
                        {(businessType === 'restaurant' || isMasterAdmin) && (
                          <div className="flex flex-wrap gap-2 items-center">
                            <select
                              value={editRole}
                              onChange={e => setEditRole(e.target.value)}
                              className="flex-1 min-w-[120px] border border-gray-300 dark:border-gray-600 rounded-md px-2 py-1 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none"
                            >
                              <option value="cashier">Kassir</option>
                              <option value="manager">Menejer</option>
                              <option value="cook">Oshpaz</option>
                              <option value="worker">Ishchi</option>
                              <option value="admin">Asosiy Admin</option>
                            </select>
                            <input
                              type="number"
                              value={editSalary}
                              onChange={e => setEditSalary(e.target.value)}
                              className="flex-1 min-w-[100px] border border-gray-300 dark:border-gray-600 rounded-md px-2 py-1 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none"
                              placeholder="Oylik"
                            />
                            <input
                              type="number"
                              min={0}
                              max={100}
                              value={editPercentage}
                              onChange={e => setEditPercentage(e.target.value)}
                              className="w-20 border border-gray-300 dark:border-gray-600 rounded-md px-2 py-1 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none"
                              placeholder="Foiz %"
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
                            {c.name} {(businessType === 'restaurant' || isMasterAdmin) && (
                              <span className="text-xs font-normal text-orange-500 font-semibold px-1.5 py-0.5 rounded bg-orange-50 dark:bg-orange-950/30 border border-orange-100 dark:border-orange-900/30 ml-1.5">
                                {c.role === 'admin' ? 'Admin' : c.role === 'manager' ? 'Menejer' : c.role === 'cook' ? 'Oshpaz' : c.role === 'worker' ? 'Ishchi' : 'Kassir'}
                              </span>
                            )}
                          </span>
                          <div className="flex flex-wrap gap-3 mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                            <span>PIN: {canReveal ? (isRevealed ? c.pin : '••••') : '••••'}</span>
                            {(businessType === 'restaurant' || isMasterAdmin) && c.salary > 0 && (
                              <span>Oylik: {Number(c.salary).toLocaleString()} so'm</span>
                            )}
                            {(businessType === 'restaurant' || isMasterAdmin) && c.percentage > 0 && (
                              <span className="text-blue-500 font-semibold">{c.percentage}% foiz</span>
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
                                setEditPercentage(c.percentage || '');
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
          {(businessType === 'restaurant' || isMasterAdmin) && (
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

          {/* Kafe Xizmat Foiz Stavkasi Card */}
          {(businessType === 'restaurant' || isMasterAdmin) && (
            <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 border border-gray-200 dark:border-gray-700 shadow-sm transition-colors">
              <h3 className="text-lg font-bold text-gray-800 dark:text-white mb-4 flex items-center gap-2">
                <Percent className="text-emerald-500" size={20} />
                Kafe Xizmat Foiz Stavkasi (Service Fee %)
              </h3>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-4 leading-relaxed">
                Kafe va restoran buyurtmalari hamda ofitsiantlar uchun umumiy xizmat ko'rsatish foiz stavkasi sozlamasi.
              </p>

              <div className="space-y-4">
                <div className="p-4 bg-emerald-50/50 dark:bg-emerald-950/20 rounded-xl border border-emerald-200/60 dark:border-emerald-800/40">
                  <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 uppercase mb-1">
                    Umumiy Kafe Xizmat Foizi (%)
                  </label>
                  <div className="flex gap-2 max-w-sm">
                    <input 
                      type="number"
                      min={0}
                      max={100}
                      value={cafeServiceFee}
                      onChange={e => setCafeServiceFee(e.target.value)}
                      placeholder="10"
                      className="flex-1 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white font-bold focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={handleSaveCafeServiceFee}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-4 py-2 rounded-lg transition-colors cursor-pointer text-xs"
                    >
                      Saqlash
                    </button>
                  </div>
                  <p className="text-[11px] text-emerald-700 dark:text-emerald-400 mt-2">
                    * Ushbu foiz stavkasi restoran cheklarida va ofitsiant xizmat ulushlarida qo'llaniladi.
                  </p>
                </div>

                {waiters.length > 0 && (
                  <div className="space-y-2 pt-2">
                    <h4 className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase">
                      Ofitsiantlar amaldagi xizmat foizlari:
                    </h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {waiters.map(w => (
                        <div key={w.id} className="p-2.5 bg-gray-50 dark:bg-gray-700/40 rounded-lg border border-gray-200 dark:border-gray-600 flex justify-between items-center text-xs">
                          <span className="font-semibold text-gray-800 dark:text-gray-200">{w.name}</span>
                          <span className="font-black text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/40 px-2 py-0.5 rounded border border-blue-200 dark:border-blue-800">
                            {w.percentage}% xizmat
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Telefondan kirish QR kodi va havolasi ruxsati Card (Faqat Asosiy Admin) */}
          {isMasterAdmin && (
            <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 border border-gray-200 dark:border-gray-700 shadow-sm transition-colors">
              <div className="flex items-center justify-between gap-3 mb-2">
                <h4 className="font-bold text-gray-800 dark:text-gray-200 flex items-center gap-2 text-base">
                  <span className="text-blue-500">📲</span>
                  Telefondan kirish QR kodi (Kassa oynasida ko'rsatish)
                </h4>
                <span className={`text-xs px-2.5 py-1 font-bold rounded-lg shrink-0 ${allowMobileQr ? 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300' : 'bg-rose-100 dark:bg-rose-900/40 text-rose-700 dark:text-rose-300'}`}>
                  {allowMobileQr ? 'Ruxsat berilgan' : 'Ruxsat berilmagan'}
                </span>
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-4 leading-relaxed">
                Kassa va restoran oyna panellarida telefondan ulanish QR kodi va havolasi tugmasini ko'rsatish yoki yashirish. Sozlamani o'zgartirish uchun maxfiy PIN kod talab etiladi.
              </p>
              <button
                type="button"
                onClick={() => {
                  setShowMobileQrPinModal(true);
                  setMobileQrPinInput('');
                  setMobileQrPinError('');
                }}
                className={`w-full py-2.5 px-4 rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2 cursor-pointer ${
                  allowMobileQr
                    ? 'bg-rose-50 hover:bg-rose-100 dark:bg-rose-900/20 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-800'
                    : 'bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800'
                }`}
              >
                {allowMobileQr ? "Ruxsatni bekor qilish va yashirish" : "Ruxsat berish va ko'rsatish"}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
});
