import { createContext, useContext, useState, useEffect } from 'react';
import { TRANSLATIONS } from '../translations';
import { io } from 'socket.io-client';

const AppContext = createContext(null);

export function AppProvider({ children }) {
  // ── Cart (persists across tab switches) ─────────────────────────────────────
  const [carts, setCarts] = useState({ 1: [], 2: [], 3: [] });
  const [activeCartId, setActiveCartId] = useState(1);

  const cart = carts[activeCartId] || [];

  const setCart = (updater) => {
    setCarts(prev => {
      const currentCart = prev[activeCartId] || [];
      const nextCart = typeof updater === 'function' ? updater(currentCart) : updater;
      return {
        ...prev,
        [activeCartId]: nextCart
      };
    });
  };

  // ── Global Products Cache ──────────────────────────────────────────────────
  const [globalProducts, setGlobalProducts] = useState([]);
  const [productsLoaded, setProductsLoaded] = useState(false);

  const fetchGlobalProducts = async () => {
    if (!window.api) return;
    try {
      const data = await window.api.getProducts();
      setGlobalProducts(data || []);
      setProductsLoaded(true);
    } catch (err) {
    }
  };

  useEffect(() => {
    fetchGlobalProducts();
  }, []);

  // ── Theme ────────────────────────────────────────────────────────────────────
  const [theme, setTheme] = useState(() => {
    const saved = localStorage.getItem('theme');
    return saved === 'light' || saved === 'dark' ? saved : 'dark';
  });
  const toggleTheme = () => {
    setTheme(t => {
      const next = t === 'light' ? 'dark' : 'light';
      localStorage.setItem('theme', next);
      return next;
    });
  };

  // ── Language ─────────────────────────────────────────────────────────────────
  const [lang, setLang] = useState(() => {
    const saved = localStorage.getItem('lang');
    return saved === 'ru' || saved === 'uz' ? saved : 'uz';
  });
  const toggleLang = () => {
    setLang(l => {
      const next = l === 'ru' ? 'uz' : 'ru';
      localStorage.setItem('lang', next);
      return next;
    });
  };

  // ── Translation helper ───────────────────────────────────────────────────────
  const t = (key) => {
    const keys = key.split('.');
    let val = TRANSLATIONS[lang];
    for (const k of keys) val = val?.[k];
    return val ?? key;
  };

  // ── Auth & Settings ──────────────────────────────────────────────────────────
  const [currentUser, setCurrentUser] = useState(null);
  const [storeName, setStoreName] = useState("Mening Do'konim");
  const [businessType, setBusinessType] = useState('retail');
  const [terminalMode, setTerminalMode] = useState(false);
  const [shopLogo, setShopLogoState] = useState(() => {
    return localStorage.getItem('shopLogoBase64') || '';
  });

  const setShopLogo = (val) => {
    setShopLogoState(val);
    if (val) {
      localStorage.setItem('shopLogoBase64', val);
    } else {
      localStorage.removeItem('shopLogoBase64');
    }
  };

  const [receiptLogo, setReceiptLogoState] = useState(() => {
    return localStorage.getItem('receiptLogoBase64') || '';
  });

  const setReceiptLogo = (val) => {
    setReceiptLogoState(val);
    if (val) {
      localStorage.setItem('receiptLogoBase64', val);
    } else {
      localStorage.removeItem('receiptLogoBase64');
    }
  };

  const updateTerminalMode = async (val) => {
    setTerminalMode(val);
    if (window.api) {
      await window.api.updateSetting({ key: 'terminal_mode', value: val ? 'true' : 'false' });
    }
  };



  // ── Global Customers Cache ─────────────────────────────────────────────────
  const [globalCustomers, setGlobalCustomers] = useState([]);
  const [customersLoaded, setCustomersLoaded] = useState(false);

  const fetchGlobalCustomers = async () => {
    if (!window.api) return;
    try {
      const data = await window.api.getCustomers();
      setGlobalCustomers(data || []);
      setCustomersLoaded(true);
    } catch (err) {
    }
  };

  useEffect(() => {
    // Fetch initial settings and customers
    if (window.api) {
      window.api.getSettings().then(res => {
        if (res && res.success) {
          if (res.data.store_name) setStoreName(res.data.store_name);
          if (res.data.business_type) setBusinessType(res.data.business_type);
          if (res.data.terminal_mode) setTerminalMode(res.data.terminal_mode === 'true');
          if (res.data.receipt_printer_name) localStorage.setItem('receiptPrinterName', res.data.receipt_printer_name);
          if (res.data.label_printer_name) localStorage.setItem('labelPrinterName', res.data.label_printer_name);
          if (res.data.printer_width) localStorage.setItem('printer_width', res.data.printer_width);
          if (res.data.label_width) localStorage.setItem('label_width', res.data.label_width);
          if (res.data.label_height) localStorage.setItem('label_height', res.data.label_height);
          if (res.data.shop_location) localStorage.setItem('shopLocation', res.data.shop_location);
          if (res.data.telegram_qr) localStorage.setItem('telegramQrCode', res.data.telegram_qr);
          if (res.data.instagram_qr) localStorage.setItem('instagramQrCode', res.data.instagram_qr);
          if (res.data.shop_logo) {
            setShopLogoState(res.data.shop_logo);
            localStorage.setItem('shopLogoBase64', res.data.shop_logo);
          } else {
            setShopLogoState('');
            localStorage.removeItem('shopLogoBase64');
          }
          if (res.data.receipt_logo) {
            setReceiptLogoState(res.data.receipt_logo);
            localStorage.setItem('receiptLogoBase64', res.data.receipt_logo);
          } else {
            setReceiptLogoState('');
            localStorage.removeItem('receiptLogoBase64');
          }
        }
      }).catch(() => {});
      fetchGlobalCustomers();
    }
  }, []);

  useEffect(() => {
    let socket;
    
    const initSocket = (url) => {
      socket = io(url);
      
      socket.on('connect', () => {
        console.log('🔌 Connected to local WebSocket server');
      });
      
      socket.on('sales-updated', (data) => {
        console.log('🔄 WebSocket: Sales updated, reloading products and stats...', data);
        fetchGlobalProducts();
        fetchGlobalCustomers();
        window.dispatchEvent(new CustomEvent('sales-updated', { detail: data }));
      });
      
      socket.on('products-updated', (data) => {
        console.log('🔄 WebSocket: Products updated, reloading products...', data);
        fetchGlobalProducts();
        window.dispatchEvent(new CustomEvent('products-updated', { detail: data }));
      });
      
      socket.on('debts-updated', (data) => {
        console.log('🔄 WebSocket: Debts updated, reloading customers...', data);
        fetchGlobalCustomers();
        window.dispatchEvent(new CustomEvent('debts-updated', { detail: data }));
      });
    };

    if (window.api && typeof window.api.getExpressPort === 'function') {
      // In desktop app, fetch actual express port
      window.api.getExpressPort().then(port => {
        if (port) {
          initSocket(`http://localhost:${port}`);
        } else {
          initSocket(window.location.origin);
        }
      }).catch(err => {
        console.error('Failed to get Express port, falling back to window origin:', err);
        initSocket(window.location.origin);
      });
    } else {
      // In web browser, connect directly to the serving host origin
      initSocket(window.location.origin);
    }
    
    return () => {
      if (socket) socket.disconnect();
    };
  }, []);

  return (
    <AppContext.Provider value={{ 
      cart, setCart, carts, setCarts, activeCartId, setActiveCartId, theme, toggleTheme, lang, toggleLang, t,
      currentUser, setCurrentUser, storeName, setStoreName, businessType, setBusinessType, shopLogo, setShopLogo, receiptLogo, setReceiptLogo,
      terminalMode, updateTerminalMode,
      globalProducts, setGlobalProducts, fetchGlobalProducts, productsLoaded,
      globalCustomers, setGlobalCustomers, fetchGlobalCustomers, customersLoaded
    }}>
      {children}
    </AppContext.Provider>
  );
}

export const useApp = () => {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used inside AppProvider');
  return ctx;
};
