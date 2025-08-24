// server/controllers/stockController.js
const dbx = require('../config/db');    // { db, get, all, run, migrate }
const { db } = dbx;                     // raw better-sqlite3 Database (for transactions)

// 1) Get Unstocked GDs
// GET /api/stock/unstocked-gds
exports.getUnstockedGds = (req, res) => {
  try {
    const rows = dbx.all(`
      SELECT id, gd_number, gd_date, supplier_name
      FROM gd_entries
      WHERE stocked_in = 0
    `);
    res.json(rows);
  } catch (err) {
    console.error('getUnstockedGds error:', err);
    res.status(500).json({ error: 'Failed to fetch unstocked GDs' });
  }
};

// 2) Process Stock In (Grouped by description + unit)
// POST /api/stock/stock-in/:gdId
// Body: { stocked_by, stocked_at? }
exports.processStockIn = (req, res) => {
  const { gdId } = req.params;
  const { stocked_by, stocked_at } = req.body;

  // normalize one timestamp up-front (SQLite compares ISO strings correctly)
  const normalizedWhen = stocked_at
    ? new Date(stocked_at).toISOString().slice(0, 19).replace('T', ' ')
    : new Date().toISOString().slice(0, 19).replace('T', ' ');

  const txn = db.transaction(({ gdId, stocked_by }) => {
    const items = dbx.all(
      `SELECT * FROM gd_items WHERE gd_entry_id = @gd`,
      { gd: Number(gdId) }
    );

    const stInsertInv = db.prepare(`
      INSERT INTO inventory (
        item_id, gd_entry_id, item_code, hs_code, description,
        quantity, quantity_remaining, unit, cost, mrp,
        stocked_by, stocked_at
      ) VALUES (
        @item_id, @gd_entry_id, @item_code, @hs_code, @description,
        @quantity, @quantity_remaining, @unit, @cost, @mrp,
        @stocked_by, @stocked_at
      )
    `);

    const stInsertAudit = db.prepare(`
      INSERT INTO stock_audit (
        gd_entry_id, item_id, description, hs_code, unit, quantity, stocked_by, timestamp
      ) VALUES (
        @gd_entry_id, @item_id, @description, @hs_code, @unit, @quantity, @stocked_by, datetime('now')
      )
    `);

    for (const item of items) {
      const unit = String(item.unit || '').trim().toUpperCase();

      stInsertInv.run({
        item_id: item.item_id,
        gd_entry_id: Number(gdId),
        item_code: item.item_number,
        hs_code: item.hs_code,
        description: item.description,
        quantity: Number(item.quantity || 0),
        quantity_remaining: Number(item.quantity || 0),
        unit,
        cost: Number(item.cost || 0),
        mrp: Number(item.mrp || 0),
        stocked_by: stocked_by || 'Unknown',
        stocked_at: normalizedWhen
      });

      stInsertAudit.run({
        gd_entry_id: Number(gdId),
        item_id: item.item_id,
        description: item.description,
        hs_code: item.hs_code,
        unit,
        quantity: Number(item.quantity || 0),
        stocked_by: stocked_by || 'Unknown'
      });
    }

    db.prepare(`UPDATE gd_entries SET stocked_in = 1 WHERE id = @id`)
      .run({ id: Number(gdId) });
  });

  try {
    txn({ gdId, stocked_by });
    res.json({ message: 'Stocked in successfully' });
  } catch (err) {
    console.error('processStockIn error:', err);
    res.status(500).json({ error: 'Stock-in failed' });
  }
};

// 3) GD-Batch Stock Summary (raw entries from inventory)
// GET /api/stock/summary
exports.getStockSummary = (req, res) => {
  try {
    const rows = dbx.all(`
      SELECT
        i.item_id,
        i.description,
        i.unit,
        i.quantity_remaining,
        i.cost,
        i.mrp,
        i.stocked_by,
        i.stocked_at,
        g.gd_number
      FROM inventory i
      LEFT JOIN gd_entries g ON i.gd_entry_id = g.id
      ORDER BY i.stocked_at DESC, i.rowid DESC
    `);
    res.json(rows);
  } catch (err) {
    console.error('getStockSummary error:', err);
    res.status(500).json({ error: 'Failed to fetch GD-batch inventory summary' });
  }
};

// 4) Grouped Stock Summary + Audit Enrichment
// GET /api/stock/summary-with-audit
exports.getStockSummaryWithAudit = (req, res) => {
  try {
    // SQLite: group_concat(DISTINCT x)  ← one argument only (no custom separator/order)
    const summary = dbx.all(`
      SELECT
        description,
        unit,
        group_concat(DISTINCT hs_code)            AS hs_codes,
        COUNT(DISTINCT gd_entry_id)               AS gd_count,
        SUM(CAST(quantity_remaining AS REAL))     AS quantity,
        MAX(stocked_at)                           AS last_updated
      FROM inventory
      GROUP BY description, unit
      ORDER BY description
    `);

    const auditLogs = dbx.all(`
      SELECT a.*, g.gd_number
      FROM stock_audit a
      LEFT JOIN gd_entries g ON g.id = a.gd_entry_id
      ORDER BY a.timestamp DESC, a.rowid DESC
    `);

    const grouped = {};
    for (const log of auditLogs) {
      const key = `${log.description}_${String(log.unit || '').trim().toUpperCase()}`;
      (grouped[key] ||= []).push(log);
    }

    const enriched = summary.map(item => {
      const key = `${item.description}_${String(item.unit || '').trim().toUpperCase()}`;
      // prettify hs_codes with comma+space if present
      const hsCodesPretty = item.hs_codes ? item.hs_codes.split(',').join(', ') : '';
      return { ...item, hs_codes: hsCodesPretty, audit_log: grouped[key] || [] };
    });

    res.json(enriched);
  } catch (err) {
    console.error('getStockSummaryWithAudit error:', err);
    res.status(500).json({ error: 'Failed to fetch stock summary with audit log' });
  }
};
