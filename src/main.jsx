import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { AppProvider } from './context/AppContext.jsx'

// ── Fallback window.api for Web Browser Clients ──
if (typeof window !== 'undefined' && !window.api) {
  const ipcMapping = {
    getProducts: 'get-products',
    getCustomers: 'get-customers',
    addProduct: 'add-product',
    updateProduct: 'update-product',
    addStockToProduct: 'add-stock-to-product',
    deleteProduct: 'delete-product',
    searchProduct: 'search-product',
    processSale: 'process-sale',
    getRecentSales: 'get-recent-sales',
    getAllSalesHistory: 'get-all-sales-history',
    processFullReturn: 'process-full-return',
    processReturn: 'process-return',
    getPrinters: 'get-printers',
    payDebt: 'pay-debt',
    getReports: 'get-reports',
    getWaitersReport: 'get-waiters-report',
    getSalesForExcel: 'get-sales-for-excel',
    getLowStock: 'get-low-stock',
    clearTestData: 'clear-test-data',
    clearWarehouse: 'clear-warehouse',
    resetFactoryData: 'reset-factory-data',
    getCurrentShiftStats: 'get-current-shift-stats',
    closeShift: 'close-shift',
    getCustomerDebtDetails: 'get-customer-debt-details',
    verifyPin: 'verify-pin',
    maybeOpenShift: 'maybe-open-shift',
    getSettings: 'get-settings',
    updateSetting: 'update-setting',
    checkBaseLoaded: 'check-base-loaded',
    loadInitialBase: 'load-initial-base',
    getRestaurantTables: 'get-restaurant-tables',
    getActiveOrderForTable: 'get-active-order-for-table',
    saveRestaurantOrder: 'save-restaurant-order',
    closeRestaurantOrder: 'close-restaurant-order',
    closeRestaurantOrderOnly: 'close-restaurant-order-only',
    getWaiters: 'get-waiters',
    addWaiter: 'add-waiter',
    deleteWaiter: 'delete-waiter',
    transferRestaurantTable: 'transfer-restaurant-table',
    transferRestaurantOrderWaiter: 'transfer-restaurant-order-waiter',
    cancelRestaurantOrder: 'cancel-restaurant-order',
    addDeliveryOrder: 'add-delivery-order',
    addRestaurantTable: 'add-restaurant-table',
    deleteRestaurantTable: 'delete-restaurant-table',
    saveProductRecipe: 'save-product-recipe',
    getProductRecipe: 'get-product-recipe',
    lockTable: 'lock-table',
    unlockTable: 'unlock-table',
    setTablePrePrinted: 'set-table-pre-printed',
    getCashiers: 'get-cashiers',
    addCashier: 'add-cashier',
    deleteCashier: 'delete-cashier',
    updateCashierPin: 'update-cashier-pin',
    exportDB: 'export-db',
    importDB: 'import-db',
    optimizeDatabase: 'optimize-database',
    autoBackupDB: 'auto-backup-db',
    writeOffProduct: 'write-off-product',
    getWriteOffs: 'get-write-offs',
    getInventoryLogs: 'get-inventory-logs',
    addExpense: 'add-expense',
    deleteExpense: 'delete-expense',
    deleteCustomer: 'delete-customer',
    getMachineId: 'get-machine-id',
    getActivation: 'get-activation',
    saveActivation: 'save-activation',
    clearActivation: 'clear-activation',
    getNgrokUrl: 'get-ngrok-url',
    getExpressPort: 'get-express-port',
    saveNgrokSettings: 'save-ngrok-settings',
    exportSaleExcel: 'export-sale-excel',
    getAiInsights: 'get-ai-insights',
    saveNetworkSettings: 'save-network-settings',
    getNetworkSettings: 'get-network-settings',
    getLocalIPs: 'get-local-ips',
  };

  const apiFallback = {};
  
  // Forward normal database/IPC methods to express server
  for (const [key, channel] of Object.entries(ipcMapping)) {
    apiFallback[key] = async (...args) => {
      try {
        const response = await fetch('/api/ipc-forward', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-pos-client-token': 'xxmpos-secure-token-123'
          },
          body: JSON.stringify({ channel, args })
        });
        if (!response.ok) {
          const errData = await response.json();
          throw new Error(errData.error || 'Server error');
        }
        const resJson = await response.json();
        return resJson.data;
      } catch (err) {
        console.error(`Error forwarding IPC channel "${channel}":`, err);
        throw err;
      }
    };
  }

  // Intercept printReceipt to run locally in the browser
  apiFallback.printReceipt = async ({ receiptHTML }) => {
    try {
      const iframe = document.createElement('iframe');
      iframe.style.position = 'fixed';
      iframe.style.right = '0';
      iframe.style.bottom = '0';
      iframe.style.width = '0';
      iframe.style.height = '0';
      iframe.style.border = '0';
      document.body.appendChild(iframe);
      
      const doc = iframe.contentWindow.document;
      doc.open();
      doc.write(receiptHTML);
      doc.close();
      
      const style = doc.createElement('style');
      style.innerHTML = `
        @page { margin: 0; }
        body { margin: 0; padding: 0; background: white; }
      `;
      doc.head.appendChild(style);
      
      iframe.contentWindow.focus();
      iframe.contentWindow.print();
      
      setTimeout(() => {
        document.body.removeChild(iframe);
      }, 1000);
      
      return { success: true };
    } catch (err) {
      console.error('Local receipt printing error:', err);
      return { success: false, error: err.message };
    }
  };

  // Intercept printLabel to run locally in the browser
  apiFallback.printLabel = async ({ labelHTML }) => {
    try {
      const iframe = document.createElement('iframe');
      iframe.style.position = 'fixed';
      iframe.style.right = '0';
      iframe.style.bottom = '0';
      iframe.style.width = '0';
      iframe.style.height = '0';
      iframe.style.border = '0';
      document.body.appendChild(iframe);
      
      const doc = iframe.contentWindow.document;
      doc.open();
      doc.write(labelHTML);
      doc.close();
      
      const style = doc.createElement('style');
      style.innerHTML = `
        @page { margin: 0; }
        body { margin: 0; padding: 0; background: white; }
      `;
      doc.head.appendChild(style);
      
      iframe.contentWindow.focus();
      iframe.contentWindow.print();
      
      setTimeout(() => {
        document.body.removeChild(iframe);
      }, 1000);
      
      return { success: true };
    } catch (err) {
      console.error('Local label printing error:', err);
      return { success: false, error: err.message };
    }
  };

  apiFallback.printA4Invoice = async ({ invoiceHTML }) => {
    try {
      const iframe = document.createElement('iframe');
      iframe.style.position = 'fixed';
      iframe.style.right = '0';
      iframe.style.bottom = '0';
      iframe.style.width = '0';
      iframe.style.height = '0';
      iframe.style.border = '0';
      document.body.appendChild(iframe);
      
      const doc = iframe.contentWindow.document;
      doc.open();
      doc.write(invoiceHTML);
      doc.close();
      
      iframe.contentWindow.focus();
      iframe.contentWindow.print();
      
      setTimeout(() => {
        document.body.removeChild(iframe);
      }, 1000);
      
      return { success: true };
    } catch (err) {
      console.error('Local A4 invoice printing error:', err);
      return { success: false, error: err.message };
    }
  };

  // Event listener fallbacks (no-ops for browser client)
  apiFallback.onMobileSalePrinted = () => {};
  apiFallback.onNgrokUrlUpdated = () => {};
  apiFallback.onNgrokUrlSuccess = () => {};
  apiFallback.onNgrokUrlError = () => {};

  window.api = apiFallback;
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AppProvider>
      <App />
    </AppProvider>
  </StrictMode>,
)
