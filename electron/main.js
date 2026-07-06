const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { exec, execSync } = require('child_process');

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
  processSale, getRecentSales, processFullReturn, processReturn, payDebt, getReports, getSaleForReprint,
  getLowStockProducts, clearTestData, resetFactoryData, getCustomerDebtDetails, getAllSalesHistory, getSalesForExcel,
  verifyPin, getSettings, updateSetting, checkBaseLoaded, loadInitialBase, clearWarehouse,
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
  addProductGroup,
  projectYield,
  getOrCreateProductGroup,
  getAttendanceList,
  saveAttendance,
  updateCashier,
  updateWaiter,
  getRestaurantZones,
  addRestaurantZone,
  deleteRestaurantZone
} = require('./database');

const { generateA4InvoiceHTML, generateExcelInvoice } = require('./excelA4Helper');

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
function startExpressServer() {
  try {
    const express = require('express');
    const expressApp = express();
    
    expressApp.use(express.json({ limit: '50mb' }));
    expressApp.use(express.urlencoded({ limit: '50mb', extended: true }));
    
    // CORS middleware
    const cors = require('cors');
    expressApp.use(cors({ origin: '*' }));
    
    // Helper to check if request is coming through a public tunnel (like ngrok)
    const isPublicTunnelRequest = (req) => {
      const host = req.headers['host'] || '';
      return host.includes('ngrok');
    };

    // For ngrok/external access to /mobile, allow the page to load (owner can see cashier login)
    // Waiter API endpoints are still individually blocked by waiterAuthMiddleware
    expressApp.use('/mobile', (req, res, next) => {
      // Only block if trying to access waiter API directly (not page load)
      // The page itself handles the redirect to cashier login via JS hostname detection
      next();
    });


    // Static assets distribution for both desktop and mobile
    expressApp.use('/mobile', express.static(path.join(__dirname, '../dist-mobile')));
    expressApp.use(express.static(path.join(__dirname, '../dist')));
    
    // Auth Middleware for API endpoints
    const authMiddleware = (req, res, next) => {
      const pin = req.headers['authorization'];
      if (!pin) {
        return res.status(401).json({ success: false, error: 'Authorization required' });
      }
      
      const trimmedPin = pin.trim();
      
      const pinRes = verifyPin(trimmedPin);
      if (pinRes && pinRes.success && pinRes.valid) {
        req.cashier = pinRes.cashier;
        return next();
      }
      
      // Master PIN override (only if no cashier matches) - ALLOWED for mobile/Express
      if (trimmedPin === 'xxMpos7532.') {
        req.cashier = { id: 0, name: 'Asosiy Admin', pin: 'xxMpos7532.', role: 'admin' };
        return next();
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
      const trimmedPin = pin.trim();
      const result = waiterLogin(trimmedPin);
      if (result && result.success) {
        req.waiter = result;
        return next();
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

    // API: Waiter Login
    expressApp.post('/api/auth/waiter-login', (req, res) => {
      if (isPublicTunnelRequest(req)) {
        return res.status(403).json({ success: false, error: 'Ofitsiantlar faqat kafedagi WiFi orqali ulanishi mumkin (tashqi tarmoq taqiqlangan)' });
      }

      const { pin_code } = req.body;
      if (!pin_code) {
        return res.status(400).json({ success: false, error: 'PIN code is required' });
      }
      const trimmedPin = String(pin_code).trim();
      const result = waiterLogin(trimmedPin);
      if (result && result.success) {
        return res.json({
          success: true,
          waiter_id: result.waiter_id,
          waiter_o_id: result.waiter_id,
          name: result.name,
          role: result.role
        });
      } else {
        return res.status(401).json({ success: false, error: 'Noto\'g\'ri PIN-kod! Qayta urinib ko\'ring.' });
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
        
        // Notify desktop via Socket.io if initialized
        if (io) {
          io.emit('sales-updated'); // trigger desktop refresh
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

    // API: Login
    expressApp.post('/api/login', (req, res) => {
      const { pin } = req.body;
      if (!pin) {
        return res.status(400).json({ success: false, error: 'PIN is required' });
      }
      
      const trimmedPin = String(pin).trim();
      
      const result = verifyPin(trimmedPin);
      if (result && result.success && result.valid) {
        maybeOpenShift(result.cashier.name);
        return res.json({ success: true, cashier: result.cashier });
      } else if (trimmedPin === 'xxMpos7532.') {
        maybeOpenShift('Asosiy Admin');
        return res.json({
          success: true,
          cashier: { id: 0, name: 'Asosiy Admin', pin: 'xxMpos7532.', role: 'admin' }
        });
      } else {
        return res.status(401).json({ success: false, error: 'Invalid PIN' });
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
      const { name, barcode, buy_price, sell_price, stock, unit, discount } = req.body;
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
      const { id, name, barcode, buy_price, sell_price, stock, unit, discount } = req.body;
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
        const storeName = settings.storeName || '750 AVTOTUNING';
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

    // IPC Forwarding route for Client-Server mode
    expressApp.post('/api/ipc-forward', async (req, res) => {
      try {
        const clientToken = req.headers['x-pos-client-token'];
        if (clientToken !== 'xxmpos-secure-token-123') {
          return res.status(401).json({ success: false, error: 'Unauthorized desktop client request' });
        }
        const { channel, args = [] } = req.body;
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

    // Helper to detect mobile user agent
    const isMobileRequest = (req) => {
      const ua = req.headers['user-agent'] || '';
      return /Mobi|Android|iPhone|iPad|iPod|Windows Phone/i.test(ua);
    };

    // Serve index.html for mobile or desktop SPA routing nicely
    expressApp.get(/^\/mobile(\/.*)?$/, (req, res) => {
      res.sendFile(path.join(__dirname, '../dist-mobile/index.html'));
    });
    expressApp.get(/.*/, (req, res) => {
      try {
        const settingsRes = getSettings();
        const isRetail = settingsRes && settingsRes.success && settingsRes.data && settingsRes.data.business_type === 'retail';
        if (!isRetail && isMobileRequest(req)) {
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

    try {
      const { Server } = require('socket.io');
      io = new Server(server, {
        cors: {
          origin: '*',
          methods: ['GET', 'POST']
        }
      });
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
  ipcMain.handle('generate-unique-local-barcode', () => generateUniqueLocalBarcode());
  ipcMain.handle('batch-add-products', (_, payload) => {
    const res = batchAddProducts(payload);
    if (res && res.success && io) {
      io.emit('products-updated');
    }
    return res;
  });

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
  safeHandle('pay-debt',                  (_, { customerId, amount, cashierName }) => {
    const result = payDebt(customerId, amount, cashierName);
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
  safeHandle('get-waiters-report', (_, opts) => getWaitersReport(opts.start, opts.end, opts.waiterId));
  safeHandle('get-sales-for-excel',(_, {start, end}) => getSalesForExcel(start, end));
  safeHandle('get-low-stock',      (_, limit) => getLowStockProducts(limit ?? 3));
  safeHandle('clear-test-data',    () => clearTestData());
  safeHandle('clear-warehouse',    () => clearWarehouse());
  safeHandle('reset-factory-data', () => resetFactoryData());
  safeHandle('add-expense',        (_, data) => addExpense(data.reason, data.amount, data.cashier_name));
  safeHandle('delete-expense',     (_, id) => deleteExpense(id));

  // ── Network / Terminal Mode ──────────────────────────────────────────────
  safeHandle('get-local-ip', () => {
    const os = require('os');
    const ifaces = os.networkInterfaces();
    for (const name of Object.keys(ifaces)) {
      for (const iface of ifaces[name]) {
        if (iface.family === 'IPv4' && !iface.internal) {
          return { success: true, ip: iface.address };
        }
      }
    }
    return { success: false, ip: null };
  });
  safeHandle('get-terminal-mode', () => {
    try {
      const row = db.prepare("SELECT value FROM settings WHERE key = 'terminal_mode'").get();
      return { success: true, enabled: row && row.value === '1' };
    } catch (e) { return { success: false, enabled: false }; }
  });
  safeHandle('set-terminal-mode', (_, enabled) => {
    try {
      db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('terminal_mode', ?)").run(enabled ? '1' : '0');
      return { success: true };
    } catch (e) { return { success: false }; }
  });

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
  ipcMain.handle('add-cashier', (_, { name, pin, role, salary }) => addCashier(name, pin, role, salary));
  ipcMain.handle('delete-cashier', (_, id) => deleteCashier(id));
  ipcMain.handle('update-cashier-pin', (_, { id, newPin }) => updateCashierPin(id, newPin));
  ipcMain.handle('get-attendance', (_, date) => getAttendanceList(date));
  ipcMain.handle('save-attendance', (_, { employeeId, employeeType, date, status }) => saveAttendance(employeeId, employeeType, date, status));
  ipcMain.handle('update-cashier', (_, { id, name, pin, role, salary }) => updateCashier(id, name, pin, role, salary));
  ipcMain.handle('update-waiter', (_, { id, name, pinCode, percentage, salary }) => updateWaiter(id, name, pinCode, percentage, salary));

  // ── Restaurant IPC Handlers ────────────────────────────────────────────────
  ipcMain.handle('get-restaurant-tables', () => getRestaurantTables());
  ipcMain.handle('get-active-order-for-table', (_, tableId) => getActiveOrderForTable(tableId));
  ipcMain.handle('save-restaurant-order', (_, tableId, waiterId, items) => saveRestaurantOrder(tableId, waiterId, items));
  ipcMain.handle('close-restaurant-order', (_, { tableId, cashierName, paymentMethod, customerInfo, discountPercent, comment }) => closeRestaurantOrder(tableId, cashierName, paymentMethod, customerInfo, discountPercent, comment));
  ipcMain.handle('close-restaurant-order-only', (_, tableId) => closeRestaurantOrderOnly(tableId));
  ipcMain.handle('get-waiters', () => getWaiters());
  ipcMain.handle('add-waiter', (_, { name, pinCode, percentage, salary }) => addWaiter(name, pinCode, percentage, salary));
  ipcMain.handle('delete-waiter', (_, id) => deleteWaiter(id));
  ipcMain.handle('transfer-restaurant-table', (_, { fromTableId, toTableId }) => transferRestaurantTable(fromTableId, toTableId));
  ipcMain.handle('transfer-restaurant-order-waiter', (_, { tableId, targetWaiterId }) => transferRestaurantOrderWaiter(tableId, targetWaiterId));
  ipcMain.handle('cancel-restaurant-order', (_, { tableId, cancelledBy }) => cancelRestaurantOrder(tableId, cancelledBy));
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
  ipcMain.handle('lock-table', (_, tableId, userName) => lockTable(tableId, userName));
  ipcMain.handle('unlock-table', (_, tableId, userName) => unlockTable(tableId, userName));
  ipcMain.handle('set-table-pre-printed', (_, tableId, isPrinted) => setTablePrePrinted(tableId, isPrinted));

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
