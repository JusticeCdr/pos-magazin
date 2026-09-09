// database.js — uses Node.js built-in SQLite (available in Node ≥ 22 / Electron ≥ 32)
// No native compilation needed — zero dependency on build tools.

const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const { app } = require('electron');
const fs = require('fs');
const https = require('https');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const getLocalTimeStr = () => {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
};

let db;

function getUserDataPath() {
  try {
    if (app && typeof app.getPath === 'function') {
      return app.getPath('userData');
    }
  } catch (_) {}
  return path.join(process.env.APPDATA || process.env.HOME || '.', 'xxMpos');
}

function getImagesDir() {
  try {
    const dir = path.join(getUserDataPath(), 'product_images');
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    return dir;
  } catch (_) {
    return null;
  }
}

function deleteProductImageFile(fileName) {
  if (!fileName) return;
  try {
    const dir = getImagesDir();
    if (!dir) return;
    const filePath = path.join(dir, path.basename(fileName));
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch (err) {
    console.error('Failed to unlink product image:', err);
  }
}

function initDB(customPath) {
  const dir = customPath ? path.dirname(customPath) : getUserDataPath();
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const dbPath = customPath || path.join(dir, 'pos.db');
  db = new DatabaseSync(dbPath);

  // Unicode case-insensitive custom lowercase function
  db.function('my_lower', (str) => typeof str === 'string' ? str.toLowerCase() : str);

  // Clean phone number (leave only digits)
  db.function('clean_phone', (str) => typeof str === 'string' ? str.replace(/\D/g, '') : '');

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

  try { db.exec("ALTER TABLE products ADD COLUMN unit TEXT DEFAULT 'dona';"); } catch (_) {}
  try { db.exec("ALTER TABLE products ADD COLUMN cost_price REAL DEFAULT 0;"); } catch (_) {} 
  try { db.exec("ALTER TABLE products ADD COLUMN buy_price_usd REAL DEFAULT 0;"); } catch (_) {}
  try { db.exec("ALTER TABLE products ADD COLUMN usd_rate REAL DEFAULT 0;"); } catch (_) {}
  try { db.exec("ALTER TABLE products ADD COLUMN discount REAL DEFAULT 0;"); } catch (_) {}
  try { db.exec("ALTER TABLE products ADD COLUMN is_stopped INTEGER DEFAULT 0;"); } catch (_) {}
  try { db.exec("ALTER TABLE products ADD COLUMN is_unlimited INTEGER DEFAULT 0;"); } catch (_) {}
  try { db.exec("ALTER TABLE products ADD COLUMN stop_limit REAL DEFAULT NULL;"); } catch (_) {}
  try { db.exec("ALTER TABLE products ADD COLUMN image TEXT DEFAULT NULL;"); } catch (_) {}
  try { db.exec("CREATE INDEX IF NOT EXISTS idx_products_stopped ON products(is_stopped);"); } catch (_) {}
  try { db.exec("ALTER TABLE sales ADD COLUMN cashier_name TEXT DEFAULT 'Kassir';"); } catch (_) {}
  try { db.exec("ALTER TABLE sales ADD COLUMN is_closed INTEGER DEFAULT 0;"); } catch (_) {}
  try { db.exec("ALTER TABLE sales ADD COLUMN status TEXT DEFAULT 'completed';"); } catch (_) {}
  try { db.exec("ALTER TABLE sales ADD COLUMN shift_receipt_number INTEGER DEFAULT 0;"); } catch (_) {}
  try { db.exec("ALTER TABLE sales ADD COLUMN device TEXT DEFAULT 'desktop';"); } catch (_) {}
  try { db.exec("ALTER TABLE sales ADD COLUMN is_manual_debt INTEGER DEFAULT 0;"); } catch (_) {}
  try { db.exec("ALTER TABLE sales ADD COLUMN cash_refund REAL DEFAULT 0;"); } catch (_) {}
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

  try { db.exec("ALTER TABLE customers ADD COLUMN is_deleted INTEGER DEFAULT 0;"); } catch (_) {}

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
      discount_amount REAL   DEFAULT 0,
      device         TEXT    DEFAULT 'desktop'
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
  try { db.exec("ALTER TABLE write_offs ADD COLUMN user_name TEXT DEFAULT '';"); } catch (_) {}
  try { db.exec("ALTER TABLE write_offs ADD COLUMN note TEXT DEFAULT '';"); } catch (_) {}
  try { db.exec("ALTER TABLE write_offs ADD COLUMN unit TEXT DEFAULT 'dona';"); } catch (_) {}

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

  // ── Suppliers & Supplier Invoices ──────────────────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS suppliers (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      name       TEXT NOT NULL,
      phone      TEXT DEFAULT '',
      company    TEXT DEFAULT '',
      balance    REAL DEFAULT 0,
      note       TEXT DEFAULT '',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS supplier_invoices (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      supplier_id    INTEGER,
      supplier_name  TEXT DEFAULT '',
      total_amount   REAL DEFAULT 0,
      paid_amount    REAL DEFAULT 0,
      debt_amount    REAL DEFAULT 0,
      payment_method TEXT DEFAULT 'cash',
      note           TEXT DEFAULT '',
      user_name      TEXT DEFAULT 'Admin',
      created_at     DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(supplier_id) REFERENCES suppliers(id)
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS supplier_invoice_items (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      invoice_id   INTEGER NOT NULL,
      product_id   INTEGER NOT NULL,
      product_name TEXT NOT NULL,
      quantity     REAL NOT NULL,
      buy_price    REAL DEFAULT 0,
      total_price  REAL DEFAULT 0,
      unit         TEXT DEFAULT 'dona',
      FOREIGN KEY(invoice_id) REFERENCES supplier_invoices(id)
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS supplier_payments (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      supplier_id    INTEGER NOT NULL,
      amount         REAL NOT NULL,
      payment_method TEXT DEFAULT 'cash',
      note           TEXT DEFAULT '',
      user_name      TEXT DEFAULT 'Admin',
      created_at     DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(supplier_id) REFERENCES suppliers(id)
    );

    CREATE TABLE IF NOT EXISTS sub_warehouses (
      id   INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      note TEXT DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS stock_transfers (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      transfer_number  TEXT,
      source_warehouse TEXT NOT NULL,
      target_warehouse TEXT NOT NULL,
      user_name        TEXT DEFAULT 'Admin',
      note             TEXT DEFAULT '',
      created_at       DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS stock_transfer_items (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      transfer_id INTEGER NOT NULL,
      product_id  INTEGER NOT NULL,
      quantity    REAL NOT NULL,
      FOREIGN KEY(transfer_id) REFERENCES stock_transfers(id) ON DELETE CASCADE,
      FOREIGN KEY(product_id) REFERENCES products(id)
    );
  `);

  try {
    const swCount = db.prepare("SELECT COUNT(*) as count FROM sub_warehouses").get()?.count || 0;
    if (swCount === 0) {
      const initSWs = ["Bosh Ombor (Markaziy)", "Oshxona (Issiq cex)", "Bar", "Xolodniy cex (Salatlar)", "Qandolat / Pishiriq"];
      const stmtSW = db.prepare("INSERT OR IGNORE INTO sub_warehouses (name) VALUES (?)");
      for (const sw of initSWs) {
        stmtSW.run(sw);
      }
    }
  } catch (_) {}



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
  
  if (!db.prepare("SELECT value FROM settings WHERE key = 'business_type'").get()) {
    db.prepare("INSERT INTO settings (key, value) VALUES ('business_type', 'retail')").run();
  }
  if (!db.prepare("SELECT value FROM settings WHERE key = 'ngrok_token'").get()) {
    db.prepare("INSERT INTO settings (key, value) VALUES ('ngrok_token', '')").run();
  }
  if (!db.prepare("SELECT value FROM settings WHERE key = 'ngrok_domain'").get()) {
    db.prepare("INSERT INTO settings (key, value) VALUES ('ngrok_domain', '')").run();
  }
  if (!db.prepare("SELECT value FROM settings WHERE key = 'gemini_api_key'").get()) {
    db.prepare("INSERT INTO settings (key, value) VALUES ('gemini_api_key', '')").run();
  }
  const DEFAULT_TG_BOT_TOKEN = '8621843458:AAGBnjR3LwNDWfnKnnKmB9EQpqlm57tnr84';
  const DEFAULT_TG_CHAT_ID = '-5583805832';

  const curBotToken = db.prepare("SELECT value FROM settings WHERE key = 'telegram_bot_token'").get();
  if (!curBotToken || !curBotToken.value || curBotToken.value.trim() === '') {
    db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('telegram_bot_token', ?)").run(DEFAULT_TG_BOT_TOKEN);
  }
  const curChatId = db.prepare("SELECT value FROM settings WHERE key = 'telegram_chat_id'").get();
  if (!curChatId || !curChatId.value || curChatId.value.trim() === '') {
    db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('telegram_chat_id', ?)").run(DEFAULT_TG_CHAT_ID);
  }
  // Telegram Attendance (Multi-venue) Settings
  try { db.exec("ALTER TABLE settings ADD COLUMN telegram_attendance_token TEXT"); } catch (_) {}
  try { db.exec("ALTER TABLE settings ADD COLUMN telegram_attendance_chat_id TEXT"); } catch (_) {}
  try { db.exec("ALTER TABLE settings ADD COLUMN cafe_name TEXT"); } catch (_) {}

  if (!db.prepare("SELECT value FROM settings WHERE key = 'telegram_attendance_token'").get()) {
    db.prepare("INSERT INTO settings (key, value) VALUES ('telegram_attendance_token', '8621843458:AAGBnjR3LwNDWfnKnnKmB9EQpqlm57tnr84')").run();
  }
  if (!db.prepare("SELECT value FROM settings WHERE key = 'telegram_attendance_chat_id'").get()) {
    db.prepare("INSERT INTO settings (key, value) VALUES ('telegram_attendance_chat_id', '')").run();
  }
  if (!db.prepare("SELECT value FROM settings WHERE key = 'cafe_name'").get()) {
    const sNameRow = db.prepare("SELECT value FROM settings WHERE key = 'store_name'").get();
    db.prepare("INSERT INTO settings (key, value) VALUES ('cafe_name', ?)").run(sNameRow?.value || 'Mening Kafem');
  }

  // Synchronize column values for single-row / direct column queries
  try {
    const tokenVal = db.prepare("SELECT value FROM settings WHERE key = 'telegram_attendance_token'").get()?.value || '';
    const chatVal = db.prepare("SELECT value FROM settings WHERE key = 'telegram_attendance_chat_id'").get()?.value || '';
    const cafeVal = db.prepare("SELECT value FROM settings WHERE key = 'cafe_name'").get()?.value || '';
    db.prepare("UPDATE settings SET telegram_attendance_token = ?, telegram_attendance_chat_id = ?, cafe_name = ? WHERE key = 'telegram_attendance_token'").run(
      tokenVal,
      chatVal,
      cafeVal
    );
  } catch (_) {}
  if (!db.prepare("SELECT value FROM settings WHERE key = 'terminal_mode'").get()) {
    db.prepare("INSERT INTO settings (key, value) VALUES ('terminal_mode', 'false')").run();
  }
  if (!db.prepare("SELECT value FROM settings WHERE key = 'allow_mobile_qr'").get()) {
    db.prepare("INSERT INTO settings (key, value) VALUES ('allow_mobile_qr', 'false')").run();
  }
  if (!db.prepare("SELECT value FROM settings WHERE key = 'allow_attendance_qr'").get()) {
    db.prepare("INSERT INTO settings (key, value) VALUES ('allow_attendance_qr', 'false')").run();
  }
  if (!db.prepare("SELECT value FROM settings WHERE key = 'telegram_url'").get()) {
    db.prepare("INSERT INTO settings (key, value) VALUES ('telegram_url', '')").run();
  }
  if (!db.prepare("SELECT value FROM settings WHERE key = 'instagram_url'").get()) {
    db.prepare("INSERT INTO settings (key, value) VALUES ('instagram_url', '')").run();
  }
  if (!db.prepare("SELECT value FROM settings WHERE key = 'kitchen_printer'").get()) {
    db.prepare("INSERT INTO settings (key, value) VALUES ('kitchen_printer', '')").run();
  }
  if (!db.prepare("SELECT value FROM settings WHERE key = 'bar_printer'").get()) {
    db.prepare("INSERT INTO settings (key, value) VALUES ('bar_printer', '')").run();
  }
  if (!db.prepare("SELECT value FROM settings WHERE key = 'cold_printer'").get()) {
    db.prepare("INSERT INTO settings (key, value) VALUES ('cold_printer', '')").run();
  }
  if (!db.prepare("SELECT value FROM settings WHERE key = 'oshxona_1_printer'").get()) {
    db.prepare("INSERT INTO settings (key, value) VALUES ('oshxona_1_printer', '')").run();
  }
  if (!db.prepare("SELECT value FROM settings WHERE key = 'oshxona_2_printer'").get()) {
    db.prepare("INSERT INTO settings (key, value) VALUES ('oshxona_2_printer', '')").run();
  }
  if (!db.prepare("SELECT value FROM settings WHERE key = 'oshxona_3_printer'").get()) {
    db.prepare("INSERT INTO settings (key, value) VALUES ('oshxona_3_printer', '')").run();
  }
  if (!db.prepare("SELECT value FROM settings WHERE key = 'bar_1_printer'").get()) {
    db.prepare("INSERT INTO settings (key, value) VALUES ('bar_1_printer', '')").run();
  }
  if (!db.prepare("SELECT value FROM settings WHERE key = 'bar_2_printer'").get()) {
    db.prepare("INSERT INTO settings (key, value) VALUES ('bar_2_printer', '')").run();
  }
  if (!db.prepare("SELECT value FROM settings WHERE key = 'bar_3_printer'").get()) {
    db.prepare("INSERT INTO settings (key, value) VALUES ('bar_3_printer', '')").run();
  }
  if (!db.prepare("SELECT value FROM settings WHERE key = 'xolodniy_1_printer'").get()) {
    db.prepare("INSERT INTO settings (key, value) VALUES ('xolodniy_1_printer', '')").run();
  }
  if (!db.prepare("SELECT value FROM settings WHERE key = 'xolodniy_2_printer'").get()) {
    db.prepare("INSERT INTO settings (key, value) VALUES ('xolodniy_2_printer', '')").run();
  }
  if (!db.prepare("SELECT value FROM settings WHERE key = 'xolodniy_3_printer'").get()) {
    db.prepare("INSERT INTO settings (key, value) VALUES ('xolodniy_3_printer', '')").run();
  }
  if (!db.prepare("SELECT value FROM settings WHERE key = 'receipt_lang'").get()) {
    db.prepare("INSERT INTO settings (key, value) VALUES ('receipt_lang', 'uz')").run();
  }

  // ── Product Groups ────────────────────────────────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS product_groups (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      group_name TEXT NOT NULL UNIQUE
    );
  `);
  
  const groupCount = db.prepare("SELECT COUNT(*) as count FROM product_groups").get().count;
  if (groupCount === 0) {
    db.prepare("INSERT INTO product_groups (group_name) VALUES ('Go''sht mahsulotlari')").run();
    db.prepare("INSERT INTO product_groups (group_name) VALUES ('Sabzavotlar')").run();
    db.prepare("INSERT INTO product_groups (group_name) VALUES ('Ichimliklar')").run();
    db.prepare("INSERT INTO product_groups (group_name) VALUES ('Sut mahsulotlari')").run();
    db.prepare("INSERT INTO product_groups (group_name) VALUES ('Fast-food masalliqlari')").run();
  }

  // ── Waiters & Restaurant Tables ───────────────────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS waiters (
      id       INTEGER PRIMARY KEY AUTOINCREMENT,
      name     TEXT NOT NULL,
      pin_code TEXT NOT NULL UNIQUE,
      role     TEXT NOT NULL CHECK(role IN ('admin', 'waiter')),
      percentage REAL NOT NULL DEFAULT 10,
      salary   REAL NOT NULL DEFAULT 0
    );
  `);

  const waiterCount = db.prepare("SELECT COUNT(*) as count FROM waiters").get().count;
  if (waiterCount === 0) {
    db.prepare("INSERT INTO waiters (name, pin_code, role, percentage) VALUES ('Alisher', '1234', 'waiter', 10)").run();
    db.prepare("INSERT INTO waiters (name, pin_code, role, percentage) VALUES ('Madina', '5678', 'waiter', 10)").run();
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS restaurant_zones (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS restaurant_tables (
      id     INTEGER PRIMARY KEY AUTOINCREMENT,
      name   TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL DEFAULT 'free' CHECK(status IN ('free', 'occupied')),
      zone   TEXT NOT NULL DEFAULT 'Zal',
      locked_by TEXT,
      is_printed INTEGER DEFAULT 0,
      opened_at TEXT
    );
  `);

  const tableCount = db.prepare("SELECT COUNT(*) as count FROM restaurant_tables").get().count;
  if (tableCount === 0) {
    db.prepare("INSERT INTO restaurant_tables (name, status) VALUES ('Стол 1', 'free')").run();
    db.prepare("INSERT INTO restaurant_tables (name, status) VALUES ('Стол 2', 'free')").run();
    db.prepare("INSERT INTO restaurant_tables (name, status) VALUES ('Стол 3', 'free')").run();
    db.prepare("INSERT INTO restaurant_tables (name, status) VALUES ('Стол 4', 'free')").run();
    db.prepare("INSERT INTO restaurant_tables (name, status) VALUES ('Стол 5', 'free')").run();
    db.prepare("INSERT INTO restaurant_tables (name, status) VALUES ('VIP 1', 'free')").run();
    db.prepare("INSERT INTO restaurant_tables (name, status) VALUES ('VIP 2', 'free')").run();
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS restaurant_orders (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      table_id     INTEGER NOT NULL,
      waiter_id    INTEGER NOT NULL,
      total_amount REAL NOT NULL DEFAULT 0,
      status       TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'completed', 'cancelled')),
      created_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(table_id) REFERENCES restaurant_tables(id),
      FOREIGN KEY(waiter_id) REFERENCES waiters(id)
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS restaurant_order_items (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id     INTEGER NOT NULL,
      product_id   INTEGER NOT NULL,
      product_name TEXT NOT NULL,
      qty          REAL NOT NULL,
      price        REAL NOT NULL,
      added_at     DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(order_id) REFERENCES restaurant_orders(id),
      FOREIGN KEY(product_id) REFERENCES products(id)
    );
  `);

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
      pin  TEXT NOT NULL UNIQUE,
      role TEXT NOT NULL DEFAULT 'cashier',
      salary REAL NOT NULL DEFAULT 0
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
      is_closed    INTEGER DEFAULT 0,
      source       TEXT DEFAULT 'cash'
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
  try {
    db.exec("ALTER TABLE expenses ADD COLUMN source TEXT DEFAULT 'cash'");
  } catch (err) {
    // Column already exists, safe to ignore
  }

  // RESTAURANT EXPANSION MIGRATIONS
  try { db.exec("ALTER TABLE products ADD COLUMN printer_destination TEXT DEFAULT 'none'"); } catch (_) {}
  try { db.exec("ALTER TABLE products ADD COLUMN business_type TEXT DEFAULT 'retail'"); } catch (_) {}
  try { db.exec("ALTER TABLE products ADD COLUMN category TEXT DEFAULT 'Boshqa'"); } catch (_) {}
  try { db.exec("ALTER TABLE waiters ADD COLUMN percentage REAL NOT NULL DEFAULT 10"); } catch (_) {}
  try { db.exec("ALTER TABLE restaurant_tables ADD COLUMN zone TEXT NOT NULL DEFAULT 'Zal'"); } catch (_) {}
  try { db.exec("ALTER TABLE cashiers ADD COLUMN role TEXT NOT NULL DEFAULT 'cashier'"); } catch (_) {}
  try { db.exec("ALTER TABLE cashiers ADD COLUMN salary REAL NOT NULL DEFAULT 0"); } catch (_) {}
  try { db.exec("ALTER TABLE sales ADD COLUMN waiter_id INTEGER"); } catch (_) {}
  try { db.exec("ALTER TABLE sales ADD COLUMN waiter_name TEXT"); } catch (_) {}
  try { db.exec("ALTER TABLE sales ADD COLUMN waiter_percentage REAL DEFAULT 0"); } catch (_) {}
  try { db.exec("ALTER TABLE sales ADD COLUMN waiter_commission REAL DEFAULT 0"); } catch (_) {}
  try { db.exec("ALTER TABLE sales ADD COLUMN service_fee_percent REAL DEFAULT 0"); } catch (_) {}
  try { db.exec("ALTER TABLE sales ADD COLUMN service_fee_amount REAL DEFAULT 0"); } catch (_) {}
  try { db.exec("ALTER TABLE sales ADD COLUMN is_takeaway INTEGER DEFAULT 0"); } catch (_) {}
  try { db.exec("ALTER TABLE sales ADD COLUMN comment TEXT DEFAULT ''"); } catch (_) {}
  try { db.exec("INSERT OR IGNORE INTO settings (key, value) VALUES ('terminal_mode', '0')"); } catch (_) {}
  try { db.exec("INSERT OR IGNORE INTO settings (key, value) VALUES ('cafe_service_percent', '10')"); } catch (_) {}
  try { db.exec("INSERT OR IGNORE INTO settings (key, value) VALUES ('cafe_service_enabled', 'true')"); } catch (_) {}
  try { db.exec("ALTER TABLE waiters ADD COLUMN salary REAL NOT NULL DEFAULT 0"); } catch (_) {}
  try { db.exec("ALTER TABLE cashiers ADD COLUMN percentage REAL NOT NULL DEFAULT 0"); } catch (_) {}

  // Create attendance table
  db.exec(`
    CREATE TABLE IF NOT EXISTS attendance (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      employee_id INTEGER NOT NULL,
      employee_type TEXT NOT NULL CHECK(employee_type IN ('cashier', 'waiter')),
      date TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('present', 'absent')),
      UNIQUE(employee_id, employee_type, date)
    );
  `);
  try { db.exec("ALTER TABLE attendance ADD COLUMN photo TEXT"); } catch (_) {}
  try { db.exec("ALTER TABLE attendance ADD COLUMN time TEXT"); } catch (_) {}
  try { db.exec("ALTER TABLE attendance ADD COLUMN created_at DATETIME DEFAULT CURRENT_TIMESTAMP"); } catch (_) {}
  try { db.exec("ALTER TABLE attendance ADD COLUMN check_in_time TEXT"); } catch (_) {}
  try { db.exec("ALTER TABLE attendance ADD COLUMN check_out_time TEXT"); } catch (_) {}
  try { db.exec("ALTER TABLE attendance ADD COLUMN check_in_photo TEXT"); } catch (_) {}
  try { db.exec("ALTER TABLE attendance ADD COLUMN check_out_photo TEXT"); } catch (_) {}
  try { db.exec("ALTER TABLE attendance ADD COLUMN last_action TEXT"); } catch (_) {}

  // Recipes, Locking & Printed Migrations
  db.exec(`
    CREATE TABLE IF NOT EXISTS product_ingredients (
      id                    INTEGER PRIMARY KEY AUTOINCREMENT,
      parent_product_id     INTEGER NOT NULL,
      ingredient_product_id INTEGER NOT NULL,
      quantity              REAL NOT NULL,
      FOREIGN KEY(parent_product_id) REFERENCES products(id) ON DELETE CASCADE,
      FOREIGN KEY(ingredient_product_id) REFERENCES products(id) ON DELETE CASCADE
    );
  `);
  try { db.exec("ALTER TABLE product_ingredients ADD COLUMN waste_percentage REAL DEFAULT 0"); } catch (_) {}
  try { db.exec("ALTER TABLE restaurant_tables ADD COLUMN locked_by TEXT"); } catch (_) {}
  try { db.exec("ALTER TABLE restaurant_tables ADD COLUMN is_printed INTEGER DEFAULT 0"); } catch (_) {}
  try { db.exec("ALTER TABLE restaurant_tables ADD COLUMN opened_at TEXT"); } catch (_) {}
  try { db.exec("UPDATE restaurant_tables SET locked_by = NULL"); } catch (_) {}
  try { db.exec("ALTER TABLE products ADD COLUMN type TEXT DEFAULT 'ready_dish'"); } catch (_) {}
  try { db.exec("ALTER TABLE products ADD COLUMN group_id INTEGER"); } catch (_) {}
  try { db.exec("ALTER TABLE restaurant_order_items ADD COLUMN added_at DATETIME DEFAULT CURRENT_TIMESTAMP"); } catch (_) {}
  try { db.exec("ALTER TABLE restaurant_orders ADD COLUMN order_number INTEGER"); } catch (_) {}
  try { db.exec("ALTER TABLE restaurant_orders ADD COLUMN kitchen_status TEXT NOT NULL DEFAULT 'preparing'"); } catch (_) {}
  try { db.exec("ALTER TABLE restaurant_orders ADD COLUMN order_type TEXT NOT NULL DEFAULT 'dine_in'"); } catch (_) {}
  try { db.exec("ALTER TABLE restaurant_orders ADD COLUMN ready_at DATETIME"); } catch (_) {}

  // ── Inventory Audits (Reviziya) ──────────────────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS audits (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      audit_date DATETIME DEFAULT CURRENT_TIMESTAMP,
      created_by TEXT DEFAULT 'Admin',
      total_shortage_sum REAL DEFAULT 0,
      total_surplus_sum REAL DEFAULT 0,
      net_difference_sum REAL DEFAULT 0,
      status TEXT DEFAULT 'completed',
      notes TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_audits_date ON audits(audit_date);

    CREATE TABLE IF NOT EXISTS audit_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      audit_id INTEGER NOT NULL,
      item_id INTEGER NOT NULL,
      item_type TEXT DEFAULT 'product',
      item_name TEXT NOT NULL,
      unit TEXT NOT NULL,
      expected_qty REAL NOT NULL,
      actual_qty REAL NOT NULL,
      diff_qty REAL NOT NULL,
      cost_price REAL NOT NULL,
      total_cost_diff REAL NOT NULL,
      FOREIGN KEY (audit_id) REFERENCES audits(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_audit_items_audit_id ON audit_items(audit_id);
  `);

  // Insert default cashiers if empty
  const cashierCount = db.prepare("SELECT COUNT(*) as count FROM cashiers").get().count;
  if (cashierCount === 0) {
    db.prepare("INSERT INTO cashiers (name, pin, role, salary) VALUES ('Admin', '1111', 'admin', 0)").run();
    db.prepare("INSERT INTO cashiers (name, pin, role, salary) VALUES ('Kassir', '2222', 'cashier', 0)").run();
  }

  // Clear old Russian tables if they exist
  try {
    db.prepare("DELETE FROM restaurant_tables WHERE status = 'free' AND (name LIKE 'Стол %' OR name LIKE 'VIP %')").run();
  } catch (_) {}

  // Seed restaurant zones and tables only once if empty
  const zoneCount = db.prepare("SELECT COUNT(*) as count FROM restaurant_zones").get().count;
  if (zoneCount === 0) {
    const seedZones = ['Stol', 'Zal', 'Terrassa', 'Chorpoya', '2-qavat', 'Podval', 'Banket', 'Dostavka'];
    for (const zone of seedZones) {
      try {
        db.prepare("INSERT OR IGNORE INTO restaurant_zones (name) VALUES (?)").run(zone);
      } catch (_) {}
      
      for (let i = 1; i <= 30; i++) {
        const name = `${zone} ${i}`;
        try {
          db.prepare("INSERT OR IGNORE INTO restaurant_tables (name, zone, status) VALUES (?, ?, 'free')").run(name, zone);
        } catch (_) {}
      }
    }
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

  // Set default usd_rate if not exists
  try {
    db.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES ('usd_rate', '12800')").run();
    db.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES ('auto_usd_rate', '1')").run();
  } catch (_) {}

  // Check if auto-sync is enabled
  let autoSync = '1';
  try {
    const row = db.prepare("SELECT value FROM settings WHERE key = 'auto_usd_rate'").get();
    if (row) autoSync = row.value;
  } catch (_) {}

  if (autoSync === '1') {
    // Auto-fetch USD rate from CBU on startup
    fetchUSDExchangeRate().then(rate => {
      if (rate > 0) {
        db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('usd_rate', ?)").run(String(rate));
        console.log('CBU Exchange rate auto-synced:', rate);
      }
    }).catch(err => {
      console.log('CBU Exchange rate auto-sync failed (offline/error):', err.message);
    });
  }

}
function closeDB() {
  if (db) {
    db.close();
    db = null;
  }
}

function fetchUSDExchangeRate() {
  return new Promise((resolve, reject) => {
    https.get('https://cbu.uz/uz/arkhiv-kursov-valyut/json/', (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const arr = JSON.parse(data);
          const usd = arr.find(item => item.Ccy === 'USD');
          if (usd && usd.Rate) {
            resolve(parseFloat(usd.Rate));
          } else {
            reject(new Error('USD rate not found in CBU response'));
          }
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', (err) => {
      reject(err);
    });
  });
}

async function syncUsdRate() {
  try {
    const rate = await fetchUSDExchangeRate();
    if (rate > 0) {
      db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('usd_rate', ?)").run(String(rate));
      return { success: true, rate };
    }
    throw new Error('Noto\'g\'ri kurs qiymati');
  } catch (err) {
    return { success: false, error: err.message };
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
    if (['telegram_attendance_token', 'telegram_attendance_chat_id', 'cafe_name'].includes(key)) {
      try {
        db.prepare(`UPDATE settings SET ${key} = ? WHERE key = 'telegram_attendance_token'`).run(value);
      } catch (_) {}
    }
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

function getAttendanceSettings() {
  try {
    // 1. Try selecting directly from columns if available
    try {
      const colRow = db.prepare("SELECT telegram_attendance_token, telegram_attendance_chat_id, cafe_name FROM settings WHERE telegram_attendance_token IS NOT NULL LIMIT 1").get();
      if (colRow && (colRow.telegram_attendance_token || colRow.telegram_attendance_chat_id || colRow.cafe_name)) {
        const storeRow = db.prepare("SELECT value FROM settings WHERE key = 'store_name'").get();
        return {
          telegram_attendance_token: colRow.telegram_attendance_token || '',
          telegram_attendance_chat_id: colRow.telegram_attendance_chat_id || '',
          cafe_name: colRow.cafe_name || storeRow?.value || 'Kafe'
        };
      }
    } catch (_) {}

    // 2. Select from key-value
    const tokenRow = db.prepare("SELECT value FROM settings WHERE key = 'telegram_attendance_token'").get();
    const chatRow = db.prepare("SELECT value FROM settings WHERE key = 'telegram_attendance_chat_id'").get();
    const cafeRow = db.prepare("SELECT value FROM settings WHERE key = 'cafe_name'").get();
    const storeRow = db.prepare("SELECT value FROM settings WHERE key = 'store_name'").get();
    const startRow = db.prepare("SELECT value FROM settings WHERE key = 'work_start_time'").get();
    const endRow = db.prepare("SELECT value FROM settings WHERE key = 'work_end_time'").get();
    const graceRow = db.prepare("SELECT value FROM settings WHERE key = 'late_grace_minutes'").get();

    return {
      telegram_attendance_token: tokenRow?.value || '',
      telegram_attendance_chat_id: chatRow?.value || '',
      cafe_name: cafeRow?.value || storeRow?.value || 'Kafe',
      work_start_time: startRow?.value || '09:00',
      work_end_time: endRow?.value || '18:00',
      late_grace_minutes: graceRow?.value || '5'
    };
  } catch (err) {
    return {
      telegram_attendance_token: '',
      telegram_attendance_chat_id: '',
      cafe_name: 'Kafe',
      work_start_time: '09:00',
      work_end_time: '18:00',
      late_grace_minutes: '5'
    };
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

function loadRestaurantBase() {
  try {
    db.exec('BEGIN TRANSACTION');
    
    // 1. Raw materials list
    const rawMaterials = [
      { name: "Go'sht (Mol go'shti)", barcode: "90001", buy_price: 85000, sell_price: 0, stock: 50, unit: "kg", category: "Xom-ashyolar", type: "raw_material" },
      { name: "Tovuq go'shti", barcode: "90002", buy_price: 45000, sell_price: 0, stock: 40, unit: "kg", category: "Xom-ashyolar", type: "raw_material" },
      { name: "Pomidor", barcode: "90003", buy_price: 15000, sell_price: 0, stock: 35, unit: "kg", category: "Xom-ashyolar", type: "raw_material" },
      { name: "Pishloq", barcode: "90004", buy_price: 70000, sell_price: 0, stock: 20, unit: "kg", category: "Xom-ashyolar", type: "raw_material" },
      { name: "Lavash xamiri", barcode: "90005", buy_price: 1500, sell_price: 0, stock: 150, unit: "dona", category: "Xom-ashyolar", type: "raw_material" }
    ];
    
    const insertProduct = db.prepare(`
      INSERT INTO products (name, barcode, buy_price, sell_price, stock, unit, category, type, business_type)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'restaurant')
    `);
    
    const rawIds = {};
    for (const p of rawMaterials) {
      const existing = db.prepare("SELECT id FROM products WHERE barcode = ?").get(p.barcode);
      if (!existing) {
        const info = insertProduct.run(p.name, p.barcode, p.buy_price, p.sell_price, p.stock, p.unit, p.category, p.type);
        rawIds[p.name] = info.lastInsertRowid;
      } else {
        rawIds[p.name] = existing.id;
      }
    }
    
    // 2. Ready dishes list
    const readyDishes = [
      { 
        name: "Mol go'shtli lavash", barcode: "90006", sell_price: 35000, category: "Lavashlar", type: "ready_dish",
        ingredients: [
          { name: "Go'sht (Mol go'shti)", qty: 0.1 },
          { name: "Pomidor", qty: 0.05 },
          { name: "Lavash xamiri", qty: 1 }
        ]
      },
      { 
        name: "Tovuqli lavash", barcode: "90007", sell_price: 30000, category: "Lavashlar", type: "ready_dish",
        ingredients: [
          { name: "Tovuq go'shti", qty: 0.1 },
          { name: "Pomidor", qty: 0.05 },
          { name: "Lavash xamiri", qty: 1 }
        ]
      },
      { 
        name: "Pishloqli lavash", barcode: "90008", sell_price: 32000, category: "Lavashlar", type: "ready_dish",
        ingredients: [
          { name: "Pishloq", qty: 0.08 },
          { name: "Lavash xamiri", qty: 1 }
        ]
      }
    ];
    
    for (const d of readyDishes) {
      const existing = db.prepare("SELECT id FROM products WHERE barcode = ?").get(d.barcode);
      let dishId;
      if (!existing) {
        const info = insertProduct.run(d.name, d.barcode, 0, d.sell_price, 0, 'dona', d.category, d.type);
        dishId = info.lastInsertRowid;
      } else {
        dishId = existing.id;
      }
      
      db.prepare("DELETE FROM product_ingredients WHERE parent_product_id = ?").run(dishId);
      
      let calculatedCost = 0;
      const insertIng = db.prepare("INSERT INTO product_ingredients (parent_product_id, ingredient_product_id, quantity) VALUES (?, ?, ?)");
      for (const ing of d.ingredients) {
        const ingId = rawIds[ing.name];
        if (ingId) {
          insertIng.run(dishId, ingId, ing.qty);
          const ingProduct = db.prepare("SELECT buy_price FROM products WHERE id = ?").get(ingId);
          if (ingProduct) {
            calculatedCost += (ingProduct.buy_price * ing.qty);
          }
        }
      }
      db.prepare("UPDATE products SET buy_price = ?, cost_price = ? WHERE id = ?").run(calculatedCost, calculatedCost, dishId);
      calculateAvailablePortions(dishId);
    }
    
    db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").run('is_base_loaded', 'true');
    db.exec('COMMIT');
    return { success: true };
  } catch (err) {
    try { db.exec('ROLLBACK'); } catch(_) {}
    return { success: false, error: err.message };
  }
}

function loadInitialBase(type) {
  try {
    const check = checkBaseLoaded();
    const countRes = db.prepare("SELECT COUNT(*) as count FROM products").get();
    const count = countRes ? countRes.count : 0;
    if (check.loaded && count > 0) {
      return { success: true, alreadyLoaded: true };
    }

    if (type !== 'grocery' && type !== 'restaurant') {
      return { success: false, error: 'Invalid base type' };
    }

    if (type === 'restaurant') {
      return loadRestaurantBase();
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
    try { db.exec('ROLLBACK'); } catch (_) {}
    return { success: false, error: err.message };
  }
}


// ── Cashiers & Authentication ────────────────────────────────────────────────
function verifyPin(pin) {
  try {
    const cashier = db.prepare("SELECT id, name, role, salary FROM cashiers WHERE pin = ?").get(pin);
    if (cashier) {
      return { success: true, valid: true, cashier };
    }
    const waiter = db.prepare("SELECT id, name, role, salary FROM waiters WHERE pin_code = ?").get(pin);
    if (waiter) {
      return {
        success: true,
        valid: true,
        cashier: {
          id: waiter.id,
          name: waiter.name,
          role: 'waiter',
          salary: waiter.salary || 0
        }
      };
    }
    return { success: true, valid: false, cashier: null };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

function getCashiers() {
  try {
    const rows = db.prepare("SELECT id, name, pin, role, salary, percentage FROM cashiers ORDER BY id ASC").all();
    return { success: true, data: rows };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

function addCashier(name, pin, role = 'cashier', salary = 0, percentage = 0) {
  try {
    // Check if pin exists in cashiers or waiters
    const exists = db.prepare("SELECT id FROM cashiers WHERE pin = ?").get(pin);
    if (exists) return { success: false, error: 'pin_exists' };
    const waiterExists = db.prepare("SELECT id FROM waiters WHERE pin_code = ?").get(pin);
    if (waiterExists) return { success: false, error: 'pin_exists' };
    
    db.prepare("INSERT INTO cashiers (name, pin, role, salary, percentage) VALUES (?, ?, ?, ?, ?)").run(name, pin, role, salary, percentage);
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
    const waiterExists = db.prepare("SELECT id FROM waiters WHERE pin_code = ?").get(newPin);
    if (waiterExists) return { success: false, error: 'pin_exists' };

    db.prepare("UPDATE cashiers SET pin = ? WHERE id = ?").run(newPin, id);
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// ── Waiters Management ──
function getWaiters() {
  try {
    const rows = db.prepare("SELECT id, name, pin_code, role, percentage, salary FROM waiters ORDER BY id ASC").all();
    return { success: true, data: rows };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

function addWaiter(name, pinCode, percentage = 10, salary = 0) {
  try {
    const exists = db.prepare("SELECT id FROM waiters WHERE pin_code = ?").get(pinCode);
    if (exists) return { success: false, error: 'pin_exists' };
    const cashierExists = db.prepare("SELECT id FROM cashiers WHERE pin = ?").get(pinCode);
    if (cashierExists) return { success: false, error: 'pin_exists' };
    
    db.prepare("INSERT INTO waiters (name, pin_code, role, percentage, salary) VALUES (?, ?, 'waiter', ?, ?)").run(name, pinCode, percentage, salary);
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

function deleteWaiter(id) {
  try {
    db.prepare("DELETE FROM waiters WHERE id = ?").run(id);
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

function getActiveBusinessType() {
  try {
    const row = db.prepare("SELECT value FROM settings WHERE key = 'business_type'").get();
    return row ? row.value : 'retail';
  } catch (err) {
    return 'retail';
  }
}

function attachStopStatusToProducts(products) {
  if (!products || products.length === 0) return products;
  try {
    const allIngredients = db.prepare(`
      SELECT i.parent_product_id, i.ingredient_product_id, i.quantity, i.waste_percentage, p.name, p.stock, p.unit, p.is_stopped
      FROM product_ingredients i
      JOIN products p ON i.ingredient_product_id = p.id
    `).all();

    const ingredientsByParent = {};
    for (const ing of allIngredients) {
      if (!ingredientsByParent[ing.parent_product_id]) {
        ingredientsByParent[ing.parent_product_id] = [];
      }
      ingredientsByParent[ing.parent_product_id].push(ing);
    }

    for (const p of products) {
      p.is_stopped = p.is_stopped ? 1 : 0;
      p.is_unlimited = p.is_unlimited ? 1 : 0;
      p.stop_limit = (p.stop_limit !== null && p.stop_limit !== undefined) ? parseFloat(p.stop_limit) : null;
      p.stop_reason = null;

      const ings = ingredientsByParent[p.id];
      p.has_recipe = (ings && ings.length > 0) ? 1 : 0;

      if (p.has_recipe === 1) {
        let minPortions = Infinity;
        for (const ing of ings) {
          const wastePct = parseFloat(ing.waste_percentage) || 0;
          const effectiveQty = (parseFloat(ing.quantity) || 0) * (1 + wastePct / 100);
          if (effectiveQty > 0) {
            const portions = ing.stock / effectiveQty;
            if (portions < minPortions) minPortions = portions;
          }
        }
        p.recipe_available_portions = minPortions === Infinity ? 0 : Math.max(0, Math.floor(minPortions + 0.0001));
      } else {
        p.recipe_available_portions = null;
      }

      if (p.is_stopped === 1) {
        p.stop_reason = "Stop-listda";
      } else if (p.stop_limit !== null && p.stop_limit <= 0) {
        p.is_stopped = 1;
        p.stop_reason = "Qoldiq tugadi (0 dona)";
      } else if (p.business_type === 'restaurant' && p.has_recipe === 1) {
        for (const ing of ings) {
          if (ing.is_stopped === 1) {
            p.is_stopped = 1;
            p.stop_reason = `Tarkibidagi "${ing.name}" stop-listda`;
            break;
          } else if (ing.stock <= 0 && ing.quantity > 0) {
            p.is_stopped = 1;
            p.stop_reason = `Tarkibidagi "${ing.name}" tugagan (0 ${ing.unit || 'dona'})`;
            break;
          }
        }
      }
    }
  } catch (err) {
    console.error("attachStopStatusToProducts error:", err);
  }
  return products;
}

function toggleProductStop(productId, isStopped) {
  return setProductStopWithLimit({ productId, isStopped, limit: null });
}

function setProductStopWithLimit({ productId, isStopped, limit = null, reason = '', userName = 'Admin/Kassa' }) {
  try {
    const val = isStopped ? 1 : 0;
    const numLimit = (limit !== null && limit !== undefined && limit !== '') ? parseFloat(limit) : null;

    db.prepare('UPDATE products SET is_stopped = ?, stop_limit = ? WHERE id = ?').run(val, numLimit, productId);

    const prod = db.prepare('SELECT name, type, business_type FROM products WHERE id = ?').get(productId);
    if (prod) {
      let note = '';
      if (val === 1) {
        note = `Stop-listga kiritildi${reason ? ` (${reason})` : ''}`;
      } else if (numLimit !== null) {
        note = `Stop-list qoldig'i belgilandi: ${numLimit} dona${reason ? ` (${reason})` : ''}`;
      } else {
        note = "Stop-listdan chiqarildi";
      }

      logInventory({
        productId,
        productName: prod.name,
        actionType: val === 1 ? 'stop_list' : (numLimit !== null ? 'stop_limit' : 'stop_list_ochildi'),
        quantityChanged: 0,
        userName: userName || 'Admin/Kassa',
        note: note
      });

      updateDependentDishesStocks(productId);
    }

    return { success: true, is_stopped: val, stop_limit: numLimit };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

function getProducts() {
  const bType = getActiveBusinessType();
  let rows;
  if (bType === 'restaurant') {
    rows = db.prepare('SELECT * FROM products ORDER BY id DESC').all();
  } else {
    // In retail mode, query retail or untyped products; fallback to all products if none explicitly marked retail
    rows = db.prepare("SELECT * FROM products WHERE business_type = 'retail' OR business_type IS NULL OR business_type = '' ORDER BY id DESC").all();
    if (rows.length === 0) {
      rows = db.prepare('SELECT * FROM products ORDER BY id DESC').all();
    }
  }
  return attachStopStatusToProducts(rows);
}

// Always returns only restaurant sellable menu items (used by waiter mobile app and restaurant cashier)
function getRestaurantOnlyProducts() {
  const rows = db.prepare("SELECT * FROM products WHERE business_type = 'restaurant' AND (type != 'raw_material' OR type IS NULL OR (type = 'raw_material' AND sell_price > 0)) ORDER BY category ASC, name ASC").all();
  return attachStopStatusToProducts(rows);
}


function getCustomers(searchQuery = '') {
  if (searchQuery && searchQuery.trim() !== '') {
    const q = `%${searchQuery.trim().toLowerCase()}%`;
    const cleanQ = `%${searchQuery.replace(/\D/g, '')}%`;
    return db.prepare(`
      SELECT c.*, 
             (SELECT MAX(created_at) FROM sales WHERE customer_id = c.id AND payment_method = 'debt') as last_debt_date,
             EXISTS(SELECT 1 FROM sales WHERE customer_id = c.id AND payment_method = 'debt' AND is_manual_debt = 1) as has_manual_debt,
             EXISTS(SELECT 1 FROM sales WHERE customer_id = c.id AND payment_method = 'debt' AND is_manual_debt = 0) as has_product_debt
      FROM customers c 
      WHERE c.is_deleted = 0 AND (my_lower(c.name) LIKE ? OR clean_phone(c.phone) LIKE ?)
      ORDER BY c.total_debt DESC
    `).all(q, cleanQ);
  }
  return db.prepare(`
    SELECT c.*, 
           (SELECT MAX(created_at) FROM sales WHERE customer_id = c.id AND payment_method = 'debt') as last_debt_date,
           EXISTS(SELECT 1 FROM sales WHERE customer_id = c.id AND payment_method = 'debt' AND is_manual_debt = 1) as has_manual_debt,
           EXISTS(SELECT 1 FROM sales WHERE customer_id = c.id AND payment_method = 'debt' AND is_manual_debt = 0) as has_product_debt
    FROM customers c 
    WHERE c.is_deleted = 0
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
        (product_id, product_name, action_type, quantity_changed, balance_after, user_name, note, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(productId, productName, actionType, quantityChanged, balanceAfter, userName, note, getLocalTimeStr());
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
        existing = db.prepare('SELECT id, stock, name, discount, buy_price, cost_price FROM products WHERE LOWER(name) = LOWER(?) OR barcode = ?').get(product.name, barcode);
      } else {
        existing = db.prepare('SELECT id, stock, name, discount, buy_price, cost_price FROM products WHERE LOWER(name) = LOWER(?)').get(product.name);
      }

      if (existing) {
        const addedQty = parseFloat(product.stock) || 0;
        const newBuyPrice  = typeof product.buy_price === 'string' ? (parseInt(product.buy_price.replace(/\D/g, '')) || 0) : (parseFloat(product.buy_price) || 0);
        const newSellPrice = typeof product.sell_price === 'string' ? (parseInt(product.sell_price.replace(/\D/g, '')) || 0) : (parseFloat(product.sell_price) || 0);
        const discount     = product.discount !== undefined ? (parseFloat(product.discount) || 0) : (existing.discount || 0);
        
        const buyPriceUsd = parseFloat(product.buy_price_usd) || 0;
        const usdRate = parseFloat(product.usd_rate) || 0;

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

        db.prepare(`
          UPDATE products 
          SET stock = stock + ?, buy_price = ?, cost_price = ?, sell_price = ?, unit = ?, discount = ?, type = ?, group_id = ?, buy_price_usd = ?, usd_rate = ?
          WHERE id = ?
        `).run(addedQty, newBuyPrice, newAvgCost, newSellPrice, product.unit || 'dona', discount, product.type || 'ready_dish', product.group_id || null, buyPriceUsd, usdRate, existing.id);
        
        if (addedQty > 0) {
          logInventory({
            productId: existing.id,
            productName: existing.name,
            actionType: 'kirim',
            quantityChanged: +addedQty,
            userName: product.userName || '',
            note: product.note || `Mavjud tovar ustiga qo'shildi. Eski qoldiq: ${oldQty}, Yangi qoldiq: ${oldQty + addedQty}. Yangi o'rtacha tannarx: ${newAvgCost}`
          });
        }
        updateDependentDishesStocks(existing.id);
        return { success: true, id: existing.id };
      }
    }

    const isUnlimited = product.is_unlimited ? 1 : 0;

    const stmt = db.prepare(`
      INSERT INTO products (name, barcode, buy_price, sell_price, stock, unit, discount, printer_destination, business_type, category, type, group_id, buy_price_usd, usd_rate, is_unlimited, image)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const dest = product.printer_destination || 'none';
    const bType = product.business_type || getActiveBusinessType();
    const cat = product.category || 'Boshqa';
    const buyPriceUsd = parseFloat(product.buy_price_usd) || 0;
    const usdRate = parseFloat(product.usd_rate) || 0;
    const image = product.image || null;

    const info = stmt.run(
      product.name,
      barcode,
      typeof product.buy_price === 'string' ? (parseInt(product.buy_price.replace(/\D/g, '')) || 0) : (parseFloat(product.buy_price) || 0),
      typeof product.sell_price === 'string' ? (parseInt(product.sell_price.replace(/\D/g, '')) || 0) : (parseFloat(product.sell_price) || 0),
      parseFloat(product.stock)      || 0,
      product.unit || 'dona',
      parseFloat(product.discount)   || 0,
      dest,
      bType,
      cat,
      product.type || 'ready_dish',
      product.group_id || null,
      buyPriceUsd,
      usdRate,
      isUnlimited,
      image
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
        note: product.note || 'Yangi mahsulot'
      });
    }
    updateDependentDishesStocks(newId);

    return { success: true, id: newId };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

function batchAddProducts(products) {
  try {
    db.exec('BEGIN TRANSACTION');
    const results = [];
    for (const p of products) {
      const res = addProduct(p);
      if (!res.success) {
        db.exec('ROLLBACK');
        return { success: false, error: res.error };
      }
      results.push(res.id);
    }
    db.exec('COMMIT');
    return { success: true, ids: results };
  } catch (err) {
    db.exec('ROLLBACK');
    return { success: false, error: err.message };
  }
}

function updateProduct(id, product) {
  try {
    const existing = db.prepare('SELECT stock, buy_price, cost_price, is_unlimited, image FROM products WHERE id = ?').get(id);
    const oldQty = existing ? existing.stock : 0;
    const addedQty = parseFloat(product.stock) || 0;
    const newQty = (oldQty + addedQty);

    const barcode = (product.barcode && product.barcode.trim() !== '')
      ? product.barcode.trim()
      : null;

    const discount = product.discount !== undefined ? (parseFloat(product.discount) || 0) : (existing ? (existing.discount || 0) : 0);

    const buyPriceUsd = parseFloat(product.buy_price_usd) || 0;
    const usdRate = parseFloat(product.usd_rate) || 0;

    const newBuyPrice = typeof product.buy_price === 'string' ? (parseInt(product.buy_price.replace(/\D/g, '')) || 0) : (parseFloat(product.buy_price) || 0);
    const oldCostPrice = existing ? (existing.cost_price || existing.buy_price || 0) : 0;

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
      newAvgCost = oldCostPrice > 0 ? oldCostPrice : newBuyPrice;
    }

    const isUnlimited = product.is_unlimited !== undefined ? (product.is_unlimited ? 1 : 0) : (existing ? existing.is_unlimited : 0);

    const finalImage = product.image !== undefined ? (product.image || null) : (existing ? existing.image : null);
    if (existing && existing.image && product.image !== undefined && existing.image !== finalImage) {
      deleteProductImageFile(existing.image);
    }

    const stmt = db.prepare(`
      UPDATE products 
      SET name = ?, barcode = ?, buy_price = ?, cost_price = ?, sell_price = ?, stock = ?, unit = ?, discount = ?, printer_destination = ?, business_type = ?, category = ?, type = ?, group_id = ?, buy_price_usd = ?, usd_rate = ?, is_unlimited = ?, image = ?
      WHERE id = ?
    `);

    stmt.run(
      product.name,
      barcode,
      newBuyPrice,
      newAvgCost,
      typeof product.sell_price === 'string' ? (parseInt(product.sell_price.replace(/\D/g, '')) || 0) : (parseFloat(product.sell_price) || 0),
      newQty,
      product.unit || 'dona',
      discount,
      product.printer_destination || 'none',
      product.business_type || getActiveBusinessType(),
      product.category || 'Boshqa',
      product.type || 'ready_dish',
      product.group_id || null,
      buyPriceUsd,
      usdRate,
      isUnlimited,
      finalImage,
      id
    );

    logInventory({
      productId: id,
      productName: product.name,
      actionType: 'tahrirlash',
      quantityChanged: addedQty,
      userName: product.userName || '',
      note: product.note || `Tahrir qilindi. Eski qoldiq: ${oldQty}, Yangi qoldiq: ${newQty}`
    });

    updateDependentDishesStocks(id);
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

    const newSellPrice = typeof product.sell_price === 'string' ? (parseInt(product.sell_price.replace(/\D/g, '')) || 0) : (parseFloat(product.sell_price) || 0);
    const newBuyPrice  = typeof product.buy_price === 'string' ? (parseInt(product.buy_price.replace(/\D/g, '')) || 0) : (parseFloat(product.buy_price) || 0);
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

    const buyPriceUsd = parseFloat(product.buy_price_usd) || 0;
    const usdRate = parseFloat(product.usd_rate) || 0;

    const stmt = db.prepare(`
      UPDATE products 
      SET name = ?, buy_price = ?, cost_price = ?, sell_price = ?, stock = stock + ?, unit = ?, discount = ?, buy_price_usd = ?, usd_rate = ?
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
      buyPriceUsd,
      usdRate,
      id
    );

    if (addedQty > 0) {
      logInventory({
        productId: id,
        productName: product.name,
        actionType: 'kirim',
        quantityChanged: addedQty,
        userName: product.userName || '',
        note: product.note || `Kirim. Eski qoldiq: ${oldQty}, Yangi qoldiq: ${oldQty + addedQty}. Yangi o'rtacha tannarx: ${newAvgCost}`
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
    try { db.exec('ROLLBACK'); } catch (_) {}
    return { success: false, error: err.message };
  }
}

function deleteProduct(id, userName) {
  try {
    const product = db.prepare('SELECT name, stock, image FROM products WHERE id = ?').get(id);
    if (product) {
      if (product.image) {
        deleteProductImageFile(product.image);
      }
      db.prepare(`
        INSERT INTO inventory_logs
          (product_id, product_name, action_type, quantity_changed, balance_after, user_name, note, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(id, product.name, 'ochirildi', -product.stock, 0, userName || '', 'Mahsulot ombordan o\'chirildi', getLocalTimeStr());
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
    if (byBarcode.length > 0) return attachStopStatusToProducts(byBarcode);

    // Fallback: name LIKE search
    const rows = db.prepare(
      "SELECT * FROM products WHERE my_lower(name) LIKE my_lower(?) ORDER BY name LIMIT 20"
    ).all(`%${term}%`);
    return attachStopStatusToProducts(rows);
  } catch (err) {
    return [];
  }
}

function processSale(cartItems, paymentMethod, customerInfo, cashierName = 'Kassir', discountPercent = 0, device = 'desktop', waiterId = null, comment = '', serviceFeePercent = 0, serviceFeeAmount = 0, isTakeaway = 0) {
  try {
    if (!Array.isArray(cartItems) || cartItems.length === 0) {
      return { success: false, error: 'Savat bo\'sh yoki noto\'g\'ri formatda!' };
    }

    // Input validation: ensure no negative or NaN prices, quantities, or invalid discounts
    for (const item of cartItems) {
      const qty = parseFloat(item.qty);
      const price = parseFloat(item.sell_price);
      const disc = parseFloat(item.discount) || 0;
      if (isNaN(qty) || qty <= 0 || !isFinite(qty)) {
        return { success: false, error: `Noto'g'ri mahsulot miqdori: ${item.name || item.id}` };
      }
      if (isNaN(price) || price < 0 || !isFinite(price)) {
        return { success: false, error: `Noto'g'ri mahsulot narxi: ${item.name || item.id}` };
      }
      if (isNaN(disc) || disc < 0 || disc > 100) {
        return { success: false, error: `Noto'g'ri mahsulot chegirmasi (0-100 oralig'ida bo'lishi kerak): ${item.name || item.id}` };
      }
    }

    let pct = parseFloat(discountPercent) || 0;
    if (isNaN(pct) || pct < 0 || pct > 100) {
      pct = 0;
    }

    db.exec('BEGIN TRANSACTION');

    const originalTotal = cartItems.reduce((sum, item) => sum + (item.sell_price * item.qty), 0);
    
    // Calculate subtotal after item-level discounts
    const subtotal = cartItems.reduce((sum, item) => {
      const itemPct = parseFloat(item.discount) || 0;
      const itemTotal = item.sell_price * item.qty;
      const itemDisc = Math.round(itemTotal * (itemPct / 100));
      return sum + (itemTotal - itemDisc);
    }, 0);

    const discountAmount = Math.round((subtotal * pct) / 100);
    const subtotalAfterDiscount = subtotal - discountAmount;

    // Service fee calculation (0 if takeaway/saboy)
    const isSaboy = isTakeaway === 1 || isTakeaway === true;
    let actualServicePercent = isSaboy ? 0 : (parseFloat(serviceFeePercent) || 0);
    let actualServiceAmount = 0;
    if (!isSaboy) {
      if (serviceFeeAmount && parseFloat(serviceFeeAmount) > 0) {
        actualServiceAmount = parseFloat(serviceFeeAmount);
      } else if (actualServicePercent > 0) {
        actualServiceAmount = Math.round((subtotalAfterDiscount * actualServicePercent) / 100);
      }
    }

    const finalTotal = subtotalAfterDiscount + actualServiceAmount;
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
    let waiterName = null;
    let waiterPercentage = 0;
    let waiterCommission = 0;
    if (waiterId) {
      const w = db.prepare("SELECT name, percentage FROM waiters WHERE id = ?").get(waiterId);
      if (w) {
        waiterName = w.name;
        waiterPercentage = w.percentage || 0;
        waiterCommission = Math.round((subtotalAfterDiscount * waiterPercentage) / 100);
      }
    }

    const saleInfo = db.prepare(`
      INSERT INTO sales (
        total_amount, payment_method, customer_id, cashier_name, 
        shift_receipt_number, original_total, discount_percent, discount_amount, 
        service_fee_percent, service_fee_amount, is_takeaway,
        device, waiter_id, waiter_name, waiter_percentage, waiter_commission, comment, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      finalTotal, paymentMethod, customerId, cashierName, 
      shiftReceiptNumber, originalTotal, pct, discountAmount, 
      actualServicePercent, actualServiceAmount, isSaboy ? 1 : 0,
      device, waiterId, waiterName, waiterPercentage, waiterCommission, comment || '',
      getLocalTimeStr()
    );
    const saleId = saleInfo.lastInsertRowid;

    // 4. Insert Sale Items, Deduct Stock, and Log
    const insertItem  = db.prepare('INSERT INTO sale_items (sale_id, product_id, qty, price, discount_percent, discount_amount, product_name, unit) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
    const deductStock = db.prepare('UPDATE products SET stock = stock - ? WHERE id = ?');

    let payTypeLabel = 'Naqd';
    if (paymentMethod === 'card') payTypeLabel = 'Karta';
    if (paymentMethod === 'debt') payTypeLabel = 'Qarzga';

    const discountLabel = pct > 0 ? `, Skidka: ${pct}%` : '';
    const saleNote = `Chek #${shiftReceiptNumber} (${payTypeLabel}${discountLabel})${device === 'mobile' ? ' (Mobil)' : ''}`;

    for (const item of cartItems) {
      // Check stop-list for product itself
      const prodCheck = db.prepare('SELECT id, name, is_stopped, is_unlimited, stop_limit, stock, business_type FROM products WHERE id = ?').get(item.id);
      if (prodCheck && prodCheck.is_stopped === 1) {
        throw new Error(`stock_error:${prodCheck.name} stop-listda! Uni sotish taqiqlangan.`);
      }

      // Check stop_limit if set (donabay mahsulotlar uchun limit)
      if (prodCheck && prodCheck.stop_limit !== null && prodCheck.stop_limit !== undefined) {
        if (prodCheck.stop_limit < item.qty) {
          throw new Error(`stock_error:${prodCheck.name} uchun faqat ${prodCheck.stop_limit} dona qolgan!`);
        }
      }

      const isUnlimited = prodCheck?.is_unlimited === 1;

      // Check recipe ingredients stock level and stop-list!
      const ingredients = db.prepare(`
        SELECT i.ingredient_product_id, i.quantity, i.waste_percentage, p.name, p.stock, p.unit, p.is_stopped
        FROM product_ingredients i
        JOIN products p ON i.ingredient_product_id = p.id
        WHERE i.parent_product_id = ?
      `).all(item.id);

      for (const ing of ingredients) {
        if (ing.is_stopped === 1) {
          throw new Error(`stock_error:Tarkibidagi "${ing.name}" stop-listda! Uni sotish taqiqlangan.`);
        }
        const effectiveQtyPerUnit = ing.quantity * (1 + (ing.waste_percentage || 0) / 100);
        const requiredQty = effectiveQtyPerUnit * item.qty;
        if (ing.stock < requiredQty) {
          throw new Error(`stock_error:Tarkibidagi "${ing.name}" yetarli emas (Kerak: ${requiredQty.toFixed(3)}, Mavjud: ${ing.stock})`);
        }
      }

      // Concurrency protection for product itself
      const currentStock = prodCheck ? prodCheck.stock : 0;
      if (!isUnlimited && ingredients.length === 0 && currentStock < item.qty) {
        throw new Error(`stock_error:${prodCheck ? prodCheck.name : item.name}:${item.qty}:${currentStock}`);
      }

      const itemPct = parseFloat(item.discount) || 0;
      const itemTotal = item.sell_price * item.qty;
      const itemDiscAmount = Math.round(itemTotal * (itemPct / 100));
      const priceAfterDiscount = item.sell_price * (1 - itemPct / 100);

      insertItem.run(saleId, item.id, item.qty, priceAfterDiscount, itemPct, itemDiscAmount, item.name, item.unit || 'dona');

      // Update stop_limit if active
      if (prodCheck && prodCheck.stop_limit !== null && prodCheck.stop_limit !== undefined) {
        const newLimit = Math.max(0, prodCheck.stop_limit - item.qty);
        if (newLimit <= 0) {
          db.prepare('UPDATE products SET stop_limit = 0, is_stopped = 1 WHERE id = ?').run(item.id);
          logInventory({
            productId: item.id,
            productName: prodCheck.name,
            actionType: 'stop_list',
            quantityChanged: 0,
            userName: cashierName || 'Kassir',
            note: "Qoldiq tugadi va avtomatik stop-listga kiritildi"
          });
        } else {
          db.prepare('UPDATE products SET stop_limit = ? WHERE id = ?').run(newLimit, item.id);
        }
      }

      // If product has ingredients, deduct ingredient stock and log it
      if (ingredients.length > 0) {
        for (const ing of ingredients) {
          const effectiveQtyPerUnit = ing.quantity * (1 + (ing.waste_percentage || 0) / 100);
          const requiredQty = effectiveQtyPerUnit * item.qty;
          db.prepare('UPDATE products SET stock = stock - ? WHERE id = ?').run(requiredQty, ing.ingredient_product_id);

          logInventory({
            productId: ing.ingredient_product_id,
            productName: ing.name,
            actionType: 'chiqim',
            quantityChanged: -requiredQty,
            userName: cashierName || 'Kassir',
            note: `Taom tarkibi bo'yicha sarflandi: ${item.name} × ${item.qty}`
          });

          updateDependentDishesStocks(ing.ingredient_product_id);
        }

        // If dish also has tracked stock in 2-Ombor (and not unlimited), deduct it too!
        if (!isUnlimited && currentStock > 0) {
          deductStock.run(item.qty, item.id);
        }
        calculateAvailablePortions(item.id);
      } else {
        // Direct product / raw material without ingredients
        if (!isUnlimited) {
          deductStock.run(item.qty, item.id);
        }
        // If this product was an ingredient in other dishes, update their portions!
        updateDependentDishesStocks(item.id);
      }

      // Custom note for item-level discount
      let itemNote = saleNote;
      if (itemPct > 0) {
        const formattedPrice = String(Math.round(priceAfterDiscount)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
        itemNote = `Chek #${shiftReceiptNumber} (${payTypeLabel}, -${itemPct}%, ${formattedPrice} so'm)${device === 'mobile' ? ' (Mobil)' : ''}`;
      }

      logInventory({
        productId: item.id,
        productName: item.name,
        actionType: paymentMethod === 'debt' ? 'sotuv_qarz' : 'sotuv',
        quantityChanged: -item.qty,
        userName: cashierName + (device === 'mobile' ? ' (Mobil)' : ''),
        note: itemNote
      });
    }

    db.exec('COMMIT');
    return { success: true, saleId, shiftReceiptNumber };
  } catch (err) {
    db.exec('ROLLBACK');
    if (err.message && err.message.startsWith('stock_error:')) {
      const parts = err.message.split(':');
      if (parts.length >= 4) {
        const name = parts[1];
        const reqQty = parts[2];
        const availStock = parts[3];
        return {
          success: false,
          error: 'insufficient_stock',
          message: `"${name}" omborda yetarli emas! Kiritilgan: ${reqQty}, mavjud: ${availStock}`
        };
      }
      return {
        success: false,
        error: 'stop_list_error',
        message: parts.slice(1).join(':')
      };
    }
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
      SELECT s.*, c.name as customer_name, c.phone as customer_phone, c.total_debt as customer_total_debt
      FROM sales s
      LEFT JOIN customers c ON s.customer_id = c.id
      WHERE s.created_at >= datetime('now', '-3 days', 'localtime') AND s.payment_method != 'qarz_tulov'
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
        totalReturnedAmount += (item.qty * item.price);
      }
    }

    let debtReduction = 0;
    let cashRefundAmount = 0;

    // If debt, reduce total_debt (prevent negative debt, refund paid part as cash)
    if (sale.payment_method === 'debt' && sale.customer_id && totalReturnedAmount > 0) {
      const cust = db.prepare('SELECT total_debt FROM customers WHERE id = ?').get(sale.customer_id);
      if (cust) {
        const previousDebt = cust.total_debt;
        const newDebt = Math.max(0, previousDebt - totalReturnedAmount);
        debtReduction = previousDebt - newDebt;
        cashRefundAmount = totalReturnedAmount - debtReduction;
        db.prepare('UPDATE customers SET total_debt = ? WHERE id = ?').run(newDebt, sale.customer_id);
      }
    }

    for (const item of saleItems) {
      if (item.qty > 0) {
        // Restore stock
        db.prepare('UPDATE products SET stock = stock + ? WHERE id = ?').run(item.qty, item.product_id);
        
        // Log inventory with precise note
        const prod = db.prepare('SELECT name FROM products WHERE id = ?').get(item.product_id);
        
        let logNote = `Chek #${sale.shift_receipt_number || sale.id} to'liq qaytarildi`;
        if (sale.payment_method === 'debt') {
          if (cashRefundAmount > 0 && debtReduction > 0) {
            logNote = `Chek #${sale.shift_receipt_number || sale.id} (Qarzga) qaytarildi. Qarz kamaydi: ${debtReduction.toLocaleString('ru-RU')} so'm, Kassadan qaytdi: ${cashRefundAmount.toLocaleString('ru-RU')} so'm`;
          } else if (cashRefundAmount > 0) {
            logNote = `Chek #${sale.shift_receipt_number || sale.id} (Qarzga) qaytarildi. Kassadan qaytdi: ${cashRefundAmount.toLocaleString('ru-RU')} so'm`;
          } else {
            logNote = `Chek #${sale.shift_receipt_number || sale.id} (Qarzga) qaytarildi. Qarz kamaydi: ${debtReduction.toLocaleString('ru-RU')} so'm`;
          }
        }

        logInventory({
          productId: item.product_id,
          productName: prod ? prod.name : (item.product_name || `Product #${item.product_id}`),
          actionType: 'vozvrat',
          quantityChanged: +item.qty,
          userName: sale.cashier_name || '',
          note: logNote
        });
      }
    }

    // Save the cash refund amount to the sale
    if (cashRefundAmount > 0) {
      db.prepare('UPDATE sales SET cash_refund = cash_refund + ? WHERE id = ?').run(cashRefundAmount, sale.id);
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

    // 6. Handle Debt reduction if applicable
    let debtReduction = 0;
    let cashRefundAmount = 0;
    if (sale.payment_method === 'debt' && sale.customer_id) {
      const cust = db.prepare('SELECT total_debt FROM customers WHERE id = ?').get(sale.customer_id);
      if (cust) {
        const previousDebt = cust.total_debt;
        const newDebt = Math.max(0, previousDebt - returnAmount);
        debtReduction = previousDebt - newDebt;
        cashRefundAmount = returnAmount - debtReduction;
        db.prepare('UPDATE customers SET total_debt = ? WHERE id = ?').run(newDebt, sale.customer_id);
      }
    }

    // Save the cash refund amount to the sale
    if (cashRefundAmount > 0) {
      db.prepare('UPDATE sales SET cash_refund = cash_refund + ? WHERE id = ?').run(cashRefundAmount, sale.id);
    }

    // Log inventory
    const prodRow = db.prepare('SELECT name FROM products WHERE id = ?').get(saleItem.product_id);
    
    let logNote = `Chek #${sale.shift_receipt_number || sale.id} qisman qaytarildi`;
    if (sale.payment_method === 'debt') {
      if (cashRefundAmount > 0 && debtReduction > 0) {
        logNote = `Chek #${sale.shift_receipt_number || sale.id} (Qarzga) qisman qaytarildi. Qarz kamaydi: ${debtReduction.toLocaleString('ru-RU')} so'm, Kassadan qaytdi: ${cashRefundAmount.toLocaleString('ru-RU')} so'm`;
      } else if (cashRefundAmount > 0) {
        logNote = `Chek #${sale.shift_receipt_number || sale.id} (Qarzga) qisman qaytarildi. Kassadan qaytdi: ${cashRefundAmount.toLocaleString('ru-RU')} so'm`;
      } else {
        logNote = `Chek #${sale.shift_receipt_number || sale.id} (Qarzga) qisman qaytarildi. Qarz kamaydi: ${debtReduction.toLocaleString('ru-RU')} so'm`;
      }
    }

    logInventory({
      productId: saleItem.product_id,
      productName: prodRow ? prodRow.name : (saleItem.product_name || `Product #${saleItem.product_id}`),
      actionType: 'vozvrat',
      quantityChanged: +returnQty,
      userName: sale.cashier_name || '',
      note: logNote
    });

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
    db.prepare('INSERT INTO debt_payments (customer_id, amount, created_at) VALUES (?, ?, ?)')
      .run(customerId, parsedAmount, getLocalTimeStr());

    const countRow = db.prepare('SELECT MAX(shift_receipt_number) as max_num FROM sales WHERE is_closed = 0').get();
    const shiftReceiptNumber = (countRow && countRow.max_num) ? countRow.max_num + 1 : 1;

    db.prepare(`
      INSERT INTO sales (total_amount, payment_method, customer_id, cashier_name, status, shift_receipt_number, created_at)
      VALUES (?, 'qarz_tulov', ?, ?, 'completed', ?, ?)
    `).run(parsedAmount, customerId, cashierName || 'Kassir', shiftReceiptNumber, getLocalTimeStr());

    const customer = db.prepare('SELECT name FROM customers WHERE id = ?').get(customerId);
    if (customer) {
      logInventory({
        productId: 0,
        productName: `Mijoz: ${customer.name}`,
        actionType: 'qarz_tulov',
        quantityChanged: 0,
        userName: cashierName,
        note: `Qarzdan to'lov: ${parsedAmount.toLocaleString('ru-RU')} so'm`
      });
    }

    db.exec('COMMIT');
    return { success: true };
  } catch (err) {
    try { db.exec('ROLLBACK'); } catch (_) {}
    return { success: false, error: err.message };
  }
}

function addManualDebt({ customerId, customerName, customerPhone, amount, comment, cashierName }) {
  try {
    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) throw new Error('Invalid amount');

    db.exec('BEGIN TRANSACTION');

    let finalCustomerId = customerId;
    let targetName = customerName || '';

    if (!finalCustomerId) {
      // Create new customer
      const insCust = db.prepare('INSERT INTO customers (name, phone, total_debt) VALUES (?, ?, ?)');
      const info = insCust.run(customerName, customerPhone || '', parsedAmount);
      finalCustomerId = info.lastInsertRowid;
      targetName = customerName;
    } else {
      // Update existing customer
      const customer = db.prepare('SELECT name FROM customers WHERE id = ?').get(finalCustomerId);
      if (!customer) {
        throw new Error('Mijoz topilmadi');
      }
      targetName = customer.name;
      db.prepare('UPDATE customers SET total_debt = total_debt + ? WHERE id = ?')
        .run(parsedAmount, finalCustomerId);
    }

    const countRow = db.prepare('SELECT MAX(shift_receipt_number) as max_num FROM sales WHERE is_closed = 0').get();
    const shiftReceiptNumber = (countRow && countRow.max_num) ? countRow.max_num + 1 : 1;

    db.prepare(`
      INSERT INTO sales (total_amount, payment_method, customer_id, cashier_name, status, shift_receipt_number, is_manual_debt, comment, created_at)
      VALUES (?, 'debt', ?, ?, 'completed', ?, 1, ?, ?)
    `).run(parsedAmount, finalCustomerId, cashierName || 'Kassir', shiftReceiptNumber, comment || '', getLocalTimeStr());

    logInventory({
      productId: 0,
      productName: `Mijoz: ${targetName}`,
      actionType: 'tahrirlash',
      quantityChanged: 0,
      userName: cashierName || 'Kassir',
      note: `Kassir tomondan to'g'ridan-to'g'ri qarz berildi: ${parsedAmount.toLocaleString('ru-RU')} so'm. Izoh: ${comment || 'izohsiz'}`
    });

    db.exec('COMMIT');
    return { success: true, customerId: finalCustomerId };
  } catch (err) {
    try { db.exec('ROLLBACK'); } catch (_) {}
    return { success: false, error: err.message };
  }
}

function getLocalDateString(isoStr) {
  try {
    const d = new Date(isoStr);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  } catch (_) {
    return isoStr.substring(0, 10);
  }
}

function getReports(startDateISO, endDateISO) {
  try {
    const bType = getActiveBusinessType();

    const start = startDateISO ? (startDateISO.length === 10 ? `${startDateISO} 00:00:00` : startDateISO.replace('T', ' ').substring(0, 19)) : '1970-01-01 00:00:00';
    const end = endDateISO ? (endDateISO.length === 10 ? `${endDateISO} 23:59:59` : endDateISO.replace('T', ' ').substring(0, 19)) : '9999-12-31 23:59:59';

    // 1. Stats by Payment Method & Total Revenue/Debt & Total Discounts (consolidated query)
    const statsRows = db.prepare(`
      SELECT s.payment_method, SUM(s.total_amount) as total, SUM(s.discount_amount) as total_discounts
      FROM sales s
      WHERE s.created_at >= ? AND s.created_at <= ? AND s.status != 'refunded'
        AND s.id IN (
          SELECT si.sale_id FROM sale_items si 
          LEFT JOIN products p ON si.product_id = p.id 
          WHERE p.business_type = ? 
             OR (p.id IS NULL AND ((? = 'retail' AND s.waiter_id IS NULL) OR (? = 'restaurant' AND s.waiter_id IS NOT NULL)))
        )
      GROUP BY s.payment_method
    `).all(start, end, bType, bType, bType);

    let totalRevenue = 0;
    let totalDebtIssued = 0;
    let totalDiscounts = 0;
    const salesByType = { cash: 0, card: 0, debt: 0 };

    for (const row of statsRows) {
      totalDiscounts += (row.total_discounts || 0);
      if (row.payment_method === 'expense') {
        // Skip write-offs from revenue
      } else if (row.payment_method === 'debt') {
        totalDebtIssued += row.total;
        salesByType.debt += row.total;
      } else {
        totalRevenue += row.total;
        if (row.payment_method === 'cash') salesByType.cash += row.total;
        if (row.payment_method === 'card') salesByType.card += row.total;
      }
    }

    // Subtract refunds in this period to get actual net revenue and net debt
    const refundsByTypeRows = db.prepare(`
      SELECT s.payment_method, SUM(si.refunded_qty * si.price) as refunded_total
      FROM sale_items si
      JOIN sales s ON s.id = si.sale_id
      LEFT JOIN products p ON p.id = si.product_id
      WHERE s.created_at >= ? AND s.created_at <= ? AND s.status != 'refunded'
        AND (p.business_type = ? 
             OR (p.id IS NULL AND ((? = 'retail' AND s.waiter_id IS NULL) OR (? = 'restaurant' AND s.waiter_id IS NOT NULL))))
      GROUP BY s.payment_method
    `).all(start, end, bType, bType, bType);

    const refundsByType = { cash: 0, card: 0, debt: 0 };
    for (const r of refundsByTypeRows) {
      if (r.payment_method === 'cash') refundsByType.cash = r.refunded_total || 0;
      if (r.payment_method === 'card') refundsByType.card = r.refunded_total || 0;
      if (r.payment_method === 'debt') refundsByType.debt = r.refunded_total || 0;
    }

    // Fetch total cash refunds made on debt sales in this period
    const cashRefundsRow = db.prepare(`
      SELECT SUM(s.cash_refund) as total_cash_refund
      FROM sales s
      WHERE s.created_at >= ? AND s.created_at <= ? AND s.payment_method = 'debt' AND s.status != 'refunded'
        AND s.id IN (
          SELECT si.sale_id FROM sale_items si 
          LEFT JOIN products p ON si.product_id = p.id 
          WHERE p.business_type = ? 
             OR (p.id IS NULL AND ((? = 'retail' AND s.waiter_id IS NULL) OR (? = 'restaurant' AND s.waiter_id IS NOT NULL)))
        )
    `).get(start, end, bType, bType, bType);
    const totalDebtCashRefund = cashRefundsRow?.total_cash_refund || 0;

    // Apply refund deductions
    salesByType.cash = Math.max(0, salesByType.cash - refundsByType.cash - totalDebtCashRefund);
    salesByType.card = Math.max(0, salesByType.card - refundsByType.card);
    
    // The actual debt reduction is the total refunded on debt sales minus the cash portion refunded
    const debtReduction = Math.max(0, refundsByType.debt - totalDebtCashRefund);
    salesByType.debt = Math.max(0, salesByType.debt - debtReduction);

    totalRevenue = Math.max(0, totalRevenue - (refundsByType.cash + refundsByType.card + totalDebtCashRefund));
    totalDebtIssued = Math.max(0, totalDebtIssued - debtReduction);

    // 2. Total Profit Calculation
    // Profit = (sell_price - cost_price) * (qty - refunded_qty) - discount_amount
    const profitRow = db.prepare(`
      SELECT SUM((si.price - COALESCE(NULLIF(p.cost_price, 0), p.buy_price, 0)) * (si.qty - si.refunded_qty)) as total_profit
      FROM sale_items si
      JOIN sales s ON s.id = si.sale_id
      LEFT JOIN products p ON p.id = si.product_id
      WHERE s.created_at >= ? AND s.created_at <= ? AND s.status != 'refunded' AND s.payment_method != 'expense'
        AND (p.business_type = ? 
             OR (p.id IS NULL AND ((? = 'retail' AND s.waiter_id IS NULL) OR (? = 'restaurant' AND s.waiter_id IS NOT NULL))))
    `).get(start, end, bType, bType, bType);
    
    const totalProfit = (profitRow?.total_profit || 0) - totalDiscounts;

    // Total COGS (Tannarx / Cost of Goods Sold)
    const cogsRow = db.prepare(`
      SELECT SUM(COALESCE(NULLIF(p.cost_price, 0), p.buy_price, 0) * (si.qty - si.refunded_qty)) as total_cogs
      FROM sale_items si
      JOIN sales s ON s.id = si.sale_id
      LEFT JOIN products p ON p.id = si.product_id
      WHERE s.created_at >= ? AND s.created_at <= ? AND s.status != 'refunded' AND s.payment_method != 'expense'
        AND (p.business_type = ? 
             OR (p.id IS NULL AND ((? = 'retail' AND s.waiter_id IS NULL) OR (? = 'restaurant' AND s.waiter_id IS NOT NULL))))
    `).get(start, end, bType, bType, bType);
    const totalCogs = cogsRow?.total_cogs || 0;

    // 3. Top Selling Products
    const topProducts = db.prepare(`
      SELECT COALESCE(p.name, si.product_name, 'Mahsulot #' || si.product_id) as name, SUM(si.qty - si.refunded_qty) as total_sold, COALESCE(p.unit, si.unit, 'dona') as unit
      FROM sale_items si
      JOIN sales s ON s.id = si.sale_id
      LEFT JOIN products p ON p.id = si.product_id
      WHERE s.created_at >= ? AND s.created_at <= ? AND s.status != 'refunded' AND s.payment_method != 'expense'
        AND (p.business_type = ? 
             OR (p.id IS NULL AND ((? = 'retail' AND s.waiter_id IS NULL) OR (? = 'restaurant' AND s.waiter_id IS NOT NULL))))
      GROUP BY si.product_id, COALESCE(p.name, si.product_name, 'Mahsulot #' || si.product_id), COALESCE(p.unit, si.unit, 'dona')
      ORDER BY total_sold DESC
      LIMIT 50
    `).all(start, end, bType, bType, bType);

    // Fetch total debt payments in this period
    const debtPaymentsRow = db.prepare(`
      SELECT SUM(amount) as total_paid
      FROM debt_payments
      WHERE created_at >= ? AND created_at <= ?
    `).get(start, end);
    const totalDebtPayments = debtPaymentsRow?.total_paid || 0;

    // Add debt payments to total revenue
    totalRevenue += totalDebtPayments;

    // 4. Expenses (Rasxodlar)
    const expensesList = db.prepare(`
      SELECT * FROM expenses 
      WHERE created_at >= ? AND created_at <= ? 
      ORDER BY created_at DESC
    `).all(start, end);
    
    const totalExpenses = expensesList.reduce((sum, exp) => sum + exp.amount, 0);

    // 5. Purchases from suppliers (Kirimlar / Fakturalar)
    const purchasesRow = db.prepare(`
      SELECT SUM(total_amount) as total_purchases
      FROM supplier_invoices
      WHERE created_at >= ? AND created_at <= ?
    `).get(start, end);
    const totalPurchases = purchasesRow?.total_purchases || 0;

    // 6. Write-offs (Spisaniya / Yaroqsiz yoki chiqim qilingan mahsulotlar)
    const writeOffsList = db.prepare(`
      SELECT * FROM write_offs
      WHERE created_at >= ? AND created_at <= ?
      ORDER BY created_at DESC
    `).all(start, end);
    const totalWriteOffs = writeOffsList.reduce((sum, wo) => sum + (wo.total_loss_amount || 0), 0);

    // Calculate current warehouse valuation (only positive stock items count as assets, excluding unlimited and stopped items)
    const valuation = db.prepare(`
      SELECT SUM(COALESCE(NULLIF(cost_price, 0), buy_price, 0) * stock) as total_buy,
             SUM(IFNULL(sell_price, 0) * stock) as total_sell
      FROM products
      WHERE business_type = ? AND stock > 0 AND (is_unlimited IS NULL OR is_unlimited = 0) AND (is_stopped IS NULL OR is_stopped = 0)
    `).get(bType);

    const warehouseBuyValue = valuation?.total_buy || 0;
    const warehouseSellValue = valuation?.total_sell || 0;

    // 7. Aging products (unsold for 10+ days to allow frontend dynamic 10/20/30 day filters)
    const agingProducts = db.prepare(`
      SELECT * FROM (
        SELECT p.id, p.name, p.barcode, p.buy_price, p.sell_price, p.stock, p.unit,
               (SELECT MAX(s.created_at)
                FROM sale_items si
                JOIN sales s ON si.sale_id = s.id
                WHERE si.product_id = p.id AND s.status != 'refunded'
               ) as last_sold_at,
               (SELECT MIN(il.created_at)
                FROM inventory_logs il
                WHERE il.product_id = p.id
               ) as added_at
        FROM products p
        WHERE p.stock > 0 AND p.business_type = ?
      ) WHERE 
        (last_sold_at IS NOT NULL AND last_sold_at < datetime('now', '-10 days', 'localtime'))
        OR (last_sold_at IS NULL AND (added_at IS NULL OR added_at < datetime('now', '-10 days', 'localtime')))
      ORDER BY COALESCE(last_sold_at, added_at) ASC
      LIMIT 150
    `).all(bType);

    const waiterStats = db.prepare(`
      SELECT ro.waiter_id, w.name as waiter_name, w.percentage, SUM(ro.total_amount) as total_sales
      FROM restaurant_orders ro
      JOIN waiters w ON w.id = ro.waiter_id
      WHERE ro.status = 'completed' AND ro.created_at >= ? AND ro.created_at <= ?
      GROUP BY ro.waiter_id, w.name, w.percentage
    `).all(start, end);

    const cashiersList = db.prepare(`
      SELECT id, name, role, salary, percentage FROM cashiers
    `).all();

    const waitersList = db.prepare(`
      SELECT id, name, percentage, salary FROM waiters
    `).all();

    const startDay = getLocalDateString(start);
    const endDay = getLocalDateString(end);

    const cashierAttendance = db.prepare(`
      SELECT employee_id, COUNT(*) as present_days
      FROM attendance
      WHERE employee_type = 'cashier' AND date >= ? AND date <= ? AND status = 'present'
      GROUP BY employee_id
    `).all(startDay, endDay);
    
    const cashierAttMap = {};
    for (const row of cashierAttendance) {
      cashierAttMap[row.employee_id] = row.present_days;
    }

    const waiterAttendance = db.prepare(`
      SELECT employee_id, COUNT(*) as present_days
      FROM attendance
      WHERE employee_type = 'waiter' AND date >= ? AND date <= ? AND status = 'present'
      GROUP BY employee_id
    `).all(startDay, endDay);

    const waiterAttMap = {};
    for (const row of waiterAttendance) {
      waiterAttMap[row.employee_id] = row.present_days;
    }

    // Get individual waiter commissions in this range
    const waiterComms = db.prepare(`
      SELECT waiter_id, SUM(waiter_commission) as comm
      FROM sales
      WHERE created_at >= ? AND created_at <= ? AND status != 'refunded' AND waiter_id IS NOT NULL
      GROUP BY waiter_id
    `).all(start, end);
    
    const waiterCommMap = {};
    for (const row of waiterComms) {
      waiterCommMap[row.waiter_id] = row.comm;
    }

    // Calculate total service fees collected
    const serviceFeesRow = db.prepare(`
      SELECT SUM(service_fee_amount) as total_service_fees
      FROM sales
      WHERE created_at >= ? AND created_at <= ? AND status != 'refunded'
    `).get(start, end);
    const totalServiceFees = serviceFeesRow?.total_service_fees || 0;

    let totalSalaries = 0;
    let totalStaffCommissions = 0;

    for (const c of cashiersList) {
      const presentDays = cashierAttMap[c.id] || 0;
      c.present_days = presentDays;
      c.earned_salary = presentDays > 0 ? (c.salary / 30) * presentDays : (c.salary || 0);
      if (c.percentage > 0) {
        c.commissions = Math.round((totalRevenue * c.percentage) / 100);
      } else {
        c.commissions = 0;
      }
      c.total_earned = c.earned_salary + c.commissions;
      totalSalaries += c.earned_salary;
      totalStaffCommissions += c.commissions;
    }

    for (const w of waitersList) {
      const presentDays = waiterAttMap[w.id] || 0;
      w.present_days = presentDays;
      w.earned_salary = presentDays > 0 ? (w.salary / 30) * presentDays : (w.salary || 0);
      w.commissions = waiterCommMap[w.id] || 0;
      w.total_earned = w.earned_salary + w.commissions;
      totalSalaries += w.earned_salary;
    }

    const commissionsRow = db.prepare(`
      SELECT SUM(waiter_commission) as total_commissions
      FROM sales
      WHERE created_at >= ? AND created_at <= ? AND status != 'refunded'
    `).get(start, end);
    const totalWaitersCommissions = commissionsRow?.total_commissions || 0;
    const totalCommissions = totalWaitersCommissions + totalStaffCommissions;

    // Net Profit = Yalpi foyda - Rasxodlar - Spisaniya - Oyliklar - Ofitsiantlar ulushi
    const netProfit = totalProfit - totalExpenses - totalWriteOffs - totalSalaries - totalCommissions;

    return {
      success: true,
      data: {
        totalRevenue,
        totalDebtIssued,
        totalProfit,
        totalExpenses,
        totalPurchases,
        totalWriteOffs,
        writeOffsList,
        totalCogs,
        expensesList,
        salesByType,
        topProducts,
        warehouseBuyValue,
        warehouseSellValue,
        totalDebtPayments,
        agingProducts,
        waiterStats,
        cashiersList,
        waitersList,
        totalSalaries,
        totalCommissions,
        totalServiceFees,
        netProfit
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

    // Clear sales history
    db.exec('DELETE FROM sale_items');
    db.exec('DELETE FROM sales');
    db.exec('DELETE FROM inventory_logs');
    db.exec('DELETE FROM expenses');
    db.exec('DELETE FROM write_offs');
    db.exec('DELETE FROM shifts_history');
    db.exec('DELETE FROM debt_payments');
    db.exec('DELETE FROM restaurant_order_items');
    db.exec('DELETE FROM restaurant_orders');
    db.exec('DELETE FROM attendance');

    // Reset customer debts
    db.exec('UPDATE customers SET total_debt = 0');

    // Reset tables
    db.exec("UPDATE restaurant_tables SET status = 'free', locked_by = NULL, is_printed = 0, opened_at = NULL");

    // Reset auto-increment counters for sales & history tables
    db.exec("DELETE FROM sqlite_sequence WHERE name IN ('sale_items', 'sales', 'inventory_logs', 'expenses', 'write_offs', 'shifts_history', 'debt_payments', 'restaurant_order_items', 'restaurant_orders', 'attendance')");

    db.exec('COMMIT');
    return { success: true };
  } catch (err) {
    try { db.exec('ROLLBACK'); } catch (_) {}
    return { success: false, error: err.message };
  }
}
function clearWarehouse() {
  try {
    db.exec('PRAGMA foreign_keys = OFF');
    db.exec('BEGIN TRANSACTION');
    // Clear dependent child rows first so FK constraints don't fire
    db.exec('DELETE FROM product_ingredients');
    db.exec('DELETE FROM products');
    db.exec("DELETE FROM sqlite_sequence WHERE name IN ('products', 'product_ingredients')");
    db.exec('COMMIT');
    return { success: true };
  } catch (err) {
    try { db.exec('ROLLBACK'); } catch (_) {}
    return { success: false, error: err.message };
  } finally {
    try { db.exec('PRAGMA foreign_keys = ON'); } catch (_) {}
  }
}

function resetFactoryData() {
  try {
    db.exec('BEGIN TRANSACTION');

    // 1. Delete all tables in correct dependency order
    db.exec('DELETE FROM product_ingredients');
    db.exec('DELETE FROM restaurant_order_items');
    db.exec('DELETE FROM restaurant_orders');
    db.exec('DELETE FROM sale_items');
    db.exec('DELETE FROM sales');
    db.exec('DELETE FROM inventory_logs');
    db.exec('DELETE FROM expenses');
    db.exec('DELETE FROM write_offs');
    db.exec('DELETE FROM shifts_history');
    db.exec('DELETE FROM debt_payments');
    db.exec('DELETE FROM customers');
    db.exec('DELETE FROM products');
    db.exec('DELETE FROM settings');
    db.exec('DELETE FROM waiters');
    db.exec('DELETE FROM cashiers');
    db.exec('DELETE FROM restaurant_tables');
    db.exec('DELETE FROM restaurant_zones');
    db.exec('DELETE FROM attendance');

    // 2. Reset sequence
    db.exec("DELETE FROM sqlite_sequence");

    // 3. Re-seed default settings
    db.prepare("INSERT INTO settings (key, value) VALUES ('store_name', 'Mening Do''konim')").run();
    db.prepare("INSERT INTO settings (key, value) VALUES ('business_type', 'retail')").run();
    db.prepare("INSERT INTO settings (key, value) VALUES ('ngrok_token', '')").run();
    db.prepare("INSERT INTO settings (key, value) VALUES ('ngrok_domain', '')").run();
    db.prepare("INSERT INTO settings (key, value) VALUES ('gemini_api_key', '')").run();
    db.prepare("INSERT INTO settings (key, value) VALUES ('terminal_mode', 'false')").run();
    db.prepare("INSERT INTO settings (key, value) VALUES ('telegram_url', '')").run();
    db.prepare("INSERT INTO settings (key, value) VALUES ('instagram_url', '')").run();
    db.prepare("INSERT INTO settings (key, value) VALUES ('kitchen_printer', '')").run();
    db.prepare("INSERT INTO settings (key, value) VALUES ('bar_printer', '')").run();
    db.prepare("INSERT INTO settings (key, value) VALUES ('cold_printer', '')").run();
    db.prepare("INSERT INTO settings (key, value) VALUES ('oshxona_1_printer', '')").run();
    db.prepare("INSERT INTO settings (key, value) VALUES ('oshxona_2_printer', '')").run();
    db.prepare("INSERT INTO settings (key, value) VALUES ('oshxona_3_printer', '')").run();
    db.prepare("INSERT INTO settings (key, value) VALUES ('bar_1_printer', '')").run();
    db.prepare("INSERT INTO settings (key, value) VALUES ('bar_2_printer', '')").run();
    db.prepare("INSERT INTO settings (key, value) VALUES ('bar_3_printer', '')").run();
    db.prepare("INSERT INTO settings (key, value) VALUES ('xolodniy_1_printer', '')").run();
    db.prepare("INSERT INTO settings (key, value) VALUES ('xolodniy_2_printer', '')").run();
    db.prepare("INSERT INTO settings (key, value) VALUES ('xolodniy_3_printer', '')").run();
    db.prepare("INSERT INTO settings (key, value) VALUES ('receipt_lang', 'uz')").run();
    db.prepare("INSERT INTO settings (key, value) VALUES ('telegram_bot_token', '8621843458:AAGBnjR3LwNDWfnKnnKmB9EQpqlm57tnr84')").run();
    db.prepare("INSERT INTO settings (key, value) VALUES ('telegram_chat_id', '-5583805832')").run();
    db.prepare("INSERT INTO settings (key, value) VALUES ('telegram_attendance_token', '8621843458:AAGBnjR3LwNDWfnKnnKmB9EQpqlm57tnr84')").run();
    db.prepare("INSERT INTO settings (key, value) VALUES ('telegram_attendance_chat_id', '')").run();
    db.prepare("INSERT INTO settings (key, value) VALUES ('cafe_name', 'Mening Kafem')").run();

    // 4. Re-seed default cashiers
    db.prepare("INSERT INTO cashiers (name, pin, role, salary) VALUES ('Admin', '1111', 'admin', 0)").run();
    db.prepare("INSERT INTO cashiers (name, pin, role, salary) VALUES ('Kassir', '2222', 'cashier', 0)").run();

    // 5. Re-seed default waiters
    db.prepare("INSERT INTO waiters (name, pin_code, role, percentage) VALUES ('Alisher', '1234', 'waiter', 10)").run();
    db.prepare("INSERT INTO waiters (name, pin_code, role, percentage) VALUES ('Madina', '5678', 'waiter', 10)").run();

    // 6. Re-seed default restaurant zones & tables
    const seedZones = ['Stol', 'Zal', 'Terrassa', 'Chorpoya', '2-qavat', 'Podval', 'Banket', 'Dostavka'];
    for (const zone of seedZones) {
      db.prepare("INSERT INTO restaurant_zones (name) VALUES (?)").run(zone);
      for (let i = 1; i <= 30; i++) {
        const name = `${zone} ${i}`;
        db.prepare("INSERT INTO restaurant_tables (name, zone, status) VALUES (?, ?, 'free')").run(name, zone);
      }
    }

    db.exec('COMMIT');
    return { success: true };
  } catch (err) {
    try { db.exec('ROLLBACK'); } catch (_) {}
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

    // Date filters: if both startDate and endDate are empty, default to last 30 days
    if (!startDate && !endDate) {
      conditions.push("date(s.created_at) >= date('now', '-30 days', 'localtime')");
    } else {
      if (startDate) {
        conditions.push("date(s.created_at) >= ?");
        params.push(startDate);
      }
      if (endDate) {
        conditions.push("date(s.created_at) <= ?");
        params.push(endDate);
      }
    }

    // Time filters
    if (startTime) {
      conditions.push("time(s.created_at) >= ?");
      params.push(startTime + ':00');
    }
    if (endTime) {
      conditions.push("time(s.created_at) <= ?");
      params.push(endTime + ':00');
    }

    // Cashier filter
    if (selectedCashier) {
      conditions.push("s.cashier_name = ?");
      params.push(selectedCashier);
    }

    // Status filter
    if (statusFilter) {
      if (statusFilter === 'refunded') {
        conditions.push("s.status = 'refunded'");
      } else if (statusFilter === 'completed') {
        conditions.push("s.status != 'refunded'");
      } else if (statusFilter === 'discounted') {
        conditions.push("s.discount_percent > 0");
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
          conditions.push("(s.id = ? OR s.shift_receipt_number = ?)");
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
            s.id = ? 
            OR s.shift_receipt_number = ? 
            OR s.id IN (
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
            s.id IN (
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
    const countQuery = `SELECT COUNT(*) as total FROM sales s ${whereClause}`;
    const { total } = db.prepare(countQuery).get(...params);

    // Paginated sales, newest first, joining customers table
    const salesQuery = `
      SELECT s.*, c.name as customer_name, c.phone as customer_phone, c.total_debt as customer_total_debt
      FROM sales s
      LEFT JOIN customers c ON s.customer_id = c.id
      ${whereClause} 
      ORDER BY s.created_at DESC 
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
      WHERE date(s.created_at) >= ? AND date(s.created_at) <= ? AND s.status != 'refunded'
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
        SUM(CASE WHEN status != 'refunded' AND payment_method != 'expense' AND payment_method != 'qarz_tulov' THEN total_amount ELSE 0 END) as total_sales,
        SUM(CASE WHEN payment_method = 'cash' AND status != 'refunded' THEN total_amount ELSE 0 END) as cash_sales,
        SUM(CASE WHEN payment_method = 'qarz_tulov' AND status != 'refunded' THEN total_amount ELSE 0 END) as debt_payments,
        SUM(CASE WHEN payment_method = 'card' AND status != 'refunded' THEN total_amount ELSE 0 END) as card_sales,
        SUM(CASE WHEN payment_method = 'debt' AND status != 'refunded' THEN total_amount ELSE 0 END) as debt_sales,
        SUM(CASE WHEN status != 'refunded' THEN service_fee_amount ELSE 0 END) as service_fee_total,
        COUNT(CASE WHEN status != 'refunded' AND payment_method != 'expense' AND payment_method != 'qarz_tulov' THEN id END) as receipts_count
      FROM sales
      WHERE is_closed = 0
    `;
    const row = db.prepare(query).get();
    
    // Cash expenses during shift (reduces drawer cash)
    const expRow = db.prepare("SELECT SUM(amount) as total_expenses FROM expenses WHERE is_closed = 0 AND COALESCE(source, 'cash') = 'cash'").get();
    
    // Write-offs during shift
    const writeOffRow = db.prepare("SELECT SUM(amount) as total_write_offs, COUNT(id) as count_write_offs FROM expenses WHERE is_closed = 0 AND source = 'write_off'").get();
    const write_offs_total = writeOffRow?.total_write_offs || 0;

    // 1. Shift Number
    const countRow = db.prepare('SELECT COUNT(*) as cnt FROM shifts_history').get();
    const shift_number = (countRow?.cnt || 0) + 1;

    // 2. Discounts
    const discountRow = db.prepare("SELECT SUM(discount_amount) as total_discounts FROM sales WHERE is_closed = 0 AND status != 'refunded' AND payment_method != 'qarz_tulov'").get();
    const total_discounts = discountRow?.total_discounts || 0;

    // 3. Refunds / Voids
    const refundRow = db.prepare("SELECT COUNT(id) as cnt, SUM(total_amount) as total_refunds FROM sales WHERE is_closed = 0 AND status = 'refunded' AND payment_method != 'qarz_tulov'").get();
    const refunds_count = refundRow?.cnt || 0;
    const total_refunds = refundRow?.total_refunds || 0;

    // 4. Expected Cash (Cash Sales + Debt collected - Cash Expenses)
    const total_sales = row?.total_sales || 0;
    const cash_sales = row?.cash_sales || 0;
    const debt_payments = row?.debt_payments || 0;
    const total_expenses = expRow?.total_expenses || 0;
    const expected_cash = cash_sales + debt_payments - total_expenses;

    const receipts_count = row?.receipts_count || 0;
    const average_check = receipts_count > 0 ? Math.round(total_sales / receipts_count) : 0;
    const service_fee_total = row?.service_fee_total || 0;

    // 5. Waiter Breakdown for shift (for restaurant/cafe)
    const waiter_stats = db.prepare(`
      SELECT 
        w.id as waiter_id,
        w.name as waiter_name,
        COUNT(s.id) as receipts_count,
        SUM(s.total_amount) as total_sales,
        SUM(s.waiter_commission) as total_commission
      FROM sales s
      JOIN waiters w ON w.id = s.waiter_id
      WHERE s.is_closed = 0 AND s.status != 'refunded' AND s.payment_method != 'qarz_tulov'
      GROUP BY w.id, w.name
      ORDER BY total_sales DESC
    `).all();

    // 6. Category Breakdown for shift
    const category_stats = db.prepare(`
      SELECT 
        COALESCE(NULLIF(p.category, ''), 'Boshqa') as category_name,
        SUM(si.qty - si.refunded_qty) as total_qty,
        SUM(si.price * (si.qty - si.refunded_qty)) as total_amount
      FROM sale_items si
      JOIN sales s ON s.id = si.sale_id
      LEFT JOIN products p ON p.id = si.product_id
      WHERE s.is_closed = 0 AND s.status != 'refunded' AND s.payment_method != 'expense' AND s.payment_method != 'qarz_tulov'
      GROUP BY category_name
      HAVING total_amount > 0
      ORDER BY total_amount DESC
    `).all();

    const firstSale = db.prepare("SELECT cashier_name FROM sales WHERE is_closed = 0 AND payment_method != 'qarz_tulov' LIMIT 1").get();
    const opened_by = firstSale ? firstSale.cashier_name : 'Noma\'lum';

    // Get current shift opened time (fast query via indices)
    const salesRow = db.prepare("SELECT MIN(created_at) as opened_at FROM sales WHERE is_closed = 0 AND payment_method != 'qarz_tulov'").get();
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
        opened_at = getLocalTimeStr();
      }
    }

    return {
      success: true,
      data: {
        shift_number,
        total_sales,
        cash_sales,
        card_sales: row?.card_sales || 0,
        debt_sales: row?.debt_sales || 0,
        debt_payments,
        total_expenses,
        write_offs_total,
        receipts_count,
        average_check,
        service_fee_total,
        total_discounts,
        refunds_count,
        total_refunds,
        expected_cash,
        waiter_stats,
        category_stats,
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
      (total_sales, cash_sales, card_sales, debt_sales, receipts_count, opened_by, closed_by, total_expenses, opened_at, closed_at) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      stats.total_sales, 
      stats.cash_sales, 
      stats.card_sales, 
      stats.debt_sales, 
      stats.receipts_count, 
      stats.opened_by || '', 
      stats.closed_by || '', 
      stats.total_expenses || 0,
      stats.opened_at || null,
      getLocalTimeStr()
    );
    db.prepare('UPDATE sales SET is_closed = 1 WHERE is_closed = 0').run();
    db.prepare('UPDATE expenses SET is_closed = 1 WHERE is_closed = 0').run();

    const formatNumber = (num) => {
      if (num === null || num === undefined) return '0';
      let parts = String(num).split('.');
      parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
      return parts.join('.');
    };

    const note = `Jami: ${formatNumber(stats.total_sales)} so'm (Naqd: ${formatNumber(stats.cash_sales)}, Plastik: ${formatNumber(stats.card_sales)}, Qarz: ${formatNumber(stats.debt_sales)}, Kassa: ${formatNumber(stats.expected_cash)})`;

    db.prepare(`
      INSERT INTO inventory_logs
        (product_id, product_name, action_type, quantity_changed, balance_after, user_name, note, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      0, 
      'Smena', 
      'smena_yopildi', 
      0, 
      0, 
      stats.closed_by || 'Kassir', 
      note,
      getLocalTimeStr()
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
  return path.join(getUserDataPath(), 'pos.db');
}

function writeOffProduct({ productId, quantity, reason, note, userName }) {
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
      INSERT INTO write_offs (product_id, product_name, quantity, reason, total_loss_amount, user_name, note, unit)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(productId, product.name, qty, reason || 'Boshqa', totalLoss, userName || 'Admin', note || '', product.unit || 'dona');
    // 3. Log inventory
    logInventory({
      productId,
      productName: product.name,
      actionType: 'spisaniya',
      quantityChanged: -qty,
      userName: userName || 'Ombor',
      note: note ? `${reason || 'Brak'}: ${note}` : (reason || 'Boshqa')
    });
    
    // 4. Add to expenses
    if (totalLoss > 0) {
      db.prepare("INSERT INTO expenses (reason, amount, cashier_name, source, created_at) VALUES (?, ?, ?, 'write_off', ?)").run(
        `Spisaniya: ${product.name} (${reason || 'Boshqa'})`,
        totalLoss,
        userName || 'Tizim/Ombor',
        getLocalTimeStr()
      );
    }

    // 5. If businessType is retail, also log this as a write-off (expense) in the sales and sale_items tables
    const bType = getActiveBusinessType();
    if (bType === 'retail') {
      const countRow = db.prepare('SELECT MAX(shift_receipt_number) as max_num FROM sales WHERE is_closed = 0').get();
      const shiftReceiptNumber = (countRow && countRow.max_num) ? countRow.max_num + 1 : 1;
      
      const created_at = getLocalTimeStr();
      
      const saleStmt = db.prepare(`
        INSERT INTO sales (total_amount, payment_method, cashier_name, created_at, comment, original_total, discount_percent, discount_amount, device, shift_receipt_number)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      
      const saleInfo = saleStmt.run(
        totalLoss,
        'expense',
        userName || 'Ombor',
        created_at,
        `Spisaniya: ${product.name} (${reason || 'Boshqa'})`,
        totalLoss,
        0,
        0,
        'desktop',
        shiftReceiptNumber
      );
      
      const saleId = saleInfo.lastInsertRowid;
      
      db.prepare(`
        INSERT INTO sale_items (sale_id, product_id, qty, price, product_name, unit, discount_percent, discount_amount)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        saleId,
        productId,
        qty,
        costPrice,
        product.name,
        product.unit || 'dona',
        0,
        0
      );
    }

    db.exec('COMMIT');

    return { success: true, totalLoss, productName: product.name, newStock: product.stock - qty };
  } catch (err) {
    try { db.exec('ROLLBACK'); } catch (_) {}
    return { success: false, error: err.message };
  }
}

function getWriteOffs(startDate, endDate) {
  try {
    let query = `
      SELECT w.*, p.unit
      FROM write_offs w
      LEFT JOIN products p ON p.id = w.product_id
    `;
    const params = [];
    if (startDate && endDate) {
      query += ` WHERE w.created_at >= ? AND w.created_at <= ?`;
      params.push(startDate + ' 00:00:00', endDate + ' 23:59:59');
    }
    query += ` ORDER BY w.created_at DESC LIMIT 500`;

    const rows = db.prepare(query).all(...params);
    return { success: true, data: rows };
  } catch (err) {
    console.error('getWriteOffs error:', err);
    return { success: false, error: err.message };
  }
}

function getInventoryLogs({ page = 1, pageSize = 100, startDate = '', endDate = '', productId = null, actionType = '', productSearch = '' } = {}) {
  try {
    const bType = getActiveBusinessType();
    const offset = (page - 1) * pageSize;
    const conditions = [];
    const params     = [];

    // Filter by active business type (allow product_id = 0 or general logs)
    conditions.push("(il.product_id = 0 OR p.business_type = ?)");
    params.push(bType);

    if (startDate) {
      const sDate = startDate.includes(' ') ? startDate : `${startDate} 00:00:00`;
      conditions.push("il.created_at >= ?");
      params.push(sDate);
    }
    if (endDate) {
      const eDate = endDate.includes(' ') ? endDate : `${endDate} 23:59:59`;
      conditions.push("il.created_at <= ?");
      params.push(eDate);
    }
    if (productId) {
      conditions.push('il.product_id = ?');
      params.push(productId);
    }
    if (actionType) {
      conditions.push('il.action_type = ?');
      params.push(actionType);
    }
    if (productSearch && productSearch.trim() !== '') {
      conditions.push('my_lower(il.product_name) LIKE my_lower(?)');
      params.push(`%${productSearch.trim()}%`);
    }

    const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

    const total = db.prepare(`
      SELECT COUNT(*) as cnt 
      FROM inventory_logs il
      LEFT JOIN products p ON il.product_id = p.id
      ${where}
    `).get(...params).cnt;

    const rows  = db.prepare(`
      SELECT il.* 
      FROM inventory_logs il
      LEFT JOIN products p ON il.product_id = p.id
      ${where} 
      ORDER BY il.created_at DESC 
      LIMIT ? OFFSET ?
    `).all(...params, pageSize, offset);

    return { success: true, data: rows, total, page, pageSize };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

function addExpense(reason, amount, cashier_name, source = 'cash') {
  try {
    const created_at = getLocalTimeStr();
    const parsedAmount = parseFloat(amount) || 0;
    db.prepare("INSERT INTO expenses (reason, amount, cashier_name, created_at, source) VALUES (?, ?, ?, ?, ?)").run(reason, parsedAmount, cashier_name || 'Kassir', created_at, source);

    logInventory({
      productId: 0,
      productName: `Chiqim: ${reason}`,
      actionType: 'rasxod',
      quantityChanged: 0,
      userName: cashier_name || 'Kassir',
      note: `Chiqim (Rasxod): ${parsedAmount.toLocaleString('ru-RU')} so'm (${reason})`
    });

    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

function deleteExpense(id, userName = 'Admin') {
  try {
    const exp = db.prepare('SELECT * FROM expenses WHERE id = ?').get(id);
    if (!exp) return { success: false, error: 'Xarajat topilmadi' };
    db.prepare('DELETE FROM expenses WHERE id = ?').run(id);

    logInventory({
      productId: 0,
      productName: `Chiqim bekor qilindi: ${exp.reason}`,
      actionType: 'rasxod_bekor',
      quantityChanged: 0,
      userName: userName || 'Admin',
      note: `Chiqim o'chirildi: ${Number(exp.amount).toLocaleString('ru-RU')} so'm`
    });

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

    // Soft delete the customer, keeping debt payments and sales associations intact
    db.prepare('UPDATE customers SET is_deleted = 1 WHERE id = ?').run(customerId);

    logInventory({
      productId: 0,
      productName: `Mijoz o'chirildi: ${customer.name}`,
      actionType: 'tahrirlash',
      quantityChanged: 0,
      userName: cashierName,
      note: `Mijoz tizimdan o'chirildi. Yakuniy qarz: ${customer.total_debt.toLocaleString('ru-RU')} so'm`
    });

    db.exec('COMMIT');
    return { success: true };
  } catch (err) {
    try { db.exec('ROLLBACK'); } catch (_) {}
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
      INSERT INTO inventory_logs (product_id, product_name, action_type, quantity_changed, balance_after, user_name, note, created_at)
      VALUES (0, 'Smena', 'smena_ochildi', 0, 0, ?, 'Smena ochildi', ?)
    `).run(cashierName, getLocalTimeStr());

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

function getTodayStats() {
  try {
    const salesRow = db.prepare(`
      SELECT COALESCE(SUM(total_amount), 0) as total_sales, COUNT(id) as receipts_count
      FROM sales
      WHERE date(created_at) = date('now', 'localtime') AND status != 'refunded'
    `).get();

    const profitRow = db.prepare(`
      SELECT COALESCE(SUM((si.price - COALESCE(NULLIF(p.cost_price, 0), p.buy_price, 0)) * si.qty), 0) as gross_profit
      FROM sale_items si
      JOIN sales s ON s.id = si.sale_id
      LEFT JOIN products p ON p.id = si.product_id
      WHERE date(s.created_at) = date('now', 'localtime') AND s.status != 'refunded'
    `).get();

    const discountsRow = db.prepare(`
      SELECT COALESCE(SUM(discount_amount), 0) as total_discounts
      FROM sales
      WHERE date(created_at) = date('now', 'localtime') AND status != 'refunded'
    `).get();

    const expensesRow = db.prepare(`
      SELECT COALESCE(SUM(amount), 0) as total_expenses
      FROM expenses
      WHERE date(created_at) = date('now', 'localtime')
    `).get();

    const total_sales = salesRow.total_sales;
    const receipts_count = salesRow.receipts_count;
    const net_profit = profitRow.gross_profit - discountsRow.total_discounts - expensesRow.total_expenses;

    const lastSaleRow = db.prepare(`
      SELECT id, shift_receipt_number FROM sales ORDER BY id DESC LIMIT 1
    `).get();
    const last_sale_id = lastSaleRow ? lastSaleRow.id : null;
    const last_shift_receipt_number = lastSaleRow ? lastSaleRow.shift_receipt_number : null;

    return {
      success: true,
      total_sales,
      net_profit,
      receipts_count,
      last_sale_id,
      last_shift_receipt_number
    };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

function getProductsPaginated(page = 1, searchQuery = '') {
  try {
    const limit = 50;
    const offset = (page - 1) * limit;
    let products;
    let totalCount;
    const bType = getActiveBusinessType();
    const hasRetail = db.prepare("SELECT 1 FROM products WHERE business_type = 'retail' LIMIT 1").get();
    const filterRetail = bType !== 'restaurant' && !!hasRetail;

    if (searchQuery && searchQuery.trim() !== '') {
      const queryStr = `%${searchQuery.trim().toLowerCase()}%`;
      if (!filterRetail) {
        products = db.prepare(`
          SELECT * FROM products 
          WHERE (my_lower(name) LIKE ? OR my_lower(barcode) LIKE ?) 
          ORDER BY id DESC LIMIT ? OFFSET ?
        `).all(queryStr, queryStr, limit, offset);

        totalCount = db.prepare(`
          SELECT COUNT(*) as count FROM products 
          WHERE (my_lower(name) LIKE ? OR my_lower(barcode) LIKE ?)
        `).get(queryStr, queryStr).count;
      } else {
        products = db.prepare(`
          SELECT * FROM products 
          WHERE business_type = 'retail' AND (my_lower(name) LIKE ? OR my_lower(barcode) LIKE ?) 
          ORDER BY id DESC LIMIT ? OFFSET ?
        `).all(queryStr, queryStr, limit, offset);

        totalCount = db.prepare(`
          SELECT COUNT(*) as count FROM products 
          WHERE business_type = 'retail' AND (my_lower(name) LIKE ? OR my_lower(barcode) LIKE ?)
        `).get(queryStr, queryStr).count;
      }
    } else {
      if (!filterRetail) {
        products = db.prepare(`
          SELECT * FROM products 
          ORDER BY id DESC LIMIT ? OFFSET ?
        `).all(limit, offset);

        totalCount = db.prepare(`
          SELECT COUNT(*) as count FROM products
        `).get().count;
      } else {
        products = db.prepare(`
          SELECT * FROM products 
          WHERE business_type = 'retail'
          ORDER BY id DESC LIMIT ? OFFSET ?
        `).all(limit, offset);

        totalCount = db.prepare(`
          SELECT COUNT(*) as count FROM products WHERE business_type = 'retail'
        `).get().count;
      }
    }

    return {
      success: true,
      products,
      totalCount,
      page: parseInt(page),
      totalPages: Math.ceil(totalCount / limit)
    };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

function getCustomersWithDebts(searchQuery = '') {
  try {
    let rows;
    if (searchQuery && searchQuery.trim() !== '') {
      const q = `%${searchQuery.trim().toLowerCase()}%`;
      const cleanQ = `%${searchQuery.replace(/\D/g, '')}%`;
      rows = db.prepare(`
        SELECT c.*, 
               (SELECT MAX(created_at) FROM sales WHERE customer_id = c.id AND payment_method = 'debt') as last_debt_date 
        FROM customers c 
        WHERE my_lower(c.name) LIKE ? OR clean_phone(c.phone) LIKE ?
        ORDER BY c.total_debt DESC
      `).all(q, cleanQ);
    } else {
      rows = db.prepare(`
        SELECT c.*, 
               (SELECT MAX(created_at) FROM sales WHERE customer_id = c.id AND payment_method = 'debt') as last_debt_date 
        FROM customers c 
        ORDER BY c.total_debt DESC
      `).all();
    }
    return { success: true, data: rows };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

function generateEAN13(numberStr) {
  const prefix = '200';
  let dataPart = prefix + String(numberStr).padStart(9, '0');
  if (dataPart.length > 12) {
    dataPart = dataPart.substring(0, 12);
  }
  
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    const digit = parseInt(dataPart[i], 10);
    if (i % 2 === 0) {
      sum += digit;
    } else {
      sum += digit * 3;
    }
  }
  const checksum = (10 - (sum % 10)) % 10;
  return dataPart + checksum;
}

function generateUniqueLocalBarcode() {
  try {
    const rows = db.prepare("SELECT barcode FROM products WHERE barcode LIKE '200%' AND length(barcode) = 13").all();
    let maxNum = 0;
    for (const r of rows) {
      const code = r.barcode;
      const dataPart = code.substring(3, 12);
      const num = parseInt(dataPart, 10);
      if (!isNaN(num) && num > maxNum) {
        maxNum = num;
      }
    }
    const nextNum = maxNum + 1;
    return generateEAN13(nextNum);
  } catch (err) {
    const rand = Math.floor(100000000 + Math.random() * 900000000);
    return generateEAN13(rand);
  }
}

function findLocalBarcodeByName(name) {
  try {
    if (!name || name.trim() === "") return null;
    const row = db.prepare("SELECT barcode FROM products WHERE my_lower(name) LIKE my_lower(?) AND barcode IS NOT NULL AND barcode != '' LIMIT 1")
      .get(`%${name.trim()}%`);
    if (row && row.barcode) {
      return row.barcode;
    }
    return null;
  } catch (err) {
    return null;
  }
}

function getCustomer(customerId) {
  try {
    const row = db.prepare("SELECT * FROM customers WHERE id = ?").get(customerId);
    return { success: true, data: row };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

function getSaleForReprint(saleId) {
  try {
    const sale = db.prepare('SELECT * FROM sales WHERE id = ?').get(saleId);
    if (!sale) return { success: false, error: 'Sale not found' };
    const items = db.prepare('SELECT * FROM sale_items WHERE sale_id = ?').all(saleId);
    return { success: true, sale, items };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// ── AI Bashoratchi ───────────────────────────────────────────────────────────
async function getAiInsights() {
  try {
    const settingsRow = db.prepare("SELECT value FROM settings WHERE key = 'gemini_api_key'").get();
    if (!settingsRow || !settingsRow.value) {
      return { success: false, error: "Gemini API kaliti topilmadi. Sozlamalar menyusiga kirib, AI API kalitini kiriting." };
    }
    const apiKey = settingsRow.value;

    const query = `
      SELECT 
        p.name, 
        SUM(si.qty - si.refunded_qty) as total_sold, 
        SUM((si.qty - si.refunded_qty) * si.price - (COALESCE(NULLIF(p.cost_price, 0), p.buy_price, 0) * (si.qty - si.refunded_qty))) as total_profit,
        p.stock
      FROM sale_items si
      JOIN sales s ON si.sale_id = s.id
      JOIN products p ON si.product_id = p.id
      WHERE s.status != 'refunded' AND s.created_at >= date('now', '-30 days')
      GROUP BY p.id
      ORDER BY total_sold DESC
      LIMIT 100
    `;
    const salesData = db.prepare(query).all();
    if (!salesData || salesData.length === 0) {
      return { success: false, error: "Tahlil qilish uchun oxirgi 30 kun ichida yetarli savdo ma'lumoti topilmadi." };
    }

    // Totals summary
    const totals = db.prepare(`
      SELECT 
        COUNT(*) as total_sales_count,
        SUM(total_amount) as total_revenue
      FROM sales
      WHERE created_at >= date('now', '-30 days') AND status != 'refunded'
    `).get();

    const profitRow = db.prepare(`
      SELECT SUM((si.price - COALESCE(NULLIF(p.cost_price, 0), p.buy_price, 0)) * (si.qty - si.refunded_qty)) as total_profit
      FROM sale_items si
      JOIN sales s ON s.id = si.sale_id
      LEFT JOIN products p ON p.id = si.product_id
      WHERE s.created_at >= date('now', '-30 days') AND s.status != 'refunded'
    `).get();
    
    // Deduct discounts if any
    const discountRow = db.prepare(`
      SELECT SUM(discount_amount) as total_discounts
      FROM sales
      WHERE created_at >= date('now', '-30 days') AND status != 'refunded'
    `).get();
    const totalDiscounts = discountRow?.total_discounts || 0;
    const totalProfit = (profitRow?.total_profit || 0) - totalDiscounts;

    // Best weekday
    const weekdaySales = db.prepare(`
      SELECT 
        strftime('%w', created_at) as weekday, 
        SUM(total_amount) as total_revenue
      FROM sales
      WHERE created_at >= date('now', '-30 days') AND status != 'refunded'
      GROUP BY weekday
      ORDER BY total_revenue DESC
      LIMIT 1
    `).get();
    
    const weekdayMap = {
      '0': 'Yakshanba',
      '1': 'Dushanba',
      '2': 'Seshanba',
      '3': 'Chorshanba',
      '4': 'Payshanba',
      '5': 'Juma',
      '6': 'Shanba'
    };
    const bestDay = weekdaySales ? weekdayMap[weekdaySales.weekday] : 'Noma\'lum';

    // Aging products (unsold for 30+ days)
    const bType = getActiveBusinessType();
    const agingProducts = db.prepare(`
      SELECT * FROM (
        SELECT p.id, p.name, p.barcode, p.buy_price, p.sell_price, p.stock, p.unit,
               (SELECT MAX(s.created_at)
                FROM sale_items si
                JOIN sales s ON si.sale_id = s.id
                WHERE si.product_id = p.id AND s.status != 'refunded'
               ) as last_sold_at,
               (SELECT MIN(il.created_at)
                FROM inventory_logs il
                WHERE il.product_id = p.id
               ) as added_at
        FROM products p
        WHERE p.stock > 0 AND p.business_type = ?
      ) WHERE 
        (last_sold_at IS NOT NULL AND last_sold_at < datetime('now', '-30 days', 'localtime'))
        OR (last_sold_at IS NULL AND (added_at IS NULL OR added_at < datetime('now', '-30 days', 'localtime')))
      ORDER BY COALESCE(last_sold_at, added_at) ASC
      LIMIT 30
    `).all(bType);

    const genAI = new GoogleGenerativeAI(apiKey);
    
    const prompt = `Ты — опытный, резкий и успешный бизнес-консультант и профессиональный аналитик розничных продаж. Изучи показатели продаж магазина за последние 30 дней и список залежавшихся товаров (unsold).
Сделай детальный бизнес-анализ и выдай результат СТРОГО в формате JSON на узбекском языке.

Формат ответа строго чистый JSON без markdown-разметки (без \`\`\`json):
{
  "monthly_summary": {
    "sales_count_last_30_days": ${totals?.total_sales_count || 0},
    "net_profit_last_30_days": ${Math.round(totalProfit)},
    "revenue_last_30_days": ${Math.round(totals?.total_revenue || 0)},
    "best_day_of_week": "${bestDay}"
  },
  "top_product": "🔥 [Name]... Ushbu tovar eng xaridorgir. Oxirgi 1 oyda jami shuncha dona sotildi va shuncha so'm sof foyda keltirdi.",
  "price_up": "💰 [Name]... Xaridorgir tovar. Narxini ko'taring, savdo pasaymaydi, foyda ortadi.",
  "dead_stock": "📉 [Name]... Omborda qoldiq bor, ancha vaqtdan beri sotilmadi. Savdoni jadallashtirish uchun narxini arzonlashtiring yoki skidka bering.",
  "forecast": "🔮 Kelgusi oyda siz taxminan faloncha UZS lik savdo qilasiz, eng ko'p sotiladigan kun falon kun bo'ladi.",
  "detailed_insights": [
    "Sotuvlar tahlili: Oxirgi oyda jami faloncha so'm savdo qilib, faloncha so'm sof foyda oldingiz. Savdolar asosan falon kuni eng yuqori bo'lmoqda.",
    "Aylanmayotgan tovarlar bo'yicha raqamli hisob-kitob: [Name1] va [Name2] tovarlari ancha paytdan beri turibdi. Agar ularni narxini faloncha so'mga tushirsangiz, keyingi 1 oyda faloncha dona sota olasiz, bu sizga faloncha so'm muzlagan aylanma mablag'ni qaytaradi.",
    "Batafsil tavsiya: Tovar qoldiqlarini boshqarish va keyingi oyda qancha sotishingiz taxminiy hisob-kitobi..."
  ]
}

Boshqa hech qanday izoh yoki qo'shimcha matn yozmang, faqat JSON formatda javob bering.

Ma'lumotlar:
- Savdolar soni (cheklar soni): ${totals?.total_sales_count || 0}
- Jami savdo aylanmasi (Revenue): ${Math.round(totals?.total_revenue || 0)} so'm
- Jami sof foyda (Net Profit): ${Math.round(totalProfit)} so'm
- Eng yaxshi savdo kuni: ${bestDay}

Top sotilgan tovarlar (oxirgi 30 kun):
${JSON.stringify(salesData, null, 2)}

Sotilmayotgan tovarlar (30+ kundan beri omborda turibdi, sotilmagan):
${JSON.stringify(agingProducts, null, 2)}
`;

    const modelsToTry = [
      "gemini-2.5-flash",
      "gemini-2.0-flash",
      "gemini-flash-latest",
      "gemini-pro-latest",
      "gemini-1.5-flash",
      "gemini-1.5-pro"
    ];

    let result = null;
    let lastError = null;

    for (const modelName of modelsToTry) {
      try {
        const model = genAI.getGenerativeModel({ model: modelName });
        result = await model.generateContent(prompt);
        break; // Muvaffaqiyatli ishlasa loopdan chiqib ketadi
      } catch (apiErr) {
        lastError = apiErr;
        console.error(`AI model ${modelName} failed:`, apiErr);
        // Har qanday xatolik (masalan 404, 503, 429) bo'lsa, keyingi modelni sinab ko'radi
        continue;
      }
    }

    if (!result) {
      throw lastError || new Error("Barcha AI modellari tekshirildi, biroq sizning API kalitingiz uchun mos model topilmadi.");
    }

    let text = result.response.text();
    text = text.replace(/```json/g, '').replace(/```/g, '').trim();
    const parsed = JSON.parse(text);

    return { success: true, data: parsed };
  } catch (err) {
    console.error("AI Error:", err);
    return { success: false, error: "AI bilan bog'lanishda xatolik: " + err.message };
  }
}

function getProduct(id) {
  try {
    return db.prepare('SELECT * FROM products WHERE id = ?').get(id);
  } catch (err) {
    return null;
  }
}

function getNextBarcode() {
  try {
    const rows = db.prepare("SELECT barcode FROM products WHERE barcode LIKE '75%' AND length(barcode) = 8").all();
    let maxNum = 0;
    for (const r of rows) {
      if (r.barcode) {
        const numPart = parseInt(r.barcode.substring(2));
        if (!isNaN(numPart) && numPart > maxNum) {
          maxNum = numPart;
        }
      }
    }
    const nextNum = maxNum + 1;
    const paddedNum = String(nextNum).padStart(6, '0');
    return { success: true, barcode: '75' + paddedNum };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// ── Restaurant / Waiter POS ──────────────────────────────────────────────────
function waiterLogin(pinCode) {
  try {
    const waiter = db.prepare("SELECT id, name, role FROM waiters WHERE pin_code = ?").get(pinCode);
    if (waiter) {
      return { success: true, waiter_id: waiter.id, name: waiter.name, role: waiter.role };
    }
    return { success: false, error: 'Invalid PIN' };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

function getRestaurantTables() {
  try {
    // Dynamically check if active orders exist to determine occupied status
    const rows = db.prepare(`
      SELECT t.id, t.name, t.zone, t.locked_by, t.is_printed, t.opened_at,
        CASE WHEN EXISTS (
          SELECT 1 FROM restaurant_orders o WHERE o.table_id = t.id AND o.status = 'active'
        ) THEN 'occupied' ELSE 'free' END as status,
        (
          SELECT w.name 
          FROM restaurant_orders o 
          JOIN waiters w ON o.waiter_id = w.id 
          WHERE o.table_id = t.id AND o.status = 'active' 
          LIMIT 1
        ) as waiter_name,
        (
          SELECT o.kitchen_status 
          FROM restaurant_orders o 
          WHERE o.table_id = t.id AND o.status = 'active' 
          LIMIT 1
        ) as kitchen_status,
        (
          SELECT o.order_number 
          FROM restaurant_orders o 
          WHERE o.table_id = t.id AND o.status = 'active' 
          LIMIT 1
        ) as order_number,
        (
          SELECT o.id 
          FROM restaurant_orders o 
          WHERE o.table_id = t.id AND o.status = 'active' 
          LIMIT 1
        ) as order_id,
        (
          SELECT o.ready_at 
          FROM restaurant_orders o 
          WHERE o.table_id = t.id AND o.status = 'active' 
          LIMIT 1
        ) as ready_at
      FROM restaurant_tables t
      ORDER BY t.id ASC
    `).all();
    return { success: true, data: rows };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

function addRestaurantTable(name, zone) {
  try {
    const info = db.prepare("INSERT INTO restaurant_tables (name, zone, status) VALUES (?, ?, 'free')").run(name, zone);
    return { success: true, id: info.lastInsertRowid };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

function deleteRestaurantTable(tableId) {
  try {
    // Check if the table has an active order
    const active = db.prepare("SELECT id FROM restaurant_orders WHERE table_id = ? AND status = 'active'").get(tableId);
    if (active) {
      return { success: false, error: 'Bu stolda aktiv buyurtma bor, avval buyurtmani yoping!' };
    }
    db.prepare("DELETE FROM restaurant_tables WHERE id = ?").run(tableId);
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

function getRestaurantZones() {
  try {
    const rows = db.prepare("SELECT id, name FROM restaurant_zones ORDER BY id ASC").all();
    return { success: true, data: rows };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

function addRestaurantZone(name) {
  try {
    db.prepare("INSERT INTO restaurant_zones (name) VALUES (?)").run(name);
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

function deleteRestaurantZone(name) {
  try {
    if (name === 'Dostavka') {
      return { success: false, error: 'Dostavka zonasini o\'chirib bo\'lmaydi!' };
    }
    
    // Check if there are active orders in this zone
    const activeOrder = db.prepare(`
      SELECT 1 FROM restaurant_tables t
      JOIN restaurant_orders o ON o.table_id = t.id
      WHERE t.zone = ? AND o.status = 'active'
      LIMIT 1
    `).get(name);
    
    if (activeOrder) {
      return { success: false, error: 'Bu zonada faol buyurtmalar bor, avval ularni yakunlang!' };
    }
    
    db.exec('BEGIN TRANSACTION');
    // Delete tables under this zone
    db.prepare("DELETE FROM restaurant_tables WHERE zone = ?").run(name);
    // Delete the zone itself
    db.prepare("DELETE FROM restaurant_zones WHERE name = ?").run(name);
    db.exec('COMMIT');
    
    return { success: true };
  } catch (err) {
    try { db.exec('ROLLBACK'); } catch (_) {}
    return { success: false, error: err.message };
  }
}



function getActiveOrderForTable(tableId) {
  try {
    const order = db.prepare("SELECT id, table_id, waiter_id, total_amount, status, kitchen_status, order_number, order_type, ready_at, created_at FROM restaurant_orders WHERE table_id = ? AND status = 'active'").get(tableId);
    if (!order) {
      return { success: true, data: null };
    }
    const items = db.prepare(`
      SELECT item.product_id as id, item.product_name as name, item.qty, item.price, p.unit, p.category, item.added_at 
      FROM restaurant_order_items item
      LEFT JOIN products p ON p.id = item.product_id
      WHERE item.order_id = ?
    `).all(order.id);
    return { success: true, data: { order, items } };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

function saveRestaurantOrder(tableId, waiterId, cartItems) {
  try {
    db.prepare("BEGIN TRANSACTION").run();
    
    // If cart is empty, clean up the active order (if any) and mark table as free
    if (!cartItems || cartItems.length === 0) {
      const active = db.prepare("SELECT id FROM restaurant_orders WHERE table_id = ? AND status = 'active'").get(tableId);
      if (active) {
        db.prepare("DELETE FROM restaurant_order_items WHERE order_id = ?").run(active.id);
        db.prepare("DELETE FROM restaurant_orders WHERE id = ?").run(active.id);
      }
      db.prepare("UPDATE restaurant_tables SET status = 'free', is_printed = 0, locked_by = NULL, opened_at = NULL WHERE id = ?").run(tableId);
      db.prepare("COMMIT").run();
      deleteTableIfDelivery(tableId);
      return { success: true };
    }

    // Check stop-list and validate all cart items
    for (const item of cartItems) {
      const qty = parseFloat(item.qty);
      if (isNaN(qty) || qty <= 0 || !isFinite(qty)) {
        throw new Error(`Noto'g'ri mahsulot miqdori: ${item.name || item.id}`);
      }
      const p = db.prepare('SELECT id, name, sell_price, is_stopped FROM products WHERE id = ?').get(item.id);
      if (!p) {
        throw new Error(`Mahsulot topilmadi: ${item.name || item.id}`);
      }
      if (p.is_stopped === 1) {
        throw new Error(`"${p.name}" stop-listda! Uni buyurtmaga qo'shib bo'lmaydi.`);
      }
      const price = parseFloat(item.price);
      if (isNaN(price) || price < 0 || !isFinite(price)) {
        item.price = p.sell_price;
      }
      const ings = db.prepare(`
        SELECT p.name, p.is_stopped
        FROM product_ingredients i
        JOIN products p ON i.ingredient_product_id = p.id
        WHERE i.parent_product_id = ?
      `).all(p.id);
      for (const ing of ings) {
        if (ing.is_stopped === 1) {
          throw new Error(`"${p.name}" taomi tarkibidagi "${ing.name}" stop-listda! Uni buyurtmaga qo'shib bo'lmaydi.`);
        }
      }
    }

    // Calculate total amount
    let totalAmount = 0;
    for (const item of cartItems) {
      totalAmount += (item.qty * item.price);
    }
    
    const table = db.prepare("SELECT name, zone FROM restaurant_tables WHERE id = ?").get(tableId);
    const orderType = (table && table.zone === 'Dostavka') ? 'takeaway' : 'dine_in';

    // Check if there is an active order
    let order = db.prepare("SELECT id, order_number, kitchen_status FROM restaurant_orders WHERE table_id = ? AND status = 'active'").get(tableId);
    let orderId;
    let orderNumber;
    if (order) {
      orderId = order.id;
      orderNumber = order.order_number;
      if (!orderNumber) {
        const lastOrd = db.prepare("SELECT order_number FROM restaurant_orders WHERE order_number IS NOT NULL ORDER BY id DESC LIMIT 1").get();
        orderNumber = (lastOrd && lastOrd.order_number >= 1 && lastOrd.order_number < 999) ? lastOrd.order_number + 1 : 1;
      }
      // Update order
      db.prepare("UPDATE restaurant_orders SET total_amount = ?, waiter_id = ?, order_type = ?, order_number = ? WHERE id = ?").run(totalAmount, waiterId, orderType, orderNumber, orderId);
      // Delete old items
      db.prepare("DELETE FROM restaurant_order_items WHERE order_id = ?").run(orderId);
    } else {
      // Insert new order with cyclic number 1..999
      const lastOrd = db.prepare("SELECT order_number FROM restaurant_orders WHERE order_number IS NOT NULL ORDER BY id DESC LIMIT 1").get();
      orderNumber = (lastOrd && lastOrd.order_number >= 1 && lastOrd.order_number < 999) ? lastOrd.order_number + 1 : 1;
      const info = db.prepare("INSERT INTO restaurant_orders (table_id, waiter_id, total_amount, status, kitchen_status, order_number, order_type) VALUES (?, ?, ?, 'active', 'preparing', ?, ?)").run(tableId, waiterId, totalAmount, orderNumber, orderType);
      orderId = info.lastInsertRowid;
    }
    
    // Insert items
    const insertItem = db.prepare("INSERT INTO restaurant_order_items (order_id, product_id, product_name, qty, price, added_at) VALUES (?, ?, ?, ?, ?, ?)");
    for (const item of cartItems) {
      const addedAt = item.added_at || new Date().toISOString().replace('T', ' ').substring(0, 19);
      insertItem.run(orderId, item.id, item.name, item.qty, item.price, addedAt);
    }
    
    // Update table status and opened_at if not set
    const nowStr = new Date().toISOString().replace('T', ' ').substring(0, 19);
    db.prepare("UPDATE restaurant_tables SET status = 'occupied', opened_at = COALESCE(opened_at, ?) WHERE id = ?").run(nowStr, tableId);
    
    db.prepare("COMMIT").run();
    
    return { success: true, orderId, orderNumber };
  } catch (err) {
    try { db.prepare("ROLLBACK").run(); } catch (_) {}
    return { success: false, error: err.message };
  }
}

function deleteTableIfDelivery(tableId) {
  try {
    const table = db.prepare("SELECT name, zone FROM restaurant_tables WHERE id = ?").get(tableId);
    if (table && table.zone === 'Dostavka') {
      // Only delete if it is a custom delivery table (starts with "Dostavka: ")
      if (table.name.startsWith('Dostavka: ')) {
        db.prepare("DELETE FROM restaurant_tables WHERE id = ?").run(tableId);
      }
    }
  } catch (err) {
    console.error("Error deleting delivery table:", err);
  }
}

function closeRestaurantOrder(tableId, cashierName, paymentMethod, customerInfo, discountPercent, comment = '', serviceFeePercent = 0, serviceFeeAmount = 0, isTakeaway = 0) {
  try {
    // Find active order
    const orderRes = getActiveOrderForTable(tableId);
    if (!orderRes.success || !orderRes.data) {
      return { success: false, error: 'No active order for this table' };
    }
    const { order, items } = orderRes.data;

    const table = db.prepare("SELECT name, zone FROM restaurant_tables WHERE id = ?").get(tableId);
    const isDeliveryOrTakeaway = isTakeaway || (table && table.zone === 'Dostavka') ? 1 : 0;
    
    // Call processSale
    const cartItems = items.map(it => ({
      id: it.id,
      name: it.name,
      qty: it.qty,
      sell_price: it.price,
      unit: it.unit || 'dona',
      category: it.category || 'Boshqa'
    }));
    
    // 1. Execute standard checkout first (this performs stock check and deduction)
    const saleResult = processSale(
      cartItems,
      paymentMethod,
      customerInfo,
      cashierName,
      discountPercent,
      'mobile',
      order.waiter_id,
      comment,
      isDeliveryOrTakeaway ? 0 : serviceFeePercent,
      isDeliveryOrTakeaway ? 0 : serviceFeeAmount,
      isDeliveryOrTakeaway
    );
    
    if (saleResult && saleResult.success) {
      // 2. If checkout succeeded, run a transaction to close restaurant order and free table
      db.prepare("BEGIN TRANSACTION").run();
      try {
        // Mark order as completed
        db.prepare("UPDATE restaurant_orders SET status = 'completed', kitchen_status = 'completed' WHERE id = ?").run(order.id);
        
        // Mark table as free, reset locks, printed status, and opened_at
        db.prepare("UPDATE restaurant_tables SET status = 'free', is_printed = 0, locked_by = NULL, opened_at = NULL WHERE id = ?").run(tableId);
        
        db.prepare("COMMIT").run();
      } catch (transErr) {
        try { db.prepare("ROLLBACK").run(); } catch (_) {}
        throw transErr;
      }
      
      // If it was delivery, delete table
      deleteTableIfDelivery(tableId);
      
      return { success: true, saleResult };
    } else {
      return { success: false, error: saleResult ? saleResult.error : 'Sotuvni yakunlashda xatolik yuz berdi' };
    }
  } catch (err) {
    return { success: false, error: err.message };
  }
}

function closeRestaurantOrderOnly(tableId) {
  try {
    const order = db.prepare("SELECT id FROM restaurant_orders WHERE table_id = ? AND status = 'active'").get(tableId);
    if (order) {
      db.prepare("UPDATE restaurant_orders SET status = 'completed' WHERE id = ?").run(order.id);
    }
    db.prepare("UPDATE restaurant_tables SET status = 'free', is_printed = 0, locked_by = NULL, opened_at = NULL WHERE id = ?").run(tableId);
    
    // If it was delivery, delete table
    deleteTableIfDelivery(tableId);

    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

function transferRestaurantTable(fromTableId, toTableId) {
  try {
    db.prepare("BEGIN TRANSACTION").run();
    
    const order = db.prepare("SELECT id FROM restaurant_orders WHERE table_id = ? AND status = 'active'").get(fromTableId);
    if (!order) {
      db.prepare("ROLLBACK").run();
      return { success: false, error: 'Buyurtma topilmadi' };
    }

    const activeTargetOrder = db.prepare("SELECT id FROM restaurant_orders WHERE table_id = ? AND status = 'active'").get(toTableId);
    const targetTable = db.prepare("SELECT status FROM restaurant_tables WHERE id = ?").get(toTableId);
    if (activeTargetOrder || (targetTable && targetTable.status === 'occupied')) {
      db.prepare("ROLLBACK").run();
      return { success: false, error: 'Nishon stol band' };
    }

    const fromTable = db.prepare("SELECT opened_at, is_printed, zone FROM restaurant_tables WHERE id = ?").get(fromTableId);
    const openedAt = fromTable ? fromTable.opened_at : null;
    const isPrinted = fromTable ? fromTable.is_printed : 0;

    db.prepare("UPDATE restaurant_orders SET table_id = ? WHERE id = ?").run(toTableId, order.id);
    db.prepare("UPDATE restaurant_tables SET status = 'free', opened_at = NULL, is_printed = 0, locked_by = NULL WHERE id = ?").run(fromTableId);
    db.prepare("UPDATE restaurant_tables SET status = 'occupied', opened_at = ?, is_printed = ?, locked_by = NULL WHERE id = ?").run(openedAt, isPrinted, toTableId);

    db.prepare("COMMIT").run();

    if (fromTable && fromTable.zone === 'Dostavka') {
      deleteTableIfDelivery(fromTableId);
    }

    return { success: true };
  } catch (err) {
    try { db.prepare("ROLLBACK").run(); } catch (_) {}
    return { success: false, error: err.message };
  }
}

function transferRestaurantOrderWaiter(tableId, targetWaiterId) {
  try {
    db.prepare("UPDATE restaurant_orders SET waiter_id = ? WHERE table_id = ? AND status = 'active'").run(targetWaiterId, tableId);
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

function cancelRestaurantOrder(tableId, cancelledBy) {
  try {
    db.prepare("BEGIN TRANSACTION").run();
    
    const order = db.prepare("SELECT id FROM restaurant_orders WHERE table_id = ? AND status = 'active'").get(tableId);
    if (!order) {
      db.prepare("ROLLBACK").run();
      return { success: false, error: 'Buyurtma topilmadi' };
    }

    db.prepare("UPDATE restaurant_orders SET status = 'cancelled' WHERE id = ?").run(order.id);
    db.prepare("UPDATE restaurant_tables SET status = 'free', locked_by = NULL, is_printed = 0, opened_at = NULL WHERE id = ?").run(tableId);

    db.prepare("COMMIT").run();
    
    // If it was delivery, delete table
    deleteTableIfDelivery(tableId);

    return { success: true, orderId: order.id };
  } catch (err) {
    try { db.prepare("ROLLBACK").run(); } catch (_) {}
    return { success: false, error: err.message };
  }
}

function addDeliveryOrder(customerName, customerPhone, customerAddress, waiterId) {
  try {
    db.prepare("BEGIN TRANSACTION").run();
    
    const tableName = `Dostavka: ${customerName} (${customerPhone}) - ${customerAddress}`;
    const info = db.prepare("INSERT INTO restaurant_tables (name, zone, status) VALUES (?, 'Dostavka', 'occupied')").run(tableName);
    const tableId = info.lastInsertRowid;

    const orderInfo = db.prepare("INSERT INTO restaurant_orders (table_id, waiter_id, total_amount, status) VALUES (?, ?, 0, 'active')").run(tableId, waiterId);
    
    db.prepare("COMMIT").run();
    return { success: true, tableId, tableName, orderId: orderInfo.lastInsertRowid };
  } catch (err) {
    try { db.prepare("ROLLBACK").run(); } catch (_) {}
    return { success: false, error: err.message };
  }
}

function saveProductRecipe(productId, ingredients) {
  try {
    db.prepare("BEGIN TRANSACTION").run();
    db.prepare("DELETE FROM product_ingredients WHERE parent_product_id = ?").run(productId);
    
    if (ingredients && ingredients.length > 0) {
      const stmt = db.prepare("INSERT INTO product_ingredients (parent_product_id, ingredient_product_id, quantity, waste_percentage) VALUES (?, ?, ?, ?)");
      for (const ing of ingredients) {
        stmt.run(
          productId,
          ing.ingredient_product_id,
          parseFloat(ing.quantity) || 0,
          parseFloat(ing.waste_percentage) || 0
        );
      }
      
      // Dynamically calculate parent product buy_price (cost price) as sum of ingredients' costs including waste %
      let calculatedCost = 0;
      for (const ing of ingredients) {
        const ingProduct = db.prepare("SELECT buy_price FROM products WHERE id = ?").get(ing.ingredient_product_id);
        if (ingProduct) {
          const qty = parseFloat(ing.quantity) || 0;
          const wastePct = parseFloat(ing.waste_percentage) || 0;
          const effectiveQty = qty * (1 + wastePct / 100);
          calculatedCost += (ingProduct.buy_price * effectiveQty);
        }
      }
      db.prepare("UPDATE products SET buy_price = ?, cost_price = ? WHERE id = ?").run(calculatedCost, calculatedCost, productId);
      calculateAvailablePortions(productId);
    }
    
    db.prepare("COMMIT").run();
    return { success: true };
  } catch (err) {
    try { db.prepare("ROLLBACK").run(); } catch (_) {}
    return { success: false, error: err.message };
  }
}

function getProductRecipe(productId) {
  try {
    const rows = db.prepare(`
      SELECT i.ingredient_product_id, i.quantity, i.waste_percentage, p.name, p.unit, p.buy_price, p.stock
      FROM product_ingredients i
      JOIN products p ON i.ingredient_product_id = p.id
      WHERE i.parent_product_id = ?
    `).all(productId);
    return { success: true, data: rows };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

function calculateAvailablePortions(dishId) {
  try {
    const ingredients = db.prepare(`
      SELECT i.ingredient_product_id, i.quantity, i.waste_percentage, p.stock
      FROM product_ingredients i
      JOIN products p ON i.ingredient_product_id = p.id
      WHERE i.parent_product_id = ?
    `).all(dishId);

    if (ingredients.length === 0) return null; // Not a ready dish with a recipe

    let minPortions = Infinity;
    for (const ing of ingredients) {
      const qty = parseFloat(ing.quantity) || 0;
      const wastePct = parseFloat(ing.waste_percentage) || 0;
      const effectiveQty = qty * (1 + wastePct / 100);
      if (effectiveQty <= 0) continue;
      const portions = ing.stock / effectiveQty;
      if (portions < minPortions) {
        minPortions = portions;
      }
    }

    const available = minPortions === Infinity ? 0 : Math.max(0, Math.floor(minPortions + 0.0001));
    db.prepare('UPDATE products SET stock = ? WHERE id = ?').run(available, dishId);
    return available;
  } catch (err) {
    console.error('Error calculating portions:', err);
    return 0;
  }
}

function produceSemiFinished(productId, quantity, userName) {
  try {
    const prod = db.prepare("SELECT id, name, unit, type, stock FROM products WHERE id = ?").get(productId);
    if (!prod) {
      return { success: false, error: "Mahsulot topilmadi!" };
    }

    const qtyToProduce = parseFloat(quantity);
    if (isNaN(qtyToProduce) || qtyToProduce <= 0) {
      return { success: false, error: "Noto'g'ri miqdor kiritildi!" };
    }

    const ingredients = db.prepare(`
      SELECT i.ingredient_product_id, i.quantity, i.waste_percentage, p.name, p.stock, p.unit
      FROM product_ingredients i
      JOIN products p ON i.ingredient_product_id = p.id
      WHERE i.parent_product_id = ?
    `).all(productId);

    if (!ingredients || ingredients.length === 0) {
      return { success: false, error: `"${prod.name}" uchun retsept / kalkulyatsiya kiritilmagan!` };
    }

    // Validate ingredient stock availability
    for (const ing of ingredients) {
      const wastePct = parseFloat(ing.waste_percentage) || 0;
      const effectiveQtyPerUnit = (parseFloat(ing.quantity) || 0) * (1 + wastePct / 100);
      const totalRequired = effectiveQtyPerUnit * qtyToProduce;

      if ((ing.stock || 0) < totalRequired) {
        const requiredStr = totalRequired.toFixed(3);
        const stockStr = (ing.stock || 0).toFixed(3);
        return {
          success: false,
          error: `Xom-ashyo yetarli emas: "${ing.name}" (Mavjud: ${stockStr} ${ing.unit || ''}, Kerak: ${requiredStr} ${ing.unit || ''})`
        };
      }
    }

    db.prepare("BEGIN TRANSACTION").run();

    // Deduct ingredients and log inventory
    for (const ing of ingredients) {
      const wastePct = parseFloat(ing.waste_percentage) || 0;
      const effectiveQtyPerUnit = (parseFloat(ing.quantity) || 0) * (1 + wastePct / 100);
      const totalRequired = effectiveQtyPerUnit * qtyToProduce;

      db.prepare("UPDATE products SET stock = stock - ? WHERE id = ?").run(totalRequired, ing.ingredient_product_id);

      logInventory({
        productId: ing.ingredient_product_id,
        productName: ing.name,
        actionType: 'production_out',
        quantityChanged: -totalRequired,
        userName: userName || 'Oshpaz',
        note: `Polufabrikat tayyorlash uchun sarflandi: ${prod.name} × ${qtyToProduce} ${prod.unit || 'kg'}`
      });

      updateDependentDishesStocks(ing.ingredient_product_id);
    }

    // Add stock to semi-finished product
    db.prepare("UPDATE products SET stock = stock + ? WHERE id = ?").run(qtyToProduce, productId);

    logInventory({
      productId: productId,
      productName: prod.name,
      actionType: 'production_in',
      quantityChanged: qtyToProduce,
      userName: userName || 'Oshpaz',
      note: `Polufabrikat tayyorlandi: +${qtyToProduce} ${prod.unit || 'kg'}`
    });

    updateDependentDishesStocks(productId);

    db.prepare("COMMIT").run();
    return { success: true, productName: prod.name, qtyProduced: qtyToProduce };
  } catch (err) {
    try { db.prepare("ROLLBACK").run(); } catch (_) {}
    return { success: false, error: err.message };
  }
}

function updateDependentDishesStocks(ingredientId) {
  try {
    const parentDishes = db.prepare(`
      SELECT DISTINCT parent_product_id FROM product_ingredients WHERE ingredient_product_id = ?
    `).all(ingredientId);

    for (const row of parentDishes) {
      calculateAvailablePortions(row.parent_product_id);
    }
  } catch (err) {
    console.error('Error updating dependent dishes:', err);
  }
}

function getProductGroups() {
  try {
    const rows = db.prepare("SELECT * FROM product_groups ORDER BY group_name ASC").all();
    return { success: true, data: rows };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

function addProductGroup(name) {
  try {
    const stmt = db.prepare("INSERT INTO product_groups (group_name) VALUES (?)");
    const info = stmt.run(name);
    return { success: true, id: info.lastInsertRowid };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

function getOrCreateProductGroup(name) {
  try {
    const trimmed = String(name).trim();
    let row = db.prepare("SELECT id FROM product_groups WHERE LOWER(group_name) = LOWER(?)").get(trimmed);
    if (row) {
      return { success: true, id: row.id };
    }
    const info = db.prepare("INSERT INTO product_groups (group_name) VALUES (?)").run(trimmed);
    return { success: true, id: info.lastInsertRowid };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

function projectYield(products) {
  try {
    const recipes = db.prepare(`
      SELECT DISTINCT parent_product_id, p.name as dish_name
      FROM product_ingredients i
      JOIN products p ON i.parent_product_id = p.id
    `).all();

    const stockChanges = {};
    for (const p of products) {
      let qty = parseFloat(p.quantity) || 0;
      let unit = p.unit || 'dona';
      if (unit.toLowerCase() === 'kg' || unit.toLowerCase() === 'l') {
        qty = qty * 1000;
      }

      let existing = null;
      if (p.barcode && String(p.barcode).trim() !== '') {
        existing = db.prepare('SELECT id FROM products WHERE barcode = ?').get(p.barcode);
      }
      if (!existing && p.name) {
        existing = db.prepare('SELECT id FROM products WHERE LOWER(name) = LOWER(?)').get(p.name);
      }

      if (existing) {
        stockChanges[existing.id] = (stockChanges[existing.id] || 0) + qty;
      }
    }

    const projections = [];

    for (const dish of recipes) {
      const ingredients = db.prepare(`
        SELECT i.ingredient_product_id, i.quantity, p.stock
        FROM product_ingredients i
        JOIN products p ON i.ingredient_product_id = p.id
        WHERE i.parent_product_id = ?
      `).all(dish.parent_product_id);

      if (ingredients.length === 0) continue;

      let currentMin = Infinity;
      let simulatedMin = Infinity;

      for (const ing of ingredients) {
        if (ing.quantity <= 0) continue;
        const currentPortions = ing.stock / ing.quantity;
        if (currentPortions < currentMin) {
          currentMin = currentPortions;
        }

        const added = stockChanges[ing.ingredient_product_id] || 0;
        const simulatedPortions = (ing.stock + added) / ing.quantity;
        if (simulatedPortions < simulatedMin) {
          simulatedMin = simulatedPortions;
        }
      }

      const currentAvailable = currentMin === Infinity ? 0 : Math.floor(currentMin);
      const simulatedAvailable = simulatedMin === Infinity ? 0 : Math.floor(simulatedMin);
      const additional = simulatedAvailable - currentAvailable;

      if (additional > 0) {
        projections.push({
          dish_id: dish.parent_product_id,
          dish_name: dish.dish_name,
          current: currentAvailable,
          simulated: simulatedAvailable,
          additional: additional
        });
      }
    }

    return { success: true, projections };
  } catch (err) {
    console.error('Error projecting yield:', err);
    return { success: false, error: err.message };
  }
}

function lockTable(tableId, userName) {
  try {
    const table = db.prepare("SELECT locked_by, status, opened_at FROM restaurant_tables WHERE id = ?").get(tableId);
    if (!table) return { success: false, error: 'Stol topilmadi' };
    
    if (table.locked_by && table.locked_by !== userName) {
      return { success: false, lockedBy: table.locked_by };
    }
    
    const nowStr = new Date().toISOString().replace('T', ' ').substring(0, 19);
    if (!table.opened_at && table.status === 'free') {
      db.prepare("UPDATE restaurant_tables SET locked_by = ?, opened_at = ? WHERE id = ?").run(userName, nowStr, tableId);
    } else {
      db.prepare("UPDATE restaurant_tables SET locked_by = ? WHERE id = ?").run(userName, tableId);
    }
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

function unlockTable(tableId, userName) {
  try {
    const table = db.prepare("SELECT locked_by, status FROM restaurant_tables WHERE id = ?").get(tableId);
    if (table && table.locked_by === userName) {
      if (table.status === 'free') {
        db.prepare("UPDATE restaurant_tables SET locked_by = NULL, opened_at = NULL WHERE id = ?").run(tableId);
      } else {
        db.prepare("UPDATE restaurant_tables SET locked_by = NULL WHERE id = ?").run(tableId);
      }
    }
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

function setTablePrePrinted(tableId, isPrinted) {
  try {
    db.prepare("UPDATE restaurant_tables SET is_printed = ? WHERE id = ?").run(parseInt(isPrinted) || 0, tableId);
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

function getWaitersReport(startDateISO, endDateISO, waiterId = null, period = null) {
  try {
    const isCurrentShift = (startDateISO === 'shift' || period === 'shift');
    const sanitizeDate = (d) => {
      if (!d) return d;
      return d.replace('T', ' ').replace('Z', '').substring(0, 19);
    };
    const start = isCurrentShift ? null : sanitizeDate(startDateISO);
    const end = isCurrentShift ? null : sanitizeDate(endDateISO);

    const dateFilter = isCurrentShift
      ? "s.is_closed = 0"
      : "s.created_at >= ? AND s.created_at <= ?";
    const dateParams = isCurrentShift ? [] : [start, end];

    if (waiterId) {
      // 1. Consolidated stats for single waiter
      const stats = db.prepare(`
        SELECT 
          w.id,
          w.name,
          w.percentage,
          w.salary,
          COUNT(s.id) as total_receipts,
          IFNULL(SUM(s.total_amount), 0) as total_sales,
          IFNULL(SUM(s.waiter_commission), 0) as total_commission
        FROM waiters w
        LEFT JOIN sales s ON s.waiter_id = w.id AND ${dateFilter} AND s.status != 'refunded'
        WHERE w.id = ?
        GROUP BY w.id
      `).get(...dateParams, waiterId);

      // 2. Detailed list of receipts
      const receipts = db.prepare(`
        SELECT 
          s.id,
          s.shift_receipt_number,
          s.total_amount,
          s.payment_method,
          s.created_at,
          s.waiter_percentage,
          s.waiter_commission,
          s.service_fee_percent,
          s.service_fee_amount,
          s.is_takeaway
        FROM sales s
        WHERE s.waiter_id = ? AND ${dateFilter} AND s.status != 'refunded'
        ORDER BY s.created_at DESC
      `).all(waiterId, ...dateParams);

      return { 
        success: true, 
        data: { 
          waiter: stats || { id: waiterId, name: 'Ochirilgan ofitsiant', percentage: 0, salary: 0, total_receipts: 0, total_sales: 0, total_commission: 0 }, 
          receipts 
        } 
      };
    } else {
      // Consolidated stats for all waiters
      const rows = db.prepare(`
        SELECT 
          w.id,
          w.name,
          w.percentage,
          w.salary,
          COUNT(s.id) as total_receipts,
          IFNULL(SUM(s.total_amount), 0) as total_sales,
          IFNULL(SUM(s.waiter_commission), 0) as total_commission
        FROM waiters w
        LEFT JOIN sales s ON s.waiter_id = w.id AND ${dateFilter} AND s.status != 'refunded'
        GROUP BY w.id
        ORDER BY total_sales DESC
      `).all(...dateParams);

      // Also get deleted waiters who have sales in this period
      const deletedRows = db.prepare(`
        SELECT 
          s.waiter_id as id,
          s.waiter_name as name,
          s.waiter_percentage as percentage,
          0 as salary,
          COUNT(s.id) as total_receipts,
          IFNULL(SUM(s.total_amount), 0) as total_sales,
          IFNULL(SUM(s.waiter_commission), 0) as total_commission
        FROM sales s
        WHERE s.waiter_id IS NOT NULL AND s.waiter_id NOT IN (SELECT id FROM waiters) AND ${dateFilter} AND s.status != 'refunded'
        GROUP BY s.waiter_id
        ORDER BY total_sales DESC
      `).all(...dateParams);

      const allRows = [...rows, ...deletedRows];

      return { success: true, data: allRows };
    }
  } catch (err) {
    return { success: false, error: err.message };
  }
}

function getAttendanceList(date) {
  try {
    const cashiers = db.prepare("SELECT id, name, role, salary FROM cashiers").all();
    const waiters = db.prepare("SELECT id, name, percentage, salary FROM waiters").all();
    const attendance = db.prepare("SELECT employee_id, employee_type, status FROM attendance WHERE date = ?").all();
    
    const attMap = {};
    for (const att of attendance) {
      attMap[`${att.employee_type}_${att.employee_id}`] = att.status;
    }
    
    const list = [];
    for (const c of cashiers) {
      list.push({
        id: c.id,
        name: c.name,
        type: 'cashier',
        role: c.role,
        salary: c.salary,
        status: attMap[`cashier_${c.id}`] || 'absent'
      });
    }
    for (const w of waiters) {
      list.push({
        id: w.id,
        name: w.name,
        type: 'waiter',
        role: 'waiter',
        salary: w.salary,
        status: attMap[`waiter_${w.id}`] || 'absent'
      });
    }
    return { success: true, data: list };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

function saveAttendance(employeeId, employeeType, date, status, photo = null, time = null, action = null) {
  try {
    const isDeparture = action === 'ketdi' || status === 'ketdi';
    const checkInTime = !isDeparture ? time : null;
    const checkInPhoto = !isDeparture ? photo : null;
    const checkOutTime = isDeparture ? time : null;
    const checkOutPhoto = isDeparture ? photo : null;
    const lastAction = isDeparture ? 'ketdi' : 'keldi';
    const finalDbStatus = (status === 'absent') ? 'absent' : 'present';

    db.prepare(`
      INSERT INTO attendance (
        employee_id, employee_type, date, status, photo, time,
        check_in_time, check_out_time, check_in_photo, check_out_photo, last_action
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(employee_id, employee_type, date) DO UPDATE SET 
        status = excluded.status,
        photo = COALESCE(excluded.photo, attendance.photo),
        time = COALESCE(excluded.time, attendance.time),
        check_in_time = CASE WHEN excluded.check_in_time IS NOT NULL THEN excluded.check_in_time ELSE attendance.check_in_time END,
        check_out_time = CASE WHEN excluded.check_out_time IS NOT NULL THEN excluded.check_out_time ELSE attendance.check_out_time END,
        check_in_photo = CASE WHEN excluded.check_in_photo IS NOT NULL THEN excluded.check_in_photo ELSE attendance.check_in_photo END,
        check_out_photo = CASE WHEN excluded.check_out_photo IS NOT NULL THEN excluded.check_out_photo ELSE attendance.check_out_photo END,
        last_action = excluded.last_action
    `).run(
      employeeId, employeeType, date, finalDbStatus, photo, time,
      checkInTime, checkOutTime, checkInPhoto, checkOutPhoto, lastAction
    );
    return { success: true };
  } catch (err) {
    try {
      db.prepare(`
        INSERT INTO attendance (employee_id, employee_type, date, status, photo, time)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(employee_id, employee_type, date) DO UPDATE SET 
          status = excluded.status,
          photo = COALESCE(excluded.photo, attendance.photo),
          time = COALESCE(excluded.time, attendance.time)
      `).run(employeeId, employeeType, date, (status === 'absent' ? 'absent' : 'present'), photo, time);
      return { success: true };
    } catch (inner) {
      try {
        db.prepare(`
          INSERT INTO attendance (employee_id, employee_type, date, status)
          VALUES (?, ?, ?, ?)
          ON CONFLICT(employee_id, employee_type, date) DO UPDATE SET status = excluded.status
        `).run(employeeId, employeeType, date, (status === 'absent' ? 'absent' : 'present'));
        return { success: true };
      } catch (lastErr) {
        return { success: false, error: lastErr.message };
      }
    }
  }
}

function getAttendanceReport(startDate, endDate) {
  try {
    const todayStr = new Date().toISOString().slice(0, 10);
    const sDate = startDate || todayStr;
    const eDate = endDate || sDate;

    // 1. Get staff
    const cashiers = db.prepare("SELECT id, name, role, salary FROM cashiers").all();
    const waiters = db.prepare("SELECT id, name, percentage, salary FROM waiters").all();

    // 2. Work hours settings
    const settings = getAttendanceSettings();
    const workStartTime = settings.work_start_time || '09:00';
    const workEndTime = settings.work_end_time || '18:00';
    const lateGraceMinutes = parseInt(settings.late_grace_minutes || '5', 10);

    // 3. Query attendance records in date range
    const records = db.prepare(`
      SELECT 
        a.id,
        a.employee_id,
        a.employee_type,
        a.date,
        a.status,
        a.time,
        a.check_in_time,
        a.check_out_time,
        a.check_in_photo,
        a.check_out_photo,
        a.last_action,
        a.photo
      FROM attendance a
      WHERE a.date >= ? AND a.date <= ?
      ORDER BY a.date DESC, a.check_in_time ASC, a.time ASC
    `).all(sDate, eDate);

    // Map existing records by employee_type_employee_id_date
    const recordMap = new Map();
    for (const r of records) {
      recordMap.set(`${r.employee_type}_${r.employee_id}_${r.date}`, r);
    }

    const allStaff = [
      ...cashiers.map(c => ({ id: c.id, name: c.name, role: c.role || 'Kassir', salary: c.salary, type: 'cashier' })),
      ...waiters.map(w => ({ id: w.id, name: w.name, role: 'Ofitsiant', salary: w.salary, type: 'waiter' }))
    ];

    // Helper to calculate late / worked info
    const processRow = (r, emp) => {
      const checkIn = r.check_in_time || (r.last_action !== 'ketdi' ? r.time : null);
      const checkOut = r.check_out_time || (r.last_action === 'ketdi' ? r.time : null);

      let isLate = false;
      let lateMinutes = 0;
      if (checkIn && workStartTime) {
        const [cHour, cMin] = checkIn.split(':').map(Number);
        const [sHour, sMin] = workStartTime.split(':').map(Number);
        if (!isNaN(cHour) && !isNaN(sHour)) {
          const checkInTotalMin = cHour * 60 + (cMin || 0);
          const startTotalMin = sHour * 60 + (sMin || 0);
          if (checkInTotalMin > startTotalMin + lateGraceMinutes) {
            isLate = true;
            lateMinutes = checkInTotalMin - startTotalMin;
          }
        }
      }

      let isEarlyDeparture = false;
      let earlyMinutes = 0;
      if (checkOut && workEndTime) {
        const [oHour, oMin] = checkOut.split(':').map(Number);
        const [eHour, eMin] = workEndTime.split(':').map(Number);
        if (!isNaN(oHour) && !isNaN(eHour)) {
          const checkOutTotalMin = oHour * 60 + (oMin || 0);
          const endTotalMin = eHour * 60 + (eMin || 0);
          if (checkOutTotalMin < endTotalMin) {
            isEarlyDeparture = true;
            earlyMinutes = endTotalMin - checkOutTotalMin;
          }
        }
      }

      let workedMinutes = 0;
      let workedDurationText = '';
      if (checkIn && checkOut) {
        const [inH, inM] = checkIn.split(':').map(Number);
        const [outH, outM] = checkOut.split(':').map(Number);
        if (!isNaN(inH) && !isNaN(outH)) {
          let diff = (outH * 60 + (outM || 0)) - (inH * 60 + (inM || 0));
          if (diff < 0) diff += 24 * 60;
          workedMinutes = diff;
          const hrs = Math.floor(diff / 60);
          const mins = diff % 60;
          workedDurationText = `${hrs} soat ${mins > 0 ? mins + ' daq' : ''}`.trim();
        }
      }

      let displayStatus = 'absent';
      if (checkIn) {
        if (checkOut) {
          displayStatus = isLate ? 'late_completed' : 'completed';
        } else if (isLate) {
          displayStatus = 'late';
        } else {
          displayStatus = 'working';
        }
      }

      return {
        id: r.id,
        employee_id: emp.id,
        employee_type: emp.type,
        employee_name: emp.name,
        role: emp.role,
        date: r.date,
        check_in_time: checkIn,
        check_out_time: checkOut,
        check_in_photo: r.check_in_photo || (r.last_action !== 'ketdi' ? r.photo : null),
        check_out_photo: r.check_out_photo || (r.last_action === 'ketdi' ? r.photo : null),
        last_action: r.last_action || (checkOut ? 'ketdi' : (checkIn ? 'keldi' : null)),
        is_late: isLate,
        late_minutes: lateMinutes,
        is_early_departure: isEarlyDeparture,
        early_minutes: earlyMinutes,
        worked_minutes: workedMinutes,
        worked_duration_text: workedDurationText,
        display_status: displayStatus
      };
    };

    const list = [];
    if (sDate === eDate) {
      for (const emp of allStaff) {
        const key = `${emp.type}_${emp.id}_${sDate}`;
        const record = recordMap.get(key);
        if (record) {
          list.push(processRow(record, emp));
        } else {
          list.push({
            id: null,
            employee_id: emp.id,
            employee_type: emp.type,
            employee_name: emp.name,
            role: emp.role,
            date: sDate,
            check_in_time: null,
            check_out_time: null,
            check_in_photo: null,
            check_out_photo: null,
            last_action: null,
            is_late: false,
            late_minutes: 0,
            is_early_departure: false,
            early_minutes: 0,
            worked_minutes: 0,
            worked_duration_text: '',
            display_status: 'absent'
          });
        }
      }
    } else {
      const empMap = new Map();
      for (const emp of allStaff) {
        empMap.set(`${emp.type}_${emp.id}`, emp);
      }
      for (const r of records) {
        const emp = empMap.get(`${r.employee_type}_${r.employee_id}`) || {
          id: r.employee_id,
          name: `Xodim #${r.employee_id}`,
          role: r.employee_type === 'cashier' ? 'Kassir' : 'Ofitsiant',
          type: r.employee_type
        };
        list.push(processRow(r, emp));
      }
    }

    return {
      success: true,
      data: list,
      workStartTime,
      workEndTime,
      lateGraceMinutes,
      allStaff
    };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

function saveManualAttendance(data) {
  try {
    const { employeeId, employeeType, date, checkInTime, checkOutTime } = data;
    if (!employeeId || !employeeType || !date) {
      return { success: false, error: "Xodim va sana kiritilishi shart!" };
    }

    const lastAction = checkOutTime ? 'ketdi' : (checkInTime ? 'keldi' : 'keldi');
    const status = (checkInTime || checkOutTime) ? 'present' : 'absent';
    const mainTime = checkOutTime || checkInTime || null;

    db.prepare(`
      INSERT INTO attendance (
        employee_id, employee_type, date, status, time,
        check_in_time, check_out_time, last_action
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(employee_id, employee_type, date) DO UPDATE SET 
        status = excluded.status,
        time = COALESCE(excluded.time, attendance.time),
        check_in_time = excluded.check_in_time,
        check_out_time = excluded.check_out_time,
        last_action = excluded.last_action
    `).run(
      employeeId, employeeType, date, status, mainTime,
      checkInTime || null, checkOutTime || null, lastAction
    );

    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

function deleteAttendanceRecord(id) {
  try {
    if (!id) return { success: false, error: "ID topilmadi" };
    db.prepare("DELETE FROM attendance WHERE id = ?").run(id);
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

function updateCashier(id, name, pin, role, salary, percentage = 0) {
  try {
    const exists = db.prepare("SELECT id FROM cashiers WHERE pin = ? AND id != ?").get(pin, id);
    if (exists) return { success: false, error: 'pin_exists' };
    const waiterExists = db.prepare("SELECT id FROM waiters WHERE pin_code = ?").get(pin);
    if (waiterExists) return { success: false, error: 'pin_exists' };

    db.prepare("UPDATE cashiers SET name = ?, pin = ?, role = ?, salary = ?, percentage = ? WHERE id = ?").run(name, pin, role, salary, percentage, id);
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

function updateWaiter(id, name, pinCode, percentage, salary) {
  try {
    const exists = db.prepare("SELECT id FROM waiters WHERE pin_code = ? AND id != ?").get(pinCode, id);
    if (exists) return { success: false, error: 'pin_exists' };
    const cashierExists = db.prepare("SELECT id FROM cashiers WHERE pin = ?").get(pinCode);
    if (cashierExists) return { success: false, error: 'pin_exists' };

    db.prepare("UPDATE waiters SET name = ?, pin_code = ?, percentage = ?, salary = ? WHERE id = ?").run(name, pinCode, percentage, salary, id);
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

function getKitchenOrders() {
  try {
    const orders = db.prepare(`
      SELECT 
        ro.id,
        ro.order_number,
        ro.table_id,
        t.name as table_name,
        t.zone as table_zone,
        ro.waiter_id,
        w.name as waiter_name,
        ro.total_amount,
        ro.kitchen_status,
        ro.order_type,
        ro.created_at,
        ro.ready_at
      FROM restaurant_orders ro
      LEFT JOIN restaurant_tables t ON t.id = ro.table_id
      LEFT JOIN waiters w ON w.id = ro.waiter_id
      WHERE ro.status = 'active' AND ro.kitchen_status IN ('preparing', 'ready')
      ORDER BY 
        CASE WHEN ro.kitchen_status = 'preparing' THEN 0 ELSE 1 END,
        ro.id ASC
    `).all();

    const getItems = db.prepare(`
      SELECT 
        item.id,
        item.product_id,
        item.product_name as name,
        item.qty,
        item.price,
        p.unit,
        p.category,
        item.added_at
      FROM restaurant_order_items item
      LEFT JOIN products p ON p.id = item.product_id
      WHERE item.order_id = ?
      ORDER BY item.id ASC
    `);

    const data = orders.map(ord => ({
      ...ord,
      order_number: ord.order_number || ord.id,
      table_name: ord.table_name || (ord.order_type === 'takeaway' ? 'Olib ketish' : `Stol #${ord.table_id}`),
      items: getItems.all(ord.id)
    }));

    return { success: true, data };
  } catch (err) {
    console.error("getKitchenOrders error:", err);
    return { success: false, error: err.message };
  }
}

function setOrderStatus(orderId, status) {
  try {
    const nowStr = new Date().toISOString().replace('T', ' ').substring(0, 19);
    if (status === 'ready') {
      db.prepare("UPDATE restaurant_orders SET kitchen_status = 'ready', ready_at = ? WHERE id = ?").run(nowStr, orderId);
    } else if (status === 'completed') {
      db.prepare("UPDATE restaurant_orders SET kitchen_status = 'completed' WHERE id = ?").run(orderId);
    } else if (status === 'preparing') {
      db.prepare("UPDATE restaurant_orders SET kitchen_status = 'preparing', ready_at = NULL WHERE id = ?").run(orderId);
    } else {
      db.prepare("UPDATE restaurant_orders SET kitchen_status = ? WHERE id = ?").run(status, orderId);
    }
    const updated = db.prepare("SELECT * FROM restaurant_orders WHERE id = ?").get(orderId);
    return { success: true, data: updated };
  } catch (err) {
    console.error("setOrderStatus error:", err);
    return { success: false, error: err.message };
  }
}

function setOrderStatusByTable(tableId, status) {
  try {
    const active = db.prepare("SELECT id FROM restaurant_orders WHERE table_id = ? AND status = 'active'").get(tableId);
    if (!active) {
      return { success: false, error: 'Bu stol uchun faol buyurtma topilmadi' };
    }
    return setOrderStatus(active.id, status);
  } catch (err) {
    return { success: false, error: err.message };
  }
}

function getTvOrders() {
  try {
    const res = getKitchenOrders();
    if (!res.success) return res;
    const preparing = res.data.filter(o => o.kitchen_status === 'preparing');
    const ready = res.data.filter(o => o.kitchen_status === 'ready');
    return { success: true, data: { preparing, ready } };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// ── Inventory Audits (Reviziya) ──────────────────────────────────────────
function getInventoryAuditPrepare() {
  try {
    const bType = getActiveBusinessType();
    let rows;
    if (bType === 'restaurant') {
      rows = db.prepare(`
        SELECT id as item_id, name as item_name, 
               CASE WHEN type = 'raw_material' THEN 'ingredient' ELSE 'product' END as item_type,
               COALESCE(unit, 'dona') as unit,
               COALESCE(category, '') as category,
               COALESCE(stock, 0) as expected_qty,
               COALESCE(stock, 0) as current_stock,
               COALESCE(NULLIF(cost_price, 0), buy_price, 0) as cost_price,
               COALESCE(barcode, '') as barcode
        FROM products 
        WHERE is_unlimited = 0 OR is_unlimited IS NULL
        ORDER BY 
          CASE WHEN type = 'raw_material' THEN 0 ELSE 1 END,
          category ASC, 
          name ASC
      `).all();
    } else {
      rows = db.prepare(`
        SELECT id as item_id, name as item_name, 
               'product' as item_type,
               COALESCE(unit, 'dona') as unit,
               COALESCE(category, '') as category,
               COALESCE(stock, 0) as expected_qty,
               COALESCE(stock, 0) as current_stock,
               COALESCE(NULLIF(cost_price, 0), buy_price, 0) as cost_price,
               COALESCE(barcode, '') as barcode
        FROM products 
        WHERE (business_type = ? OR business_type IS NULL) AND (is_unlimited = 0 OR is_unlimited IS NULL)
        ORDER BY category ASC, name ASC
      `).all(bType);
    }
    return { success: true, items: rows };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

function completeInventoryAudit({ notes = '', items = [], created_by = 'Admin' } = {}) {
  if (!items || !Array.isArray(items) || items.length === 0) {
    return { success: false, error: "Reviziya uchun tovarlar ro'yxati kiritilmadi" };
  }

  try {
    db.exec('BEGIN TRANSACTION');

    let totalShortageSum = 0; // negative sum (e.g. -323000)
    let totalSurplusSum = 0;  // positive sum (e.g. +45000)

    const preparedItems = [];

    for (const it of items) {
      const itemId = it.item_id || it.id;
      const expectedQty = parseFloat(it.expected_qty !== undefined ? it.expected_qty : it.current_stock) || 0;
      const actualQty = parseFloat(it.actual_qty !== undefined ? it.actual_qty : expectedQty) || 0;
      const diffQty = parseFloat((actualQty - expectedQty).toFixed(4));
      const costPrice = parseFloat(it.cost_price) || 0;
      const totalCostDiff = Math.round(diffQty * costPrice);

      if (diffQty < 0) {
        totalShortageSum += totalCostDiff;
      } else if (diffQty > 0) {
        totalSurplusSum += totalCostDiff;
      }

      preparedItems.push({
        item_id: itemId,
        item_type: it.item_type || 'product',
        item_name: it.item_name || it.name || '',
        unit: it.unit || 'dona',
        expected_qty: expectedQty,
        actual_qty: actualQty,
        diff_qty: diffQty,
        cost_price: costPrice,
        total_cost_diff: totalCostDiff
      });
    }

    const netDifferenceSum = totalSurplusSum + totalShortageSum;

    // 1. Insert into audits
    const auditDate = getLocalTimeStr();
    const insertAuditStmt = db.prepare(`
      INSERT INTO audits (audit_date, created_by, total_shortage_sum, total_surplus_sum, net_difference_sum, status, notes)
      VALUES (?, ?, ?, ?, ?, 'completed', ?)
    `);
    const auditRes = insertAuditStmt.run(auditDate, created_by || 'Admin', totalShortageSum, totalSurplusSum, netDifferenceSum, notes || '');
    const auditId = Number(auditRes.lastInsertRowid);

    // 2. Insert into audit_items and update products stock
    const insertItemStmt = db.prepare(`
      INSERT INTO audit_items (audit_id, item_id, item_type, item_name, unit, expected_qty, actual_qty, diff_qty, cost_price, total_cost_diff)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const updateStockStmt = db.prepare(`
      UPDATE products 
      SET stock = ? 
      WHERE id = ?
    `);

    for (const it of preparedItems) {
      insertItemStmt.run(
        auditId,
        it.item_id,
        it.item_type,
        it.item_name,
        it.unit,
        it.expected_qty,
        it.actual_qty,
        it.diff_qty,
        it.cost_price,
        it.total_cost_diff
      );

      // Sync stock in products table to actual_qty
      updateStockStmt.run(it.actual_qty, it.item_id);

      // If difference was non-zero, record in inventory_logs
      if (it.diff_qty !== 0) {
        try {
          db.prepare(`
            INSERT INTO inventory_logs (product_id, product_name, action_type, quantity_changed, balance_after, user_name, note, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          `).run(
            it.item_id,
            it.item_name,
            'reviziya',
            it.diff_qty,
            it.actual_qty,
            created_by || 'Admin',
            `Reviziya #${auditId}: ${it.diff_qty > 0 ? '+' : ''}${it.diff_qty} ${it.unit} (${notes ? notes : "Taqqoslash"})`,
            getLocalTimeStr()
          );
        } catch (_) {}
      }
    }

    db.exec('COMMIT');

    // If restaurant mode, update dependent dishes stocks if ingredients were adjusted
    try {
      for (const it of preparedItems) {
        if (it.item_type === 'ingredient' && it.diff_qty !== 0) {
          updateDependentDishesStocks(it.item_id);
        }
      }
    } catch (_) {}

    return {
      success: true,
      audit_id: auditId,
      total_shortage_sum: totalShortageSum,
      total_surplus_sum: totalSurplusSum,
      net_difference_sum: netDifferenceSum
    };
  } catch (err) {
    try { db.exec('ROLLBACK'); } catch (_) {}
    return { success: false, error: err.message };
  }
}

function getInventoryAudits() {
  try {
    const audits = db.prepare(`
      SELECT a.*, 
             (SELECT COUNT(*) FROM audit_items WHERE audit_id = a.id) as items_count,
             (SELECT COUNT(*) FROM audit_items WHERE audit_id = a.id AND diff_qty < 0) as shortage_count,
             (SELECT COUNT(*) FROM audit_items WHERE audit_id = a.id AND diff_qty > 0) as surplus_count
      FROM audits a
      ORDER BY a.id DESC
    `).all();
    return { success: true, audits };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

function getInventoryAuditDetails(auditId) {
  try {
    const audit = db.prepare('SELECT * FROM audits WHERE id = ?').get(auditId);
    if (!audit) {
      return { success: false, error: 'Reviziya topilmadi' };
    }
    const items = db.prepare('SELECT * FROM audit_items WHERE audit_id = ? ORDER BY id ASC').all(auditId);
    return { success: true, audit, items };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

function getSuppliers() {
  try {
    const suppliers = db.prepare('SELECT * FROM suppliers ORDER BY name ASC').all();
    return { success: true, data: suppliers };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

function addSupplier({ name, phone, company, note }) {
  try {
    if (!name || !name.trim()) return { success: false, error: 'Ismi kiritilishi shart' };
    const res = db.prepare(`
      INSERT INTO suppliers (name, phone, company, note) VALUES (?, ?, ?, ?)
    `).run(name.trim(), phone || '', company || '', note || '');
    return { success: true, id: res.lastInsertRowid };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

function updateSupplier({ id, name, phone, company, note }) {
  try {
    db.prepare(`
      UPDATE suppliers SET name = ?, phone = ?, company = ?, note = ? WHERE id = ?
    `).run(name.trim(), phone || '', company || '', note || '', id);
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

function deleteSupplier(id) {
  try {
    db.prepare('DELETE FROM suppliers WHERE id = ?').run(id);
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

function addSupplierInvoice({ supplierId, items, paymentMethod, paidAmount, note, userName }) {
  try {
    if (!items || !Array.isArray(items) || items.length === 0) {
      return { success: false, error: 'Kirim mahsulotlari kiritilmadi' };
    }

    db.exec('BEGIN TRANSACTION');

    let supplierName = '';
    if (supplierId) {
      const s = db.prepare('SELECT name FROM suppliers WHERE id = ?').get(supplierId);
      if (s) supplierName = s.name;
    }

    let totalAmount = 0;
    for (const item of items) {
      const qty = parseFloat(item.quantity) || 0;
      const buyPrice = parseFloat(item.buy_price) || 0;
      totalAmount += Math.round(qty * buyPrice);
    }

    const paid = parseFloat(paidAmount) || 0;
    const debt = Math.max(0, totalAmount - paid);

    const invoiceCreatedAt = getLocalTimeStr();
    const invRes = db.prepare(`
      INSERT INTO supplier_invoices (supplier_id, supplier_name, total_amount, paid_amount, debt_amount, payment_method, note, user_name, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(supplierId || null, supplierName, totalAmount, paid, debt, paymentMethod || 'cash', note || '', userName || 'Admin', invoiceCreatedAt);

    const invoiceId = invRes.lastInsertRowid;

    for (const item of items) {
      const qty = parseFloat(item.quantity) || 0;
      const buyPrice = parseFloat(item.buy_price) || 0;
      const itemTotal = Math.round(qty * buyPrice);

      db.prepare(`
        INSERT INTO supplier_invoice_items (invoice_id, product_id, product_name, quantity, buy_price, total_price, unit)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(invoiceId, item.product_id, item.product_name, qty, buyPrice, itemTotal, item.unit || 'dona');

      // Update product stock and buy_price
      const prod = db.prepare('SELECT stock FROM products WHERE id = ?').get(item.product_id);
      const currentStock = prod ? prod.stock : 0;
      const newStock = currentStock + qty;

      db.prepare('UPDATE products SET stock = ?, buy_price = ? WHERE id = ?').run(newStock, buyPrice, item.product_id);

      // Insert inventory_log
      db.prepare(`
        INSERT INTO inventory_logs (product_id, product_name, action_type, quantity_changed, balance_after, user_name, note, created_at)
        VALUES (?, ?, 'kirim', ?, ?, ?, ?, ?)
      `).run(item.product_id, item.product_name, qty, newStock, userName || 'Admin', `Kirim (Faktura #${invoiceId}): ${supplierName ? supplierName + ' - ' : ''}${note || ''}`, invoiceCreatedAt);
    }

    // Update supplier balance if debt > 0
    if (supplierId && debt > 0) {
      db.prepare('UPDATE suppliers SET balance = balance + ? WHERE id = ?').run(debt, supplierId);
    }

    db.exec('COMMIT');
    return { success: true, invoiceId };
  } catch (err) {
    try { db.exec('ROLLBACK'); } catch (_) {}
    console.error('addSupplierInvoice error:', err);
    return { success: false, error: err.message };
  }
}

function getSupplierInvoices(supplierId, startDate, endDate) {
  try {
    let query = 'SELECT * FROM supplier_invoices';
    const params = [];
    const conditions = [];

    if (supplierId) {
      conditions.push('supplier_id = ?');
      params.push(supplierId);
    }
    if (startDate && endDate) {
      conditions.push('created_at >= ? AND created_at <= ?');
      params.push(startDate + ' 00:00:00', endDate + ' 23:59:59');
    }

    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }
    query += ' ORDER BY id DESC LIMIT 500';

    const invoices = db.prepare(query).all(...params);
    return { success: true, data: invoices };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

function paySupplierDebt({ supplierId, amount, paymentMethod, note, userName }) {
  try {
    const payVal = parseFloat(amount);
    if (!supplierId || isNaN(payVal) || payVal <= 0) {
      return { success: false, error: 'Noto\'g\'ri to\'lov summasi' };
    }

    db.exec('BEGIN TRANSACTION');

    db.prepare(`
      INSERT INTO supplier_payments (supplier_id, amount, payment_method, note, user_name)
      VALUES (?, ?, ?, ?, ?)
    `).run(supplierId, payVal, paymentMethod || 'cash', note || '', userName || 'Admin');

    // Reduce supplier balance
    db.prepare('UPDATE suppliers SET balance = MAX(0, balance - ?) WHERE id = ?').run(payVal, supplierId);

    db.exec('COMMIT');
    return { success: true };
  } catch (err) {
    try { db.exec('ROLLBACK'); } catch (_) {}
    return { success: false, error: err.message };
  }
}
function getSubWarehouses() {
  try {
    const rows = db.prepare("SELECT * FROM sub_warehouses ORDER BY id ASC").all();
    return { success: true, data: rows };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

function addSubWarehouse(name, note = '') {
  try {
    const trimmed = name ? name.trim() : '';
    if (!trimmed) return { success: false, error: "Ombor nomi kiritilmadi!" };
    const stmt = db.prepare("INSERT INTO sub_warehouses (name, note) VALUES (?, ?)");
    const info = stmt.run(trimmed, note ? note.trim() : '');
    return { success: true, id: info.lastInsertRowid };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

function createStockTransfer({ sourceWarehouse, targetWarehouse, items, note, userName }) {
  try {
    if (!items || items.length === 0) {
      return { success: false, error: "Ko'chirish uchun tovarlar kiritilmadi!" };
    }
    if (!sourceWarehouse || !targetWarehouse) {
      return { success: false, error: "Manba va maqsadi omborlari tanlanmadi!" };
    }
    if (sourceWarehouse === targetWarehouse) {
      return { success: false, error: "Bir xil omborlar o'rtasida ko'chirish mumkin emas!" };
    }

    db.exec("BEGIN TRANSACTION");

    const transferNum = `TR-${Date.now().toString().slice(-6)}`;
    const stmtTransfer = db.prepare(`
      INSERT INTO stock_transfers (transfer_number, source_warehouse, target_warehouse, user_name, note)
      VALUES (?, ?, ?, ?, ?)
    `);
    const info = stmtTransfer.run(transferNum, sourceWarehouse, targetWarehouse, userName || 'Admin', note || '');
    const transferId = info.lastInsertRowid;

    const stmtItem = db.prepare(`
      INSERT INTO stock_transfer_items (transfer_id, product_id, quantity)
      VALUES (?, ?, ?)
    `);

    for (const item of items) {
      const prodId = Number(item.productId);
      const qty = parseFloat(item.quantity) || 0;
      if (qty <= 0) continue;

      stmtItem.run(transferId, prodId, qty);

      const prod = db.prepare("SELECT name, unit FROM products WHERE id = ?").get(prodId);
      const prodName = prod ? prod.name : `Tovar #${prodId}`;
      const unit = prod ? (prod.unit || 'dona') : 'dona';

      logInventory({
        productId: prodId,
        productName: prodName,
        actionType: 'internal_transfer',
        quantityChanged: 0,
        userName: userName || 'Admin',
        note: `Omborlararo ko'chirish: ${sourceWarehouse} ➔ ${targetWarehouse} (${qty} ${unit})`
      });
    }

    db.exec("COMMIT");
    return { success: true, transferId, transferNumber: transferNum };
  } catch (err) {
    try { db.exec("ROLLBACK"); } catch (_) {}
    return { success: false, error: err.message };
  }
}

function getStockTransfers(params = {}) {
  try {
    const limit = params.limit || 50;
    const transfers = db.prepare(`
      SELECT * FROM stock_transfers ORDER BY created_at DESC LIMIT ?
    `).all(limit);

    for (const t of transfers) {
      const items = db.prepare(`
        SELECT ti.quantity, p.name as product_name, p.unit
        FROM stock_transfer_items ti
        JOIN products p ON ti.product_id = p.id
        WHERE ti.transfer_id = ?
      `).all(t.id);
      t.items = items;
    }

    return { success: true, data: transfers };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

function getDirectorDashboardStats(period = 'today') {
  try {
    let startDateStr = '';
    let endDateStr = getLocalTimeStr();
    
    const now = new Date();
    if (period === 'today') {
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const day = String(now.getDate()).padStart(2, '0');
      startDateStr = `${year}-${month}-${day} 00:00:00`;
    } else if (period === 'yesterday') {
      const y = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const year = y.getFullYear();
      const month = String(y.getMonth() + 1).padStart(2, '0');
      const day = String(y.getDate()).padStart(2, '0');
      startDateStr = `${year}-${month}-${day} 00:00:00`;
      endDateStr = `${year}-${month}-${day} 23:59:59`;
    } else if (period === 'week') {
      const w = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      startDateStr = w.toISOString().slice(0, 10) + ' 00:00:00';
    } else if (period === 'month') {
      const m = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      startDateStr = m.toISOString().slice(0, 10) + ' 00:00:00';
    }

    const salesSummary = db.prepare(`
      SELECT 
        COUNT(*) as total_receipts,
        COALESCE(SUM(total_amount), 0) as total_sales,
        COALESCE(SUM(CASE WHEN payment_method = 'cash' THEN total_amount ELSE 0 END), 0) as cash_sales,
        COALESCE(SUM(CASE WHEN payment_method = 'card' THEN total_amount ELSE 0 END), 0) as card_sales,
        COALESCE(SUM(CASE WHEN payment_method = 'debt' THEN total_amount ELSE 0 END), 0) as debt_sales,
        COALESCE(SUM(service_fee_amount), 0) as total_service_fee
      FROM sales
      WHERE status != 'refunded' AND created_at >= ? AND created_at <= ?
    `).get(startDateStr, endDateStr);

    const tablesSummary = db.prepare(`
      SELECT 
        COUNT(*) as total_tables,
        COALESCE(SUM(CASE WHEN active_order IS NOT NULL AND active_order != '[]' AND active_order != '' THEN 1 ELSE 0 END), 0) as occupied_tables
      FROM restaurant_tables
    `).get();

    const openTablesRows = db.prepare(`
      SELECT active_order FROM restaurant_tables WHERE active_order IS NOT NULL AND active_order != '[]' AND active_order != ''
    `).all();

    let activeTablesTotalSum = 0;
    for (const r of openTablesRows) {
      try {
        const items = JSON.parse(r.active_order || '[]');
        if (Array.isArray(items)) {
          for (const item of items) {
            activeTablesTotalSum += (parseFloat(item.price || item.sell_price) || 0) * (parseFloat(item.qty) || 0);
          }
        }
      } catch (_) {}
    }

    const waitersPerformance = db.prepare(`
      SELECT 
        w.id, w.name, w.percentage,
        COUNT(s.id) as receipts_count,
        COALESCE(SUM(s.total_amount), 0) as total_sales,
        COALESCE(SUM(s.waiter_commission), 0) as total_commission
      FROM waiters w
      LEFT JOIN sales s ON s.waiter_id = w.id AND s.status != 'refunded' AND s.created_at >= ? AND s.created_at <= ?
      GROUP BY w.id
      ORDER BY total_sales DESC
    `).all(startDateStr, endDateStr);

    const topDishes = db.prepare(`
      SELECT 
        si.product_name,
        SUM(si.qty) as total_qty,
        SUM(si.qty * si.price) as total_sum
      FROM sale_items si
      JOIN sales s ON si.sale_id = s.id
      WHERE s.status != 'refunded' AND s.created_at >= ? AND s.created_at <= ?
      GROUP BY si.product_id
      ORDER BY total_sum DESC
      LIMIT 5
    `).all(startDateStr, endDateStr);

    const stopListCount = db.prepare(`
      SELECT COUNT(*) as count FROM products WHERE business_type = 'restaurant' AND (is_stopped = 1 OR (stop_reason IS NOT NULL AND stop_reason != ''))
    `).get()?.count || 0;

    const lowStockIngredients = db.prepare(`
      SELECT id, name, stock, unit FROM products WHERE type = 'raw_material' AND stock <= 5 ORDER BY stock ASC LIMIT 10
    `).all();

    return {
      success: true,
      period,
      sales: salesSummary,
      tables: {
        total: tablesSummary.total_tables,
        occupied: tablesSummary.occupied_tables,
        free: Math.max(0, tablesSummary.total_tables - tablesSummary.occupied_tables),
        activeTablesSum: activeTablesTotalSum
      },
      waiters: waitersPerformance,
      topDishes,
      stopListCount,
      lowStockIngredients
    };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

module.exports = { 
  initDB, closeDB, getProducts, getCustomers, getCustomer, addProduct, updateProduct, addStockToProduct, deleteProduct, searchProduct,
  processSale, getRecentSales, processFullReturn, processReturn, payDebt, addManualDebt, getReports, getSaleForReprint,
  getLowStockProducts, clearTestData, resetFactoryData, getCustomerDebtDetails, getAllSalesHistory, getSalesForExcel,
  verifyPin, getSettings, updateSetting, syncUsdRate, checkBaseLoaded, loadInitialBase,
  getCashiers, addCashier, deleteCashier, updateCashier, updateCashierPin,
  getAttendanceList, saveAttendance, updateWaiter,
  getCurrentShiftStats, closeShift,
  optimizeDatabase, getDBPath,
  writeOffProduct, getWriteOffs,
  getInventoryLogs,
  addExpense, deleteExpense,
  deleteCustomer, maybeOpenShift,
  getActivation, saveActivation, clearActivation,
  getTodayStats, getProductsPaginated, getCustomersWithDebts,
  findLocalBarcodeByName, generateUniqueLocalBarcode, batchAddProducts,
  getAiInsights, getProduct, getNextBarcode, waiterLogin,
  getRestaurantTables, getActiveOrderForTable,
  saveRestaurantOrder, closeRestaurantOrder, closeRestaurantOrderOnly,
  getWaiters, addWaiter, deleteWaiter,
  transferRestaurantTable, transferRestaurantOrderWaiter,
  cancelRestaurantOrder, addDeliveryOrder,
  addRestaurantTable, deleteRestaurantTable,
  saveProductRecipe, getProductRecipe,
  getProductGroups, getOrCreateProductGroup,
  projectYield,
  lockTable, unlockTable, setTablePrePrinted,
  getWaitersReport, getRestaurantOnlyProducts,
  clearWarehouse, getRestaurantZones, addRestaurantZone, deleteRestaurantZone,
  toggleProductStop, setProductStopWithLimit,
  getKitchenOrders, setOrderStatus, setOrderStatusByTable, getTvOrders,
  deleteProductImageFile,
  getInventoryAuditPrepare, completeInventoryAudit, getInventoryAudits, getInventoryAuditDetails,
  getAttendanceSettings, getAttendanceReport, saveManualAttendance, deleteAttendanceRecord,
  getSuppliers, addSupplier, updateSupplier, deleteSupplier,
  addSupplierInvoice, getSupplierInvoices, paySupplierDebt,
  produceSemiFinished, getSubWarehouses, addSubWarehouse,
  createStockTransfer, getStockTransfers,
  getDirectorDashboardStats
};
