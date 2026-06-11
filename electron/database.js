// database.js — uses Node.js built-in SQLite (available in Node ≥ 22 / Electron ≥ 32)
// No native compilation needed — zero dependency on build tools.

const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const { app } = require('electron');
const fs = require('fs');

let db;

function initDB() {
  const dir = app.getPath('userData');
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const dbPath = path.join(dir, 'pos.db');
  db = new DatabaseSync(dbPath);

  // Unicode case-insensitive custom lowercase function
  db.function('my_lower', (str) => typeof str === 'string' ? str.toLowerCase() : str);

  // WAL mode for better concurrency and performance
  db.exec('PRAGMA journal_mode = WAL;');

  db.exec(`
    CREATE TABLE IF NOT EXISTS app_activation (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      hardware_fingerprint TEXT NOT NULL,
      activated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS products (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      name      TEXT    NOT NULL,
      barcode   TEXT    UNIQUE,
      buy_price REAL    DEFAULT 0,
      sell_price REAL   DEFAULT 0,
      stock     REAL    DEFAULT 0,
      unit      TEXT    DEFAULT 'dona'
    );
  `);

  // Add unit column to existing databases (idempotent)
  try { db.exec("ALTER TABLE products ADD COLUMN unit TEXT DEFAULT 'dona';"); } catch (_) {}
  try { db.exec("ALTER TABLE products ADD COLUMN cost_price REAL DEFAULT 0;"); } catch (_) {} // Себестоимость
  try { db.exec("ALTER TABLE sales ADD COLUMN cashier_name TEXT DEFAULT 'Kassir';"); } catch (_) {}
  try { db.exec("ALTER TABLE sales ADD COLUMN is_closed INTEGER DEFAULT 0;"); } catch (_) {}
  try { db.exec("ALTER TABLE sales ADD COLUMN status TEXT DEFAULT 'completed';"); } catch (_) {}
  try { db.exec("ALTER TABLE sales ADD COLUMN shift_receipt_number INTEGER DEFAULT 0;"); } catch (_) {}
  try { db.exec("ALTER TABLE shifts_history ADD COLUMN opened_by TEXT;"); } catch (_) {}
  try { db.exec("ALTER TABLE shifts_history ADD COLUMN closed_by TEXT;"); } catch (_) {}
  try { db.exec("ALTER TABLE shifts_history ADD COLUMN total_expenses REAL DEFAULT 0;"); } catch (_) {}
  try { db.exec("ALTER TABLE shifts_history ADD COLUMN opened_at DATETIME;"); } catch (_) {}
  try { db.exec("ALTER TABLE expenses ADD COLUMN is_closed INTEGER DEFAULT 0;"); } catch (_) {}
  try { db.exec("ALTER TABLE sale_items ADD COLUMN refunded_qty REAL DEFAULT 0;"); } catch (_) {}
  try { db.exec("ALTER TABLE sales ADD COLUMN original_total REAL DEFAULT 0;"); } catch (_) {}
  try { db.exec("ALTER TABLE sales ADD COLUMN discount_percent REAL DEFAULT 0;"); } catch (_) {}
  try { db.exec("ALTER TABLE sales ADD COLUMN discount_amount REAL DEFAULT 0;"); } catch (_) {}
  try { db.exec("ALTER TABLE products ADD COLUMN discount REAL DEFAULT 0;"); } catch (_) {}
  try { db.exec("ALTER TABLE sale_items ADD COLUMN discount_percent REAL DEFAULT 0;"); } catch (_) {}
  try { db.exec("ALTER TABLE sale_items ADD COLUMN discount_amount REAL DEFAULT 0;"); } catch (_) {}
  try { db.exec("ALTER TABLE sale_items ADD COLUMN product_name TEXT;"); } catch (_) {}
  try { db.exec("ALTER TABLE sale_items ADD COLUMN unit TEXT DEFAULT 'dona';"); } catch (_) {}
  try {
    db.exec(`
      UPDATE sale_items 
      SET product_name = COALESCE(
            (SELECT name FROM products WHERE products.id = sale_items.product_id),
            (SELECT product_name FROM inventory_logs WHERE inventory_logs.product_id = sale_items.product_id LIMIT 1)
          ),
          unit = COALESCE(
            (SELECT unit FROM products WHERE products.id = sale_items.product_id),
            'dona'
          )
      WHERE product_name IS NULL;
    `);
  } catch (_) {}

  db.exec(`
    CREATE TABLE IF NOT EXISTS debt_payments (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id  INTEGER NOT NULL,
      amount       REAL NOT NULL,
      created_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(customer_id) REFERENCES customers(id)
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS customers (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      name       TEXT    NOT NULL,
      phone      TEXT,
      total_debt REAL    DEFAULT 0
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS sales (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      total_amount   REAL    NOT NULL,
      payment_method TEXT    NOT NULL,
      customer_id    INTEGER,
      created_at     DATETIME DEFAULT CURRENT_TIMESTAMP,
      cashier_name   TEXT    DEFAULT 'Kassir',
      is_closed      INTEGER DEFAULT 0,
      status         TEXT    DEFAULT 'completed',
      shift_receipt_number INTEGER DEFAULT 0,
      original_total REAL    DEFAULT 0,
      discount_percent REAL  DEFAULT 0,
      discount_amount REAL   DEFAULT 0
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS sale_items (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      sale_id      INTEGER NOT NULL,
      product_id   INTEGER NOT NULL,
      qty          REAL    NOT NULL,
      price        REAL    NOT NULL,
      refunded_qty REAL    DEFAULT 0,
      discount_percent REAL DEFAULT 0,
      discount_amount REAL DEFAULT 0,
      product_name TEXT,
      unit         TEXT    DEFAULT 'dona',
      FOREIGN KEY(sale_id) REFERENCES sales(id)
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS shifts_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      closed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      total_sales REAL DEFAULT 0,
      cash_sales REAL DEFAULT 0,
      card_sales REAL DEFAULT 0,
      debt_sales REAL DEFAULT 0,
      receipts_count INTEGER DEFAULT 0
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS write_offs (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id       INTEGER NOT NULL,
      product_name     TEXT    NOT NULL,
      quantity         REAL    NOT NULL,
      reason           TEXT    DEFAULT 'Boshqa',
      total_loss_amount REAL   DEFAULT 0,
      created_at       DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(product_id) REFERENCES products(id)
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS inventory_logs (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id       INTEGER NOT NULL,
      product_name     TEXT    NOT NULL,
      action_type      TEXT    NOT NULL,  -- 'kirim' | 'sotuv' | 'vozvrat' | 'spisaniya'
      quantity_changed REAL    NOT NULL,  -- positive = in, negative = out
      balance_after    REAL    NOT NULL,  -- stock level after this operation
      user_name        TEXT    DEFAULT '',
      note             TEXT    DEFAULT '',
      created_at       DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);
  db.exec('CREATE INDEX IF NOT EXISTS idx_inv_logs_product ON inventory_logs(product_id);');
  db.exec('CREATE INDEX IF NOT EXISTS idx_inv_logs_created ON inventory_logs(created_at);');
  db.exec('CREATE INDEX IF NOT EXISTS idx_inv_logs_action  ON inventory_logs(action_type);');



  // ── Settings & Auth ────────────────────────────────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key   TEXT PRIMARY KEY,
      value TEXT
    );
  `);
  
  // Set default Store Name if not exists
  const storeNameExists = db.prepare("SELECT value FROM settings WHERE key = 'store_name'").get();
  if (!storeNameExists) {
    db.prepare("INSERT INTO settings (key, value) VALUES ('store_name', 'Mening Do''konim')").run();
  }

  // ── Customers ──────────────────────────────────────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS customers (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      name         TEXT    NOT NULL,
      phone        TEXT,
      total_debt   REAL    DEFAULT 0,
      created_at   DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS debt_payments (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id  INTEGER NOT NULL,
      amount       REAL    NOT NULL,
      created_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(customer_id) REFERENCES customers(id)
    );
  `);

  // ── Cashiers ───────────────────────────────────────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS cashiers (
      id   INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      pin  TEXT NOT NULL UNIQUE
    );
  `);

  // ── Expenses ───────────────────────────────────────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS expenses (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      reason       TEXT NOT NULL,
      amount       REAL NOT NULL,
      cashier_name TEXT,
      created_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
      is_closed    INTEGER DEFAULT 0
    );
  `);

  // Migration: add missing columns in expenses table if database was created earlier
  try {
    db.exec('ALTER TABLE expenses ADD COLUMN cashier_name TEXT');
  } catch (err) {
    // Column already exists, safe to ignore
  }
  try {
    db.exec('ALTER TABLE expenses ADD COLUMN is_closed INTEGER DEFAULT 0');
  } catch (err) {
    // Column already exists, safe to ignore
  }

  // Insert default cashiers if empty
  const cashierCount = db.prepare("SELECT COUNT(*) as count FROM cashiers").get().count;
  if (cashierCount === 0) {
    db.prepare("INSERT INTO cashiers (name, pin) VALUES ('Admin', '1111')").run();
    db.prepare("INSERT INTO cashiers (name, pin) VALUES ('Kassir', '2222')").run();
  }

  // ── Auto Cleanup Old Sales ──
  try {
    // Delete items of old sales (excluding debt sales to preserve ledger)
    db.exec(`
      DELETE FROM sale_items WHERE sale_id IN (
        SELECT id FROM sales 
        WHERE created_at < datetime('now', '-3 days') 
        AND payment_method != 'debt'
      );
    `);
    // Delete the old sales themselves
    db.exec(`
      DELETE FROM sales 
      WHERE created_at < datetime('now', '-3 days') 
      AND payment_method != 'debt';
    `);

    // Delete inventory logs older than 3 months (90 days)
    db.exec(`
      DELETE FROM inventory_logs 
      WHERE created_at < datetime('now', '-90 days');
    `);
  } catch (err) {
  }

  // ── Database Optimizations (Indexes) ───────────────────────────────────────
  db.exec('CREATE INDEX IF NOT EXISTS idx_products_name     ON products(name);');
  db.exec('CREATE INDEX IF NOT EXISTS idx_products_barcode  ON products(barcode);');
  db.exec('CREATE INDEX IF NOT EXISTS idx_sales_created_at  ON sales(created_at);');
  db.exec('CREATE INDEX IF NOT EXISTS idx_sales_is_closed   ON sales(is_closed);');
  db.exec('CREATE INDEX IF NOT EXISTS idx_sale_items_sale   ON sale_items(sale_id);');
  db.exec('CREATE INDEX IF NOT EXISTS idx_sale_items_prod   ON sale_items(product_id);');
  db.exec('CREATE INDEX IF NOT EXISTS idx_sales_cust_debt_created ON sales(customer_id, payment_method, created_at DESC);');
  db.exec('CREATE INDEX IF NOT EXISTS idx_sales_created_status ON sales(created_at, status);');
  db.exec('CREATE INDEX IF NOT EXISTS idx_products_valuation ON products(stock, buy_price, sell_price);');
  db.exec('CREATE INDEX IF NOT EXISTS idx_debt_payments_created ON debt_payments(created_at);');
  db.exec('CREATE INDEX IF NOT EXISTS idx_expenses_created ON expenses(created_at);');
  db.exec('CREATE INDEX IF NOT EXISTS idx_sales_is_closed_created ON sales(is_closed, created_at);');
  db.exec('CREATE INDEX IF NOT EXISTS idx_expenses_is_closed_created ON expenses(is_closed, created_at);');

}
function closeDB() {
  if (db) {
    db.close();
    db = null;
  }
}

// ── Settings ─────────────────────────────────────────────────────────────────
function getSettings() {
  try {
    const rows = db.prepare("SELECT * FROM settings").all();
    const settings = {};
    for (const row of rows) settings[row.key] = row.value;
    return { success: true, data: settings };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

function updateSetting(key, value) {
  try {
    db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").run(key, value);
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

function checkBaseLoaded() {
  try {
    const row = db.prepare("SELECT value FROM settings WHERE key = 'is_base_loaded'").get();
    return { success: true, loaded: row ? row.value === 'true' : false };
  } catch (err) {
    return { success: false, loaded: false, error: err.message };
  }
}

function loadInitialBase(type) {
  try {
    const check = checkBaseLoaded();
    if (check.loaded) return { success: false, error: 'Base already loaded' };

    if (type !== 'grocery') {
      return { success: false, error: 'Invalid base type' };
    }

    const products = [
      { name: "Non", buy_price: 2500, sell_price: 3500, stock: 100, unit: 'dona', barcode: '10001' },
      { name: "Shakar 1kg", buy_price: 11000, sell_price: 13000, stock: 100, unit: 'kg', barcode: '10002' },
      { name: "Paxta yog'i 1L", buy_price: 14000, sell_price: 16500, stock: 100, unit: 'dona', barcode: '10003' },
      { name: "Cola 1.5L", buy_price: 10000, sell_price: 12500, stock: 100, unit: 'dona', barcode: '10004' },
      { name: "Tuz", buy_price: 2000, sell_price: 3000, stock: 100, unit: 'dona', barcode: '10005' },
      { name: "Makaron", buy_price: 8000, sell_price: 10500, stock: 100, unit: 'kg', barcode: '10006' },
      { name: "Qaymoq", buy_price: 12000, sell_price: 15000, stock: 100, unit: 'dona', barcode: '10007' },
      { name: "Fanta", buy_price: 10000, sell_price: 12500, stock: 100, unit: 'dona', barcode: '10008' },
      { name: "Kolbasa", buy_price: 25000, sell_price: 35000, stock: 100, unit: 'dona', barcode: '10009' },
      { name: "Pista", buy_price: 3000, sell_price: 4500, stock: 100, unit: 'kg', barcode: '10010' }
    ];

    const insertProduct = db.prepare("INSERT INTO products (name, barcode, buy_price, sell_price, stock, unit) VALUES (?, ?, ?, ?, ?, ?)");
    
    db.exec('BEGIN TRANSACTION');
    for (const p of products) {
      // Check if barcode already exists just in case
      const existing = db.prepare("SELECT id FROM products WHERE barcode = ?").get(p.barcode);
      if (!existing) {
        insertProduct.run(p.name, p.barcode, p.buy_price, p.sell_price, p.stock, p.unit);
      }
    }
    db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").run('is_base_loaded', 'true');
    db.exec('COMMIT');

    return { success: true };
  } catch (err) {
    if (db.inTransaction) db.exec('ROLLBACK');
    return { success: false, error: err.message };
  }
}


// ── Cashiers & Authentication ────────────────────────────────────────────────
function verifyPin(pin) {
  try {
    const cashier = db.prepare("SELECT id, name FROM cashiers WHERE pin = ?").get(pin);
    return { success: true, valid: !!cashier, cashier: cashier || null };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

function getCashiers() {
  try {
    const rows = db.prepare("SELECT id, name FROM cashiers ORDER BY id ASC").all();
    return { success: true, data: rows };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

function addCashier(name, pin) {
  try {
    // Check if pin exists
    const exists = db.prepare("SELECT id FROM cashiers WHERE pin = ?").get(pin);
    if (exists) return { success: false, error: 'pin_exists' };
    
    db.prepare("INSERT INTO cashiers (name, pin) VALUES (?, ?)").run(name, pin);
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

function deleteCashier(id) {
  try {
    const count = db.prepare("SELECT COUNT(*) as count FROM cashiers").get().count;
    if (count <= 1) return { success: false, error: 'last_cashier' };
    
    db.prepare("DELETE FROM cashiers WHERE id = ?").run(id);
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

function updateCashierPin(id, newPin) {
  try {
    const exists = db.prepare("SELECT id FROM cashiers WHERE pin = ? AND id != ?").get(newPin, id);
    if (exists) return { success: false, error: 'pin_exists' };

    db.prepare("UPDATE cashiers SET pin = ? WHERE id = ?").run(newPin, id);
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

function getProducts() {
  return db.prepare('SELECT * FROM products ORDER BY id DESC').all();
}

function getCustomers() {
  return db.prepare(`
    SELECT c.*, 
           (SELECT MAX(created_at) FROM sales WHERE customer_id = c.id AND payment_method = 'debt') as last_debt_date 
    FROM customers c 
    ORDER BY c.total_debt DESC
  `).all();
}

// ── Inventory Log Helper ──────────────────────────────────────────────────
// Must be called INSIDE an open transaction (or standalone).
// productId must already have its final stock value when this is called.
function logInventory({ productId, productName, actionType, quantityChanged, userName = '', note = '' }) {
  try {
    const row = db.prepare('SELECT stock FROM products WHERE id = ?').get(productId);
    const balanceAfter = row ? row.stock : 0;
    db.prepare(`
      INSERT INTO inventory_logs
        (product_id, product_name, action_type, quantity_changed, balance_after, user_name, note)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(productId, productName, actionType, quantityChanged, balanceAfter, userName, note);
  } catch (err) {
    // Non-fatal — never crash the parent transaction because of logging
  }
}

function addProduct(product) {
  try {
    const barcode = (product.barcode && product.barcode.trim() !== '')
      ? product.barcode.trim()
      : null;
      
    // Smart merging check (case-insensitive by name or exact barcode)
    if (product.name || barcode) {
      let existing = null;
      if (barcode) {
        existing = db.prepare('SELECT id, stock, name, discount FROM products WHERE LOWER(name) = LOWER(?) OR barcode = ?').get(product.name, barcode);
      } else {
        existing = db.prepare('SELECT id, stock, name, discount FROM products WHERE LOWER(name) = LOWER(?)').get(product.name);
      }

      if (existing) {
        const addedQty = parseFloat(product.stock) || 0;
        const newBuyPrice  = parseFloat(product.buy_price)  || 0;
        const newSellPrice = parseFloat(product.sell_price) || 0;
        const discount     = product.discount !== undefined ? (parseFloat(product.discount) || 0) : (existing.discount || 0);
        
        db.prepare(`
          UPDATE products 
          SET stock = stock + ?, buy_price = ?, cost_price = ?, sell_price = ?, unit = ?, discount = ?
          WHERE id = ?
        `).run(addedQty, newBuyPrice, newBuyPrice, newSellPrice, product.unit || 'dona', discount, existing.id);
        
        if (addedQty > 0) {
          logInventory({
            productId: existing.id,
            productName: existing.name,
            actionType: 'kirim',
            quantityChanged: +addedQty,
            userName: product.userName || '',
            note: 'Mavjud tovar ustiga qo\'shildi'
          });
        }
        return { success: true, id: existing.id };
      }
    }

    const stmt = db.prepare(`
      INSERT INTO products (name, barcode, buy_price, sell_price, stock, unit, discount)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    const info = stmt.run(
      product.name,
      barcode,
      parseFloat(product.buy_price)  || 0,
      parseFloat(product.sell_price) || 0,
      parseFloat(product.stock)      || 0,
      product.unit || 'dona',
      parseFloat(product.discount)   || 0
    );

    const newId   = info.lastInsertRowid;
    const newQty  = parseFloat(product.stock) || 0;
    if (newQty > 0) {
      logInventory({
        productId: newId,
        productName: product.name,
        actionType: 'kirim',
        quantityChanged: +newQty,
        userName: product.userName || '',
        note: 'Yangi mahsulot'
      });
    }

    return { success: true, id: newId };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

function updateProduct(id, product) {
  try {
    const existing = db.prepare('SELECT stock, discount FROM products WHERE id = ?').get(id);
    const oldQty = existing ? existing.stock : 0;
    const addedQty = parseFloat(product.stock) || 0;
    const newQty = oldQty + addedQty;

    const barcode = (product.barcode && product.barcode.trim() !== '')
      ? product.barcode.trim()
      : null;

    const discount = product.discount !== undefined ? (parseFloat(product.discount) || 0) : (existing ? (existing.discount || 0) : 0);

    const stmt = db.prepare(`
      UPDATE products 
      SET name = ?, barcode = ?, buy_price = ?, sell_price = ?, stock = ?, unit = ?, discount = ?
      WHERE id = ?
    `);

    stmt.run(
      product.name,
      barcode,
      parseFloat(product.buy_price)  || 0,
      parseFloat(product.sell_price) || 0,
      newQty,
      product.unit || 'dona',
      discount,
      id
    );

    if (addedQty !== 0) {
      logInventory({
        productId: id,
        productName: product.name,
        actionType: 'tahrirlash',
        quantityChanged: addedQty,
        userName: product.userName || '',
        note: `Tahrirlash orqali qo'shildi. Eski qoldiq: ${oldQty}, Yangi qoldiq: ${newQty}`
      });
    }

    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

function addStockToProduct(id, product) {
  try {
    db.exec('BEGIN TRANSACTION');
    const existing = db.prepare('SELECT stock, sell_price, buy_price, cost_price, discount FROM products WHERE id = ?').get(id);
    if (!existing) {
      db.exec('ROLLBACK');
      return { success: false, error: 'Mahsulot topilmadi' };
    }

    const newSellPrice = parseFloat(product.sell_price) || 0;
    const newBuyPrice  = parseFloat(product.buy_price)  || 0;
    const addedQty     = parseFloat(product.stock)      || 0;
    const discount     = product.discount !== undefined ? (parseFloat(product.discount) || 0) : (existing.discount || 0);

    const oldQty = existing.stock || 0;
    const oldCostPrice = existing.cost_price || existing.buy_price || 0;

    // AVCO Calculation
    let newAvgCost = oldCostPrice;
    if (addedQty > 0) {
      const oldTotalValue = oldQty * oldCostPrice;
      const newTotalValue = addedQty * newBuyPrice;
      const totalQty = oldQty + addedQty;
      if (totalQty > 0) {
        newAvgCost = Math.round((oldTotalValue + newTotalValue) / totalQty);
      }
    } else {
      newAvgCost = newBuyPrice > 0 ? newBuyPrice : oldCostPrice;
    }

    const sellPriceChanged = Math.abs(existing.sell_price - newSellPrice) > 0.001;
    const buyPriceChanged  = Math.abs(existing.buy_price  - newBuyPrice)  > 0.001;
    const priceChanged = sellPriceChanged || buyPriceChanged;

    const stmt = db.prepare(`
      UPDATE products 
      SET name = ?, buy_price = ?, cost_price = ?, sell_price = ?, stock = stock + ?, unit = ?, discount = ?
      WHERE id = ?
    `);

    stmt.run(
      product.name,
      newBuyPrice,     // Actual latest buy price from this batch
      newAvgCost,      // Weighted average cost price (AVCO)
      newSellPrice,    // Unified new selling price for all stock
      addedQty,
      product.unit || 'dona',
      discount,
      id
    );

    if (addedQty > 0) {
      logInventory({
        productId: id,
        productName: product.name,
        actionType: 'kirim',
        quantityChanged: addedQty,
        userName: product.userName || '',
        note: `Kirim. Eski qoldiq: ${oldQty}, Yangi qoldiq: ${oldQty + addedQty}. Yangi o'rtacha tannarx: ${newAvgCost}`
      });
    }

    db.exec('COMMIT');
    return { 
      success: true, 
      priceChanged,
      sellPriceChanged,
      oldSellPrice: existing.sell_price,
      newSellPrice
    };
  } catch (err) {
    if (db.inTransaction) db.exec('ROLLBACK');
    return { success: false, error: err.message };
  }
}

function deleteProduct(id, userName) {
  try {
    const product = db.prepare('SELECT name, stock FROM products WHERE id = ?').get(id);
    if (product) {
      db.prepare(`
        INSERT INTO inventory_logs
          (product_id, product_name, action_type, quantity_changed, balance_after, user_name, note)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(id, product.name, 'ochirildi', -product.stock, 0, userName || '', 'Mahsulot ombordan o\'chirildi');
    }
    db.prepare('DELETE FROM products WHERE id = ?').run(id);
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

function searchProduct(query) {
  try {
    const term = (query || '').trim();
    if (!term) return [];

    // Exact barcode match first (for scanner use)
    const byBarcode = db.prepare(
      'SELECT * FROM products WHERE barcode = ? LIMIT 1'
    ).all(term);
    if (byBarcode.length > 0) return byBarcode;

    // Fallback: name LIKE search
    return db.prepare(
      "SELECT * FROM products WHERE my_lower(name) LIKE my_lower(?) ORDER BY name LIMIT 20"
    ).all(`%${term}%`);
  } catch (err) {
    return [];
  }
}

function processSale(cartItems, paymentMethod, customerInfo, cashierName = 'Kassir', discountPercent = 0) {
  try {
    db.exec('BEGIN TRANSACTION');

    const pct = parseFloat(discountPercent) || 0;
    const originalTotal = cartItems.reduce((sum, item) => sum + (item.sell_price * item.qty), 0);
    
    // Calculate subtotal after item-level discounts
    const subtotal = cartItems.reduce((sum, item) => {
      const itemPct = parseFloat(item.discount) || 0;
      const itemTotal = item.sell_price * item.qty;
      const itemDisc = Math.round(itemTotal * (itemPct / 100));
      return sum + (itemTotal - itemDisc);
    }, 0);

    const discountAmount = Math.round((subtotal * pct) / 100);
    const finalTotal = subtotal - discountAmount;
    let customerId = null;

    // 1. Handle Customer & Debt
    if (paymentMethod === 'debt' && customerInfo) {
      if (customerInfo.id) {
        customerId = customerInfo.id;
        db.prepare('UPDATE customers SET total_debt = total_debt + ? WHERE id = ?')
          .run(finalTotal, customerId);
      } else {
        const customerName = (customerInfo.name || '').trim();
        const customerPhone = (customerInfo.phone || '').trim();

        // Check if customer with the same name and phone already exists
        const existing = db.prepare('SELECT id FROM customers WHERE LOWER(name) = LOWER(?) AND phone = ?')
          .get(customerName, customerPhone);

        if (existing) {
          customerId = existing.id;
          db.prepare('UPDATE customers SET total_debt = total_debt + ? WHERE id = ?')
            .run(finalTotal, customerId);
        } else {
          const info = db.prepare('INSERT INTO customers (name, phone, total_debt) VALUES (?, ?, ?)')
            .run(customerName, customerPhone, finalTotal);
          customerId = info.lastInsertRowid;
        }
      }
    }

    // 2. Calculate shift_receipt_number
    const countRow = db.prepare('SELECT MAX(shift_receipt_number) as max_num FROM sales WHERE is_closed = 0').get();
    const shiftReceiptNumber = (countRow && countRow.max_num) ? countRow.max_num + 1 : 1;

    // 3. Insert Sale record
    const saleInfo = db.prepare('INSERT INTO sales (total_amount, payment_method, customer_id, cashier_name, shift_receipt_number, original_total, discount_percent, discount_amount) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .run(finalTotal, paymentMethod, customerId, cashierName, shiftReceiptNumber, originalTotal, pct, discountAmount);
    const saleId = saleInfo.lastInsertRowid;

    // 4. Insert Sale Items, Deduct Stock, and Log
    const insertItem  = db.prepare('INSERT INTO sale_items (sale_id, product_id, qty, price, discount_percent, discount_amount, product_name, unit) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
    const deductStock = db.prepare('UPDATE products SET stock = stock - ? WHERE id = ?');

    let payTypeLabel = 'Naqd';
    if (paymentMethod === 'card') payTypeLabel = 'Karta';
    if (paymentMethod === 'debt') payTypeLabel = 'Qarzga';

    const discountLabel = pct > 0 ? `, Skidka: ${pct}%` : '';
    const saleNote = `Chek #${shiftReceiptNumber} (${payTypeLabel}${discountLabel})`;

    for (const item of cartItems) {
      const itemPct = parseFloat(item.discount) || 0;
      const itemTotal = item.sell_price * item.qty;
      const itemDiscAmount = Math.round(itemTotal * (itemPct / 100));
      const priceAfterDiscount = item.sell_price * (1 - itemPct / 100);

      insertItem.run(saleId, item.id, item.qty, priceAfterDiscount, itemPct, itemDiscAmount, item.name, item.unit || 'dona');
      deductStock.run(item.qty, item.id);

      // Custom note for item-level discount
      let itemNote = saleNote;
      if (itemPct > 0) {
        const formattedPrice = Math.round(priceAfterDiscount).toLocaleString('ru-RU').replace(/,/g, ' ');
        itemNote = `Chek #${shiftReceiptNumber} (${payTypeLabel}, -${itemPct}%, ${formattedPrice} so'm)`;
      }

      logInventory({
        productId: item.id,
        productName: item.name,
        actionType: paymentMethod === 'debt' ? 'sotuv_qarz' : 'sotuv',
        quantityChanged: -item.qty,
        userName: cashierName,
        note: itemNote
      });
    }

    db.exec('COMMIT');
    return { success: true, saleId, shiftReceiptNumber };
  } catch (err) {
    db.exec('ROLLBACK');
    return { success: false, error: err.message };
  }
}

function attachItemsToSales(sales) {
  if (!sales || sales.length === 0) return;
  const saleIds = sales.map(s => s.id);
  const placeholders = saleIds.map(() => '?').join(',');
  const query = `
    SELECT si.*, 
           COALESCE(p.name, si.product_name, 'Mahsulot #' || si.product_id) as name,
           COALESCE(p.name, si.product_name, 'Mahsulot #' || si.product_id) as product_name,
           COALESCE(p.unit, si.unit, 'dona') as unit
    FROM sale_items si
    LEFT JOIN products p ON si.product_id = p.id
    WHERE si.sale_id IN (${placeholders})
  `;
  const items = db.prepare(query).all(...saleIds);
  
  const itemsBySaleId = {};
  for (const item of items) {
    if (!itemsBySaleId[item.sale_id]) {
      itemsBySaleId[item.sale_id] = [];
    }
    itemsBySaleId[item.sale_id].push(item);
  }
  
  for (const sale of sales) {
    sale.items = itemsBySaleId[sale.id] || [];
  }
}

function getRecentSales() {
  try {
    // Get sales from the last 3 days, join with customers to get name
    const sales = db.prepare(`
      SELECT s.*, c.name as customer_name 
      FROM sales s
      LEFT JOIN customers c ON s.customer_id = c.id
      WHERE s.created_at >= datetime('now', '-3 days', 'localtime')
      ORDER BY s.id DESC
    `).all();

    // Attach items to each sale in a single batch query
    attachItemsToSales(sales);

    return { success: true, data: sales };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

function processFullReturn(saleId) {
  try {
    db.exec('BEGIN TRANSACTION');

    const sale = db.prepare('SELECT * FROM sales WHERE id = ?').get(saleId);
    if (!sale) throw new Error('Sale not found');

    const saleDate = new Date(sale.created_at + 'Z');
    if ((Date.now() - saleDate.getTime()) > 3 * 24 * 60 * 60 * 1000) {
      throw new Error("Chek muddati 3 kundan o'tgan, qaytarish mumkin emas!");
    }

    const saleItems = db.prepare('SELECT * FROM sale_items WHERE sale_id = ?').all(saleId);

    let totalReturnedAmount = 0;

    for (const item of saleItems) {
      if (item.qty > 0) {
        // Restore stock
        db.prepare('UPDATE products SET stock = stock + ? WHERE id = ?').run(item.qty, item.product_id);
        // qty is kept intact for history
        const prod = db.prepare('SELECT name FROM products WHERE id = ?').get(item.product_id);
        logInventory({
          productId: item.product_id,
          productName: prod ? prod.name : (item.product_name || `Product #${item.product_id}`),
          actionType: 'vozvrat',
          quantityChanged: +item.qty,
          userName: sale.cashier_name || '',
          note: `Chek #${sale.shift_receipt_number || sale.id} to'liq qaytarildi`
        });
        totalReturnedAmount += (item.qty * item.price);
      }
    }

    // The total_amount is kept intact for history.

    // If debt, reduce total_debt
    if (sale.payment_method === 'debt' && sale.customer_id && totalReturnedAmount > 0) {
      db.prepare('UPDATE customers SET total_debt = total_debt - ? WHERE id = ?').run(totalReturnedAmount, sale.customer_id);
    }

    // Update status to refunded
    db.prepare("UPDATE sales SET status = 'refunded' WHERE id = ?").run(sale.id);

    db.exec('COMMIT');
    return { success: true };
  } catch (err) {
    db.exec('ROLLBACK');
    return { success: false, error: err.message };
  }
}

function processReturn(saleItemId, returnQty) {
  try {
    db.exec('BEGIN TRANSACTION');

    // 1. Fetch sale_item
    const saleItem = db.prepare('SELECT * FROM sale_items WHERE id = ?').get(saleItemId);
    if (!saleItem) throw new Error('Sale item not found');

    const availableToReturn = saleItem.qty - (saleItem.refunded_qty || 0);
    if (returnQty <= 0 || returnQty > availableToReturn) {
      throw new Error(`Faqat ${availableToReturn} ta qaytarish mumkin`);
    }

    const returnAmount = returnQty * saleItem.price;

    // 2. Fetch parent sale
    const sale = db.prepare('SELECT * FROM sales WHERE id = ?').get(saleItem.sale_id);
    if (!sale) throw new Error('Parent sale not found');

    const saleDate = new Date(sale.created_at + 'Z');
    if ((Date.now() - saleDate.getTime()) > 3 * 24 * 60 * 60 * 1000) {
      throw new Error("Chek muddati 3 kundan o'tgan, qaytarish mumkin emas!");
    }

    // 3. Track refunded quantity without modifying original qty or price
    db.prepare('UPDATE sale_items SET refunded_qty = refunded_qty + ? WHERE id = ?').run(returnQty, saleItem.id);

    // 4. Restore stock
    db.prepare('UPDATE products SET stock = stock + ? WHERE id = ?').run(returnQty, saleItem.product_id);

    // 5. Update sale status based on total refunds
    const allItems = db.prepare('SELECT SUM(qty) as total_qty, SUM(refunded_qty) as total_refunded FROM sale_items WHERE sale_id = ?').get(sale.id);
    
    if (allItems.total_refunded >= allItems.total_qty) {
      db.prepare("UPDATE sales SET status = 'refunded' WHERE id = ?").run(sale.id);
    } else {
      db.prepare("UPDATE sales SET status = 'partially_refunded' WHERE id = ?").run(sale.id);
    }

    // Log inventory
    const prodRow = db.prepare('SELECT name FROM products WHERE id = ?').get(saleItem.product_id);
    logInventory({
      productId: saleItem.product_id,
      productName: prodRow ? prodRow.name : (saleItem.product_name || `Product #${saleItem.product_id}`),
      actionType: 'vozvrat',
      quantityChanged: +returnQty,
      userName: sale.cashier_name || '',
      note: `Chek #${sale.shift_receipt_number || sale.id} qisman qaytarildi`
    });

    // 6. Handle Debt reduction if applicable
    if (sale.payment_method === 'debt' && sale.customer_id) {
      db.prepare('UPDATE customers SET total_debt = total_debt - ? WHERE id = ?').run(returnAmount, sale.customer_id);
    }

    db.exec('COMMIT');
    return { success: true };
  } catch (err) {
    db.exec('ROLLBACK');
    return { success: false, error: err.message };
  }
}

function payDebt(customerId, amount, cashierName = '') {
  try {
    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) throw new Error('Invalid amount');

    db.exec('BEGIN TRANSACTION');
    db.prepare('UPDATE customers SET total_debt = total_debt - ? WHERE id = ?')
      .run(parsedAmount, customerId);
    db.prepare('INSERT INTO debt_payments (customer_id, amount) VALUES (?, ?)')
      .run(customerId, parsedAmount);

    const customer = db.prepare('SELECT name FROM customers WHERE id = ?').get(customerId);
    if (customer) {
      logInventory({
        productId: 0,
        productName: `Mijoz: ${customer.name}`,
        actionType: 'qarz_tulov',
        quantityChanged: 0,
        userName: cashierName,
        note: `Qarzdan to'lov: ${parsedAmount} so'm`
      });
    }

    db.exec('COMMIT');
    return { success: true };
  } catch (err) {
    if (db.inTransaction) db.exec('ROLLBACK');
    return { success: false, error: err.message };
  }
}

function getReports(startDateISO, endDateISO) {
  try {
    // 1. Stats by Payment Method & Total Revenue/Debt & Total Discounts (consolidated query)
    const statsRows = db.prepare(`
      SELECT payment_method, SUM(total_amount) as total, SUM(discount_amount) as total_discounts
      FROM sales
      WHERE created_at >= ? AND created_at <= ? AND status != 'refunded'
      GROUP BY payment_method
    `).all(startDateISO, endDateISO);

    let totalRevenue = 0;
    let totalDebtIssued = 0;
    let totalDiscounts = 0;
    const salesByType = { cash: 0, card: 0, debt: 0 };

    for (const row of statsRows) {
      totalDiscounts += (row.total_discounts || 0);
      if (row.payment_method === 'debt') {
        totalDebtIssued += row.total;
        salesByType.debt += row.total;
      } else {
        totalRevenue += row.total;
        if (row.payment_method === 'cash') salesByType.cash += row.total;
        if (row.payment_method === 'card') salesByType.card += row.total;
      }
    }

    // 2. Total Profit Calculation
    // Profit = (sell_price - buy_price) * qty - discount_amount
    const profitRow = db.prepare(`
      SELECT SUM((si.price - IFNULL(p.buy_price, 0)) * si.qty) as total_profit
      FROM sale_items si
      JOIN sales s ON s.id = si.sale_id
      LEFT JOIN products p ON p.id = si.product_id
      WHERE s.created_at >= ? AND s.created_at <= ? AND s.status != 'refunded'
    `).get(startDateISO, endDateISO);
    
    const totalProfit = (profitRow?.total_profit || 0) - totalDiscounts;

    // 3. Top 5 Selling Products
    const topProducts = db.prepare(`
      SELECT COALESCE(p.name, si.product_name, 'Mahsulot #' || si.product_id) as name, SUM(si.qty) as total_sold, COALESCE(p.unit, si.unit, 'dona') as unit
      FROM sale_items si
      JOIN sales s ON s.id = si.sale_id
      LEFT JOIN products p ON p.id = si.product_id
      WHERE s.created_at >= ? AND s.created_at <= ? AND s.status != 'refunded'
      GROUP BY si.product_id, COALESCE(p.name, si.product_name, 'Mahsulot #' || si.product_id), COALESCE(p.unit, si.unit, 'dona')
      ORDER BY total_sold DESC
      LIMIT 50
    `).all(startDateISO, endDateISO);

    // Fetch total debt payments in this period
    const debtPaymentsRow = db.prepare(`
      SELECT SUM(amount) as total_paid
      FROM debt_payments
      WHERE created_at >= ? AND created_at <= ?
    `).get(startDateISO, endDateISO);
    const totalDebtPayments = debtPaymentsRow?.total_paid || 0;

    // Add debt payments to total revenue
    totalRevenue += totalDebtPayments;

    // 4. Expenses
    const expensesList = db.prepare(`
      SELECT * FROM expenses 
      WHERE created_at >= ? AND created_at <= ? 
      ORDER BY created_at DESC
    `).all(startDateISO, endDateISO);
    
    const totalExpenses = expensesList.reduce((sum, exp) => sum + exp.amount, 0);

    // Calculate current warehouse valuation
    const valuation = db.prepare(`
      SELECT SUM(buy_price * stock) as total_buy, SUM(sell_price * stock) as total_sell
      FROM products
    `).get();

    const warehouseBuyValue = valuation?.total_buy || 0;
    const warehouseSellValue = valuation?.total_sell || 0;

    return {
      success: true,
      data: {
        totalRevenue,
        totalDebtIssued,
        totalProfit,
        totalExpenses,
        expensesList,
        salesByType,
        topProducts,
        warehouseBuyValue,
        warehouseSellValue
      }
    };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

function getLowStockProducts(limit = 3) {
  try {
    const products = db.prepare(
      'SELECT * FROM products WHERE stock <= ? ORDER BY stock ASC'
    ).all(limit);
    return { success: true, data: products };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

function clearTestData() {
  try {
    db.exec('BEGIN TRANSACTION');

    // Clear everything
    db.exec('DELETE FROM sale_items');
    db.exec('DELETE FROM sales');
    db.exec('DELETE FROM inventory_logs');
    db.exec('DELETE FROM expenses');
    db.exec('DELETE FROM write_offs');
    db.exec('DELETE FROM shifts_history');
    db.exec('DELETE FROM debt_payments');
    db.exec('DELETE FROM customers');
    db.exec('DELETE FROM products');

    // Reset auto-increment counters
    db.exec("DELETE FROM sqlite_sequence WHERE name IN ('sale_items', 'sales', 'inventory_logs', 'expenses', 'write_offs', 'shifts_history', 'debt_payments', 'customers', 'products')");

    db.exec('COMMIT');
    return { success: true };
  } catch (err) {
    db.exec('ROLLBACK');
    return { success: false, error: err.message };
  }
}

function getCustomerDebtDetails(customerId) {
  try {
    const sales = db.prepare("SELECT * FROM sales WHERE customer_id = ? AND payment_method = 'debt' ORDER BY created_at DESC").all(customerId);
    
    attachItemsToSales(sales);
    for (let s of sales) {
      s.type = 'sale';
    }

    const payments = db.prepare("SELECT * FROM debt_payments WHERE customer_id = ? ORDER BY created_at DESC").all(customerId);
    for (let p of payments) {
      p.type = 'payment';
    }

    const history = [...sales, ...payments].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    return { success: true, data: history };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

function getAllSalesHistory({
  page = 1,
  pageSize = 50,
  startDate = '',
  endDate = '',
  startTime = '',
  endTime = '',
  selectedCashier = '',
  statusFilter = '',
  searchQuery = ''
} = {}) {
  try {
    const offset = (page - 1) * pageSize;
    const conditions = [];
    const params = [];

    // Date filters: if both startDate and endDate are empty, default to today's date
    if (!startDate && !endDate) {
      const today = new Date();
      const year = today.getFullYear();
      const month = String(today.getMonth() + 1).padStart(2, '0');
      const day = String(today.getDate()).padStart(2, '0');
      const todayStr = `${year}-${month}-${day}`;
      
      conditions.push("date(created_at, 'localtime') = ?");
      params.push(todayStr);
    } else {
      if (startDate) {
        conditions.push("date(created_at, 'localtime') >= ?");
        params.push(startDate);
      }
      if (endDate) {
        conditions.push("date(created_at, 'localtime') <= ?");
        params.push(endDate);
      }
    }

    // Time filters
    if (startTime) {
      conditions.push("time(created_at, 'localtime') >= ?");
      params.push(startTime + ':00');
    }
    if (endTime) {
      conditions.push("time(created_at, 'localtime') <= ?");
      params.push(endTime + ':00');
    }

    // Cashier filter
    if (selectedCashier) {
      conditions.push("cashier_name = ?");
      params.push(selectedCashier);
    }

    // Status filter
    if (statusFilter) {
      if (statusFilter === 'refunded') {
        conditions.push("status = 'refunded'");
      } else if (statusFilter === 'completed') {
        conditions.push("status != 'refunded'");
      } else if (statusFilter === 'discounted') {
        conditions.push("discount_percent > 0");
      }
    }

    // Search query filter
    if (searchQuery) {
      const trimmedQuery = searchQuery.trim();
      // If it starts with '#' followed by digits, strip it
      if (trimmedQuery.startsWith('#')) {
        const numStr = trimmedQuery.substring(1).trim();
        const num = parseInt(numStr, 10);
        if (!isNaN(num)) {
          conditions.push("(id = ? OR shift_receipt_number = ?)");
          params.push(num);
          params.push(num);
        } else {
          conditions.push("0 = 1"); // force empty if invalid
        }
      } else {
        // General search query: ID, shift_receipt_number, or product names
        const num = parseInt(trimmedQuery, 10);
        if (!isNaN(num) && String(num) === trimmedQuery) {
          conditions.push(`(
            id = ? 
            OR shift_receipt_number = ? 
            OR id IN (
              SELECT DISTINCT si.sale_id 
              FROM sale_items si
              LEFT JOIN products p ON si.product_id = p.id
              WHERE my_lower(COALESCE(p.name, si.product_name, '')) LIKE my_lower(?)
            )
          )`);
          params.push(num);
          params.push(num);
          params.push(`%${trimmedQuery}%`);
        } else {
          conditions.push(`(
            id IN (
              SELECT DISTINCT si.sale_id 
              FROM sale_items si
              LEFT JOIN products p ON si.product_id = p.id
              WHERE my_lower(COALESCE(p.name, si.product_name, '')) LIKE my_lower(?)
            )
          )`);
          params.push(`%${trimmedQuery}%`);
        }
      }
    }

    const whereClause = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';

    // Get total count for pagination meta
    const countQuery = `SELECT COUNT(*) as total FROM sales ${whereClause}`;
    const { total } = db.prepare(countQuery).get(...params);

    // Paginated sales, newest first
    const salesQuery = `
      SELECT * FROM sales 
      ${whereClause} 
      ORDER BY created_at DESC 
      LIMIT ? OFFSET ?
    `;
    const queryParams = [...params, pageSize, offset];
    const sales = db.prepare(salesQuery).all(...queryParams);

    attachItemsToSales(sales);

    return {
      success: true,
      data: sales,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize)
      }
    };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

function getSalesForExcel(startDate, endDate) {
  try {
    // Compare only the LOCAL date part — immune to UTC offset issues.
    // SQLite date(col, 'localtime') converts UTC storage to the machine's local date.
    // We receive plain YYYY-MM-DD strings from the frontend.
    const records = db.prepare(`
      SELECT 
        s.created_at,
        s.cashier_name,
        COALESCE(p.name, si.product_name, 'Mahsulot #' || si.product_id) as product_name,
        si.qty       as quantity,
        si.price,
        (si.qty * si.price) as subtotal
      FROM sale_items si
      JOIN sales s ON si.sale_id = s.id
      LEFT JOIN products p ON si.product_id = p.id
      WHERE date(s.created_at, 'localtime') >= ? AND date(s.created_at, 'localtime') <= ? AND s.status != 'refunded'
      ORDER BY s.created_at ASC
    `).all(startDate, endDate);
    
    return { success: true, data: records };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

function getCurrentShiftStats() {
  try {
    const query = `
      SELECT 
        SUM(CASE WHEN status != 'refunded' THEN total_amount ELSE 0 END) as total_sales,
        SUM(CASE WHEN payment_method = 'cash' AND status != 'refunded' THEN total_amount ELSE 0 END) as cash_sales,
        SUM(CASE WHEN payment_method = 'card' AND status != 'refunded' THEN total_amount ELSE 0 END) as card_sales,
        SUM(CASE WHEN payment_method = 'debt' AND status != 'refunded' THEN total_amount ELSE 0 END) as debt_sales,
        COUNT(CASE WHEN status != 'refunded' THEN id END) as receipts_count
      FROM sales
      WHERE is_closed = 0
    `;
    const row = db.prepare(query).get();
    
    const expRow = db.prepare('SELECT SUM(amount) as total_expenses FROM expenses WHERE is_closed = 0').get();
    
    const firstSale = db.prepare('SELECT cashier_name FROM sales WHERE is_closed = 0 LIMIT 1').get();
    const opened_by = firstSale ? firstSale.cashier_name : 'Noma\'lum';

    // Get current shift opened time (fast query via indices)
    const salesRow = db.prepare('SELECT MIN(created_at) as opened_at FROM sales WHERE is_closed = 0').get();
    const expensesRow = db.prepare('SELECT MIN(created_at) as opened_at FROM expenses WHERE is_closed = 0').get();
    
    let opened_at = null;
    const minSaleDate = salesRow ? salesRow.opened_at : null;
    const minExpenseDate = expensesRow ? expensesRow.opened_at : null;
    
    if (minSaleDate && minExpenseDate) {
      opened_at = minSaleDate < minExpenseDate ? minSaleDate : minExpenseDate;
    } else {
      opened_at = minSaleDate || minExpenseDate || null;
    }

    if (!opened_at) {
      // Fallback: check last closed shift
      const lastShift = db.prepare('SELECT closed_at FROM shifts_history ORDER BY id DESC LIMIT 1').get();
      if (lastShift && lastShift.closed_at) {
        opened_at = lastShift.closed_at;
      } else {
        opened_at = new Date().toISOString().replace('T', ' ').substring(0, 19);
      }
    }

    return {
      success: true,
      data: {
        total_sales: row.total_sales || 0,
        cash_sales: row.cash_sales || 0,
        card_sales: row.card_sales || 0,
        debt_sales: row.debt_sales || 0,
        total_expenses: expRow.total_expenses || 0,
        receipts_count: row.receipts_count || 0,
        opened_by: opened_by,
        opened_at: opened_at
      }
    };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

function closeShift(stats) {
  try {
    db.exec('BEGIN TRANSACTION');
    db.prepare(`
      INSERT INTO shifts_history 
      (total_sales, cash_sales, card_sales, debt_sales, receipts_count, opened_by, closed_by, total_expenses, opened_at) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      stats.total_sales, 
      stats.cash_sales, 
      stats.card_sales, 
      stats.debt_sales, 
      stats.receipts_count, 
      stats.opened_by || '', 
      stats.closed_by || '', 
      stats.total_expenses || 0,
      stats.opened_at || null
    );
    db.prepare('UPDATE sales SET is_closed = 1 WHERE is_closed = 0').run();
    db.prepare('UPDATE expenses SET is_closed = 1 WHERE is_closed = 0').run();

    const formatNumber = (num) => {
      if (num === null || num === undefined) return '0';
      let parts = String(num).split('.');
      parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
      return parts.join('.');
    };

    const note = `Jami: ${formatNumber(stats.total_sales)} so'm (Naqd: ${formatNumber(stats.cash_sales)}, Plastik: ${formatNumber(stats.card_sales)}, Qarz: ${formatNumber(stats.debt_sales)})`;

    db.prepare(`
      INSERT INTO inventory_logs
        (product_id, product_name, action_type, quantity_changed, balance_after, user_name, note)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      0, 
      'Smena', 
      'smena_yopildi', 
      0, 
      0, 
      stats.closed_by || 'Kassir', 
      note
    );

    db.exec('COMMIT');
    return { success: true };
  } catch (err) {
    db.exec('ROLLBACK');
    return { success: false, error: err.message };
  }
}

// ── DB Maintenance ──────────────────────────────────────────────────────────
function optimizeDatabase() {
  try {
    // VACUUM rebuilds the DB file, reclaiming space from deleted rows.
    // Must run OUTSIDE a transaction (node:sqlite allows it directly).
    db.exec('PRAGMA wal_checkpoint(TRUNCATE);');
    db.exec('VACUUM;');
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

function getDBPath() {
  const { app } = require('electron');
  return require('path').join(app.getPath('userData'), 'pos.db');
}

function writeOffProduct({ productId, quantity, reason, userName }) {
  try {
    const product = db.prepare('SELECT * FROM products WHERE id = ?').get(productId);
    if (!product) throw new Error('Mahsulot topilmadi');

    const qty = parseFloat(quantity) || 0;
    if (qty <= 0) throw new Error('Miqdor 0 dan katta bo\'lishi kerak');
    if (qty > product.stock) throw new Error(`Omborda faqat ${product.stock} ${product.unit} bor`);

    const costPrice = product.cost_price || product.buy_price || 0;
    const totalLoss = qty * costPrice;

    db.exec('BEGIN TRANSACTION');
    // 1. Deduct from stock
    db.prepare('UPDATE products SET stock = stock - ? WHERE id = ?').run(qty, productId);
    // 2. Log write-off table
    db.prepare(`
      INSERT INTO write_offs (product_id, product_name, quantity, reason, total_loss_amount)
      VALUES (?, ?, ?, ?, ?)
    `).run(productId, product.name, qty, reason || 'Boshqa', totalLoss);
    // 3. Log inventory
    logInventory({
      productId,
      productName: product.name,
      actionType: 'spisaniya',
      quantityChanged: -qty,
      userName: userName || 'Ombor',
      note: reason || 'Boshqa'
    });
    
    // 4. Add to expenses
    if (totalLoss > 0) {
      db.prepare('INSERT INTO expenses (reason, amount, cashier_name) VALUES (?, ?, ?)').run(
        `Spisaniya: ${product.name} (${reason || 'Boshqa'})`,
        totalLoss,
        userName || 'Tizim/Ombor'
      );
    }
    db.exec('COMMIT');

    return { success: true, totalLoss, productName: product.name };
  } catch (err) {
    try { db.exec('ROLLBACK'); } catch (_) {}
    return { success: false, error: err.message };
  }
}

function getWriteOffs() {
  try {
    const rows = db.prepare(
      'SELECT * FROM write_offs ORDER BY created_at DESC LIMIT 200'
    ).all();
    return { success: true, data: rows };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

function getInventoryLogs({ page = 1, pageSize = 100, startDate = '', endDate = '', productId = null, actionType = '', productSearch = '' } = {}) {
  try {
    const offset = (page - 1) * pageSize;
    const conditions = [];
    const params     = [];

    if (startDate) {
      const localStart = new Date(`${startDate}T00:00:00`);
      if (!isNaN(localStart.getTime())) {
        const utcStr = localStart.toISOString().replace('T', ' ').substring(0, 19);
        conditions.push("created_at >= ?");
        params.push(utcStr);
      }
    }
    if (endDate) {
      const localEnd = new Date(`${endDate}T23:59:59`);
      if (!isNaN(localEnd.getTime())) {
        const utcStr = localEnd.toISOString().replace('T', ' ').substring(0, 19);
        conditions.push("created_at <= ?");
        params.push(utcStr);
      }
    }
    if (productId) {
      conditions.push('product_id = ?');
      params.push(productId);
    }
    if (actionType) {
      conditions.push('action_type = ?');
      params.push(actionType);
    }
    if (productSearch && productSearch.trim() !== '') {
      conditions.push('my_lower(product_name) LIKE my_lower(?)');
      params.push(`%${productSearch.trim()}%`);
    }

    const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

    const total = db.prepare(`SELECT COUNT(*) as cnt FROM inventory_logs ${where}`).get(...params).cnt;
    const rows  = db.prepare(
      `SELECT * FROM inventory_logs ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`
    ).all(...params, pageSize, offset);

    return { success: true, data: rows, total, page, pageSize };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

function addExpense(reason, amount, cashier_name) {
  try {
    const created_at = new Date().toISOString().replace('T', ' ').substring(0, 19);
    db.prepare('INSERT INTO expenses (reason, amount, cashier_name, created_at) VALUES (?, ?, ?, ?)').run(reason, amount, cashier_name || 'Kassir', created_at);
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

function deleteExpense(id) {
  try {
    db.prepare('DELETE FROM expenses WHERE id = ?').run(id);
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

function deleteCustomer(customerId, cashierName = '') {
  try {
    db.exec('BEGIN TRANSACTION');
    const customer = db.prepare('SELECT name, total_debt FROM customers WHERE id = ?').get(customerId);
    if (!customer) {
      db.exec('ROLLBACK');
      return { success: false, error: 'Mijoz topilmadi' };
    }

    db.prepare('DELETE FROM debt_payments WHERE customer_id = ?').run(customerId);
    db.prepare('UPDATE sales SET customer_id = NULL WHERE customer_id = ?').run(customerId);
    db.prepare('DELETE FROM customers WHERE id = ?').run(customerId);

    logInventory({
      productId: 0,
      productName: `Mijoz o'chirildi: ${customer.name}`,
      actionType: 'tahrirlash',
      quantityChanged: 0,
      userName: cashierName,
      note: `Mijoz tizimdan o'chirildi. Yakuniy qarz: ${customer.total_debt} so'm`
    });

    db.exec('COMMIT');
    return { success: true };
  } catch (err) {
    if (db.inTransaction) db.exec('ROLLBACK');
    return { success: false, error: err.message };
  }
}

function maybeOpenShift(cashierName) {
  try {
    // 1. Find the timestamp of the last shift-close event
    const lastClose = db.prepare(`
      SELECT created_at FROM inventory_logs
      WHERE action_type = 'smena_yopildi'
      ORDER BY id DESC LIMIT 1
    `).get();

    // 2. Check if a shift-open event already exists AFTER the last close
    let alreadyOpen;
    if (lastClose) {
      alreadyOpen = db.prepare(`
        SELECT id FROM inventory_logs
        WHERE action_type = 'smena_ochildi'
          AND created_at > ?
        LIMIT 1
      `).get(lastClose.created_at);
    } else {
      // No close event ever — check if ANY smena_ochildi exists at all
      alreadyOpen = db.prepare(`
        SELECT id FROM inventory_logs
        WHERE action_type = 'smena_ochildi'
        LIMIT 1
      `).get();
    }

    // 3. If shift is already open — do nothing
    if (alreadyOpen) {
      return { success: true, shiftOpened: false };
    }

    // 4. Open a new shift
    db.prepare(`
      INSERT INTO inventory_logs (product_id, product_name, action_type, quantity_changed, balance_after, user_name, note)
      VALUES (0, 'Smena', 'smena_ochildi', 0, 0, ?, 'Smena ochildi')
    `).run(cashierName);

    return { success: true, shiftOpened: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

function getActivation() {
  try {
    const row = db.prepare("SELECT hardware_fingerprint FROM app_activation LIMIT 1").get();
    return { success: true, data: row ? row.hardware_fingerprint : null };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

function saveActivation(fingerprint) {
  try {
    db.prepare("DELETE FROM app_activation").run();
    db.prepare("INSERT INTO app_activation (hardware_fingerprint) VALUES (?)").run(fingerprint);
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

function clearActivation() {
  try {
    db.prepare("DELETE FROM app_activation").run();
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

module.exports = { 
  initDB, closeDB, getProducts, getCustomers, addProduct, updateProduct, addStockToProduct, deleteProduct, searchProduct,
  processSale, getRecentSales, processFullReturn, processReturn, payDebt, getReports,
  getLowStockProducts, clearTestData, getCustomerDebtDetails, getAllSalesHistory, getSalesForExcel,
  verifyPin, getSettings, updateSetting, checkBaseLoaded, loadInitialBase,
  getCashiers, addCashier, deleteCashier, updateCashierPin,
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
};
