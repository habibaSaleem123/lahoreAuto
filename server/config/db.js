// server/config/db.js
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

// ─────────────────────────────────────────────
// Paths (Electron provides APP_DATA_DIR; fallback to server/.. in dev)
// ─────────────────────────────────────────────
const baseDir = process.env.APP_DATA_DIR
  ? process.env.APP_DATA_DIR
  : path.join(__dirname, '..'); // dev fallback

const dataDir = path.join(baseDir, 'data');
fs.mkdirSync(dataDir, { recursive: true });
const dbFile = path.join(dataDir, 'lahore_auto.db');

// ─────────────────────────────────────────────
// Open DB (sync; throws if it fails)
// ─────────────────────────────────────────────
let db;
try {
  db = new Database(dbFile);
} catch (err) {
  console.error('❌ Failed to open SQLite DB:', dbFile, err);
  throw err;
}

// Pragmas (set early)
db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');
db.pragma('foreign_keys = ON');
db.pragma('busy_timeout = 5000');

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────
function hasParams(p) {
  if (p == null) return false;
  if (Array.isArray(p)) return p.length > 0;
  if (typeof p === 'object') return Object.keys(p).length > 0;
  return true; // primitives count
}

function get(sql, params)  { const s = db.prepare(sql); return hasParams(params) ? s.get(params)  : s.get(); }
function all(sql, params)  { const s = db.prepare(sql); return hasParams(params) ? s.all(params)  : s.all(); }
function run(sql, params)  { const s = db.prepare(sql); return hasParams(params) ? s.run(params)  : s.run(); }

// Quote identifiers minimally
const q = (ident) => `"${String(ident).replace(/"/g, '""')}"`;

function columnExists(table, col) {
  const rows = db.prepare(`PRAGMA table_info(${q(table)})`).all();
  return rows.some(r => r.name === col);
}
function ensureColumn(table, col, decl) {
  if (!columnExists(table, col)) {
    db.prepare(`ALTER TABLE ${q(table)} ADD COLUMN ${q(col)} ${decl}`).run();
  }
}
function ensureIndex(indexName, table, cols) {
  const sql = `CREATE INDEX IF NOT EXISTS ${q(indexName)} ON ${q(table)}(${cols})`;
  db.prepare(sql).run();
}

// ─────────────────────────────────────────────
// Migration (safe transaction)
// ─────────────────────────────────────────────
const migrateTx = db.transaction(() => {
  // Tables
  db.exec(`
    CREATE TABLE IF NOT EXISTS banks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      balance REAL DEFAULT 0,
      is_active INTEGER DEFAULT 1,
      account_number TEXT,
      branch TEXT
    );

    CREATE TABLE IF NOT EXISTS customers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT,
      business_name TEXT,
      address TEXT,
      cnic TEXT UNIQUE,
      mobile TEXT,
      credit_limit REAL NOT NULL DEFAULT 0,
      filer_status TEXT DEFAULT 'non-filer',
      created_at TEXT DEFAULT (datetime('now')),
      balance REAL NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS customer_balances (
      customer_id INTEGER PRIMARY KEY,
      total_purchases REAL,
      receivable REAL,
      withholding_payable REAL,
      balance REAL,
      FOREIGN KEY(customer_id) REFERENCES customers(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS gd_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      gd_number TEXT NOT NULL,
      gd_date TEXT NOT NULL,
      supplier_name TEXT,
      invoice_value REAL, freight REAL, insurance REAL,
      clearing_charges REAL, port_charges REAL,
      gross_weight REAL, net_weight REAL, number_of_packages INTEGER,
      container_no TEXT, vessel_name TEXT,
      port_of_loading TEXT, port_of_discharge TEXT, delivery_terms TEXT,
      bl_awb_no TEXT, exchange_rate REAL, invoice_currency TEXT,
      assessed_value REAL, payment_mode TEXT, psid_no TEXT, bank_name TEXT,
      total_gd_amount REAL, challan_no TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      landed_cost REAL DEFAULT 0,
      stocked_in INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS gd_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      gd_entry_id INTEGER,
      item_number TEXT,
      description TEXT,
      hs_code TEXT,
      quantity INTEGER,
      unit TEXT,
      unit_price REAL,
      custom_duty REAL, sales_tax REAL, income_tax REAL, acd REAL, ast REAL,
      unit_cost REAL, total_custom_value REAL, gross_weight REAL,
      total_value REAL, invoice_value REAL, regulatory_duty REAL,
      landed_cost REAL, gst REAL,
      item_id TEXT UNIQUE,
      retail_price REAL DEFAULT 0,
      per_unit_sales_tax REAL DEFAULT 0,
      mrp REAL DEFAULT 0,
      cost REAL DEFAULT 0,
      gross_margin REAL DEFAULT 0,
      sale_price REAL DEFAULT 0,
      FOREIGN KEY(gd_entry_id) REFERENCES gd_entries(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS gd_charges (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      gd_entry_id INTEGER,
      charge_type TEXT,
      charge_amount REAL,
      FOREIGN KEY(gd_entry_id) REFERENCES gd_entries(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS inventory (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      gd_entry_id INTEGER NOT NULL,
      item_id TEXT NOT NULL,
      item_code TEXT,
      description TEXT,
      unit TEXT,
      quantity INTEGER,
      hs_code TEXT,
      quantity_remaining INTEGER NOT NULL DEFAULT 0,
      cost REAL,
      mrp REAL,
      stocked_by TEXT,
      stocked_at TEXT,
      source_return_id INTEGER,
      last_updated TEXT DEFAULT (datetime('now')),
      FOREIGN KEY(gd_entry_id) REFERENCES gd_entries(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS inventory_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      item_id TEXT,
      gd_entry_id INTEGER,
      action TEXT,
      quantity_changed REAL,
      resulting_quantity REAL,
      action_by TEXT,
      ref TEXT,
      action_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      type TEXT NOT NULL,
      customer_id INTEGER,
      supplier_name TEXT,
      invoice_id TEXT,
      amount REAL NOT NULL,
      mode TEXT NOT NULL,
      bank_id INTEGER,
      remarks TEXT,
      receipt_path TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      payment_for TEXT NOT NULL DEFAULT 'invoice',
      FOREIGN KEY(customer_id) REFERENCES customers(id) ON DELETE SET NULL,
      FOREIGN KEY(bank_id) REFERENCES banks(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS payment_allocations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      payment_id INTEGER NOT NULL,
      invoice_id INTEGER NOT NULL,
      amount REAL NOT NULL,
      FOREIGN KEY(payment_id) REFERENCES payments(id) ON DELETE CASCADE,
      FOREIGN KEY(invoice_id) REFERENCES sales_invoices(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS sales_invoices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      invoice_number TEXT UNIQUE,
      customer_id INTEGER,
      gd_entry_id INTEGER,
      gross_total REAL,
      withholding_tax REAL,
      sales_tax REAL,
      income_tax_paid REAL,
      gross_profit REAL,
      tax_section TEXT,
      filer_status TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      is_paid INTEGER DEFAULT 0,
      paid_by TEXT,
      paid_date TEXT,
      paid_bank TEXT,
      paid_receipt_path TEXT,
      total_refund REAL DEFAULT 0,
      total_refund_tax REAL DEFAULT 0,
      fully_refunded INTEGER DEFAULT 0,
      FOREIGN KEY(customer_id) REFERENCES customers(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS sales_invoice_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      invoice_id INTEGER,
      item_id TEXT,
      gd_entry_id INTEGER,
      quantity_sold REAL,
      retail_price REAL,
      sale_rate REAL,
      cost REAL DEFAULT 0,
      mrp REAL DEFAULT 0,
      unit TEXT,
      gross_line_total REAL,
      quantity_returned INTEGER DEFAULT 0,
      FOREIGN KEY(invoice_id) REFERENCES sales_invoices(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS sales_returns (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      return_number TEXT UNIQUE,
      invoice_id INTEGER NOT NULL,
      invoice_item_id INTEGER,
      item_id TEXT NOT NULL,
      quantity_returned REAL NOT NULL,
      reason TEXT,
      restock INTEGER NOT NULL DEFAULT 0,
      refund_amount REAL NOT NULL,
      tax_reversal REAL NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      refund_method TEXT DEFAULT 'withholding',
      FOREIGN KEY(invoice_id) REFERENCES sales_invoices(id) ON DELETE CASCADE,
      FOREIGN KEY(invoice_item_id) REFERENCES sales_invoice_items(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS gd_deletion_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      gd_entry_id INTEGER,
      deleted_by TEXT,
      deleted_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS stock_audit (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      gd_entry_id INTEGER,
      item_id TEXT,
      quantity INTEGER,
      stocked_by TEXT,
      timestamp TEXT DEFAULT (datetime('now')),
      description TEXT,
      hs_code TEXT,
      unit TEXT
    );
  `);

  // Columns that might be missing in older DBs
  ensureColumn('banks', 'account_number', 'TEXT');
  ensureColumn('banks', 'branch', 'TEXT');
  ensureColumn('banks', 'is_active', 'INTEGER DEFAULT 1');

  ensureColumn('customers', 'balance', 'REAL NOT NULL DEFAULT 0');

  ensureColumn('inventory_log', 'ref', 'TEXT');
  ensureColumn('inventory_log', 'action_at', "TEXT DEFAULT (datetime('now'))");

  ensureColumn('payments', 'supplier_name', 'TEXT');
  ensureColumn('payments', 'created_at', "TEXT DEFAULT (datetime('now'))");
  ensureColumn('payments', 'payment_for', "TEXT NOT NULL DEFAULT 'invoice'");

  // Indexes
  ensureIndex('idx_inventory_item_gd', 'inventory', 'item_id, gd_entry_id');
  ensureIndex('idx_sii_invoice', 'sales_invoice_items', 'invoice_id');
  ensureIndex('idx_sii_item_gd', 'sales_invoice_items', 'item_id, gd_entry_id');
  ensureIndex('idx_sales_invoices_created', 'sales_invoices', 'created_at');
});

function migrate() {
  try {
    migrateTx();
  } catch (err) {
    console.error('❌ Migration failed; DB unchanged (rolled back):', err);
    throw err;
  }
}

// ─────────────────────────────────────────────
// Diagnostics
// ─────────────────────────────────────────────
function ping() {
  const file = db.prepare('PRAGMA database_list').all();
  return { ok: true, dbFile, attached: file };
}

function selfTest() {
  const unique = `TEST-${Date.now()}`;
  run(
    `INSERT INTO customers (name, cnic, credit_limit, filer_status)
     VALUES (@name, @cnic, 0, 'non-filer')`,
    { name: 'SelfTest', cnic: unique }
  );
  const row = get('SELECT id, name, cnic, created_at FROM customers WHERE cnic = ?', unique);
  const count = get('SELECT COUNT(*) AS c FROM customers').c;
  return { inserted: row, totalCustomers: count };
}

module.exports = {
  db, get, all, run, migrate,
  dbFile,
  ping, selfTest
};
