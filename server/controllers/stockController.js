const db = require('../config/db');

const formatDateForMySQL = (date) => {
  const d = new Date(date);
  return d.toISOString().slice(0, 19).replace('T', ' ');
};

// 1. Get Unstocked GDs
exports.getUnstockedGds = async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT id, gd_number, gd_date, supplier_name 
      FROM gd_entries 
      WHERE stocked_in = 0
    `);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch unstocked GDs' });
  }
};

// 2. Process Stock In (Grouped by description + unit)
exports.processStockIn = async (req, res) => {
  const { gdId } = req.params;
  const { stocked_by, stocked_at } = req.body;

  const conn = await db.getConnection();
  await conn.beginTransaction();

  try {
    const [items] = await conn.query(
      'SELECT * FROM gd_items WHERE gd_entry_id = ?', [gdId]
    );

    for (const item of items) {
      const unit = (item.unit || '').trim().toUpperCase(); // normalize unit for grouping

      await conn.query(`
        INSERT INTO inventory (
          item_id, gd_entry_id, item_code, hs_code, description,
          quantity, quantity_remaining, unit, cost, mrp,
          stocked_by, stocked_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          item.item_id, gdId, item.item_number, item.hs_code, item.description,
          item.quantity, item.quantity, unit, item.cost, item.mrp,
          stocked_by || 'Unknown', formatDateForMySQL(stocked_at || new Date())
        ]
      );

      await conn.query(`
        INSERT INTO stock_audit (
          gd_entry_id, item_id, description, hs_code, unit, quantity, stocked_by
        )
        VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          gdId, item.item_id, item.description, item.hs_code,
          unit, item.quantity, stocked_by || 'Unknown'
        ]
      );
    }

    await conn.query('UPDATE gd_entries SET stocked_in = 1 WHERE id = ?', [gdId]);
    await conn.commit();
    res.json({ message: 'Stocked in successfully' });

  } catch (err) {
    await conn.rollback();
    console.error(err);
    res.status(500).json({ error: 'Stock-in failed' });
  } finally {
    conn.release();
  }
};

// 3. GD-Batch Stock Summary (raw entries from inventory)
exports.getStockSummary = async (req, res) => {
  try {
    const [rows] = await db.query(`
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
      ORDER BY i.stocked_at DESC
    `);

    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch GD-batch inventory summary' });
  }
};

// 4. Grouped Stock Summary + Audit Enrichment
exports.getStockSummaryWithAudit = async (req, res) => {
  try {
    const [summary] = await db.query(`
      SELECT 
        description,
        unit,
        GROUP_CONCAT(DISTINCT hs_code) AS hs_codes,
        COUNT(DISTINCT gd_entry_id) AS gd_count,
        SUM(CAST(quantity_remaining AS DECIMAL(15,2))) AS quantity,
        MAX(stocked_at) AS last_updated
      FROM inventory
      GROUP BY description, unit
      ORDER BY description
    `);

    const [auditLogs] = await db.query(`
      SELECT a.*, g.gd_number
      FROM stock_audit a
      LEFT JOIN gd_entries g ON g.id = a.gd_entry_id
      ORDER BY a.timestamp DESC
    `);

    // group audit logs by description + unit
    const auditGrouped = auditLogs.reduce((acc, log) => {
      const key = `${log.description}_${(log.unit || '').trim().toUpperCase()}`;
      if (!acc[key]) acc[key] = [];
      acc[key].push(log);
      return acc;
    }, {});

    const enrichedSummary = summary.map(item => {
      const key = `${item.description}_${(item.unit || '').trim().toUpperCase()}`;
      return {
        ...item,
        audit_log: auditGrouped[key] || []
      };
    });

    res.json(enrichedSummary);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch stock summary with audit log' });
  }
};
