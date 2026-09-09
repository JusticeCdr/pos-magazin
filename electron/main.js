const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { exec, execSync } = require('child_process');
const { autoUpdater } = require('electron-updater');

autoUpdater.autoDownload = false;
autoUpdater.autoInstallOnAppQuit = false;

function sendUpdateStatus(channel, payload) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, payload);
  }
}

autoUpdater.on('checking-for-update', () => sendUpdateStatus('checking-for-update'));
autoUpdater.on('update-available', (info) => sendUpdateStatus('update-available', info));
autoUpdater.on('update-not-available', (info) => sendUpdateStatus('update-not-available', info));
autoUpdater.on('download-progress', (progressObj) => sendUpdateStatus('download-progress', Math.round(progressObj.percent || 0)));
autoUpdater.on('update-downloaded', (info) => sendUpdateStatus('update-downloaded', info));
autoUpdater.on('error', (err) => sendUpdateStatus('update-error', err ? err.message : 'Yangilanishlarni tekshirishda xatolik'));

async function getOrCreateSSLKeys() {
  const userDataDir = app.getPath('userData');
  const keyPath = path.join(userDataDir, 'ssl.key');
  const certPath = path.join(userDataDir, 'ssl.crt');

  if (fs.existsSync(keyPath) && fs.existsSync(certPath)) {
    return {
      key: fs.readFileSync(keyPath),
      cert: fs.readFileSync(certPath)
    };
  }

  console.log('Generating self-signed SSL certificate...');
  logError('Generating self-signed SSL certificate...');
  try {
    const selfsigned = require('selfsigned');
    const attrs = [{ name: 'commonName', value: 'xxmpos.local' }];
    const pems = await selfsigned.generate(attrs, { days: 3650 }); // 10 years validity

    fs.writeFileSync(keyPath, pems.private);
    fs.writeFileSync(certPath, pems.cert);

    logError('Self-signed SSL certificate generated successfully');
    return {
      key: pems.private,
      cert: pems.cert
    };
  } catch (err) {
    console.error('Failed to generate dynamic SSL:', err);
    logError(`Failed to generate dynamic SSL: ${err.stack || err}`);
    return { key: '', cert: '' };
  }
}

// ── Network Client-Server Settings ──────────────────────────────────────────
const networkSettingsPath = path.join(app.getPath('userData'), 'network-settings.json');

function getNetworkSettingsSync() {
  try {
    if (fs.existsSync(networkSettingsPath)) {
      const data = fs.readFileSync(networkSettingsPath, 'utf8');
      return JSON.parse(data);
    }
  } catch (err) {
    console.error('getNetworkSettingsSync error:', err);
  }
  return { role: 'server', ip: '' }; // Default
}

function saveNetworkSettingsSync(settings) {
  try {
    fs.writeFileSync(networkSettingsPath, JSON.stringify(settings, null, 2), 'utf8');
    return { success: true };
  } catch (err) {
    console.error('saveNetworkSettingsSync error:', err);
    return { success: false, error: err.message };
  }
}

const os = require('os');
function getLocalIPs() {
  const interfaces = os.networkInterfaces();
  const candidates = [];
  for (const name in interfaces) {
    const isVirtual = /virtual|vbox|virtualbox|vmware|wsl|docker|vethernet|loopback/i.test(name);
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        const ip = iface.address;
        let score = 50; // base score

        // Prioritize common home/office subnets
        if (ip.startsWith('192.168.')) {
          score += 30;
          // De-prioritize common host-only/virtual subnets
          if (ip.includes('.56.') || ip.includes('.99.')) {
            score -= 40;
          }
        } else if (ip.startsWith('10.')) {
          score += 20;
        } else if (ip.startsWith('172.')) {
          const parts = ip.split('.');
          const secondOctet = parseInt(parts[1], 10);
          if (secondOctet >= 16 && secondOctet <= 31) {
            // private class B, common for Docker/WSL, de-prioritize slightly
            score -= 10;
          } else {
            score += 10;
          }
        }

        // De-prioritize virtual interfaces by name
        if (isVirtual) {
          score -= 50;
        }

        // Prioritize typical physical connection names
        if (/wi-fi|wifi|wlan|ethernet|eth|local/i.test(name)) {
          score += 15;
        }

        candidates.push({ ip, score });
      }
    }
  }

  // Sort candidates by score descending
  candidates.sort((a, b) => b.score - a.score);

  // Return the best one (or empty array if none)
  return candidates.length > 0 ? [candidates[0].ip] : [];
}


// Map of all original handlers to execute locally in server mode
const ipcHandlers = {};
const localChannels = [
  'get-printers',
  'print-receipt',
  'print-label',
  'get-network-settings',
  'save-network-settings',
  'get-machine-id',
  'get-activation',
  'save-activation',
  'clear-activation',
  'get-local-ips'
];

// Hijack ipcMain.handle to inject client-server forwarding
const originalHandle = ipcMain.handle.bind(ipcMain);
ipcMain.handle = (channel, fn) => {
  ipcHandlers[channel] = fn;
  originalHandle(channel, async (event, ...args) => {
    const netSettings = getNetworkSettingsSync();
    if (netSettings.role === 'client' && !localChannels.includes(channel)) {
      try {
        const serverUrl = `http://${netSettings.ip}:4000/api/ipc-forward`;
        const response = await fetch(serverUrl, {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'X-POS-Client-Token': 'xxmpos-secure-token-123'
          },
          body: JSON.stringify({ channel, args })
        });
        const res = await response.json();
        if (res.success) {
          return res.data;
        } else {
          return { success: false, error: res.error };
        }
      } catch (err) {
        return { success: false, error: `Asosiy serverga ulanishda xatolik: ${err.message}` };
      }
    }
    return fn(event, ...args);
  });
};

ipcMain.handle('save-network-settings', (_, data) => saveNetworkSettingsSync(data));
ipcMain.handle('get-network-settings', () => getNetworkSettingsSync());
ipcMain.handle('get-local-ips', () => getLocalIPs());

// ── Ngrok State ───────────────────────────────────────────────────────────────
let ngrokProcess    = null;   // reference to the running child process
let isNgrokStarting = false;  // guard against parallel launches
let currentNgrokUrl = '';     // last known public URL
const EXPRESS_PORT  = 4000;   // port our Express server listens on
let io = null;                // Socket.io instance

// ─────────────────────────────────────────────────────────────────────────────
// startNgrokAutomation — launches ngrok tunnel via CLI (no npm package).
//
// ERR_NGROK_8012 fix: after taskkill we wait 5 seconds so ngrok's cloud has
// time to close the old session. Starting too quickly causes the cloud to see
// two simultaneous sessions → ERR_NGROK_8012.
//
// IPC events sent to renderer:
//   'ngrok-url-success' → tunnel confirmed live (URL from stdout or domain)
//   'ngrok-url-error'   → something went wrong
//   'ngrok-url-updated' → alias for success (backward compat)
// ─────────────────────────────────────────────────────────────────────────────
async function startNgrokAutomation(saved_token, saved_domain) {
  if (isNgrokStarting) {
    logError('[Ngrok] Already starting — skipped duplicate call');
    return;
  }

  // If a process is already running on the correct domain, reuse it
  if (ngrokProcess && !ngrokProcess.killed && currentNgrokUrl) {
    logError('[Ngrok] Tunnel already running, reusing: ' + currentNgrokUrl);
    try {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('ngrok-url-success', currentNgrokUrl);
        mainWindow.webContents.send('ngrok-url-updated', currentNgrokUrl);
      }
    } catch (_) {}
    return;
  }

  isNgrokStarting = true;

  const cleanDomain = saved_domain.replace(/^https?:\/\//, '').trim();
  currentNgrokUrl  = `https://${cleanDomain}`;

  const sendToRenderer = (channel, payload) => {
    try {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send(channel, payload);
      }
    } catch (_) {}
  };

  // Step 1: Kill any running ngrok process
  if (ngrokProcess) {
    try { ngrokProcess.kill(); } catch (_) {}
    ngrokProcess = null;
  }
  exec('taskkill /f /im ngrok.exe', () => {
    // ── CRITICAL FIX ────────────────────────────────────────────────────────
    // Wait 5 seconds after killing so ngrok's cloud server closes the old
    // session and frees the "single simultaneous session" slot.
    // Without this delay: ERR_NGROK_8012 (Too many sessions).
    // ────────────────────────────────────────────────────────────────────────
    logError('[Ngrok] Waiting 5s for cloud to release old session...');
    setTimeout(() => {

      // Step 2: Register authtoken via CLI (idempotent — safe to repeat)
      exec(`ngrok config add-authtoken ${saved_token}`, (tokenErr) => {
        if (tokenErr) {
          logError('[Ngrok] Token registration failed: ' + tokenErr.message);
          isNgrokStarting = false;
          sendToRenderer('ngrok-url-error', 'Token xato: ' + tokenErr.message);
          return;
        }

        logError(`[Ngrok] Starting tunnel → https://${cleanDomain}`);

        // Step 3: Launch tunnel with log=json so we can parse the URL
        ngrokProcess = exec(
          `ngrok http 4000 --url=${cleanDomain} --log=stdout --log-format=json`,
          { windowsHide: true }
        );

        let urlConfirmed = false;

        // Parse JSON log lines from ngrok to detect "online" event
        if (ngrokProcess.stdout) {
          ngrokProcess.stdout.on('data', (chunk) => {
            const lines = chunk.toString().split('\n');
            for (const line of lines) {
              if (!line.trim()) continue;
              try {
                const obj = JSON.parse(line);
                // ngrok emits lvl=info msg="started tunnel" url=https://...
                if (obj.url && obj.url.startsWith('http') && !urlConfirmed) {
                  urlConfirmed   = true;
                  currentNgrokUrl = obj.url;
                  isNgrokStarting = false;
                  logError('[Ngrok] Confirmed from stdout: ' + currentNgrokUrl);
                  sendToRenderer('ngrok-url-success', currentNgrokUrl);
                  sendToRenderer('ngrok-url-updated', currentNgrokUrl);
                }
                // Detect ERR lines in JSON log
                if ((obj.err || obj.msg || '').includes('ERR_NGROK') && !urlConfirmed) {
                  urlConfirmed   = true;
                  isNgrokStarting = false;
                  const msg = obj.err || obj.msg || 'Ngrok xatosi';
                  logError('[Ngrok] Error from stdout: ' + msg);
                  sendToRenderer('ngrok-url-error', msg);
                }
              } catch (_) {
                // Non-JSON line — try plain text match as fallback
                const m = line.match(/url=(https?:\/\/[^\s]+)/);
                if (m && !urlConfirmed) {
                  urlConfirmed   = true;
                  currentNgrokUrl = m[1];
                  isNgrokStarting = false;
                  logError('[Ngrok] Confirmed from text: ' + currentNgrokUrl);
                  sendToRenderer('ngrok-url-success', currentNgrokUrl);
                  sendToRenderer('ngrok-url-updated', currentNgrokUrl);
                }
              }
            }
          });
        }

        // Fallback: if ngrok gave no URL in 10 s, assume success with domain
        const fallbackTimer = setTimeout(() => {
          if (!urlConfirmed) {
            urlConfirmed   = true;
            isNgrokStarting = false;
            logError('[Ngrok] 10s fallback — using constructed URL: ' + currentNgrokUrl);
            sendToRenderer('ngrok-url-success', currentNgrokUrl);
            sendToRenderer('ngrok-url-updated', currentNgrokUrl);
          }
        }, 10000);

        ngrokProcess.on('close', (code) => {
          clearTimeout(fallbackTimer);
          logError(`[Ngrok] Process exited with code: ${code}`);
          if (!urlConfirmed) {
            isNgrokStarting = false;
            const msg = code === 1
              ? 'Ngrok xatosi: token yoki domain noto\'g\'ri bo\'lishi mumkin'
              : `Ngrok yopildi (kod: ${code})`;
            sendToRenderer('ngrok-url-error', msg);
          }
          isNgrokStarting = false;
          ngrokProcess    = null;
        });
      });

    }, 5000); // ← 5 second delay = ERR_NGROK_8012 fix
  });
}



const { 
  initDB, closeDB, getProducts, getCustomers, getCustomer, addProduct, deleteProduct, searchProduct,
  processSale, getRecentSales, processFullReturn, processReturn, payDebt, addManualDebt, getReports, getSaleForReprint,
  getLowStockProducts, clearTestData, resetFactoryData, getCustomerDebtDetails, getAllSalesHistory, getSalesForExcel,
  verifyPin, getSettings, updateSetting, syncUsdRate, checkBaseLoaded, loadInitialBase, clearWarehouse,
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
  clearActivation,
  getTodayStats,
  getProductsPaginated,
  getCustomersWithDebts,
  findLocalBarcodeByName,
  generateUniqueLocalBarcode,
  batchAddProducts,
  getAiInsights,
  getProduct,
  getNextBarcode,
  waiterLogin,
  getRestaurantTables,
  getActiveOrderForTable,
  saveRestaurantOrder,
  closeRestaurantOrder,
  closeRestaurantOrderOnly,
  getWaiters,
  addWaiter,
  deleteWaiter,
  transferRestaurantTable,
  transferRestaurantOrderWaiter,
  cancelRestaurantOrder,
  addDeliveryOrder,
  addRestaurantTable,
  deleteRestaurantTable,
  saveProductRecipe,
  getProductRecipe,
  lockTable,
  unlockTable,
  setTablePrePrinted,
  getWaitersReport,
  getRestaurantOnlyProducts,
  getProductGroups,
  projectYield,
  getOrCreateProductGroup,
  getAttendanceList,
  saveAttendance,
  updateCashier,
  updateWaiter,
  getRestaurantZones,
  addRestaurantZone,
  deleteRestaurantZone,
  toggleProductStop,
  setProductStopWithLimit,
  getKitchenOrders,
  setOrderStatus,
  setOrderStatusByTable,
  getTvOrders,
  deleteProductImageFile,
  getInventoryAuditPrepare,
  completeInventoryAudit,
  getInventoryAudits,
  getInventoryAuditDetails,
  getAttendanceSettings,
  getAttendanceReport,
  saveManualAttendance,
  deleteAttendanceRecord,
  getSuppliers,
  addSupplier,
  updateSupplier,
  deleteSupplier,
  addSupplierInvoice,
  getSupplierInvoices,
  paySupplierDebt,
  produceSemiFinished,
  getSubWarehouses,
  addSubWarehouse,
  createStockTransfer,
  getStockTransfers,
  getDirectorDashboardStats
} = require('./database');

const { generateA4InvoiceHTML, generateExcelInvoice } = require('./excelA4Helper');
const { sendTelegramBackup, getTelegramChatIdFromUpdates, sendAttendanceTestMessage } = require('./telegramBackup');

// ── Logging System ───────────────────────────────────────────────────────────
function logError(message) {
  try {
    const dir = app.getPath('userData');
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.appendFileSync(path.join(dir, 'error_log.txt'), `[${new Date().toISOString()}] ${message}\n`);
  } catch (e) {}
}

let IMAGES_DIR = '';
function ensureImagesDir() {
  if (!IMAGES_DIR) {
    try {
      IMAGES_DIR = path.join(app.getPath('userData'), 'product_images');
    } catch (_) {
      IMAGES_DIR = path.join(__dirname, '..', 'product_images');
    }
  }
  if (!fs.existsSync(IMAGES_DIR)) {
    try { fs.mkdirSync(IMAGES_DIR, { recursive: true }); } catch (_) {}
  }
  return IMAGES_DIR;
}

process.on('uncaughtException', (error) => {
  logError(`Uncaught Exception: ${error.stack || error}`);
  app.quit();
});

process.on('unhandledRejection', (reason, promise) => {
  logError(`Unhandled Rejection: ${reason}`);
});

// ── Auto-Backup Helper ───────────────────────────────────────────────────────
// Runs AFTER shift close: copies pos.db → backup folder, keeps last 3 files.
const MAX_BACKUPS = 3;

function getMachineId() {
  return new Promise((resolve) => {
    try {
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
    } catch (err) {
      resolve('UNKNOWN_MACHINE_ID');
    }
  });
}

async function autoBackupDB() {
  try {
    const dbSrc = getDBPath();
    // Primary directory on C: drive (C:\xxMpos_Backups)
    let backupDir = 'C:\\xxMpos_Backups';
    try {
      if (!fs.existsSync(backupDir)) {
        fs.mkdirSync(backupDir, { recursive: true });
      }
    } catch (_) {
      // Fallback to AppData on C: drive if direct C:\ root creation is blocked by Windows permissions
      backupDir = path.join(app.getPath('userData'), 'pos_backups');
      if (!fs.existsSync(backupDir)) {
        fs.mkdirSync(backupDir, { recursive: true });
      }
    }

    // Migrate existing backups from Desktop to C: drive so no old backups are ever lost
    const desktopBackupDir = path.join(app.getPath('desktop'), 'pos_backups');
    if (fs.existsSync(desktopBackupDir) && desktopBackupDir !== backupDir) {
      try {
        const desktopFiles = await fs.promises.readdir(desktopBackupDir);
        for (const file of desktopFiles) {
          if (file.startsWith('pos_backup_') && file.endsWith('.db')) {
            const src = path.join(desktopBackupDir, file);
            const dest = path.join(backupDir, file);
            if (!fs.existsSync(dest)) {
              await fs.promises.copyFile(src, dest);
            }
          }
        }
      } catch (_) {}
    }

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

// Kitchen slip printing helper
async function printKitchenRunner(tableName, waiterName, items) {
  try {
    const settingsRes = getSettings();
    if (!settingsRes || !settingsRes.success || !settingsRes.data) {
      return { success: false, error: 'Settings not loaded' };
    }
    const settings = settingsRes.data;

    const printerMap = {
      // Legacy destinations mapping
      kitchen: settings.oshxona_1_printer_name || settings.kitchen_printer_name || settings.receipt_printer_name,
      bar: settings.bar_1_printer_name || settings.bar_printer_name || settings.receipt_printer_name,
      cold: settings.xolodniy_1_printer_name || settings.cold_printer_name || settings.receipt_printer_name,
      
      // New explicit destinations
      'oshxona-1': settings.oshxona_1_printer_name || settings.kitchen_printer_name || settings.receipt_printer_name,
      'oshxona-2': settings.oshxona_2_printer_name || settings.receipt_printer_name,
      'oshxona-3': settings.oshxona_3_printer_name || settings.receipt_printer_name,
      
      'bar-1': settings.bar_1_printer_name || settings.bar_printer_name || settings.receipt_printer_name,
      'bar-2': settings.bar_2_printer_name || settings.receipt_printer_name,
      'bar-3': settings.bar_3_printer_name || settings.receipt_printer_name,
      
      'xolodniy-1': settings.xolodniy_1_printer_name || settings.cold_printer_name || settings.receipt_printer_name,
      'xolodniy-2': settings.xolodniy_2_printer_name || settings.receipt_printer_name,
      'xolodniy-3': settings.xolodniy_3_printer_name || settings.receipt_printer_name
    };

    const titleMap = {
      kitchen: "OSHXONA CHEKI",
      bar: "BAR CHEKI",
      cold: "XOLODNIY CHEKI",
      'oshxona-1': "OSHXONA-1 CHEKI",
      'oshxona-2': "OSHXONA-2 CHEKI",
      'oshxona-3': "OSHXONA-3 CHEKI",
      'bar-1': "BAR-1 CHEKI",
      'bar-2': "BAR-2 CHEKI",
      'bar-3': "BAR-3 CHEKI",
      'xolodniy-1': "XOLODNIY-1 CHEKI",
      'xolodniy-2': "XOLODNIY-2 CHEKI",
      'xolodniy-3': "XOLODNIY-3 CHEKI"
    };

    // Group items by printer destination
    const groups = {};
    for (const it of items) {
      const prod = getProduct(it.id);
      const dest = (prod && prod.printer_destination) ? prod.printer_destination : 'none';
      if (!groups[dest]) {
        groups[dest] = [];
      }
      groups[dest].push(it);
    }

    const destKeys = Object.keys(groups).filter(k => k !== 'none');
    if (destKeys.length === 0) {
      return { success: true, message: 'No items with printing destinations' };
    }

    const printPromises = destKeys.map(dest => {
      const destItems = groups[dest];
      const printerName = printerMap[dest];
      const title = titleMap[dest] || "BUYURTMA CHEKI";
      
      if (!printerName || printerName === 'none') {
        console.log(`No printer configured for ${dest}, skipping`);
        return Promise.resolve({ success: true, skipped: true });
      }

      return printSingleDepartmentRunner(tableName, waiterName, destItems, printerName, title);
    });

    const printResults = await Promise.all(printPromises);
    return { success: true, printResults };
  } catch (err) {
    console.error('Error grouping and printing kitchen runners:', err);
    return { success: false, error: err.message };
  }
}

async function printSingleDepartmentRunner(tableName, waiterName, items, printerName, title) {
  try {
    const { BrowserWindow } = require('electron');
    // Verification of printer existence
    const printers = await mainWindow.webContents.getPrintersAsync();
    const printerExists = printers.some(p => p.name === printerName);
    if (!printerExists) {
      console.error(`Printer "${printerName}" not found`);
      return { success: true, skipped: true, error: 'Printer not found' };
    }

    const timeStr = new Date().toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const dateStr = new Date().toLocaleDateString('uz-UZ');

    let itemsHtml = '';
    for (const it of items) {
      const priceStr = it.price ? Math.round(it.price).toLocaleString('ru-RU') : '0';
      itemsHtml += `
        <tr style="border-bottom: 1px dashed #000; font-size: 15px;">
          <td style="padding: 8px 0; font-weight: bold;">${it.name}</td>
          <td style="padding: 8px 0; text-align: center; font-size: 18px; font-weight: bold;">x${it.qty}</td>
          <td style="padding: 8px 0; text-align: right; font-size: 15px;">${priceStr}</td>
        </tr>
      `;
    }

    const runnerHTML = `
      <html>
        <body style="font-family: 'Courier New', Courier, monospace; margin: 0; padding: 5px; width: 100%; max-width: 80mm; color: #000; box-sizing: border-box; overflow: hidden;">
          <div id="printable-receipt" style="text-align: center; width: 100%; padding: 0 5px;">
            <h2 style="margin: 0; font-size: 24px; font-weight: 900; border-bottom: 2px double #000; padding-bottom: 5px;">${title}</h2>
            <div style="text-align: left; margin: 12px 0; font-size: 15px; line-height: 1.4;">
              <div><b>STOL:</b> <span style="font-size: 20px; font-weight: 900;">${tableName}</span></div>
              <div><b>OFITSIANT:</b> ${waiterName}</div>
              <div><b>VAQT:</b> ${dateStr} ${timeStr}</div>
            </div>
            <table style="width: 100%; border-collapse: collapse; margin-top: 10px;">
              <thead>
                <tr style="border-bottom: 2px solid #000; font-size: 13px;">
                  <th style="text-align: left; padding-bottom: 6px;">Nomi</th>
                  <th style="text-align: center; padding-bottom: 6px;">Soni</th>
                  <th style="text-align: right; padding-bottom: 6px;">Narxi</th>
                </tr>
              </thead>
              <tbody>
                ${itemsHtml}
              </tbody>
            </table>
            <div style="margin-top: 25px; border-top: 1px solid #000; padding-top: 8px; font-size: 13px;">
              * Yangi buyurtma *
            </div>
          </div>
        </body>
      </html>
    `;

    let printWindow = new BrowserWindow({
      show: false,
      webPreferences: { nodeIntegration: false }
    });

    printWindow.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(runnerHTML));

    return new Promise((resolve) => {
      printWindow.webContents.on('did-finish-load', async () => {
        try {
          await printWindow.webContents.insertCSS(`
            html, body {
              margin: 0 !important;
              padding: 0 !important;
              background: white !important;
            }
            #printable-receipt {
              margin: 0 !important;
              padding: 10px !important;
            }
            * {
              color: #000000 !important;
              font-weight: 700 !important;
            }
          `);
        } catch (cssErr) {}

        printWindow.webContents.print({
          silent: true,
          deviceName: printerName,
          printBackground: false,
          margins: { marginType: 'none' },
          pageSize: { width: 72000, height: 100000 }
        }, (success, errorType) => {
          printWindow.close();
          printWindow = null;
          resolve({ success, errorType });
        });
      });
    });
  } catch (err) {
    console.error('Error printing single runner:', err);
    return { success: false, error: err.message };
  }
}

async function printCancellationSlip(tableName, staffName) {
  try {
    const settingsRes = getSettings();
    let printerName = undefined;
    if (settingsRes && settingsRes.success && settingsRes.data) {
      printerName = settingsRes.data.receipt_printer_name;
    }

    if (!printerName || printerName === 'none') {
      console.log('No printer configured for cancel print');
      return { success: false, error: 'Printer not configured' };
    }

    const { BrowserWindow } = require('electron');
    const printers = await mainWindow.webContents.getPrintersAsync();
    const printerExists = printers.some(p => p.name === printerName);
    if (!printerExists) {
      console.error(`Printer "${printerName}" not found for cancellation slip`);
      return { success: false, error: 'Printer not found' };
    }

    const timeStr = new Date().toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit' });
    const dateStr = new Date().toLocaleDateString('uz-UZ');

    const cancelHTML = `
      <html>
        <body style="font-family: 'Courier New', Courier, monospace; margin: 0; padding: 5px; width: 100%; max-width: 80mm; color: #000; box-sizing: border-box; overflow: hidden;">
          <div id="printable-receipt" style="text-align: center; border: 4px solid #000; padding: 10px; width: 100%; box-sizing: border-box;">
            <h2 style="margin: 0; font-size: 26px; font-weight: 900; background-color: #000; color: #fff; padding: 8px;">BEKOR QILINDI</h2>
            <h3 style="margin: 5px 0 0 0; font-size: 22px; font-weight: 900;">CANCELLED</h3>
            <div style="text-align: left; margin: 15px 0; font-size: 16px; line-height: 1.5; border-top: 1px dashed #000; padding-top: 10px;">
              <div><b>STOL:</b> <span style="font-size: 22px; font-weight: 900;">${tableName}</span></div>
              <div><b>XODIM:</b> ${staffName}</div>
              <div><b>VAQT:</b> ${dateStr} ${timeStr}</div>
            </div>
            <div style="font-size: 15px; font-weight: bold; border-top: 1px dashed #000; padding-top: 10px;">
              BUYURTMA TO'LIQ BEKOR QILINDI. TAYYORLANMASIN!
            </div>
          </div>
        </body>
      </html>
    `;

    let printWindow = new BrowserWindow({
      show: false,
      webPreferences: { nodeIntegration: false }
    });

    printWindow.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(cancelHTML));

    return new Promise((resolve) => {
      printWindow.webContents.on('did-finish-load', async () => {
        try {
          await printWindow.webContents.insertCSS(`
            html, body { margin: 0 !important; padding: 0 !important; background: white !important; }
            * { color: #000000 !important; font-weight: 700 !important; }
          `);
        } catch (_) {}

        printWindow.webContents.print({
          silent: true,
          deviceName: printerName,
          printBackground: false,
          margins: { marginType: 'none' },
          pageSize: { width: 72000, height: 100000 }
        }, (success, errorType) => {
          printWindow.close();
          printWindow = null;
          resolve({ success, errorType });
        });
      });
    });
  } catch (err) {
    console.error('Error printing cancellation slip:', err);
    return { success: false, error: err.message };
  }
}

// ── Express.js server & Socket.io ─────────────────────────────────────────────
async function startExpressServer() {
  try {
    const express = require('express');
    const expressApp = express();
    
    expressApp.use(express.json({ limit: '50mb' }));
    expressApp.use(express.urlencoded({ limit: '50mb', extended: true }));
    
    // Helper to validate allowed origins for CORS & WebSockets
    const isAllowedOrigin = (origin) => {
      if (!origin || origin === 'null') return true;
      try {
        const parsed = new URL(origin);
        const hostname = parsed.hostname;
        if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1') return true;
        // Private LAN IP ranges (192.168.x.x, 10.x.x.x, 172.16-31.x.x)
        if (
          /^192\.168\.\d{1,3}\.\d{1,3}$/.test(hostname) ||
          /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname) ||
          /^172\.(1[6-9]|2[0-9]|3[0-1])\.\d{1,3}\.\d{1,3}$/.test(hostname)
        ) return true;
        if (hostname.endsWith('.ngrok-free.app') || hostname.endsWith('.ngrok.io')) return true;
      } catch (_) {}
      return false;
    };

    // CORS middleware with strict origin verification
    const cors = require('cors');
    expressApp.use(cors({
      origin: (origin, callback) => {
        if (isAllowedOrigin(origin)) {
          callback(null, true);
        } else {
          callback(new Error('Xavfsizlik: Begona manbadan so\'rov taqiqlangan! (CORS origin blocked)'), false);
        }
      },
      credentials: true
    }));
    
    // Helper to check if request is coming through a public tunnel (like ngrok)
    const isPublicTunnelRequest = (req) => {
      const host = req.headers['host'] || '';
      return host.includes('ngrok');
    };

    // For ngrok/external access to /mobile, allow the page to load (owner can see cashier login)
    // Waiter API endpoints are still individually blocked by waiterAuthMiddleware
    // Serve html5-qrcode locally so mobile scanner works offline
    expressApp.get('/js/html5-qrcode.min.js', (req, res) => {
      try {
        res.sendFile(require.resolve('html5-qrcode/html5-qrcode.min.js'));
      } catch (err) {
        res.status(500).send(err.message);
      }
    });

    expressApp.use('/mobile', (req, res, next) => {
      // Only block if trying to access waiter API directly (not page load)
      // The page itself handles the redirect to cashier login via JS hostname detection
      next();
    });


    // Static assets distribution for both desktop and mobile
    const productImagesDir = ensureImagesDir();
    expressApp.use('/product-images', express.static(productImagesDir));
    const attendancePhotosDir = path.join(app.getPath('userData'), 'attendance_photos');
    if (!fs.existsSync(attendancePhotosDir)) fs.mkdirSync(attendancePhotosDir, { recursive: true });
    expressApp.use('/attendance-photos', express.static(attendancePhotosDir));
    expressApp.use('/mobile', express.static(path.join(__dirname, '../dist-mobile')));
    expressApp.use(express.static(path.join(__dirname, '../dist')));

    // ── Product Image Upload & Delete Endpoints (Multer) ────────────────────────
    const multer = require('multer');
    const allowedImageExts = ['.jpg', '.jpeg', '.png', '.webp'];
    const storage = multer.diskStorage({
      destination: (req, file, cb) => {
        cb(null, productImagesDir);
      },
      filename: (req, file, cb) => {
        let ext = path.extname(file.originalname).toLowerCase();
        if (!allowedImageExts.includes(ext)) ext = '.jpg';
        cb(null, `prod_${Date.now()}_${Math.random().toString(36).substring(7)}${ext}`);
      }
    });
    const upload = multer({
      storage,
      limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
      fileFilter: (req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase();
        const mime = (file.mimetype || '').toLowerCase();
        if (!allowedImageExts.includes(ext) || !mime.startsWith('image/')) {
          return cb(new Error('Xavfsizlik: Faqat rasm fayllari (.jpg, .jpeg, .png, .webp) ruxsat etilgan!'));
        }
        cb(null, true);
      }
    });

    expressApp.post('/api/products/upload-image', (req, res) => {
      upload.single('image')(req, res, (err) => {
        if (err) {
          return res.status(400).json({ success: false, error: err.message });
        }
        if (!req.file) {
          return res.status(400).json({ success: false, error: 'Fayl yuklanmadi' });
        }
        return res.json({ success: true, fileName: req.file.filename });
      });
    });

    expressApp.post('/api/products/delete-image', (req, res) => {
      try {
        const { fileName } = req.body;
        if (fileName && typeof fileName === 'string') {
          const ext = path.extname(fileName).toLowerCase();
          if (allowedImageExts.includes(ext)) {
            deleteProductImageFile(path.basename(fileName));
          }
        }
        return res.json({ success: true });
      } catch (err) {
        return res.status(500).json({ success: false, error: err.message });
      }
    });

    // SPA routes for Kitchen Display System (KDS) and TV Queue Display
    expressApp.get(['/kitchen', '/tv'], (req, res) => {
      res.sendFile(path.join(__dirname, '../dist/index.html'));
    });

    // ── Kitchen Display & TV API Endpoints ────────────────────────────────────
    expressApp.get('/api/kitchen/orders', (req, res) => {
      const result = getKitchenOrders();
      res.json(result);
    });

    expressApp.post('/api/orders/:id/set-status', (req, res) => {
      const { status } = req.body;
      const orderId = parseInt(req.params.id, 10);
      const result = setOrderStatus(orderId, status);
      if (result && result.success) {
        if (io) {
          io.emit('kitchen-updated', { orderId, status });
          io.emit('sales-updated');
        }
        if (mainWindow && mainWindow.webContents) {
          mainWindow.webContents.send('kitchen-updated', { orderId, status });
          mainWindow.webContents.send('sales-updated');
        }
      }
      res.json(result);
    });

    expressApp.post('/api/orders/table/:tableId/set-status', (req, res) => {
      const { status } = req.body;
      const tableId = parseInt(req.params.tableId, 10);
      const result = setOrderStatusByTable(tableId, status);
      if (result && result.success) {
        if (io) {
          io.emit('kitchen-updated', { tableId, status });
          io.emit('sales-updated');
        }
        if (mainWindow && mainWindow.webContents) {
          mainWindow.webContents.send('kitchen-updated', { tableId, status });
          mainWindow.webContents.send('sales-updated');
        }
      }
      res.json(result);
    });

    expressApp.get('/api/tv/orders', (req, res) => {
      const result = getTvOrders();
      res.json(result);
    });
    
    // ── Brute Force & Rate Limiting Shield ──────────────────────────────────────
    const authRateLimiter = {
      attempts: new Map(), // ip -> { count: number, lockedUntil: number, lastAttempt: number }

      getClientIp(req) {
        return req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress || req.ip || '127.0.0.1';
      },

      check(req) {
        const ip = this.getClientIp(req);
        const record = this.attempts.get(ip);
        if (!record) return { allowed: true };

        const now = Date.now();
        if (record.lockedUntil > now) {
          const waitSec = Math.ceil((record.lockedUntil - now) / 1000);
          return {
            allowed: false,
            waitSec,
            error: `Xavfsizlik blokirovkasi: Ko'p marotaba noto'g'ri PIN kiritildi. Iltimos, ${waitSec} soniyadan keyin qayta urining.`
          };
        }
        return { allowed: true };
      },

      onSuccess(req) {
        const ip = this.getClientIp(req);
        this.attempts.delete(ip);
      },

      onFailure(req) {
        const ip = this.getClientIp(req);
        const now = Date.now();
        const record = this.attempts.get(ip) || { count: 0, lockedUntil: 0 };

        // If previous lockout expired, reset count after 60 seconds of silence
        if (record.lockedUntil > 0 && now > record.lockedUntil + 60000) {
          record.count = 0;
        }

        record.count += 1;
        record.lastAttempt = now;

        if (record.count >= 10) {
          record.lockedUntil = now + 10 * 60 * 1000; // 10 minutes lockout
        } else if (record.count >= 7) {
          record.lockedUntil = now + 2 * 60 * 1000;  // 2 minutes lockout
        } else if (record.count >= 5) {
          record.lockedUntil = now + 30 * 1000;      // 30 seconds lockout
        }

        this.attempts.set(ip, record);

        return {
          count: record.count,
          lockedUntil: record.lockedUntil,
          waitSec: record.lockedUntil > now ? Math.ceil((record.lockedUntil - now) / 1000) : 0,
          remaining: Math.max(0, 5 - record.count)
        };
      }
    };

    // Periodic cleanup of expired rate limiter entries
    setInterval(() => {
      const now = Date.now();
      for (const [ip, rec] of authRateLimiter.attempts.entries()) {
        if (rec.lockedUntil < now && (!rec.lastAttempt || now - rec.lastAttempt > 30 * 60 * 1000)) {
          authRateLimiter.attempts.delete(ip);
        }
      }
    }, 10 * 60 * 1000);

    // Auth Middleware for API endpoints
    const authMiddleware = (req, res, next) => {
      const pin = req.headers['authorization'];
      if (!pin) {
        return res.status(401).json({ success: false, error: 'Authorization required' });
      }

      const rateCheck = authRateLimiter.check(req);
      if (!rateCheck.allowed) {
        return res.status(429).json({ success: false, error: rateCheck.error, waitSec: rateCheck.waitSec });
      }
      
      const trimmedPin = pin.trim();
      
      const pinRes = verifyPin(trimmedPin);
      if (pinRes && pinRes.success && pinRes.valid) {
        authRateLimiter.onSuccess(req);
        req.cashier = pinRes.cashier;
        return next();
      }
      
      // Master PIN override (only if no cashier matches) - ALLOWED for mobile/Express
      if (trimmedPin === 'xxMpos7532.') {
        authRateLimiter.onSuccess(req);
        req.cashier = { id: 0, name: 'Asosiy Admin', pin: 'xxMpos7532.', role: 'admin' };
        return next();
      }
      
      const fail = authRateLimiter.onFailure(req);
      if (fail.waitSec > 0) {
        return res.status(429).json({
          success: false,
          error: `Xavfsizlik blokirovkasi: 5 marta xato PIN kiritildi! Iltimos, ${fail.waitSec} soniya kuting.`,
          waitSec: fail.waitSec
        });
      }
      return res.status(401).json({ success: false, error: 'Invalid PIN' });
    };
    
    // Waiter Auth Middleware
    const waiterAuthMiddleware = (req, res, next) => {
      if (isPublicTunnelRequest(req)) {
        return res.status(403).json({ success: false, error: 'Ofitsiantlar faqat kafedagi WiFi orqali ulanishi mumkin (tashqi tarmoq taqiqlangan)' });
      }
      const pin = req.headers['authorization'];
      if (!pin) {
        return res.status(401).json({ success: false, error: 'Waiter authorization required' });
      }

      const rateCheck = authRateLimiter.check(req);
      if (!rateCheck.allowed) {
        return res.status(429).json({ success: false, error: rateCheck.error, waitSec: rateCheck.waitSec });
      }

      const trimmedPin = pin.trim();
      const result = waiterLogin(trimmedPin);
      if (result && result.success) {
        authRateLimiter.onSuccess(req);
        req.waiter = result;
        return next();
      }

      const fail = authRateLimiter.onFailure(req);
      if (fail.waitSec > 0) {
        return res.status(429).json({
          success: false,
          error: `Xavfsizlik blokirovkasi: 5 marta xato PIN kiritildi! Iltimos, ${fail.waitSec} soniya kuting.`,
          waitSec: fail.waitSec
        });
      }
      return res.status(401).json({ success: false, error: 'Invalid Waiter PIN' });
    };

    // API: Public settings check
    expressApp.get('/api/settings', (req, res) => {
      const result = getSettings();
      if (result.success) {
        const publicSettings = {
          store_name: result.data.store_name || "Mening Do'konim",
          business_type: result.data.business_type || 'retail'
        };
        return res.json({ success: true, data: publicSettings });
      } else {
        return res.status(500).json({ success: false, error: result.error });
      }
    });

    // API: Backup to Telegram Group (Protected with authMiddleware)
    expressApp.post('/api/backup/send-telegram', authMiddleware, async (req, res) => {
      try {
        const result = await sendTelegramBackup();
        if (result.success) {
          return res.json({ success: true, message: "Baza guruhga yuborildi", details: result });
        } else {
          return res.status(400).json({ success: false, error: result.error });
        }
      } catch (err) {
        return res.status(500).json({ success: false, error: err.message });
      }
    });

    // API: Waiter Login (Rate Limited)
    expressApp.post('/api/auth/waiter-login', (req, res) => {
      if (isPublicTunnelRequest(req)) {
        return res.status(403).json({ success: false, error: 'Ofitsiantlar faqat kafedagi WiFi orqali ulanishi mumkin (tashqi tarmoq taqiqlangan)' });
      }

      const rateCheck = authRateLimiter.check(req);
      if (!rateCheck.allowed) {
        return res.status(429).json({ success: false, error: rateCheck.error, waitSec: rateCheck.waitSec });
      }

      const { pin_code } = req.body;
      if (!pin_code) {
        return res.status(400).json({ success: false, error: 'PIN code is required' });
      }
      const trimmedPin = String(pin_code).trim();
      const result = waiterLogin(trimmedPin);
      if (result && result.success) {
        authRateLimiter.onSuccess(req);
        return res.json({
          success: true,
          waiter_id: result.waiter_id,
          waiter_o_id: result.waiter_id,
          name: result.name,
          role: result.role
        });
      } else {
        const fail = authRateLimiter.onFailure(req);
        if (fail.waitSec > 0) {
          return res.status(429).json({
            success: false,
            error: `Xavfsizlik blokirovkasi: 5 marta xato PIN kiritildi! Iltimos, ${fail.waitSec} soniya kuting.`,
            waitSec: fail.waitSec
          });
        }
        return res.status(401).json({
          success: false,
          error: `Noto'g'ri PIN-kod! Qolgan urinishlar: ${fail.remaining}`
        });
      }
    });

    // API: Attendance list
    expressApp.get('/api/attendance', authMiddleware, (req, res) => {
      const { date } = req.query;
      if (!date) return res.status(400).json({ success: false, error: 'Date is required' });
      const result = getAttendanceList(date);
      return res.json(result);
    });

    // API: Save attendance
    expressApp.post('/api/attendance', authMiddleware, (req, res) => {
      const { employeeId, employeeType, date, status } = req.body;
      const result = saveAttendance(employeeId, employeeType, date, status);
      return res.json(result);
    });

    // API: Public employees list for attendance check page (no auth token required)
    expressApp.get('/api/attendance/employees', (req, res) => {
      try {
        const cashiers = getCashiers()?.data || [];
        const waiters = getWaiters()?.data || [];
        const staff = [
          ...cashiers.map(c => ({ id: c.id, name: c.name, role: c.role || 'Kassir', type: 'cashier' })),
          ...waiters.map(w => ({ id: w.id, name: w.name, role: 'Ofitsiant', type: 'waiter' }))
        ];
        const settings = getAttendanceSettings();
        return res.json({ success: true, data: staff, cafeName: settings.cafe_name || '' });
      } catch (err) {
        return res.status(500).json({ success: false, error: err.message });
      }
    });

    // API: Staff Attendance Check with Photo to Telegram (Dynamic Group Chat ID per Restaurant)
    const uploadAttendance = multer({
      storage: multer.memoryStorage(),
      limits: { fileSize: 15 * 1024 * 1024 }
    });

    expressApp.post('/api/attendance/check', uploadAttendance.fields([
      { name: 'photo', maxCount: 1 },
      { name: 'image', maxCount: 1 },
      { name: 'file', maxCount: 1 },
      { name: 'selfie', maxCount: 1 }
    ]), async (req, res) => {
      try {
        const body = req.body || {};
        const employeeId = Number(body.employee_id || body.employeeId || body.id || 0);
        const employeeType = (body.employee_type || body.employeeType || body.type || 'waiter').toLowerCase();
        const status = body.status || 'present';
        const date = body.date || new Date().toISOString().slice(0, 10);
        const time = body.time || new Date().toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit' });

        // Retrieve employee details
        let employee = null;
        if (employeeId > 0) {
          if (employeeType === 'cashier') {
            const cashiersRes = getCashiers();
            const found = cashiersRes?.data?.find(c => c.id === employeeId);
            if (found) employee = { name: found.name, role: found.role || 'Kassir' };
          } else {
            const waitersRes = getWaiters();
            const found = waitersRes?.data?.find(w => w.id === employeeId);
            if (found) employee = { name: found.name, role: found.role || 'Ofitsiant' };
          }
        }
        if (!employee) {
          employee = {
            name: body.employee_name || body.name || 'Xodim',
            role: body.role || (employeeType === 'cashier' ? 'Kassir' : 'Ofitsiant')
          };
        }

        // Process photo if uploaded or sent as base64
        let photoBuffer = null;
        let photoMime = 'image/jpeg';
        let photoFileName = `att_${Date.now()}.jpg`;

        const uploadedFile = req.file || (req.files && (req.files.photo?.[0] || req.files.image?.[0] || req.files.file?.[0] || req.files.selfie?.[0]));
        if (uploadedFile && uploadedFile.buffer) {
          photoBuffer = uploadedFile.buffer;
          photoMime = uploadedFile.mimetype || 'image/jpeg';
          photoFileName = uploadedFile.originalname || photoFileName;
        } else if (body.photo || body.image || body.selfie) {
          const photoStr = body.photo || body.image || body.selfie;
          if (typeof photoStr === 'string') {
            if (photoStr.startsWith('data:')) {
              const matches = photoStr.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
              if (matches && matches.length === 3) {
                photoMime = matches[1];
                photoBuffer = Buffer.from(matches[2], 'base64');
              }
            } else {
              photoBuffer = Buffer.from(photoStr, 'base64');
            }
          }
        }

        // Save photo to disk if present
        let savedPhotoPath = null;
        if (photoBuffer) {
          try {
            const attendanceDir = path.join(app.getPath('userData'), 'attendance_photos');
            if (!fs.existsSync(attendanceDir)) {
              fs.mkdirSync(attendanceDir, { recursive: true });
            }
            const savedName = `att_${Date.now()}_${Math.random().toString(36).substring(7)}.jpg`;
            fs.writeFileSync(path.join(attendanceDir, savedName), photoBuffer);
            savedPhotoPath = savedName;
          } catch (saveErr) {
            console.warn('[Attendance Photo Save Error]:', saveErr.message);
          }
        }

        // 1. Save attendance locally to SQLite database
        const dbStatus = status === 'absent' ? 'absent' : 'present';
        const saveRes = saveAttendance(employeeId, employeeType, date, dbStatus, savedPhotoPath, time, status);

        // 2. Fetch current settings from SQLite
        const settings = getAttendanceSettings();

        // Status text & header
        const isDeparture = status === 'ketdi' || status === 'left';
        const actionTitle = isDeparture ? '🔴 <b>XODIM ISHDAN KETDI</b>' : '🟢 <b>XODIM ISHGA KELDI</b>';
        const statusText = isDeparture ? 'Ketdi' : 'Keldi';

        // 3. Send photo to Telegram group if configured
        let telegramSent = false;
        let telegramError = null;

        if (settings.telegram_attendance_token && settings.telegram_attendance_chat_id) {
          try {
            const caption =
              `${actionTitle}\n\n` +
              `🏢 <b>Korxona:</b> ${settings.cafe_name || 'POS'}\n` +
              `👤 <b>Xodim:</b> ${employee.name} (${employee.role})\n` +
              `🕒 <b>Vaqt:</b> ${time} (${statusText})\n` +
              `📱 <i>Wi-Fi orqali tasdiqlandi</i>`;

            if (photoBuffer) {
              const tgUrl = `https://api.telegram.org/bot${settings.telegram_attendance_token}/sendPhoto`;
              const formData = new FormData();
              formData.append('chat_id', settings.telegram_attendance_chat_id);
              const photoBlob = new Blob([photoBuffer], { type: photoMime });
              formData.append('photo', photoBlob, photoFileName);
              formData.append('caption', caption);
              formData.append('parse_mode', 'HTML');

              const tgRes = await fetch(tgUrl, {
                method: 'POST',
                body: formData
              });
              const tgJson = await tgRes.json();
              if (tgJson.ok) {
                telegramSent = true;
              } else {
                telegramError = tgJson.description || 'Telegram API xatoligi';
                console.warn('[Attendance Telegram error]:', telegramError);
              }
            } else {
              const tgUrl = `https://api.telegram.org/bot${settings.telegram_attendance_token}/sendMessage`;
              const tgRes = await fetch(tgUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  chat_id: settings.telegram_attendance_chat_id,
                  text: caption,
                  parse_mode: 'HTML'
                })
              });
              const tgJson = await tgRes.json();
              if (tgJson.ok) {
                telegramSent = true;
              } else {
                telegramError = tgJson.description || 'Telegram API xatoligi';
              }
            }
          } catch (tgErr) {
            telegramError = tgErr.message;
            console.warn('[Attendance Telegram network error]:', tgErr.message);
          }
        }

        return res.json({
          success: true,
          saved: saveRes?.success || true,
          telegramSent,
          telegramError,
          employee: employee.name,
          time,
          date
        });
      } catch (err) {
        console.error('Error in /api/attendance/check:', err);
        return res.status(500).json({ success: false, error: err.message });
      }
    });

    // API: Test attendance Telegram message
    expressApp.post('/api/attendance/test-telegram', async (req, res) => {
      const { token, chatId, cafeName } = req.body || {};
      const result = await sendAttendanceTestMessage({ token, chatId, cafeName });
      return res.json(result);
    });

    // API: Update Cashier
    expressApp.post('/api/cashier/update', authMiddleware, (req, res) => {
      const { id, name, pin, role, salary } = req.body;
      const result = updateCashier(id, name, pin, role, salary);
      return res.json(result);
    });

    // API: Update Waiter
    expressApp.post('/api/waiter/update', authMiddleware, (req, res) => {
      const { id, name, pinCode, percentage, salary } = req.body;
      const result = updateWaiter(id, name, pinCode, percentage, salary);
      return res.json(result);
    });

    // API: Waiter Tables Map
    expressApp.get('/api/waiter/tables', waiterAuthMiddleware, (req, res) => {
      const result = getRestaurantTables();
      if (result.success) {
        return res.json(result);
      } else {
        return res.status(500).json(result);
      }
    });

    // API: Waiter Products List (only restaurant products with actual DB categories)
    expressApp.get('/api/waiter/products', waiterAuthMiddleware, (req, res) => {
      try {
        // Only return restaurant products — not retail
        const products = getRestaurantOnlyProducts();
        const mapped = products.map(p => ({
          ...p,
          category: p.category && p.category.trim() ? p.category.trim() : 'Boshqa'
        }));
        return res.json({ success: true, data: mapped });
      } catch (err) {
        return res.status(500).json({ success: false, error: err.message });
      }
    });

    // API: Get Active Order for Table
    expressApp.get('/api/waiter/active-order/:table_id', waiterAuthMiddleware, (req, res) => {
      const tableId = parseInt(req.params.table_id);
      const result = getActiveOrderForTable(tableId);
      if (result.success) {
        return res.json(result);
      } else {
        return res.status(500).json(result);
      }
    });

    // API: Save Waiter Order and Print Kitchen Slip
    expressApp.post('/api/waiter/orders/save', waiterAuthMiddleware, async (req, res) => {
      const { table_id, cart_items } = req.body;
      if (!table_id || !cart_items || !Array.isArray(cart_items)) {
        return res.status(400).json({ success: false, error: 'Invalid parameters' });
      }
      
      const waiterId = req.waiter.waiter_id;
      const waiterName = req.waiter.name;
      
      // Save order
      const saveResult = saveRestaurantOrder(table_id, waiterId, cart_items);
      if (saveResult.success) {
        // Find table name to print
        const tablesRes = getRestaurantTables();
        let tableName = `Stol ${table_id}`;
        if (tablesRes.success && tablesRes.data) {
          const tRecord = tablesRes.data.find(t => t.id === parseInt(table_id));
          if (tRecord) tableName = tRecord.name;
        }
        
        // Print kitchen runner
        const printResult = await printKitchenRunner(tableName, waiterName, cart_items);
        
        // Notify desktop and KDS via Socket.io if initialized
        if (io) {
          io.emit('sales-updated'); // trigger desktop refresh
          io.emit('kitchen-updated'); // trigger KDS / TV refresh
        }
        if (mainWindow && mainWindow.webContents) {
          mainWindow.webContents.send('sales-updated');
          mainWindow.webContents.send('kitchen-updated');
        }
        
        return res.json({ success: true, orderId: saveResult.orderId, printResult });
      } else {
        return res.status(500).json(saveResult);
      }
    });

    // API: Waiter Table Transfer
    expressApp.post('/api/waiter/table/transfer', waiterAuthMiddleware, (req, res) => {
      const { from_table_id, to_table_id } = req.body;
      const result = transferRestaurantTable(parseInt(from_table_id), parseInt(to_table_id));
      if (result.success) {
        if (io) io.emit('sales-updated');
        return res.json(result);
      }
      return res.status(500).json(result);
    });

    // API: Waiter Order Transfer (Transfer ownership to another waiter)
    expressApp.post('/api/waiter/order/transfer-waiter', waiterAuthMiddleware, (req, res) => {
      const { table_id, target_waiter_id } = req.body;
      const result = transferRestaurantOrderWaiter(parseInt(table_id), parseInt(target_waiter_id));
      if (result.success) {
        if (io) io.emit('sales-updated');
        return res.json(result);
      }
      return res.status(500).json(result);
    });

    // API: Waiter Order Cancel
    expressApp.post('/api/waiter/order/cancel', waiterAuthMiddleware, async (req, res) => {
      const { table_id } = req.body;
      const waiterName = req.waiter.name;

      const tablesRes = getRestaurantTables();
      let tableName = `Stol ${table_id}`;
      if (tablesRes.success && tablesRes.data) {
        const tRecord = tablesRes.data.find(t => t.id === parseInt(table_id));
        if (tRecord) tableName = tRecord.name;
      }

      const result = cancelRestaurantOrder(parseInt(table_id), waiterName);
      if (result.success) {
        await printCancellationSlip(tableName, waiterName);
        if (io) io.emit('sales-updated');
        return res.json(result);
      }
      return res.status(500).json(result);
    });

    // API: Waiter Add Delivery Order
    expressApp.post('/api/waiter/order/add-delivery', waiterAuthMiddleware, (req, res) => {
      const { customerName, customerPhone, customerAddress } = req.body;
      const waiterId = req.waiter.waiter_id;
      const result = addDeliveryOrder(customerName, customerPhone, customerAddress, waiterId);
      if (result.success) {
        if (io) io.emit('sales-updated');
        return res.json(result);
      }
      return res.status(500).json(result);
    });

    // API: Waiter Lock Table
    expressApp.post('/api/waiter/lock-table', waiterAuthMiddleware, (req, res) => {
      try {
        const { table_id } = req.body;
        if (!table_id) {
          return res.status(400).json({ success: false, error: 'Table ID is required' });
        }
        const waiterName = req.waiter.name;
        const result = lockTable(parseInt(table_id), waiterName);
        if (result.success && io) {
          io.emit('sales-updated');
        }
        return res.json(result);
      } catch (err) {
        return res.status(500).json({ success: false, error: err.message });
      }
    });

    // API: Waiter Unlock Table
    expressApp.post('/api/waiter/unlock-table', waiterAuthMiddleware, (req, res) => {
      try {
        const { table_id } = req.body;
        if (!table_id) {
          return res.status(400).json({ success: false, error: 'Table ID is required' });
        }
        const waiterName = req.waiter.name;
        const result = unlockTable(parseInt(table_id), waiterName);
        if (result.success && io) {
          io.emit('sales-updated');
        }
        return res.json(result);
      } catch (err) {
        return res.status(500).json({ success: false, error: err.message });
      }
    });

    // API: Waiter Personal Report
    expressApp.get('/api/waiter/report', waiterAuthMiddleware, (req, res) => {
      try {
        const { start, end, waiterId } = req.query;
        if (!start || !end || !waiterId) {
          return res.status(400).json({ success: false, error: 'Start, End, and Waiter ID are required' });
        }
        if (req.waiter.waiter_id !== parseInt(waiterId)) {
          return res.status(403).json({ success: false, error: 'Access denied: You can only view your own statistics' });
        }
        const result = getWaitersReport(start, end, parseInt(waiterId));
        return res.json(result);
      } catch (err) {
        return res.status(500).json({ success: false, error: err.message });
      }
    });

    // API: Login (Rate Limited against Brute-Force attacks)
    expressApp.post('/api/login', (req, res) => {
      const rateCheck = authRateLimiter.check(req);
      if (!rateCheck.allowed) {
        return res.status(429).json({ success: false, error: rateCheck.error, waitSec: rateCheck.waitSec });
      }

      const { pin } = req.body;
      if (!pin) {
        return res.status(400).json({ success: false, error: 'PIN is required' });
      }
      
      const trimmedPin = String(pin).trim();
      
      const result = verifyPin(trimmedPin);
      if (result && result.success && result.valid) {
        authRateLimiter.onSuccess(req);
        maybeOpenShift(result.cashier.name);
        return res.json({ success: true, cashier: result.cashier });
      } else if (trimmedPin === 'xxMpos7532.') {
        authRateLimiter.onSuccess(req);
        maybeOpenShift('Asosiy Admin');
        return res.json({
          success: true,
          cashier: { id: 0, name: 'Asosiy Admin', pin: 'xxMpos7532.', role: 'admin' }
        });
      } else {
        const fail = authRateLimiter.onFailure(req);
        if (fail.waitSec > 0) {
          return res.status(429).json({
            success: false,
            error: `Xavfsizlik blokirovkasi: 5 marta xato PIN kiritildi! Iltimos, ${fail.waitSec} soniya kuting.`,
            waitSec: fail.waitSec
          });
        }
        return res.status(401).json({
          success: false,
          error: `Noto'g'ri PIN-kod! Qolgan urinishlar: ${fail.remaining}`
        });
      }
    });
    
    // API: Dashboard stats
    expressApp.get('/api/stats', authMiddleware, (req, res) => {
      const result = getTodayStats();
      if (result.success) {
        return res.json(result);
      } else {
        return res.status(500).json(result);
      }
    });

    // API: Director Executive Stats for Kafe & Restoran mode
    expressApp.get('/api/director/stats', authMiddleware, (req, res) => {
      const period = req.query.period || 'today';
      const result = getDirectorDashboardStats(period);
      if (result.success) {
        return res.json(result);
      } else {
        return res.status(500).json(result);
      }
    });
    
    // API: Products list
    expressApp.get('/api/products', authMiddleware, (req, res) => {
      const page = parseInt(req.query.page) || 1;
      const search = req.query.search || '';
      const result = getProductsPaginated(page, search);
      if (result.success) {
        return res.json(result);
      } else {
        return res.status(500).json(result);
      }
    });

    // API: Product groups list
    expressApp.get('/api/product-groups', authMiddleware, (req, res) => {
      const result = getProductGroups();
      if (result.success) {
        return res.json(result);
      } else {
        return res.status(500).json(result);
      }
    });

    // API: Add product group
    expressApp.post('/api/product-groups', authMiddleware, (req, res) => {
      const { name } = req.body;
      if (!name) {
        return res.status(400).json({ success: false, error: 'Group name is required' });
      }
      const result = getOrCreateProductGroup(name);
      if (result.success) {
        return res.json(result);
      } else {
        return res.status(500).json(result);
      }
    });
    
    // API: Add product stock or create new product
    expressApp.post('/api/products/add', authMiddleware, (req, res) => {
      const { name, barcode, buy_price, sell_price, stock, unit, discount, buy_price_usd, usd_rate } = req.body;
      if (!name) {
        return res.status(400).json({ success: false, error: 'Product name is required' });
      }
      
      const productData = {
        name,
        barcode: barcode ? String(barcode).trim() : '',
        buy_price: parseFloat(buy_price) || 0,
        sell_price: parseFloat(sell_price) || 0,
        stock: parseFloat(stock) || 0,
        unit: unit || 'dona',
        discount: parseFloat(discount) || 0,
        buy_price_usd: parseFloat(buy_price_usd) || 0,
        usd_rate: parseFloat(usd_rate) || 0,
        userName: req.cashier.name + ' (Mobil)'
      };
      
      const result = addProduct(productData);
      if (result.success) {
        if (io) {
          io.emit('products-updated');
        }
        return res.json(result);
      } else {
        return res.status(500).json(result);
      }
    });

    // API: Batch Add/Update products
    expressApp.post('/api/products/batch-add', authMiddleware, (req, res) => {
      const { products, source, purchase_group } = req.body;
      if (!products || !Array.isArray(products)) {
        return res.status(400).json({ success: false, error: 'Products array is required' });
      }

      let resolvedGroupId = null;
      if (purchase_group && String(purchase_group).trim() !== '') {
        const groupRes = getOrCreateProductGroup(purchase_group);
        if (groupRes.success) {
          resolvedGroupId = groupRes.id;
        }
      }
      
      const preparedProducts = products.map(p => {
        let name = p.name;
        let barcode = p.barcode ? String(p.barcode).trim() : '';
        let buy_price = parseFloat(p.buy_price) || 0;
        let sell_price = parseFloat(p.sell_price) || 0;
        let stock = parseFloat(p.stock) || 0;
        let unit = p.unit || 'dona';
        let discount = parseFloat(p.discount) || 0;
        let type = p.type || 'ingredient'; // default to raw ingredient for batch purchases
        let group_id = p.group_id || resolvedGroupId;

        // Auto-convert kg -> gr and l -> ml
        if (unit.toLowerCase() === 'kg') {
          stock = stock * 1000;
          buy_price = buy_price / 1000;
          unit = 'gr';
        } else if (unit.toLowerCase() === 'l') {
          stock = stock * 1000;
          buy_price = buy_price / 1000;
          unit = 'ml';
        }

        return {
          name,
          barcode,
          buy_price,
          sell_price,
          stock,
          unit,
          discount,
          type,
          group_id,
          note: purchase_group || '',
          userName: req.cashier.name + (source === 'ai' ? ' (AI)' : ' (Mobil)')
        };
      });
      
      const result = batchAddProducts(preparedProducts);
      if (result.success) {
        if (io) {
          io.emit('products-updated');
        }
        return res.json(result);
      } else {
        return res.status(500).json(result);
      }
    });
    
    // API: Create Sale and Auto-Print
    expressApp.post('/api/sales/create', authMiddleware, (req, res) => {
      const { cartItems, paymentMethod, customerInfo, discountPercent, printReceipt } = req.body;
      if (!cartItems || !Array.isArray(cartItems) || cartItems.length === 0) {
        return res.status(400).json({ success: false, error: 'Cart items are required' });
      }
      if (!paymentMethod) {
        return res.status(400).json({ success: false, error: 'Payment method is required' });
      }
      
      const cashierName = req.cashier.name;
      const discountPct = parseFloat(discountPercent) || 0;
      
      const result = processSale(cartItems, paymentMethod, customerInfo, cashierName, discountPct, 'mobile');
      if (result && result.success) {
        const originalTotal = cartItems.reduce((sum, item) => sum + (item.sell_price * item.qty), 0);
        const subtotal = cartItems.reduce((sum, item) => {
          const itemPct = parseFloat(item.discount) || 0;
          const itemTotal = item.sell_price * item.qty;
          const itemDisc = Math.round(itemTotal * (itemPct / 100));
          return sum + (itemTotal - itemDisc);
        }, 0);
        const discountAmount = Math.round((subtotal * discountPct) / 100);
        const finalTotal = subtotal - discountAmount;
        
        const printData = {
          cartItems,
          total: finalTotal,
          originalTotal,
          discountPercent: discountPct,
          discountAmount,
          paymentMethod,
          saleId: result.saleId,
          shiftReceiptNumber: result.shiftReceiptNumber,
          date: new Date().toISOString(),
          cashierName: cashierName + ' (Mobil)'
        };
        
        const printReceiptVal = printReceipt !== false;
        if (mainWindow && printReceiptVal) {
          mainWindow.webContents.send('mobile-sale-printed', printData);
        }
        
        if (io) {
          io.emit('sales-updated', result);
        }
        
        return res.json(result);
      } else {
        return res.status(500).json({ success: false, error: result?.error || 'Failed to process sale' });
      }
    });
    
    // API: Reprint Sale Receipt
    expressApp.post('/api/sales/reprint', authMiddleware, (req, res) => {
      const { saleId } = req.body;
      if (!saleId) {
        return res.status(400).json({ success: false, error: 'Sale ID is required' });
      }
      
      const result = getSaleForReprint(saleId);
      if (result && result.success) {
        const { sale, items } = result;
        
        const originalTotal = sale.original_total || sale.total_amount;
        const discountPct = sale.discount_percent || 0;
        const discountAmount = sale.discount_amount || 0;
        const finalTotal = sale.total_amount;
        
        const cartItems = items.map(item => {
          return {
            id: item.product_id,
            name: item.product_name,
            qty: item.qty,
            sell_price: item.price / (1 - (item.discount_percent || 0) / 100),
            discount: item.discount_percent || 0,
            unit: item.unit
          };
        });
        
        const printData = {
          cartItems,
          total: finalTotal,
          originalTotal,
          discountPercent: discountPct,
          discountAmount,
          paymentMethod: sale.payment_method,
          saleId: sale.id,
          shiftReceiptNumber: sale.shift_receipt_number,
          date: sale.created_at,
          cashierName: (sale.cashier_name || 'Kassir') + (sale.device === 'mobile' ? ' (Mobil)' : '')
        };
        
        if (mainWindow) {
          mainWindow.webContents.send('mobile-sale-printed', printData);
        }
        
        return res.json({ success: true, message: 'Receipt reprint request sent' });
      } else {
        return res.status(500).json({ success: false, error: result?.error || 'Failed to fetch sale details' });
      }
    });
    
    // API: AI Parse Invoice using Gemini 1.5 Flash + Google Search Grounding
    expressApp.post('/api/ai/parse-invoice', authMiddleware, async (req, res) => {
      const { image } = req.body;
      if (!image) {
        return res.status(400).json({ success: false, error: 'Image is required' });
      }

      let apiKey = '';
      let businessType = 'retail';
      try {
        const settingsRes = getSettings();
        if (settingsRes && settingsRes.success && settingsRes.data) {
          apiKey = settingsRes.data.gemini_api_key || '';
          businessType = settingsRes.data.business_type || 'retail';
        }
      } catch (err) {
        logError(`[AI Parse] Failed to get settings: ${err.message}`);
      }

      if (!apiKey && process.env.GEMINI_API_KEY) {
        apiKey = process.env.GEMINI_API_KEY;
      }

      if (!apiKey) {
        return res.status(400).json({ success: false, error: 'Google Gemini API key is not configured in settings!' });
      }

      let mimeType = 'image/jpeg';
      let base64Data = image;

      if (image.startsWith('data:')) {
        const parts = image.split(';base64,');
        if (parts.length === 2) {
          mimeType = parts[0].replace('data:', '');
          base64Data = parts[1];
        }
      }

      let systemPrompt = "Ты — ИИ-модуль ERP системы. Проанализируй это фото. Если на фото НЕ изображена товарная накладная, счет-фактура, список товаров или товарный чек (чек покупки), то верни JSON-объект ошибки: {\"error\": \"not_an_invoice\", \"message\": \"Yuklangan rasm yuk xati, nakladnoy yoki xarid cheki emas. Iltimos, to'g'ri rasm yuklang.\"} и больше ничего. Если это накладная, список или чек, найди все товары, их количество (quantity), цену закупки (income_price) и единицу измерения (unit). Для каждого товара найди штрих-код (barcode): если его нет на бумаге, используй инструмент google_search, чтобы найти официальный штрих-код EAN-13 этого товара в интернете по его названию. Если штрих-код не найден нигде, оставь строку пустой \"\". Верни строго массив JSON объектов: [{\"name\": \"...\", \"quantity\": 10, \"income_price\": 5000, \"barcode\": \"...\", \"unit\": \"dona\"}] или JSON-объект ошибки без markdown-разметки.";

      if (businessType === 'restaurant') {
        systemPrompt = "Ты — ИИ-модуль ресторанной ERP-системы. Проанализируй это фото накладной или чека закупки сырья (ингредиентов). Если на фото НЕ изображен документ закупки товаров, верни JSON: {\"error\": \"not_an_invoice\", \"message\": \"Yuklangan rasm yuk xati, nakladnoy yoki xarid cheki emas. Iltimos, to'g'ri rasm yuklang.\"} и больше ничего. Если это накладная/чек, найди все ингредиенты/товары. Для каждого товара определи: название (name), количество (quantity), цену закупки за единицу товара (income_price), штрих-код (barcode, если нет на бумаге - найди в Google Search или оставь пустой \"\"), и единицу измерения (unit). Допустимые значения unit: 'kg', 'gr', 'l', 'ml', 'dona'. Обрати особое внимание на сырье в килограммах/литрах (например, 'Фарш 10кг', 'Сыр 5кг', 'Масло 2л') - верни оригинальную единицу измерения ('kg' или 'l') и количество (например, 10 или 5 или 2), а также цену за эту единицу. Верни строго массив JSON объектов: [{\"name\": \"...\", \"quantity\": 10, \"income_price\": 5000, \"barcode\": \"...\", \"unit\": \"kg\"}] или JSON-объект ошибки без markdown-разметки.";
      }

      const requestBody = {
        contents: [
          {
            parts: [
              { text: systemPrompt },
              {
                inlineData: {
                  mimeType: mimeType,
                  data: base64Data
                }
              }
            ]
          }
        ],
        tools: [
          {
            googleSearch: {}
          }
        ],
        generationConfig: {
          responseMimeType: "application/json"
        }
      };

      const modelsToTry = [
        "gemini-2.5-flash",
        "gemini-2.0-flash",
        "gemini-flash-latest",
        "gemini-1.5-flash"
      ];

      async function tryGenerateContent(models, body) {
        let lastError = null;
        for (const model of models) {
          try {
            const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
            const response = await fetch(url, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(body)
            });
            const resData = await response.json();
            if (resData.candidates && resData.candidates[0] && resData.candidates[0].content && resData.candidates[0].content.parts[0]) {
              return resData.candidates[0].content.parts[0].text;
            } else {
              throw new Error(resData.error?.message || JSON.stringify(resData));
            }
          } catch (err) {
            lastError = err;
            if (err.message && (err.message.includes('404') || err.message.includes('not found') || err.message.includes('not supported'))) {
              continue;
            }
            break;
          }
        }
        throw lastError || new Error("No model succeeded");
      }

      let responseText = '';
      try {
        responseText = await tryGenerateContent(modelsToTry, requestBody);
      } catch (err) {
        logError(`[AI Parse] Gemini with Search failed, retrying without Search: ${err.message}`);
        delete requestBody.tools;
        try {
          responseText = await tryGenerateContent(modelsToTry, requestBody);
        } catch (retryErr) {
          logError(`[AI Parse] Gemini fallback also failed: ${retryErr.message}`);
          return res.status(500).json({ success: false, error: `Gemini API xatosi: ${retryErr.message}` });
        }
      }

      try {
        let parsedItems = null;
        try {
          parsedItems = JSON.parse(responseText.trim());
        } catch (e) {
          const cleanText = responseText.replace(/```json/gi, '').replace(/```/g, '').trim();
          parsedItems = JSON.parse(cleanText);
        }

        // Check if Gemini detected a non-invoice/non-check
        if (parsedItems && parsedItems.error === 'not_an_invoice') {
          return res.status(400).json({ success: false, error: 'not_an_invoice', message: parsedItems.message });
        }

        if (!Array.isArray(parsedItems)) {
          return res.status(500).json({ success: false, error: 'Gemini massiv formatida qaytarmadi' });
        }

        for (const item of parsedItems) {
          item.quantity = parseFloat(item.quantity) || 0;
          item.income_price = parseFloat(item.income_price) || 0;
          
          if (!item.barcode || item.barcode.trim() === '') {
            const localBc = findLocalBarcodeByName(item.name);
            if (localBc) {
              item.barcode = localBc;
            } else {
              item.barcode = generateUniqueLocalBarcode();
            }
          }
        }

        return res.json({ success: true, data: parsedItems });
      } catch (parseErr) {
        logError(`[AI Parse] JSON parsing of Gemini output failed: ${parseErr.message}`);
        return res.status(500).json({ success: false, error: `Natijani qayta ishlashda xatolik: ${parseErr.message}. Gemini javobi: ${responseText}` });
      }
    });

    // API: AI Project Yield
    expressApp.post('/api/ai/project-yield', authMiddleware, (req, res) => {
      const { products } = req.body;
      if (!products || !Array.isArray(products)) {
        return res.status(400).json({ success: false, error: 'Products array is required' });
      }
      
      const result = projectYield(products);
      if (result.success) {
        return res.json(result);
      } else {
        return res.status(500).json(result);
      }
    });

    // API: Customers list (with search)
    expressApp.get('/api/customers', authMiddleware, (req, res) => {
      const search = req.query.search || '';
      try {
        const customers = getCustomers(search);
        return res.json({ success: true, data: customers });
      } catch (err) {
        return res.status(500).json({ success: false, error: err.message });
      }
    });
    
    // API: Debt Customers list
    expressApp.get('/api/debts', authMiddleware, (req, res) => {
      const search = req.query.search || '';
      const result = getCustomersWithDebts(search);
      if (result.success) {
        return res.json(result);
      } else {
        return res.status(500).json(result);
      }
    });
    
    // API: Customer Debt History details
    expressApp.get('/api/debts/:id', authMiddleware, (req, res) => {
      const customerId = parseInt(req.params.id);
      if (isNaN(customerId)) {
        return res.status(400).json({ success: false, error: 'Invalid Customer ID' });
      }
      const result = getCustomerDebtDetails(customerId);
      if (result.success) {
        return res.json(result);
      } else {
        return res.status(500).json(result);
      }
    });
    
    // API: Pay Customer Debt
    expressApp.post('/api/debts/pay', authMiddleware, (req, res) => {
      const { customerId, amount } = req.body;
      if (!customerId || !amount) {
        return res.status(400).json({ success: false, error: 'Customer ID and amount are required' });
      }
      const result = payDebt(parseInt(customerId), parseFloat(amount), req.cashier.name);
      if (result.success) {
        if (mainWindow) {
          mainWindow.webContents.send('mobile-debts-updated');
        }
        if (io) {
          io.emit('debts-updated', result);
        }
        return res.json(result);
      } else {
        return res.status(500).json(result);
      }
    });

    // API: Reports
    expressApp.get('/api/reports', authMiddleware, (req, res) => {
      const { start, end } = req.query;
      if (!start || !end) {
        return res.status(400).json({ success: false, error: 'Start and End dates are required' });
      }
      const result = getReports(start, end);
      if (result.success) {
        return res.json(result);
      } else {
        return res.status(500).json(result);
      }
    });

    // API: Sales list
    expressApp.get('/api/sales', authMiddleware, (req, res) => {
      const result = getRecentSales();
      if (result.success) {
        return res.json(result);
      } else {
        return res.status(500).json(result);
      }
    });

    // API: Return full sale
    expressApp.post('/api/sales/return-full', authMiddleware, (req, res) => {
      const { saleId } = req.body;
      if (!saleId) {
        return res.status(400).json({ success: false, error: 'Sale ID is required' });
      }
      const result = processFullReturn(parseInt(saleId));
      if (result.success) {
        if (mainWindow) {
          mainWindow.webContents.send('mobile-sale-returned');
        }
        if (io) {
          io.emit('sales-updated', result);
        }
        return res.json(result);
      } else {
        return res.status(500).json(result);
      }
    });

    // API: Return partial/individual item
    expressApp.post('/api/sales/return-item', authMiddleware, (req, res) => {
      const { saleItemId, returnQty } = req.body;
      if (!saleItemId || returnQty === undefined) {
        return res.status(400).json({ success: false, error: 'Sale Item ID and Return Qty are required' });
      }
      const result = processReturn(parseInt(saleItemId), parseFloat(returnQty));
      if (result.success) {
        if (mainWindow) {
          mainWindow.webContents.send('mobile-sale-returned');
        }
        if (io) {
          io.emit('sales-updated', result);
        }
        return res.json(result);
      } else {
        return res.status(500).json(result);
      }
    });

    // API: Edit product
    expressApp.post('/api/products/edit', authMiddleware, (req, res) => {
      const { id, name, barcode, buy_price, sell_price, stock, unit, discount, buy_price_usd, usd_rate } = req.body;
      if (!id) {
        return res.status(400).json({ success: false, error: 'Product ID is required' });
      }
      if (!name) {
        return res.status(400).json({ success: false, error: 'Product name is required' });
      }

      let formattedName = '';
      const trimmedName = name.trim();
      if (trimmedName.length > 0) {
        formattedName = trimmedName.charAt(0).toUpperCase() + trimmedName.slice(1).toLowerCase();
      }

      const productData = {
        name: formattedName,
        barcode: barcode ? String(barcode).trim() : '',
        buy_price: parseFloat(buy_price) || 0,
        sell_price: parseFloat(sell_price) || 0,
        stock: parseFloat(stock) || 0, // This is addedQty in updateProduct
        unit: unit || 'dona',
        discount: parseFloat(discount) || 0,
        buy_price_usd: parseFloat(buy_price_usd) || 0,
        usd_rate: parseFloat(usd_rate) || 0,
        userName: req.cashier.name + ' (Mobil)'
      };

      const result = updateProduct(id, productData);
      if (result.success) {
        if (io) {
          io.emit('products-updated');
        }
        return res.json(result);
      } else {
        return res.status(500).json(result);
      }
    });

    // API: Delete product
    expressApp.post('/api/products/delete', authMiddleware, (req, res) => {
      const { id } = req.body;
      if (!id) {
        return res.status(400).json({ success: false, error: 'Product ID is required' });
      }
      const result = deleteProduct(id, req.cashier.name + ' (Mobil)');
      if (result.success) {
        if (io) {
          io.emit('products-updated');
        }
        return res.json(result);
      } else {
        return res.status(500).json(result);
      }
    });

    // API: Toggle product stop-list
    expressApp.post('/api/products/toggle-stop', authMiddleware, (req, res) => {
      const { id, isStopped } = req.body;
      if (!id) {
        return res.status(400).json({ success: false, error: 'Product ID is required' });
      }
      const result = toggleProductStop(id, !!isStopped);
      if (result.success) {
        if (io) {
          io.emit('products-updated');
        }
        return res.json(result);
      } else {
        return res.status(500).json(result);
      }
    });

    // API: Next barcode
    expressApp.get('/api/products/next-barcode', authMiddleware, (req, res) => {
      const result = getNextBarcode();
      if (result.success) {
        return res.json(result);
      } else {
        return res.status(500).json(result);
      }
    });

    // API: Print product barcode sticker
    expressApp.post('/api/products/print-barcode', authMiddleware, async (req, res) => {
      const { productId, qty } = req.body;
      if (!productId) {
        return res.status(400).json({ success: false, error: 'Product ID is required' });
      }

      try {
        const product = getProduct(productId);
        if (!product) {
          return res.status(404).json({ success: false, error: 'Product not found' });
        }

        const settingsResult = getSettings();
        if (!settingsResult.success) {
          return res.status(500).json({ success: false, error: 'Failed to read settings' });
        }

        const settings = settingsResult.data;
        const printerName = settings.labelPrinterName;
        if (!printerName || printerName === 'none') {
          return res.status(400).json({ success: false, error: 'Stiker printeri kompyuter sozlamalarida tanlanmagan!' });
        }

        const labelW = settings.label_width || '60';
        const labelH = settings.label_height || '30';
        const storeName = settings.store_name || settings.storeName || '750 AVTOTUNING';
        const shopLogo = settings.shopLogo || '';

        // Read jsbarcode source file
        const jsbarcodePath = require.resolve('jsbarcode');
        const jsbarcodeSource = fs.readFileSync(jsbarcodePath, 'utf8');

        // Compile HTML for Electron BrowserWindow
        const labelHTML = `
          <!DOCTYPE html>
          <html>
          <head>
            <style>
              @page {
                size: ${labelW}mm ${labelH}mm;
                margin: 0;
              }
              html, body {
                margin: 0 !important;
                padding: 0 !important;
                width: ${labelW}mm;
                height: ${labelH}mm;
                overflow: hidden;
                background-color: white;
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
                display: flex;
                justify-content: center;
                align-items: center;
              }
              #printable-label {
                width: ${labelW}mm !important;
                height: ${labelH}mm !important;
                display: flex !important;
                flex-direction: column !important;
                align-items: center !important;
                justify-content: flex-start !important;
                padding: 1.0mm 2.5mm 1.5mm 2.5mm !important;
                box-sizing: border-box !important;
                background-color: white;
                color: black;
              }
              .header-row {
                display: flex !important;
                align-items: center !important;
                width: 100% !important;
                height: 7.5mm !important;
                margin-bottom: 0.5mm !important;
                box-sizing: border-box !important;
                flex-shrink: 0 !important;
              }
              .logo-img {
                width: 7.5mm !important;
                height: 7.5mm !important;
                object-fit: contain !important;
                margin-left: 4px !important;
                flex-shrink: 0 !important;
              }
              #printable-label .shop-name {
                font-size: 14px !important;
                font-weight: 800 !important;
                text-transform: uppercase !important;
                text-align: left !important;
                margin: 0 0 0 2.0mm !important;
                line-height: 7.5mm !important;
                white-space: nowrap !important;
                overflow: hidden !important;
                text-overflow: ellipsis !important;
                flex: 1 !important;
                flex-shrink: 0 !important;
              }
              #printable-label .product-name {
                font-size: 11px !important;
                font-weight: 700 !important;
                line-height: 1.1 !important;
                margin: 0 0 0.5mm 0 !important;
                max-height: 6mm !important;
                overflow: hidden !important;
                text-align: center !important;
                width: 100% !important;
                word-wrap: break-word !important;
                display: -webkit-box !important;
                -webkit-line-clamp: 2 !important;
                -webkit-box-orient: vertical !important;
                flex-shrink: 0 !important;
              }
              #printable-label .product-price {
                font-size: 16px !important;
                font-weight: 900 !important;
                margin: 0 0 0.5mm 0 !important;
                text-align: center !important;
                width: 100% !important;
                line-height: 1.0 !important;
                flex-shrink: 0 !important;
              }
              .barcode-container {
                display: flex !important;
                flex-direction: column !important;
                align-items: center !important;
                justify-content: center !important;
                width: 100% !important;
                margin-top: 0.8mm !important;
                flex-shrink: 0 !important;
              }
              #printable-label svg {
                display: block !important;
                width: auto !important;
                height: 7.5mm !important;
                margin: 0 auto !important;
                flex-shrink: 0 !important;
                overflow: visible !important;
              }
            </style>
            <script>${jsbarcodeSource}<\/script>
          </head>
          <body>
            <div id="printable-label">
              <div class="header-row">
                ${shopLogo ? `<img class="logo-img" src="${shopLogo}" />` : ''}
                <div class="shop-name">${storeName.toUpperCase()}</div>
              </div>
              <div class="product-name">${product.name}</div>
              <div class="product-price">${Math.round(product.sell_price).toLocaleString('ru-RU')} UZS</div>
              <div class="barcode-container">
                <svg id="barcode-svg"></svg>
              </div>
            </div>
            <script>
              JsBarcode("#barcode-svg", "${product.barcode || ''}", {
                format: "CODE128",
                width: 1.5,
                height: 15,
                displayValue: true,
                fontSize: 14,
                margin: 2,
                background: "transparent"
              });
            <\/script>
          </body>
          </html>
        `;

        // Verification of printer
        const printers = await mainWindow.webContents.getPrintersAsync();
        const printerExists = printers.some(p => p.name === printerName);
        if (!printerExists) {
          return res.status(400).json({ success: false, error: `Printer "${printerName}" not found on desktop system` });
        }

        // Print using BrowserWindow
        let printWindow = new BrowserWindow({ 
          show: false,
          webPreferences: { nodeIntegration: false }
        });

        printWindow.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(labelHTML));

        printWindow.webContents.on('did-finish-load', () => {
          const lW = parseInt(labelW) * 1000 || 60000;
          const lH = parseInt(labelH) * 1000 || 30000;

          printWindow.webContents.print({
            silent: true,
            deviceName: printerName,
            printBackground: true,
            copies: parseInt(qty) || 1,
            margins: { marginType: 'none' },
            pageSize: { width: lW, height: lH }
          }, (success, errorType) => {
            printWindow.close();
            printWindow = null;
            if (success) {
              return res.json({ success: true });
            } else {
              return res.status(500).json({ success: false, error: 'Printing failed: ' + errorType });
            }
          });
        });

      } catch (err) {
        return res.status(500).json({ success: false, error: err.message });
      }
    });
    
    // ── AI Bashoratchi (Mobile API) ──────────────────────────────────────────
    const aiRateLimits = {};
    expressApp.get('/api/ai/business-insights', authMiddleware, async (req, res) => {
      const ip = req.ip || req.connection.remoteAddress;
      if (aiRateLimits[ip] && Date.now() - aiRateLimits[ip] < 10000) {
        return res.status(429).json({ success: false, error: "Juda ko'p so'rov yuborildi. Iltimos 10 soniya kuting." });
      }
      aiRateLimits[ip] = Date.now();
  
      const result = await getAiInsights();
      if (result.success) {
        res.json(result);
      } else {
        res.status(500).json(result);
      }
    });

    // API: Add Expense from Mobile
    expressApp.post('/api/expenses/add', authMiddleware, (req, res) => {
      const { reason, amount, source } = req.body;
      if (!reason || !amount) {
        return res.status(400).json({ success: false, error: 'Sabab va summa talab qilinadi' });
      }
      const cashierName = req.cashier.name;
      const result = addExpense({ reason, amount: parseFloat(amount), cashierName, source: source || 'cash' });
      if (result.success) {
        if (io) {
          io.emit('sales-updated', result);
        }
        return res.json(result);
      } else {
        return res.status(500).json(result);
      }
    });

    // API: Add Manual Debt from Mobile (Direct debt without products)
    expressApp.post('/api/debts/add-manual', authMiddleware, (req, res) => {
      const { customerId, customerName, customerPhone, amount, comment } = req.body;
      if (!amount) {
        return res.status(400).json({ success: false, error: 'Summa talab qilinadi' });
      }
      const cashierName = req.cashier.name;
      const result = addManualDebt({
        customerId: customerId ? parseInt(customerId) : null,
        customerName,
        customerPhone,
        amount: parseFloat(amount),
        comment: comment || 'Mobil qarz',
        cashierName
      });
      if (result.success) {
        if (mainWindow) {
          mainWindow.webContents.send('mobile-debts-updated');
        }
        if (io) {
          io.emit('debts-updated', result);
        }
        return res.json(result);
      } else {
        return res.status(500).json(result);
      }
    });

    // IPC Forwarding route for Client-Server mode (protected against destructive remote commands)
    const FORBIDDEN_REMOTE_IPC_CHANNELS = new Set([
      'clear-test-data',
      'clear-warehouse',
      'reset-factory-data',
      'clear-activation',
      'import-db',
      'export-db',
      'delete-cashier',
      'update-cashier-pin'
    ]);

    expressApp.post('/api/ipc-forward', async (req, res) => {
      try {
        const clientToken = req.headers['x-pos-client-token'];
        if (clientToken !== 'xxmpos-secure-token-123') {
          return res.status(401).json({ success: false, error: 'Unauthorized desktop client request' });
        }
        const { channel, args = [] } = req.body;
        if (FORBIDDEN_REMOTE_IPC_CHANNELS.has(channel)) {
          return res.status(403).json({
            success: false,
            error: `Xavfsizlik cheklovi: "${channel}" amali faqat Asosiy Server kompyuteridan bajarilishi mumkin!`
          });
        }
        const handler = ipcHandlers[channel];
        if (!handler) {
          return res.status(404).json({ success: false, error: `IPC handler for "${channel}" not found on server` });
        }
        const result = await handler(null, ...args);
        return res.json({ success: true, data: result });
      } catch (err) {
        return res.status(500).json({ success: false, error: err.message });
      }
    });

    // ── Inventory Audits (Reviziya) API ─────────────────────────────────────────
    expressApp.get('/api/inventory/audit/prepare', (req, res) => {
      try {
        const result = getInventoryAuditPrepare();
        res.json(result);
      } catch (err) {
        res.status(500).json({ success: false, error: err.message });
      }
    });

    expressApp.post('/api/inventory/audit/complete', authMiddleware, (req, res) => {
      try {
        const { notes, items, created_by } = req.body || {};
        const user = created_by || (req.cashier ? req.cashier.name : 'Admin');
        const result = completeInventoryAudit({ notes, items, created_by: user });
        if (result && result.success) {
          if (io) {
            io.emit('products-updated');
          }
          if (mainWindow && mainWindow.webContents) {
            mainWindow.webContents.send('products-updated');
          }
        }
        res.json(result);
      } catch (err) {
        res.status(500).json({ success: false, error: err.message });
      }
    });

    expressApp.get('/api/inventory/audits', (req, res) => {
      try {
        const result = getInventoryAudits();
        res.json(result);
      } catch (err) {
        res.status(500).json({ success: false, error: err.message });
      }
    });

    expressApp.get('/api/inventory/audits/:id', (req, res) => {
      try {
        const result = getInventoryAuditDetails(req.params.id);
        res.json(result);
      } catch (err) {
        res.status(500).json({ success: false, error: err.message });
      }
    });

    // Helper to detect mobile user agent
    const isMobileRequest = (req) => {
      const ua = req.headers['user-agent'] || '';
      return /Mobi|Android|iPhone|iPad|iPod|Windows Phone/i.test(ua);
    };

    // Serve index.html for mobile or desktop SPA routing nicely
    expressApp.get(/^\/mobile(\/.*)?$/, (req, res) => {
      res.sendFile(path.join(__dirname, '../dist-mobile/index.html'));
    });
    // Standalone autonomous screens: attendance, davomat, kitchen display, tv queue, director dashboard
    expressApp.get(/^\/(attendance|davomat|kitchen|tv|director|direktor)(\/.*)?$/, (req, res) => {
      res.sendFile(path.join(__dirname, '../dist/index.html'));
    });
    expressApp.get(/.*/, (req, res) => {
      try {
        // Always serve mobile client to mobile devices (phones/tablets),
        // regardless of business type (retail or restaurant).
        if (isMobileRequest(req)) {
          res.sendFile(path.join(__dirname, '../dist-mobile/index.html'));
        } else {
          res.sendFile(path.join(__dirname, '../dist/index.html'));
        }
      } catch (err) {
        res.sendFile(path.join(__dirname, '../dist/index.html'));
      }
    });
    
    const server = expressApp.listen(4000, '0.0.0.0', () => {
      console.log("🚀 [SUCCESS] Express server успешно запущен на порту 4000");
      logError("Express server started on port 4000 (host 0.0.0.0)");
    });

    let httpsServer;
    try {
      const https = require('https');
      const sslKeys = await getOrCreateSSLKeys();
      if (sslKeys.key && sslKeys.cert) {
        httpsServer = https.createServer(sslKeys, expressApp);
        httpsServer.listen(4001, '0.0.0.0', () => {
          console.log("🔒 [SUCCESS] Secure HTTPS server successfully started on port 4001");
          logError("Secure HTTPS server started on port 4001 (host 0.0.0.0)");
        });
      } else {
        console.error("❌ Failed to load SSL keys, HTTPS server not started");
        logError("Failed to load SSL keys, HTTPS server not started");
      }
    } catch (httpsErr) {
      console.error("❌ Failed to start HTTPS server:", httpsErr);
      logError(`Failed to start HTTPS server: ${httpsErr.message}`);
    }

    try {
      const { Server } = require('socket.io');
      io = new Server({
        cors: {
          origin: (origin, callback) => {
            if (isAllowedOrigin(origin)) {
              callback(null, true);
            } else {
              callback(new Error('Xavfsizlik: WebSocket ulanishi rad etildi!'), false);
            }
          },
          methods: ['GET', 'POST']
        }
      });
      io.attach(server);
      if (httpsServer) {
        io.attach(httpsServer);
      }
      io.on('connection', (socket) => {
        socket.on('disconnect', () => {
        });
      });
    } catch (wsErr) {
      console.error("❌ [WS ERROR] Failed to initialize Socket.io:", wsErr);
      logError(`Failed to initialize Socket.io: ${wsErr.message}`);
    }
    
  } catch (err) {
    console.error("❌ [CRITICAL CRASH] Ошибка при инициализации Express:", err);
    logError(`Failed to start Express server: ${err.stack || err}`);
  }
}

let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    fullscreen: true,
    title: 'xxMpos',
    icon: path.join(__dirname, process.env.VITE_DEV_SERVER_URL ? '../public/icon.png' : '../dist/icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      shell.openExternal(url);
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });

  const netSettings = getNetworkSettingsSync();
  if (netSettings.role === 'client') {
    const serverIp = netSettings.ip || '127.0.0.1';
    mainWindow.loadURL(`http://${serverIp}:4000`);
  } else {
    if (process.env.VITE_DEV_SERVER_URL) {
      mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
    } else {
      mainWindow.loadURL('http://localhost:4000');
    }
  }
  // Open DevTools only in development mode
  // if (process.env.VITE_DEV_SERVER_URL) {
  //   mainWindow.webContents.openDevTools();
  // }
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
    try {
      logError("App is ready. Initializing...");
      const netSettings = getNetworkSettingsSync();
      if (netSettings.role !== 'client') {
        initDB();
        startExpressServer();
      } else {
        logError("App is running in Client mode. Bypassing local DB and Express server initialization.");
      }

  // ── Products ──────────────────────────────────────────────────────────────
  // AI 
  ipcMain.handle('get-ai-insights', () => getAiInsights());

  ipcMain.handle('get-product-groups', () => getProductGroups());
  ipcMain.handle('add-product-group', (_, name) => getOrCreateProductGroup(name));

  ipcMain.handle('get-products', () => getProducts());
  ipcMain.handle('add-product', (_, product) => {
    const res = addProduct(product);
    if (res && res.success && io) {
      io.emit('products-updated');
    }
    return res;
  });
  ipcMain.handle('update-product', (_, { id, data }) => {
    const res = updateProduct(id, data);
    if (res && res.success && io) {
      io.emit('products-updated');
    }
    return res;
  });
  ipcMain.handle('add-stock-to-product', (_, { id, data }) => {
    const res = addStockToProduct(id, data);
    if (res && res.success && io) {
      io.emit('products-updated');
    }
    return res;
  });
  ipcMain.handle('delete-product', (_, id, userName) => {
    const res = deleteProduct(id, userName);
    if (res && res.success && io) {
      io.emit('products-updated');
    }
    return res;
  });
  ipcMain.handle('toggle-product-stop', (_, { id, isStopped }) => {
    const res = toggleProductStop(id, isStopped);
    if (res && res.success && io) {
      io.emit('products-updated');
    }
    return res;
  });
  ipcMain.handle('set-product-stop-with-limit', (_, data) => {
    const res = setProductStopWithLimit(data);
    if (res && res.success && io) {
      io.emit('products-updated');
    }
    return res;
  });
  ipcMain.handle('search-product', (_, query) => searchProduct(query));
  ipcMain.handle('get-inventory-logs', (_, opts) => getInventoryLogs(opts));
  ipcMain.handle('upload-product-image', async (_, { buffer, base64, ext = '.jpg' }) => {
    try {
      const dir = ensureImagesDir();
      const cleanExt = ext.startsWith('.') ? ext : `.${ext}`;
      const fileName = `prod_${Date.now()}${cleanExt}`;
      const filePath = path.join(dir, fileName);
      let buf;
      if (buffer) {
        buf = Buffer.from(buffer);
      } else if (base64) {
        const cleanBase64 = base64.replace(/^data:image\/\w+;base64,/, '');
        buf = Buffer.from(cleanBase64, 'base64');
      } else {
        return { success: false, error: 'Rasm ma\'lumoti topilmadi' };
      }
      fs.writeFileSync(filePath, buf);
      return { success: true, fileName };
    } catch (err) {
      console.error('Failed to save product image via IPC:', err);
      return { success: false, error: err.message };
    }
  });
  ipcMain.handle('delete-product-image', async (_, fileName) => {
    deleteProductImageFile(fileName);
    return { success: true };
  });

  // Helper: safely register an IPC handler — removes old one first to survive HMR reloads
  const safeHandle = (channel, fn) => {
    ipcMain.removeHandler(channel);
    ipcMain.handle(channel, fn);
  };

  // ── Inventory Audits (Reviziya) ─────────────────────────────────────────────
  safeHandle('get-inventory-audit-prepare', () => getInventoryAuditPrepare());
  safeHandle('complete-inventory-audit', (_, payload) => {
    const res = completeInventoryAudit(payload);
    if (res && res.success) {
      if (io) io.emit('products-updated');
      if (mainWindow && mainWindow.webContents) {
        mainWindow.webContents.send('products-updated');
      }
    }
    return res;
  });
  safeHandle('get-inventory-audits', () => getInventoryAudits());
  safeHandle('get-inventory-audit-details', (_, id) => getInventoryAuditDetails(id));

  // ── Customers & Debts ──────────────────────────────────────────────────────
  safeHandle('get-customers',             () => getCustomers());
  safeHandle('get-recent-sales',          () => getRecentSales());
  safeHandle('process-full-return',       (_, saleId) => processFullReturn(saleId));
  safeHandle('process-return',            (_, { saleItemId, returnQty }) => processReturn(saleItemId, returnQty));
  safeHandle('pay-debt',                  (_, { customerId, amount, cashierName }) => {
    const result = payDebt(customerId, amount, cashierName);
    if (result && result.success && io) {
      io.emit('debts-updated', result);
    }
    return result;
  });
  safeHandle('add-manual-debt',           (_, payload) => {
    const result = addManualDebt(payload);
    if (result && result.success && io) {
      io.emit('debts-updated', result);
    }
    return result;
  });
  safeHandle('get-customer-debt-details', (_, customerId) => getCustomerDebtDetails(customerId));
  safeHandle('delete-customer',           (_, { customerId, cashierName }) => deleteCustomer(customerId, cashierName));

  // ── Sales ──────────────────────────────────────────────────────────────────
  safeHandle('process-sale', (_, { cartItems, paymentMethod, customerInfo, cashierName, discountPercent, device, comment }) => {
    const result = processSale(cartItems, paymentMethod, customerInfo, cashierName, discountPercent, device || 'desktop', null, comment || '');
    if (result && result.success && io) {
      io.emit('sales-updated', result);
    }
    return result;
  });

  // ── Reports ────────────────────────────────────────────────────────────────
  safeHandle('get-reports',        (_, dates) => getReports(dates.start, dates.end));
  safeHandle('get-waiters-report', (_, opts) => getWaitersReport(opts.start, opts.end, opts.waiterId, opts.period));
  safeHandle('get-sales-for-excel',(_, {start, end}) => getSalesForExcel(start, end));
  safeHandle('get-low-stock',      (_, limit) => getLowStockProducts(limit ?? 3));
  safeHandle('clear-test-data',    () => clearTestData());
  safeHandle('clear-warehouse',    () => clearWarehouse());
  safeHandle('reset-factory-data', () => resetFactoryData());
  safeHandle('add-expense',        (_, data) => addExpense(data.reason, data.amount, data.cashier_name));
  safeHandle('delete-expense',     (_, id, userName) => deleteExpense(id, userName));

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
        try {
          await sendTelegramBackup();
        } catch (err) {}
      });
    }
    return result;
  });

  // ── History (paginated) ────────────────────────────────────────────────────
  safeHandle('get-all-sales-history', (_, opts) => getAllSalesHistory(opts ?? {}));
  safeHandle('optimize-database',     () => optimizeDatabase());
  safeHandle('auto-backup-db',        () => autoBackupDB());
  safeHandle('send-telegram-backup', (evt, opts) => sendTelegramBackup(opts));
  safeHandle('get-telegram-chat-id', (evt, token) => getTelegramChatIdFromUpdates(token));
  safeHandle('send-attendance-test-message', (evt, opts) => sendAttendanceTestMessage(opts));

  // ── AutoUpdater Handlers ───────────────────────────────────────────────────
  safeHandle('get-app-version', () => app.getVersion());
  safeHandle('check-update', async () => {
    try {
      if (!app.isPackaged) {
        // In dev mode, emit update-not-available immediately so UI doesn't spin endlessly
        sendUpdateStatus('update-not-available');
        return { success: true, updateInfo: null };
      }
      const result = await autoUpdater.checkForUpdates();
      if (!result || !result.updateInfo) {
        sendUpdateStatus('update-not-available');
      }
      return { success: true, updateInfo: result ? result.updateInfo : null };
    } catch (err) {
      sendUpdateStatus('update-not-available');
      return { success: false, error: err.message };
    }
  });
  safeHandle('start-download', async () => {
    try {
      await autoUpdater.downloadUpdate();
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });
  safeHandle('install-update', () => {
    try {
      autoUpdater.quitAndInstall(false, true);
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  safeHandle('export-sale-excel', async (_, saleDetails) => {
    try {
      const settingsRes = getSettings();
      const settings = (settingsRes && settingsRes.success) ? settingsRes.data : {};
      const magazin_nomi = settings.store_name || settings.magazin_nomi || 'Tashkilot';
      const phones = [settings.phone_1, settings.phone_2, settings.phone_3].filter(p => p && p.trim() !== '');
      const magazin_tel = phones.length > 0 ? phones.join(', ') : 'Kiritilmagan';
      const shopInfo = { magazin_nomi, magazin_tel };

      // Query customer info dynamically if customer_id is present
      const customerId = saleDetails.customer_id || saleDetails.customerId;
      if (customerId) {
        const custRes = getCustomer(customerId);
        if (custRes && custRes.success && custRes.data) {
          saleDetails.customerName = custRes.data.name;
          saleDetails.customerPhone = custRes.data.phone;
          saleDetails.customerTotalDebt = custRes.data.total_debt;
        }
      }

      const { filePath } = await dialog.showSaveDialog(mainWindow, {
        title: 'Naxladnoyni saqlash',
        defaultPath: `Nakladnoy_${saleDetails.shiftReceiptNumber || saleDetails.id || ''}.xlsx`,
        filters: [{ name: 'Excel Files', extensions: ['xlsx'] }]
      });

      if (!filePath) {
        return { success: false, error: 'File save cancelled' };
      }

      await generateExcelInvoice(shopInfo, saleDetails, filePath);
      return { success: true, filePath };
    } catch (err) {
      console.error('Error exporting sale to excel:', err);
      return { success: false, error: err.message };
    }
  });

  safeHandle('print-a4-invoice', async (_, saleDetails) => {
    try {
      const settingsRes = getSettings();
      const settings = (settingsRes && settingsRes.success) ? settingsRes.data : {};
      const magazin_nomi = settings.store_name || settings.magazin_nomi || 'Tashkilot';
      const phones = [settings.phone_1, settings.phone_2, settings.phone_3].filter(p => p && p.trim() !== '');
      const magazin_tel = phones.length > 0 ? phones.join(', ') : 'Kiritilmagan';
      const shopInfo = { magazin_nomi, magazin_tel };

      // Query customer info dynamically if customer_id is present
      const customerId = saleDetails.customer_id || saleDetails.customerId;
      if (customerId) {
        const custRes = getCustomer(customerId);
        if (custRes && custRes.success && custRes.data) {
          saleDetails.customerName = custRes.data.name;
          saleDetails.customerPhone = custRes.data.phone;
          saleDetails.customerTotalDebt = custRes.data.total_debt;
        }
      }

      const html = generateA4InvoiceHTML(shopInfo, saleDetails);
      
      let printWindow = new BrowserWindow({
        show: false,
        webPreferences: { nodeIntegration: false }
      });

      printWindow.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));

      return new Promise((resolve) => {
        printWindow.webContents.on('did-finish-load', () => {
          printWindow.webContents.print({
            silent: false,
            printBackground: true,
            deviceName: ''
          }, (success, errorType) => {
            printWindow.close();
            if (success) {
              resolve({ success: true });
            } else {
              resolve({ success: false, error: errorType });
            }
          });
        });
      });
    } catch (err) {
      console.error('Error printing A4 invoice:', err);
      return { success: false, error: err.message };
    }
  });

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
              font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif, monospace !important;
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
  ipcMain.handle('sync-usd-rate', () => syncUsdRate());
  ipcMain.handle('check-base-loaded', () => checkBaseLoaded());
  ipcMain.handle('load-initial-base', (_, type) => loadInitialBase(type));
  
  ipcMain.handle('get-cashiers', () => getCashiers());
  ipcMain.handle('add-cashier', (_, { name, pin, role, salary, percentage }) => addCashier(name, pin, role, salary, percentage));
  ipcMain.handle('delete-cashier', (_, id) => deleteCashier(id));
  ipcMain.handle('update-cashier-pin', (_, { id, newPin }) => updateCashierPin(id, newPin));
  ipcMain.handle('get-attendance', (_, date) => getAttendanceList(date));
  ipcMain.handle('save-attendance', (_, { employeeId, employeeType, date, status }) => saveAttendance(employeeId, employeeType, date, status));
  ipcMain.handle('get-attendance-report', (_, params) => getAttendanceReport(params?.startDate, params?.endDate));
  ipcMain.handle('save-manual-attendance', (_, data) => saveManualAttendance(data));
  ipcMain.handle('delete-attendance-record', (_, id) => deleteAttendanceRecord(id));
  ipcMain.handle('write-off-product', (_, data) => {
    const res = writeOffProduct(data);
    if (res && res.success && io) {
      io.emit('sales-updated');
    }
    return res;
  });
  ipcMain.handle('get-write-offs', (_, params) => getWriteOffs(params?.startDate, params?.endDate));
  ipcMain.handle('get-suppliers', () => getSuppliers());
  ipcMain.handle('add-supplier', (_, data) => addSupplier(data));
  ipcMain.handle('update-supplier', (_, data) => updateSupplier(data));
  ipcMain.handle('delete-supplier', (_, id) => deleteSupplier(id));
  ipcMain.handle('add-supplier-invoice', (_, data) => {
    const res = addSupplierInvoice(data);
    if (res && res.success && io) {
      io.emit('sales-updated');
    }
    return res;
  });
  ipcMain.handle('get-supplier-invoices', (_, params) => getSupplierInvoices(params?.supplierId, params?.startDate, params?.endDate));
  ipcMain.handle('pay-supplier-debt', (_, data) => {
    const res = paySupplierDebt(data);
    if (res && res.success && io) {
      io.emit('sales-updated');
    }
    return res;
  });
  ipcMain.handle('update-cashier', (_, { id, name, pin, role, salary, percentage }) => updateCashier(id, name, pin, role, salary, percentage));
  ipcMain.handle('update-waiter', (_, { id, name, pinCode, percentage, salary }) => updateWaiter(id, name, pinCode, percentage, salary));

  // ── Restaurant IPC Handlers ────────────────────────────────────────────────
  ipcMain.handle('get-restaurant-tables', () => getRestaurantTables());
  ipcMain.handle('get-active-order-for-table', (_, tableId) => getActiveOrderForTable(tableId));
  ipcMain.handle('save-restaurant-order', (_, tableId, waiterId, items) => {
    const res = saveRestaurantOrder(tableId, waiterId, items);
    if (res && res.success) {
      if (io) {
        io.emit('kitchen-updated');
        io.emit('sales-updated');
      }
      if (mainWindow && mainWindow.webContents) {
        mainWindow.webContents.send('kitchen-updated');
        mainWindow.webContents.send('sales-updated');
      }
    }
    return res;
  });
  ipcMain.handle('close-restaurant-order', (_, { tableId, cashierName, paymentMethod, customerInfo, discountPercent, comment, serviceFeePercent, serviceFeeAmount, isTakeaway }) => {
    const res = closeRestaurantOrder(tableId, cashierName, paymentMethod, customerInfo, discountPercent, comment, serviceFeePercent, serviceFeeAmount, isTakeaway);
    if (res && res.success) {
      if (io) {
        io.emit('kitchen-updated');
        io.emit('sales-updated');
      }
      if (mainWindow && mainWindow.webContents) {
        mainWindow.webContents.send('kitchen-updated');
        mainWindow.webContents.send('sales-updated');
      }
    }
    return res;
  });
  ipcMain.handle('close-restaurant-order-only', (_, tableId) => {
    const res = closeRestaurantOrderOnly(tableId);
    if (res && res.success) {
      if (io) {
        io.emit('kitchen-updated');
        io.emit('sales-updated');
      }
      if (mainWindow && mainWindow.webContents) {
        mainWindow.webContents.send('kitchen-updated');
        mainWindow.webContents.send('sales-updated');
      }
    }
    return res;
  });
  ipcMain.handle('get-waiters', () => getWaiters());
  ipcMain.handle('add-waiter', (_, { name, pinCode, percentage, salary }) => addWaiter(name, pinCode, percentage, salary));
  ipcMain.handle('delete-waiter', (_, id) => deleteWaiter(id));
  ipcMain.handle('transfer-restaurant-table', (_, { fromTableId, toTableId }) => {
    const res = transferRestaurantTable(fromTableId, toTableId);
    if (res && res.success && io) {
      io.emit('sales-updated');
      io.emit('kitchen-updated');
    }
    return res;
  });
  ipcMain.handle('transfer-restaurant-order-waiter', (_, { tableId, targetWaiterId }) => {
    const res = transferRestaurantOrderWaiter(tableId, targetWaiterId);
    if (res && res.success && io) {
      io.emit('sales-updated');
      io.emit('kitchen-updated');
    }
    return res;
  });
  ipcMain.handle('cancel-restaurant-order', (_, { tableId, cancelledBy }) => {
    const res = cancelRestaurantOrder(tableId, cancelledBy);
    if (res && res.success) {
      if (io) {
        io.emit('kitchen-updated');
        io.emit('sales-updated');
      }
      if (mainWindow && mainWindow.webContents) {
        mainWindow.webContents.send('kitchen-updated');
        mainWindow.webContents.send('sales-updated');
      }
    }
    return res;
  });
  ipcMain.handle('add-delivery-order', (_, { customerName, customerPhone, customerAddress, waiterId }) => addDeliveryOrder(customerName, customerPhone, customerAddress, waiterId));
  ipcMain.handle('add-restaurant-table', (_, { name, zone }) => {
    const res = addRestaurantTable(name, zone);
    if (res && res.success && io) {
      io.emit('sales-updated');
    }
    return res;
  });
  ipcMain.handle('delete-restaurant-table', (_, tableId) => {
    const res = deleteRestaurantTable(tableId);
    if (res && res.success && io) {
      io.emit('sales-updated');
    }
    return res;
  });
  ipcMain.handle('get-restaurant-zones', () => getRestaurantZones());
  ipcMain.handle('add-restaurant-zone', (_, name) => {
    const res = addRestaurantZone(name);
    if (res && res.success && io) {
      io.emit('sales-updated');
    }
    return res;
  });
  ipcMain.handle('delete-restaurant-zone', (_, name) => {
    const res = deleteRestaurantZone(name);
    if (res && res.success && io) {
      io.emit('sales-updated');
    }
    return res;
  });
  ipcMain.handle('save-product-recipe', (_, productId, ingredients) => saveProductRecipe(productId, ingredients));
  ipcMain.handle('get-product-recipe', (_, productId) => getProductRecipe(productId));
  ipcMain.handle('produce-semi-finished', (_, productId, quantity, userName) => produceSemiFinished(productId, quantity, userName));
  ipcMain.handle('get-sub-warehouses', () => getSubWarehouses());
  ipcMain.handle('add-sub-warehouse', (_, name, note) => addSubWarehouse(name, note));
  ipcMain.handle('create-stock-transfer', (_, data) => createStockTransfer(data));
  ipcMain.handle('get-stock-transfers', (_, params) => getStockTransfers(params));
  ipcMain.handle('get-director-stats', (_, period) => getDirectorDashboardStats(period));
  ipcMain.handle('lock-table', (_, tableId, userName) => lockTable(tableId, userName));
  ipcMain.handle('unlock-table', (_, tableId, userName) => unlockTable(tableId, userName));
  ipcMain.handle('set-table-pre-printed', (_, tableId, isPrinted) => setTablePrePrinted(tableId, isPrinted));
  ipcMain.handle('get-kitchen-orders', () => getKitchenOrders());
  ipcMain.handle('set-order-status', (_, { orderId, status }) => {
    const res = setOrderStatus(orderId, status);
    if (res && res.success) {
      if (io) {
        io.emit('kitchen-updated', { orderId, status });
        io.emit('sales-updated');
      }
      if (mainWindow && mainWindow.webContents) {
        mainWindow.webContents.send('kitchen-updated', { orderId, status });
        mainWindow.webContents.send('sales-updated');
      }
    }
    return res;
  });
  ipcMain.handle('set-order-status-by-table', (_, { tableId, status }) => {
    const res = setOrderStatusByTable(tableId, status);
    if (res && res.success) {
      if (io) {
        io.emit('kitchen-updated', { tableId, status });
        io.emit('sales-updated');
      }
      if (mainWindow && mainWindow.webContents) {
        mainWindow.webContents.send('kitchen-updated', { tableId, status });
        mainWindow.webContents.send('sales-updated');
      }
    }
    return res;
  });
  ipcMain.handle('get-tv-orders', () => getTvOrders());

  // ── Application Activation ──────────────────────────────────────────────────
  ipcMain.handle('get-machine-id', () => getMachineId());
  ipcMain.handle('get-activation', () => getActivation());
  ipcMain.handle('save-activation', (_, fingerprint) => saveActivation(fingerprint));
  ipcMain.handle('clear-activation', () => clearActivation());

  // ── Ngrok / Remote Access ─────────────────────────────────────────────────
  // Returns the port our Express server listens on
  safeHandle('get-express-port', () => EXPRESS_PORT);

  // Returns the last known public ngrok URL (empty string if not yet started)
  safeHandle('get-ngrok-url', () => currentNgrokUrl);

  // Called by Settings page "Saqlash va Ulashtirish" button.
  // Saves token+domain to DB, then launches / restarts the tunnel.
  safeHandle('save-ngrok-settings', async (_, { token, domain }) => {
    try {
      if (!token || !domain) {
        return { success: false, error: 'Token yoki domain kiritilmagan' };
      }
      // Persist credentials so tunnel auto-starts on next app launch
      updateSetting('ngrok_token',  token.trim());
      updateSetting('ngrok_domain', domain.trim());

      // Non-blocking launch — result arrives via IPC events
      startNgrokAutomation(token.trim(), domain.trim());
      return { success: true };
    } catch (err) {
      logError(`[Ngrok IPC] save-ngrok-settings error: ${err.message}`);
      return { success: false, error: err.message };
    }
  });

  // ── Auto-start Ngrok if credentials already saved ─────────────────────────
  try {
    const savedSettings = getSettings();
    if (savedSettings && savedSettings.success && savedSettings.data) {
      const { ngrok_token, ngrok_domain } = savedSettings.data;
      if (ngrok_token && ngrok_domain) {
        logError('[Ngrok] Auto-starting tunnel from saved settings...');
        // Delay slightly so the renderer has time to subscribe to IPC events
        setTimeout(() => startNgrokAutomation(ngrok_token, ngrok_domain), 3000);
      }
    }
  } catch (autoStartErr) {
    logError(`[Ngrok] Auto-start failed: ${autoStartErr.message}`);
  }

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
  
  logError("App successfully loaded and window created.");
  } catch (err) {
    logError(`Critical error during app startup: ${err.stack || err}`);
  }
}); // End of app.whenReady
} // End of else (!gotTheLock)

app.on('window-all-closed', () => {
  // Kill ngrok before exiting so it doesn't linger in the background
  if (ngrokProcess) {
    try { exec('taskkill /f /im ngrok.exe'); } catch (_) {}
    ngrokProcess = null;
  }
  if (process.platform !== 'darwin') app.quit();
});
