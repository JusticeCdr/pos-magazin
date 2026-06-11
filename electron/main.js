const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { exec } = require('child_process');
const { 
  initDB, closeDB, getProducts, getCustomers, addProduct, deleteProduct, searchProduct,
  processSale, getRecentSales, processFullReturn, processReturn, payDebt, getReports,
  getLowStockProducts, clearTestData, getCustomerDebtDetails, getAllSalesHistory, getSalesForExcel,
  verifyPin, getSettings, updateSetting, checkBaseLoaded, loadInitialBase,
  getCashiers, addCashier, deleteCashier, updateCashierPin, updateProduct, addStockToProduct,
  getCurrentShiftStats, closeShift,
  optimizeDatabase, getDBPath,
  writeOffProduct, getWriteOffs,
  getInventoryLogs,
  addExpense,
  deleteExpense,
  deleteCustomer,
  maybeOpenShift,
  getActivation,
  saveActivation,
  clearActivation
} = require('./database');

// ── Auto-Backup Helper ───────────────────────────────────────────────────────
// Runs AFTER shift close: copies pos.db → backup folder, keeps last 3 files.
const MAX_BACKUPS = 3;

function getMachineId() {
  return new Promise((resolve) => {
    exec('wmic csproduct get uuid', (error, stdout) => {
      if (error) {
        resolve('UNKNOWN_MACHINE_ID');
        return;
      }
      const lines = stdout.split('\n').map(line => line.trim()).filter(line => line && line !== 'UUID');
      if (lines.length > 0) {
        resolve(lines[0]);
      } else {
        resolve('UNKNOWN_MACHINE_ID');
      }
    });
  });
}

async function autoBackupDB() {
  try {
    const dbSrc = getDBPath();
    const backupDir = path.join(app.getPath('desktop'), 'pos_backups');

    // Ensure the backup directory exists
    await fs.promises.mkdir(backupDir, { recursive: true });

    // Name: pos_backup_2026-05-24_14-30-00.db (Local time, no colons allowed in Windows)
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
    
    const destFile = path.join(backupDir, `pos_backup_${stamp}.db`);

    // Perform the copy asynchronously
    await fs.promises.copyFile(dbSrc, destFile);

    // Prune: keep only the newest MAX_BACKUPS files
    const files = await fs.promises.readdir(backupDir);
    const dbFiles = files.filter(f => f.startsWith('pos_backup_') && f.endsWith('.db'));
    
    const filesWithStats = await Promise.all(
      dbFiles.map(async f => {
        const stat = await fs.promises.stat(path.join(backupDir, f));
        return { name: f, mtime: stat.mtime };
      })
    );
    
    filesWithStats.sort((a, b) => b.mtime - a.mtime); // newest first

    for (const old of filesWithStats.slice(MAX_BACKUPS)) {
      try {
        await fs.promises.unlink(path.join(backupDir, old.name));
      } catch (err) {
      }
    }

    return { success: true, path: destFile };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    title: 'xxMpos',
    icon: path.join(__dirname, process.env.VITE_DEV_SERVER_URL ? '../public/icon.ico' : '../dist/icon.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
    // mainWindow.webContents.openDevTools(); // uncomment to debug renderer
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }
}

const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', (event, commandLine, workingDirectory) => {
    // Someone tried to run a second instance, we should focus our window.
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(() => {
  initDB();

  // ── Products ──────────────────────────────────────────────────────────────
  ipcMain.handle('get-products', () => getProducts());
  ipcMain.handle('add-product', (_, product) => addProduct(product));
  ipcMain.handle('update-product', (_, { id, data }) => updateProduct(id, data));
  ipcMain.handle('add-stock-to-product', (_, { id, data }) => addStockToProduct(id, data));
  ipcMain.handle('delete-product', (_, id, userName) => deleteProduct(id, userName));
  ipcMain.handle('search-product', (_, query) => searchProduct(query));
  ipcMain.handle('write-off-product', (_, data) => writeOffProduct(data));
  ipcMain.handle('get-write-offs',     () => getWriteOffs());
  ipcMain.handle('get-inventory-logs', (_, opts) => getInventoryLogs(opts));
  ipcMain.handle('add-expense', (_, data) => addExpense(data.reason, data.amount, data.cashier_name));
  ipcMain.handle('delete-expense', (_, id) => deleteExpense(id));

  // Helper: safely register an IPC handler — removes old one first to survive HMR reloads
  const safeHandle = (channel, fn) => {
    ipcMain.removeHandler(channel);
    ipcMain.handle(channel, fn);
  };

  // ── Customers & Debts ──────────────────────────────────────────────────────
  safeHandle('get-customers',             () => getCustomers());
  safeHandle('get-recent-sales',          () => getRecentSales());
  safeHandle('process-full-return',       (_, saleId) => processFullReturn(saleId));
  safeHandle('process-return',            (_, { saleItemId, returnQty }) => processReturn(saleItemId, returnQty));
  safeHandle('pay-debt',                  (_, { customerId, amount, cashierName }) => payDebt(customerId, amount, cashierName));
  safeHandle('get-customer-debt-details', (_, customerId) => getCustomerDebtDetails(customerId));
  safeHandle('delete-customer',           (_, { customerId, cashierName }) => deleteCustomer(customerId, cashierName));

  // ── Sales ──────────────────────────────────────────────────────────────────
  safeHandle('process-sale', (_, { cartItems, paymentMethod, customerInfo, cashierName, discountPercent }) => {
    return processSale(cartItems, paymentMethod, customerInfo, cashierName, discountPercent);
  });

  // ── Reports ────────────────────────────────────────────────────────────────
  safeHandle('get-reports',        (_, dates) => getReports(dates.start, dates.end));
  safeHandle('get-sales-for-excel',(_, {start, end}) => getSalesForExcel(start, end));
  safeHandle('get-low-stock',      (_, limit) => getLowStockProducts(limit ?? 3));
  safeHandle('clear-test-data',    () => clearTestData());
  safeHandle('add-expense',        (_, data) => addExpense(data.reason, data.amount, data.cashier_name));
  safeHandle('delete-expense',     (_, id) => deleteExpense(id));

  // ── Shifts ─────────────────────────────────────────────────────────────────
  safeHandle('get-current-shift-stats', () => getCurrentShiftStats());
  safeHandle('close-shift', async (_, stats) => {
    const result = closeShift(stats);
    if (result.success) {
      // Run database optimization (VACUUM) and backup in background to avoid blocking the UI response
      setImmediate(async () => {
        try {
          optimizeDatabase();
        } catch (err) {}
        try {
          await autoBackupDB();
        } catch (err) {}
      });
    }
    return result;
  });

  // ── History (paginated) ────────────────────────────────────────────────────
  safeHandle('get-all-sales-history', (_, opts) => getAllSalesHistory(opts ?? {}));
  safeHandle('optimize-database',     () => optimizeDatabase());
  safeHandle('auto-backup-db',        () => autoBackupDB());

  // ── Printing ───────────────────────────────────────────────────────────────
  ipcMain.handle('get-printers', async () => {
    if (!mainWindow) return [];
    try {
      const printers = await mainWindow.webContents.getPrintersAsync();
      return printers;
    } catch (err) {
      return [];
    }
  });

  ipcMain.handle('print-receipt', async (_, arg) => {
    let receiptHTML = '';
    let printerName = undefined;

    if (typeof arg === 'string') {
      receiptHTML = arg;
      // Get printer name from settings
      try {
        const settingsRes = getSettings();
        if (settingsRes && settingsRes.success && settingsRes.data) {
          printerName = settingsRes.data.receipt_printer;
        }
      } catch (err) {
      }
    } else if (arg && typeof arg === 'object') {
      receiptHTML = arg.receiptHTML;
      printerName = arg.printerName;
    }

    if (!printerName || printerName === 'none') {
      return { success: false, error: 'Receipt printer is not configured' };
    }

    try {
      const printers = await mainWindow.webContents.getPrintersAsync();
      const printerExists = printers.some(p => p.name === printerName);
      if (!printerExists) {
        return { success: false, error: `Printer "${printerName}" not found on this system` };
      }
    } catch (err) {
      console.error('Error verifying printer existence:', err);
    }

    return new Promise((resolve) => {
      let printWindow = new BrowserWindow({ 
        show: false,
        webPreferences: { nodeIntegration: false }
      });

      printWindow.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(receiptHTML));

      printWindow.webContents.on('did-finish-load', async () => {
        // Inject a strict CSS override to reset margins and paddings before height calculation
        try {
          await printWindow.webContents.insertCSS(`
            html, body {
              margin: 0 !important;
              padding: 0 !important;
              height: auto !important;
              min-height: 0 !important;
              background: white !important;
            }
            #printable-receipt {
              margin: 0 !important;
              padding-top: 0 !important;
            }
            #printable-receipt, #printable-receipt * {
              color: #000000 !important;
              font-weight: 700 !important;
              font-family: 'Courier New', Courier, monospace !important;
              text-rendering: crispEdges !important;
              -webkit-font-smoothing: none !important;
              letter-spacing: 0.5px !important;
            }
            @page {
              margin: 0 !important;
            }
          `);
        } catch (cssErr) {
        }

        let heightInPixels = 500;
        try {
          heightInPixels = await printWindow.webContents.executeJavaScript(`
            (() => {
              const el = document.getElementById('printable-receipt');
              return el ? el.offsetHeight : document.body.scrollHeight;
            })()
          `);
        } catch (err) {
        }

        // Convert pixels to microns (1px ≈ 264.58 microns) + 50px buffer
        const heightInMicrons = Math.ceil((heightInPixels + 50) * 264.58);
        
        let printWidthMicrons = 72000; // 72mm printable width for 80mm roll
        if (receiptHTML.includes('58mm')) {
          printWidthMicrons = 48000; // 48mm printable width for 58mm roll
        }

        printWindow.webContents.print({
          silent: true,
          deviceName: printerName,
          printBackground: false,
          margins: { marginType: 'none' },
          pageSize: { width: printWidthMicrons, height: heightInMicrons }
        }, (success, errorType) => {
          if (!success) {
          }
          resolve({ success, errorType });
          printWindow.close();
          printWindow = null;
        });
      });
    });
  });

  ipcMain.removeHandler('print-label');
  ipcMain.handle('print-label', async (_, { printerName, qty, labelHTML, width, height }) => {
    if (!printerName || printerName === 'none') {
      return { success: false, error: 'Label printer is not configured' };
    }
    try {
      const printers = await mainWindow.webContents.getPrintersAsync();
      const printerExists = printers.some(p => p.name === printerName);
      if (!printerExists) {
        return { success: false, error: `Printer "${printerName}" not found on this system` };
      }
    } catch (err) {
      console.error('Error verifying printer existence:', err);
    }
    return new Promise((resolve) => {
      let printWindow = new BrowserWindow({ 
        show: false,
        webPreferences: { nodeIntegration: false }
      });

      printWindow.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(labelHTML));

      printWindow.webContents.on('did-finish-load', () => {
        const labelW = width ? parseInt(width) * 1000 : 60000;
        const labelH = height ? parseInt(height) * 1000 : 30000;

        printWindow.webContents.print({
          silent: true,
          deviceName: printerName || undefined,
          printBackground: true,
          copies: parseInt(qty) || 1,
          margins: { marginType: 'none' },
          pageSize: { width: labelW, height: labelH }
        }, (success, errorType) => {
          if (!success) {
          }
          resolve({ success, errorType });
          printWindow.close();
          printWindow = null;
        });
      });
    });
  });

  // ── Database Settings & Cashiers ────────────────────────────────────────────────────────
  ipcMain.handle('verify-pin', (_, pin) => verifyPin(pin));
  ipcMain.handle('maybe-open-shift', (_, cashierName) => maybeOpenShift(cashierName));
  ipcMain.handle('get-settings', () => getSettings());
  ipcMain.handle('update-setting', (_, { key, value }) => updateSetting(key, value));
  ipcMain.handle('check-base-loaded', () => checkBaseLoaded());
  ipcMain.handle('load-initial-base', (_, type) => loadInitialBase(type));
  
  ipcMain.handle('get-cashiers', () => getCashiers());
  ipcMain.handle('add-cashier', (_, { name, pin }) => addCashier(name, pin));
  ipcMain.handle('delete-cashier', (_, id) => deleteCashier(id));
  ipcMain.handle('update-cashier-pin', (_, { id, newPin }) => updateCashierPin(id, newPin));

  // ── Application Activation ──────────────────────────────────────────────────
  ipcMain.handle('get-machine-id', () => getMachineId());
  ipcMain.handle('get-activation', () => getActivation());
  ipcMain.handle('save-activation', (_, fingerprint) => saveActivation(fingerprint));
  ipcMain.handle('clear-activation', () => clearActivation());

  // ── Backup & Restore ───────────────────────────────────────────────────────
  ipcMain.handle('export-db', async (_, suggestedName) => {
    try {
      const dbPath = path.join(app.getPath('userData'), 'pos.db');
      const { filePath } = await dialog.showSaveDialog({
        title: 'Экспорт базы данных',
        defaultPath: (typeof suggestedName === 'string' && suggestedName) ? suggestedName : 'pos_backup.db',
        filters: [{ name: 'SQLite Database', extensions: ['db'] }]
      });
      
      if (!filePath) return { success: false, cancelled: true };
      
      // 1. Close DB to flush WAL logs to main file and release lock
      closeDB();
      
      // 2. Safe file copy
      fs.copyFileSync(dbPath, filePath);
      
      // 3. Re-initialize connection
      initDB();
      
      return { success: true, filePath };
    } catch (err) {
      // Ensure we re-init DB connection if it failed/succeeded
      initDB();
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('import-db', async () => {
    try {
      const { filePaths } = await dialog.showOpenDialog({
        title: 'Импорт базы данных',
        properties: ['openFile'],
        filters: [{ name: 'SQLite Database', extensions: ['db'] }]
      });
      
      if (!filePaths || filePaths.length === 0) return { success: false, cancelled: true };
      
      const sourcePath = filePaths[0];
      const dbPath = path.join(app.getPath('userData'), 'pos.db');

      // 1. Close DB to release locks
      closeDB();

      // 2. Overwrite file
      fs.copyFileSync(sourcePath, dbPath);

      // 3. Re-init DB
      initDB();

      // 4. Reload the renderer
      if (mainWindow) {
        mainWindow.webContents.reload();
      }

      return { success: true };
    } catch (err) {
      // Try to re-init if it failed before exiting
      initDB();
      return { success: false, error: err.message };
    }
  });

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
}); // End of app.whenReady
} // End of else (!gotTheLock)

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
