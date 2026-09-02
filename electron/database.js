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

function initDB() {
  const dir = app.getPath('userData');
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const dbPath = path.join(dir, 'pos.db');
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
  if (!db.prepare("SELECT value FROM settings WHERE key = 'telegram_bot_token'").get()) {
    db.prepare("INSERT INTO settings (key, value) VALUES ('telegram_bot_token', '8621843458:AAGBnjR3LwNDWfnKnnKmB9EQpqlm57tnr84')").run();
  }
  if (!db.prepare("SELECT value FROM settings WHERE key = 'telegram_chat_id'").get()) {
    db.prepare("INSERT INTO settings (key, value) VALUES ('telegram_chat_id', '')").run();
  }
  if (!db.prepare("SELECT value FROM settings WHERE key = 'terminal_mode'").get()) {
    db.prepare("INSERT INTO settings (key, value) VALUES ('terminal_mode', 'false')").run();
  }
  if (!db.prepare("SELECT value FROM settings WHERE key = 'allow_mobile_qr'").get()) {
    db.prepare("INSERT INTO settings (key, value) VALUES ('allow_mobile_qr', 'false')").run();
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
  try { db.exec("ALTER TABLE sales ADD COLUMN comment TEXT DEFAULT ''"); } catch (_) {}
  try { db.exec("INSERT OR IGNORE INTO settings (key, value) VALUES ('terminal_mode', '0')"); } catch (_) {}
  try { db.exec("ALTER TABLE waiters ADD COLUMN salary REAL NOT NULL DEFAULT 0"); } catch (_) {}

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
  try { db.exec("ALTER TABLE restaurant_tables ADD COLUMN locked_by TEXT"); } catch (_) {}
  try { db.exec("ALTER TABLE restaurant_tables ADD COLUMN is_printed INTEGER DEFAULT 0"); } catch (_) {}
  try { db.exec("ALTER TABLE restaurant_tables ADD COLUMN opened_at TEXT"); } catch (_) {}
  try { db.exec("UPDATE restaurant_tables SET locked_by = NULL"); } catch (_) {}
  try { db.exec("ALTER TABLE products ADD COLUMN type TEXT DEFAULT 'ready_dish'"); } catch (_) {}
  try { db.exec("ALTER TABLE products ADD COLUMN group_id INTEGER"); } catch (_) {}
  try { db.exec("ALTER TABLE restaurant_order_items ADD COLUMN added_at DATETIME DEFAULT CURRENT_TIMESTAMP"); } catch (_) {}

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

  // Seed restaurant products if none exist
  const restaurantProdCount = db.prepare("SELECT COUNT(*) as count FROM products WHERE business_type = 'restaurant'").get().count;
  if (restaurantProdCount === 0) {
    const sampleProducts = [
      { name: 'Palov (Osh)', barcode: '990001', buy_price: 20000, sell_price: 30000, stock: 50, unit: 'dona', printer_destination: 'kitchen', category: 'Ovqatlar' },
      { name: 'Tovuq Shashlik', barcode: '990002', buy_price: 10000, sell_price: 15000, stock: 100, unit: 'dona', printer_destination: 'kitchen', category: 'Ovqatlar' },
      { name: 'Coca-Cola 1.5L', barcode: '990003', buy_price: 8000, sell_price: 12000, stock: 80, unit: 'dona', printer_destination: 'bar', category: 'Ichimliklar' },
      { name: 'Achchiq-chuchuq salati', barcode: '990004', buy_price: 5000, sell_price: 8000, stock: 40, unit: 'dona', printer_destination: 'cold', category: 'Salatlar' },
      { name: 'Ko\'k choy', barcode: '990005', buy_price: 2000, sell_price: 5000, stock: 150, unit: 'dona', printer_destination: 'bar', category: 'Ichimliklar' }
    ];
    for (const p of sampleProducts) {
      try {
        db.prepare(`
          INSERT INTO products (name, barcode, buy_price, sell_price, stock, unit, printer_destination, business_type, category)
          VALUES (?, ?, ?, ?, ?, ?, ?, 'restaurant', ?)
        `).run(p.name, p.barcode, p.buy_price, p.sell_price, p.stock, p.unit, p.printer_destination, p.category);
      } catch (_) {}
    }
  }

  // ── Auto Cleanup Old Sales ──
  try {
    // Delete items of old sales
    db.exec(`
      DELETE FROM sale_items WHERE sale_id IN (
        SELECT id FROM sales 
        WHERE created_at < datetime('now', '-30 days')
      );
    `);
    // Delete the old sales themselves
    db.exec(`
      DELETE FROM sales 
      WHERE created_at < datetime('now', '-30 days');
    `);

    // Delete inventory logs older than 30 days (1 month)
    db.exec(`
      DELETE FROM inventory_logs 
      WHERE created_at < datetime('now', '-30 days');
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
    const waiter = db.prepare("SELECT id, name, role FROM waiters WHERE pin_code = ?").get(pin);
    if (waiter) {
      return {
        success: true,
        valid: true,
        cashier: {
          id: waiter.id,
          name: waiter.name,
          role: 'waiter',
          salary: 0
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
    const rows = db.prepare("SELECT id, name, pin, role, salary FROM cashiers ORDER BY id ASC").all();
    return { success: true, data: rows };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

function addCashier(name, pin, role = 'cashier', salary = 0) {
  try {
    // Check if pin exists
    const exists = db.prepare("SELECT id FROM cashiers WHERE pin = ?").get(pin);
    if (exists) return { success: false, error: 'pin_exists' };
    
    db.prepare("INSERT INTO cashiers (name, pin, role, salary) VALUES (?, ?, ?, ?)").run(name, pin, role, salary);
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

function getProducts() {
  const bType = getActiveBusinessType();
  if (bType === 'restaurant') {
    return db.prepare('SELECT * FROM products ORDER BY id DESC').all();
  }
  return db.prepare('SELECT * FROM products WHERE business_type = ? ORDER BY id DESC').all(bType);
}

// Always returns only restaurant menu items (used by waiter mobile app)
function getRestaurantOnlyProducts() {
  return db.prepare("SELECT * FROM products WHERE business_type = 'restaurant' ORDER BY category ASC, name ASC").all();
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

    const stmt = db.prepare(`
      INSERT INTO products (name, barcode, buy_price, sell_price, stock, unit, discount, printer_destination, business_type, category, type, group_id, buy_price_usd, usd_rate)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const dest = product.printer_destination || 'none';
    const bType = product.business_type || getActiveBusinessType();
    const cat = product.category || 'Boshqa';
    const buyPriceUsd = parseFloat(product.buy_price_usd) || 0;
    const usdRate = parseFloat(product.usd_rate) || 0;

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
      usdRate
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
        throw new Error(res.error || `Mahsulotni qo'shib bo'lmadi: ${p.name}`);
      }
      results.push(res);
    }
    db.exec('COMMIT');
    return { success: true, results };
  } catch (err) {
    db.exec('ROLLBACK');
    return { success: false, error: err.message };
  }
}

function updateProduct(id, product) {
  try {
    const existing = db.prepare('SELECT stock, discount, buy_price, cost_price FROM products WHERE id = ?').get(id);
    const oldQty = existing ? existing.stock : 0;
    const addedQty = parseFloat(product.stock) || 0;
    const newQty = oldQty + addedQty;

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

    const stmt = db.prepare(`
      UPDATE products 
      SET name = ?, barcode = ?, buy_price = ?, cost_price = ?, sell_price = ?, stock = ?, unit = ?, discount = ?, printer_destination = ?, business_type = ?, category = ?, type = ?, group_id = ?, buy_price_usd = ?, usd_rate = ?
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
    const product = db.prepare('SELECT name, stock FROM products WHERE id = ?').get(id);
    if (product) {
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
    if (byBarcode.length > 0) return byBarcode;

    // Fallback: name LIKE search
    return db.prepare(
      "SELECT * FROM products WHERE my_lower(name) LIKE my_lower(?) ORDER BY name LIMIT 20"
    ).all(`%${term}%`);
  } catch (err) {
    return [];
  }
}

function processSale(cartItems, paymentMethod, customerInfo, cashierName = 'Kassir', discountPercent = 0, device = 'desktop', waiterId = null, comment = '') {
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
    let waiterName = null;
    let waiterPercentage = 0;
    let waiterCommission = 0;
    if (waiterId) {
      const w = db.prepare("SELECT name, percentage FROM waiters WHERE id = ?").get(waiterId);
      if (w) {
        waiterName = w.name;
        waiterPercentage = w.percentage || 0;
        waiterCommission = Math.round((finalTotal * waiterPercentage) / 100);
      }
    }

    const saleInfo = db.prepare(`
      INSERT INTO sales (
        total_amount, payment_method, customer_id, cashier_name, 
        shift_receipt_number, original_total, discount_percent, discount_amount, 
        device, waiter_id, waiter_name, waiter_percentage, waiter_commission, comment, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      finalTotal, paymentMethod, customerId, cashierName, 
      shiftReceiptNumber, originalTotal, pct, discountAmount, 
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
      // Check recipe ingredients stock level!
      const ingredients = db.prepare(`
        SELECT i.ingredient_product_id, i.quantity, p.name, p.stock, p.unit
        FROM product_ingredients i
        JOIN products p ON i.ingredient_product_id = p.id
        WHERE i.parent_product_id = ?
      `).all(item.id);

      for (const ing of ingredients) {
        const requiredQty = ing.quantity * item.qty;
        if (ing.stock < requiredQty) {
          throw new Error(`stock_error:Tarkibdagi ${ing.name}:${requiredQty}:${ing.stock}`);
        }
      }

      // Concurrency protection for product itself
      const row = db.prepare('SELECT name, stock FROM products WHERE id = ?').get(item.id);
      const currentStock = row ? row.stock : 0;
      if (ingredients.length === 0 && currentStock < item.qty) {
        throw new Error(`stock_error:${row ? row.name : item.name}:${item.qty}:${currentStock}`);
      }

      const itemPct = parseFloat(item.discount) || 0;
      const itemTotal = item.sell_price * item.qty;
      const itemDiscAmount = Math.round(itemTotal * (itemPct / 100));
      const priceAfterDiscount = item.sell_price * (1 - itemPct / 100);

      insertItem.run(saleId, item.id, item.qty, priceAfterDiscount, itemPct, itemDiscAmount, item.name, item.unit || 'dona');
      
      // If product has ingredients, deduct ingredient stock and log it
      if (ingredients.length > 0) {
        for (const ing of ingredients) {
          const requiredQty = ing.quantity * item.qty;
          db.prepare('UPDATE products SET stock = stock - ? WHERE id = ?').run(requiredQty, ing.ingredient_product_id);
          
          logInventory({
            productId: ing.ingredient_product_id,
            productName: ing.name,
            actionType: 'chiqim',
            quantityChanged: -requiredQty,
            userName: cashierName || 'Kassir',
            note: `Taom tarkibi bo'yicha sarflandi: ${item.name} × ${item.qty}`
          });
        }
      } else {
        deductStock.run(item.qty, item.id);
      }

      // Custom note for item-level discount
      let itemNote = saleNote;
      if (itemPct > 0) {
        const formattedPrice = Math.round(priceAfterDiscount).toLocaleString('ru-RU').replace(/,/g, ' ');
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
      const name = parts[1];
      const reqQty = parts[2];
      const availStock = parts[3];
      return {
        success: false,
        error: 'insufficient_stock',
        message: `"${name}" omborda yetarli emas! Kiritilgan: ${reqQty}, mavjud: ${availStock}`
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
    `).all(startDateISO, endDateISO, bType, bType, bType);

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
    `).all(startDateISO, endDateISO, bType, bType, bType);

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
    `).get(startDateISO, endDateISO, bType, bType, bType);
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
    `).get(startDateISO, endDateISO, bType, bType, bType);
    
    const totalProfit = (profitRow?.total_profit || 0) - totalDiscounts;

    // 3. Top 5 Selling Products
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
    `).all(startDateISO, endDateISO, bType, bType, bType);

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

    // Calculate current warehouse valuation (only positive stock items count as assets)
    const valuation = db.prepare(`
      SELECT SUM(COALESCE(NULLIF(cost_price, 0), buy_price, 0) * stock) as total_buy,
             SUM(IFNULL(sell_price, 0) * stock) as total_sell
      FROM products
      WHERE business_type = ? AND stock > 0
    `).get(bType);

    const warehouseBuyValue = valuation?.total_buy || 0;
    const warehouseSellValue = valuation?.total_sell || 0;

    // 5. Aging products (unsold for 10+ days to allow frontend dynamic 10/20/30 day filters)
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
    `).all(startDateISO, endDateISO);

    const cashiersList = db.prepare(`
      SELECT id, name, role, salary FROM cashiers
    `).all();

    const waitersList = db.prepare(`
      SELECT id, name, percentage, salary FROM waiters
    `).all();

    const startDay = getLocalDateString(startDateISO);
    const endDay = getLocalDateString(endDateISO);

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
    `).all(startDateISO, endDateISO);
    
    const waiterCommMap = {};
    for (const row of waiterComms) {
      waiterCommMap[row.waiter_id] = row.comm;
    }

    let totalSalaries = 0;
    for (const c of cashiersList) {
      const presentDays = cashierAttMap[c.id] || 0;
      c.present_days = presentDays;
      c.earned_salary = (c.salary / 30) * presentDays;
      c.total_earned = c.earned_salary;
      totalSalaries += c.earned_salary;
    }
    for (const w of waitersList) {
      const presentDays = waiterAttMap[w.id] || 0;
      w.present_days = presentDays;
      w.earned_salary = (w.salary / 30) * presentDays;
      w.commissions = waiterCommMap[w.id] || 0;
      w.total_earned = w.earned_salary + w.commissions;
      totalSalaries += w.earned_salary;
    }

    const commissionsRow = db.prepare(`
      SELECT SUM(waiter_commission) as total_commissions
      FROM sales
      WHERE created_at >= ? AND created_at <= ? AND status != 'refunded'
    `).get(startDateISO, endDateISO);
    const totalCommissions = commissionsRow?.total_commissions || 0;

    const netProfit = totalProfit - totalExpenses - totalSalaries - totalCommissions;

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
        warehouseSellValue,
        totalDebtPayments,
        agingProducts,
        waiterStats,
        cashiersList,
        waitersList,
        totalSalaries,
        totalCommissions,
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
        SUM(CASE WHEN payment_method IN ('cash', 'qarz_tulov') AND status != 'refunded' THEN total_amount ELSE 0 END) as cash_sales,
        SUM(CASE WHEN payment_method = 'card' AND status != 'refunded' THEN total_amount ELSE 0 END) as card_sales,
        SUM(CASE WHEN payment_method = 'debt' AND status != 'refunded' THEN total_amount ELSE 0 END) as debt_sales,
        COUNT(CASE WHEN status != 'refunded' AND payment_method != 'expense' AND payment_method != 'qarz_tulov' THEN id END) as receipts_count
      FROM sales
      WHERE is_closed = 0
    `;
    const row = db.prepare(query).get();
    
    const expRow = db.prepare("SELECT SUM(amount) as total_expenses FROM expenses WHERE is_closed = 0 AND COALESCE(source, 'cash') = 'cash'").get();
    
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

    // 4. Expected Cash
    const cash_sales = row.cash_sales || 0;
    const total_expenses = expRow.total_expenses || 0;
    const expected_cash = cash_sales - total_expenses;

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
        opened_at = new Date().toISOString().replace('T', ' ').substring(0, 19);
      }
    }

    return {
      success: true,
      data: {
        shift_number,
        total_sales: row.total_sales || 0,
        cash_sales,
        card_sales: row.card_sales || 0,
        debt_sales: row.debt_sales || 0,
        total_expenses,
        receipts_count: row.receipts_count || 0,
        total_discounts,
        refunds_count,
        total_refunds,
        expected_cash,
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

    const note = `Jami: ${formatNumber(stats.total_sales)} so'm (Naqd: ${formatNumber(stats.cash_sales)}, Plastik: ${formatNumber(stats.card_sales)}, Qarz: ${formatNumber(stats.debt_sales)})`;

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
    const bType = getActiveBusinessType();
    const offset = (page - 1) * pageSize;
    const conditions = [];
    const params     = [];

    // Filter by active business type (allow product_id = 0 or general logs)
    conditions.push("(il.product_id = 0 OR p.business_type = ?)");
    params.push(bType);

    if (startDate) {
      const localStart = new Date(`${startDate}T00:00:00`);
      if (!isNaN(localStart.getTime())) {
        const utcStr = localStart.toISOString().replace('T', ' ').substring(0, 19);
        conditions.push("il.created_at >= ?");
        params.push(utcStr);
      }
    }
    if (endDate) {
      const localEnd = new Date(`${endDate}T23:59:59`);
      if (!isNaN(localEnd.getTime())) {
        const utcStr = localEnd.toISOString().replace('T', ' ').substring(0, 19);
        conditions.push("il.created_at <= ?");
        params.push(utcStr);
      }
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

function addExpense(reason, amount, cashier_name) {
  try {
    const created_at = getLocalTimeStr();
    db.prepare("INSERT INTO expenses (reason, amount, cashier_name, created_at, source) VALUES (?, ?, ?, ?, 'cash')").run(reason, amount, cashier_name || 'Kassir', created_at);
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

    if (searchQuery && searchQuery.trim() !== '') {
      const queryStr = `%${searchQuery.trim().toLowerCase()}%`;
      if (bType === 'restaurant') {
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
          WHERE business_type = ? AND (my_lower(name) LIKE ? OR my_lower(barcode) LIKE ?) 
          ORDER BY id DESC LIMIT ? OFFSET ?
        `).all(bType, queryStr, queryStr, limit, offset);

        totalCount = db.prepare(`
          SELECT COUNT(*) as count FROM products 
          WHERE business_type = ? AND (my_lower(name) LIKE ? OR my_lower(barcode) LIKE ?)
        `).get(bType, queryStr, queryStr).count;
      }
    } else {
      if (bType === 'restaurant') {
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
          WHERE business_type = ?
          ORDER BY id DESC LIMIT ? OFFSET ?
        `).all(bType, limit, offset);

        totalCount = db.prepare(`
          SELECT COUNT(*) as count FROM products WHERE business_type = ?
        `).get(bType).count;
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
        ) as waiter_name
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
    const order = db.prepare("SELECT id, waiter_id, total_amount, status, created_at FROM restaurant_orders WHERE table_id = ? AND status = 'active'").get(tableId);
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

    // Calculate total amount
    let totalAmount = 0;
    for (const item of cartItems) {
      totalAmount += (item.qty * item.price);
    }
    
    // Check if there is an active order
    let order = db.prepare("SELECT id FROM restaurant_orders WHERE table_id = ? AND status = 'active'").get(tableId);
    let orderId;
    if (order) {
      orderId = order.id;
      // Update order
      db.prepare("UPDATE restaurant_orders SET total_amount = ?, waiter_id = ? WHERE id = ?").run(totalAmount, waiterId, orderId);
      // Delete old items
      db.prepare("DELETE FROM restaurant_order_items WHERE order_id = ?").run(orderId);
    } else {
      // Insert new order
      const info = db.prepare("INSERT INTO restaurant_orders (table_id, waiter_id, total_amount, status) VALUES (?, ?, ?, 'active')").run(tableId, waiterId, totalAmount);
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
    
    return { success: true, orderId };
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

function closeRestaurantOrder(tableId, cashierName, paymentMethod, customerInfo, discountPercent, comment = '') {
  try {
    // Find active order
    const orderRes = getActiveOrderForTable(tableId);
    if (!orderRes.success || !orderRes.data) {
      return { success: false, error: 'No active order for this table' };
    }
    const { order, items } = orderRes.data;
    
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
    const saleResult = processSale(cartItems, paymentMethod, customerInfo, cashierName, discountPercent, 'mobile', order.waiter_id, comment);
    
    if (saleResult && saleResult.success) {
      // 2. If checkout succeeded, run a transaction to close restaurant order and free table
      db.prepare("BEGIN TRANSACTION").run();
      try {
        // Mark order as completed
        db.prepare("UPDATE restaurant_orders SET status = 'completed' WHERE id = ?").run(order.id);
        
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

    const targetTable = db.prepare("SELECT status FROM restaurant_tables WHERE id = ?").get(toTableId);
    if (targetTable && targetTable.status === 'occupied') {
      db.prepare("ROLLBACK").run();
      return { success: false, error: 'Nishon stol band' };
    }

    const fromTable = db.prepare("SELECT opened_at FROM restaurant_tables WHERE id = ?").get(fromTableId);
    const openedAt = fromTable ? fromTable.opened_at : null;

    db.prepare("UPDATE restaurant_orders SET table_id = ? WHERE id = ?").run(toTableId, order.id);
    db.prepare("UPDATE restaurant_tables SET status = 'free', opened_at = NULL WHERE id = ?").run(fromTableId);
    db.prepare("UPDATE restaurant_tables SET status = 'occupied', opened_at = ? WHERE id = ?").run(openedAt, toTableId);

    db.prepare("COMMIT").run();
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
      const stmt = db.prepare("INSERT INTO product_ingredients (parent_product_id, ingredient_product_id, quantity) VALUES (?, ?, ?)");
      for (const ing of ingredients) {
        stmt.run(productId, ing.ingredient_product_id, parseFloat(ing.quantity) || 0);
      }
      
      // Dynamically calculate parent product buy_price (cost price) as sum of ingredients' costs
      let calculatedCost = 0;
      for (const ing of ingredients) {
        const ingProduct = db.prepare("SELECT buy_price FROM products WHERE id = ?").get(ing.ingredient_product_id);
        if (ingProduct) {
          calculatedCost += (ingProduct.buy_price * (parseFloat(ing.quantity) || 0));
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
      SELECT i.ingredient_product_id, i.quantity, p.name, p.unit, p.buy_price, p.stock
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
      SELECT i.ingredient_product_id, i.quantity, p.stock
      FROM product_ingredients i
      JOIN products p ON i.ingredient_product_id = p.id
      WHERE i.parent_product_id = ?
    `).all(dishId);

    if (ingredients.length === 0) return null; // Not a ready dish with a recipe

    let minPortions = Infinity;
    for (const ing of ingredients) {
      if (ing.quantity <= 0) continue;
      const portions = ing.stock / ing.quantity;
      if (portions < minPortions) {
        minPortions = portions;
      }
    }

    const available = minPortions === Infinity ? 0 : Math.floor(minPortions);
    db.prepare('UPDATE products SET stock = ? WHERE id = ?').run(available, dishId);
    return available;
  } catch (err) {
    console.error('Error calculating portions:', err);
    return 0;
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

function getWaitersReport(startDateISO, endDateISO, waiterId = null) {
  try {
    const sanitizeDate = (d) => {
      if (!d) return d;
      return d.replace('T', ' ').replace('Z', '').substring(0, 19);
    };
    const start = sanitizeDate(startDateISO);
    const end = sanitizeDate(endDateISO);

    if (waiterId) {
      // 1. Consolidated stats for single waiter
      const stats = db.prepare(`
        SELECT 
          w.id,
          w.name,
          w.percentage,
          COUNT(s.id) as total_receipts,
          IFNULL(SUM(s.total_amount), 0) as total_sales,
          IFNULL(SUM(s.waiter_commission), 0) as total_commission
        FROM waiters w
        LEFT JOIN sales s ON s.waiter_id = w.id AND s.created_at >= ? AND s.created_at <= ? AND s.status != 'refunded'
        WHERE w.id = ?
        GROUP BY w.id
      `).get(start, end, waiterId);

      // 2. Detailed list of receipts
      const receipts = db.prepare(`
        SELECT 
          id,
          shift_receipt_number,
          total_amount,
          payment_method,
          created_at,
          waiter_percentage,
          waiter_commission
        FROM sales
        WHERE waiter_id = ? AND created_at >= ? AND created_at <= ? AND status != 'refunded'
        ORDER BY created_at DESC
      `).all(waiterId, start, end);

      return { 
        success: true, 
        data: { 
          waiter: stats || { id: waiterId, name: 'Ochirilgan ofitsiant', percentage: 0, total_receipts: 0, total_sales: 0, total_commission: 0 }, 
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
          COUNT(s.id) as total_receipts,
          IFNULL(SUM(s.total_amount), 0) as total_sales,
          IFNULL(SUM(s.waiter_commission), 0) as total_commission
        FROM waiters w
        LEFT JOIN sales s ON s.waiter_id = w.id AND s.created_at >= ? AND s.created_at <= ? AND s.status != 'refunded'
        GROUP BY w.id
        ORDER BY total_sales DESC
      `).all(start, end);

      // Also get deleted waiters who have sales in this period
      const deletedRows = db.prepare(`
        SELECT 
          waiter_id as id,
          waiter_name as name,
          waiter_percentage as percentage,
          COUNT(id) as total_receipts,
          IFNULL(SUM(total_amount), 0) as total_sales,
          IFNULL(SUM(waiter_commission), 0) as total_commission
        FROM sales
        WHERE waiter_id IS NOT NULL AND waiter_id NOT IN (SELECT id FROM waiters) AND created_at >= ? AND created_at <= ? AND status != 'refunded'
        GROUP BY waiter_id
        ORDER BY total_sales DESC
      `).all(start, end);

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

function saveAttendance(employeeId, employeeType, date, status) {
  try {
    db.prepare(`
      INSERT INTO attendance (employee_id, employee_type, date, status)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(employee_id, employee_type, date) DO UPDATE SET status = excluded.status
    `).run(employeeId, employeeType, date, status);
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

function updateCashier(id, name, pin, role, salary) {
  try {
    const exists = db.prepare("SELECT id FROM cashiers WHERE pin = ? AND id != ?").get(pin, id);
    if (exists) return { success: false, error: 'pin_exists' };

    db.prepare("UPDATE cashiers SET name = ?, pin = ?, role = ?, salary = ? WHERE id = ?").run(name, pin, role, salary, id);
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

function updateWaiter(id, name, pinCode, percentage, salary) {
  try {
    const exists = db.prepare("SELECT id FROM waiters WHERE pin_code = ? AND id != ?").get(pinCode, id);
    if (exists) return { success: false, error: 'pin_exists' };

    db.prepare("UPDATE waiters SET name = ?, pin_code = ?, percentage = ?, salary = ? WHERE id = ?").run(name, pinCode, percentage, salary, id);
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

module.exports = { 
  initDB, closeDB, getProducts, getCustomers, getCustomer, addProduct, updateProduct, addStockToProduct, deleteProduct, searchProduct,
  processSale, getRecentSales, processFullReturn, processReturn, payDebt, addManualDebt, getReports, getSaleForReprint,
  getLowStockProducts, clearTestData, resetFactoryData, getCustomerDebtDetails, getAllSalesHistory, getSalesForExcel,
  verifyPin, getSettings, updateSetting, syncUsdRate, checkBaseLoaded, loadInitialBase,
  getCashiers, addCashier, deleteCashier, updateCashierPin,
  getAttendanceList, saveAttendance, updateCashier, updateWaiter,
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
  getProductGroups,
  addProductGroup,
  getOrCreateProductGroup,
  calculateAvailablePortions,
  updateDependentDishesStocks,
  projectYield,
  lockTable,
  unlockTable,
  setTablePrePrinted,
  getWaitersReport,
  getRestaurantOnlyProducts,
  clearWarehouse,
  getRestaurantZones,
  addRestaurantZone,
  deleteRestaurantZone
};
