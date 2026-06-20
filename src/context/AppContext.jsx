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
      setGlobalProducts(data);
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



  // ── Global Customers Cache ─────────────────────────────────────────────────
  const [globalCustomers, setGlobalCustomers] = useState([]);
  const [customersLoaded, setCustomersLoaded] = useState(false);

  const fetchGlobalCustomers = async () => {
    if (!window.api) return;
    try {
      const data = await window.api.getCustomers();
      setGlobalCustomers(data);
      setCustomersLoaded(true);
    } catch (err) {
    }
  };

  useEffect(() => {
    // Fetch initial settings and customers
    if (window.api) {
      window.api.getSettings().then(res => {
        if (res && res.success && res.data?.store_name) {
          setStoreName(res.data.store_name);
        }
      }).catch(() => {});
      fetchGlobalCustomers();
    }
  }, []);

  useEffect(() => {
    let socket;
    if (window.api) {
      window.api.getExpressPort().then(port => {
        socket = io(`http://localhost:${port}`);
        
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
      }).catch(err => {
        console.error('Failed to get Express port:', err);
      });
    }
    return () => {
      if (socket) socket.disconnect();
    };
  }, []);

  return (
    <AppContext.Provider value={{ 
      cart, setCart, carts, setCarts, activeCartId, setActiveCartId, theme, toggleTheme, lang, toggleLang, t,
      currentUser, setCurrentUser, storeName, setStoreName,
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
