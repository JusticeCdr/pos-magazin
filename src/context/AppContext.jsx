import { createContext, useContext, useState, useEffect } from 'react';
import { TRANSLATIONS } from '../translations';

const AppContext = createContext(null);

export function AppProvider({ children }) {
  // ── Cart (persists across tab switches) ─────────────────────────────────────
  const [cart, setCart] = useState([]);

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

  return (
    <AppContext.Provider value={{ 
      cart, setCart, theme, toggleTheme, lang, toggleLang, t,
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
