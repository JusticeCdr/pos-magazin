const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { exec, execSync } = require('child_process');

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
  clearActivation,
  getTodayStats,
  getProductsPaginated,
  getCustomersWithDebts,
  findLocalBarcodeByName,
  generateUniqueLocalBarcode,
  batchAddProducts
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

// ── Express.js server & Socket.io ─────────────────────────────────────────────
function startExpressServer() {
  try {
    const express = require('express');
    const expressApp = express();
    
    expressApp.use(express.json({ limit: '50mb' }));
    expressApp.use(express.urlencoded({ limit: '50mb', extended: true }));
    
    // CORS middleware
    expressApp.use((req, res, next) => {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
      }
      next();
    });
    
    // Static assets distribution
    const staticPath = path.join(__dirname, '../dist-mobile');
    expressApp.use(express.static(staticPath));
    
    // Auth Middleware for API endpoints
    const authMiddleware = (req, res, next) => {
      const pin = req.headers['authorization'];
      if (!pin) {
        return res.status(401).json({ success: false, error: 'Authorization required' });
      }
      
      const trimmedPin = pin.trim();
      
      // Master PIN override
      if (trimmedPin === '7532') {
        req.cashier = { id: 0, name: 'Asosiy Admin', pin: '7532' };
        return next();
      }
      
      const pinRes = verifyPin(trimmedPin);
      if (pinRes && pinRes.success && pinRes.valid) {
        req.cashier = pinRes.cashier;
        return next();
      }
      
      return res.status(401).json({ success: false, error: 'Invalid PIN' });
    };
    
    // API: Login
    expressApp.post('/api/login', (req, res) => {
      const { pin } = req.body;
      if (!pin) {
        return res.status(400).json({ success: false, error: 'PIN is required' });
      }
      
      const trimmedPin = String(pin).trim();
      if (trimmedPin === '7532') {
        maybeOpenShift('Asosiy Admin');
        return res.json({ success: true, cashier: { id: 0, name: 'Asosiy Admin' } });
      }
      
      const result = verifyPin(trimmedPin);
      if (result && result.success && result.valid) {
        maybeOpenShift(result.cashier.name);
        return res.json({ success: true, cashier: result.cashier });
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
        userName: req.cashier.name
      };
      
      const result = addProduct(productData);
      if (result.success) {
        return res.json(result);
      } else {
        return res.status(500).json(result);
      }
    });

    // API: Batch Add/Update products
    expressApp.post('/api/products/batch-add', authMiddleware, (req, res) => {
      const { products } = req.body;
      if (!products || !Array.isArray(products)) {
        return res.status(400).json({ success: false, error: 'Products array is required' });
      }
      
      const preparedProducts = products.map(p => ({
        name: p.name,
        barcode: p.barcode ? String(p.barcode).trim() : '',
        buy_price: parseFloat(p.buy_price) || 0,
        sell_price: parseFloat(p.sell_price) || 0,
        stock: parseFloat(p.stock) || 0,
        unit: p.unit || 'dona',
        discount: parseFloat(p.discount) || 0,
        userName: req.cashier.name
      }));
      
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
      const { cartItems, paymentMethod, customerInfo, discountPercent } = req.body;
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
          cashierName
        };
        
        if (mainWindow) {
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
          cashierName: sale.cashier_name || 'Kassir'
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
      try {
        const settingsRes = getSettings();
        if (settingsRes && settingsRes.success && settingsRes.data) {
          apiKey = settingsRes.data.gemini_api_key || '';
        }
      } catch (err) {
        logError(`[AI Parse] Failed to get api key from settings: ${err.message}`);
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

      const systemPrompt = "Ты — ИИ-модуль ERP системы. Проанализируй это фото. Если на фото НЕ изображена товарная накладная, счет-фактура, список товаров или товарный чек (чек покупки), то верни JSON-объект ошибки: {\"error\": \"not_an_invoice\", \"message\": \"Yuklangan rasm yuk xati, nakladnoy yoki xarid cheki emas. Iltimos, to'g'ri rasm yuklang.\"} и больше ничего. Если это накладная, список или чек, найди все товары, их количество (quantity) и цену закупки (income_price). Для каждого товара найди штрих-код (barcode): если его нет на бумаге, используй инструмент google_search, чтобы найти официальный штрих-код EAN-13 этого товара в интернете по его названию. Если штрих-код не найден нигде, оставь строку пустой \"\". Верни строго массив JSON объектов: [{\"name\": \"...\", \"quantity\": 10, \"income_price\": 5000, \"barcode\": \"...\"}] или JSON-объект ошибки без markdown-разметки.";

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

      let responseText = '';
      try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestBody)
        });

        const resData = await response.json();
        if (resData.candidates && resData.candidates[0] && resData.candidates[0].content && resData.candidates[0].content.parts[0]) {
          responseText = resData.candidates[0].content.parts[0].text;
        } else {
          throw new Error(resData.error?.message || JSON.stringify(resData));
        }
      } catch (err) {
        logError(`[AI Parse] Gemini with Search failed, retrying without Search: ${err.message}`);
        delete requestBody.tools;
        try {
          const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody)
          });
          const resData = await response.json();
          if (resData.candidates && resData.candidates[0] && resData.candidates[0].content && resData.candidates[0].content.parts[0]) {
            responseText = resData.candidates[0].content.parts[0].text;
          } else {
            throw new Error(resData.error?.message || JSON.stringify(resData));
          }
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
        userName: req.cashier.name
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
      const result = deleteProduct(id, req.cashier.name);
      if (result.success) {
        if (io) {
          io.emit('products-updated');
        }
        return res.json(result);
      } else {
        return res.status(500).json(result);
      }
    });
    
    // Serve index.html for any other route to handle SPA page refreshes nicely
    expressApp.get(/.*/, (req, res) => {
      res.sendFile(path.join(staticPath, 'index.html'));
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
        console.log(`🔌 [WS] Client connected: ${socket.id}`);
        socket.on('disconnect', () => {
          console.log(`🔌 [WS] Client disconnected: ${socket.id}`);
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
    try {
      logError("App is ready. Initializing...");
      initDB();
      startExpressServer();

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
  safeHandle('process-sale', (_, { cartItems, paymentMethod, customerInfo, cashierName, discountPercent, device }) => {
    const result = processSale(cartItems, paymentMethod, customerInfo, cashierName, discountPercent, device || 'desktop');
    if (result && result.success && io) {
      io.emit('sales-updated', result);
    }
    return result;
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
  ipcMain.handle('add-cashier', (_, { name, pin }) => addCashier(name, pin));
  ipcMain.handle('delete-cashier', (_, id) => deleteCashier(id));
  ipcMain.handle('update-cashier-pin', (_, { id, newPin }) => updateCashierPin(id, newPin));

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
