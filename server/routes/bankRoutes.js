// server/routes/bankRoutes.js
const express = require('express');
const router = express.Router();
const dbx = require('../config/db'); // { db, get, all, run }

// Helper: make absolute URL for files served by Express static
const absUrl = (req, p) => {
  if (!p) return '';
  if (/^https?:\/\//i.test(p)) return p;
  const withSlash = p.startsWith('/') ? p : `/${p}`;
  const base = `${req.protocol}://${req.get('host')}`;
  return `${base}${withSlash}`;
};

// ─────────────────────────────
// Banks CRUD (simple)
// ─────────────────────────────

// Get all banks
router.get('/', (req, res) => {
  try {
    const banks = dbx.all(`SELECT * FROM banks ORDER BY id DESC`);
    res.json(banks);
  } catch (err) {
    console.error('❌ Get banks error:', err);
    res.status(500).json({ error: 'Failed to fetch banks' });
  }
});

// Add new bank
router.post('/', (req, res) => {
  try {
    const { name, account_number, branch } = req.body;
    if (!name || !account_number || !branch) {
      return res.status(400).json({ error: 'Missing fields' });
    }

    dbx.run(
      `INSERT INTO banks (name, account_number, branch, is_active, balance)
       VALUES (@name, @account_number, @branch, 1, 0)`,
      { name, account_number, branch }
    );

    res.json({ message: '✅ Bank added' });
  } catch (err) {
    console.error('❌ Add bank error:', err);
    res.status(500).json({ error: 'Failed to add bank' });
  }
});

// Update bank details
router.put('/:id', (req, res) => {
  try {
    const { name, account_number, branch } = req.body;
    const { id } = req.params;

    dbx.run(
      `UPDATE banks
         SET name = @name, account_number = @account_number, branch = @branch
       WHERE id = @id`,
      { name, account_number, branch, id: Number(id) }
    );

    res.json({ message: '✅ Bank updated' });
  } catch (err) {
    console.error('❌ Update bank error:', err);
    res.status(500).json({ error: 'Failed to update bank' });
  }
});

// (Legacy) Get payments assigned to a bank (kept for backward compatibility)
router.get('/:id/payments', (req, res) => {
  try {
    const bankId = Number(req.params.id);

    const payments = dbx.all(
      `
      SELECT p.date, p.amount, p.type, p.mode, c.name AS customer_name
        FROM payments p
        LEFT JOIN customers c ON p.customer_id = c.id
       WHERE p.bank_id = @bankId
       ORDER BY p.date DESC, p.id DESC
      `,
      { bankId }
    );

    const totalRow = dbx.get(
      `SELECT COALESCE(SUM(amount), 0) AS total FROM payments WHERE bank_id = @bankId`,
      { bankId }
    );

    res.json({ payments, total: totalRow?.total || 0 });
  } catch (err) {
    console.error('❌ Get bank payments error:', err);
    res.status(500).json({ error: 'Failed to fetch payments' });
  }
});

// ─────────────────────────────
// Bank Ledger (recommended)
// Optional query: ?from_date=YYYY-MM-DD&to_date=YYYY-MM-DD
// ─────────────────────────────
router.get('/:id/ledger', (req, res) => {
  try {
    const bankId = Number(req.params.id);
    const { from_date, to_date } = req.query;

    // Build date filter (SQLite)
    const dateClauses = [];
    const params = { bankId };
    if (from_date) { dateClauses.push(`date(p.date) >= date(@from_date)`); params.from_date = from_date; }
    if (to_date)   { dateClauses.push(`date(p.date) <= date(@to_date)`);   params.to_date   = to_date;   }

    const where = `
      WHERE p.bank_id = @bankId
        AND p.mode = 'bank'
        ${dateClauses.length ? ' AND ' + dateClauses.join(' AND ') : ''}
    `;

    const rows = dbx.all(
      `
      SELECT
        p.id AS payment_id,
        p.date,
        p.type,                 -- 'received' | 'paid'
        p.payment_for,          -- 'customer' | 'invoice' (etc)
        p.amount,
        p.mode,
        p.remarks,
        p.receipt_path,
        p.invoice_id            AS invoice_number,
        c.name AS counterparty_name,
        c.business_name
      FROM payments p
      LEFT JOIN customers c ON c.id = p.customer_id
      ${where}
      ORDER BY p.date DESC, p.id DESC
      `,
      params
    );

    const totals = dbx.get(
      `
      SELECT
        COALESCE(SUM(CASE WHEN p.type='received' THEN p.amount END), 0) AS inflows,
        COALESCE(SUM(CASE WHEN p.type='paid'     THEN p.amount END), 0) AS outflows
      FROM payments p
      ${where}
      `,
      params
    ) || { inflows: 0, outflows: 0 };

    const bankMeta = dbx.get(
      `SELECT id, name, account_number, branch, balance FROM banks WHERE id = @bankId`,
      { bankId }
    );

    const normalizedRows = rows.map(r => ({
      ...r,
      receipt_path: r.receipt_path ? absUrl(req, r.receipt_path) : ''
    }));

    res.json({
      bank: bankMeta || null,
      inflows: totals.inflows || 0,
      outflows: totals.outflows || 0,
      net: (totals.inflows || 0) - (totals.outflows || 0),
      rows: normalizedRows
    });
  } catch (err) {
    console.error('❌ Bank ledger error:', err);
    res.status(500).json({ error: 'Failed to fetch bank ledger' });
  }
});

module.exports = router;
