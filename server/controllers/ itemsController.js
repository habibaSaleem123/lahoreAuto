// server/controllers/itemsController.js
const db = require('../config/db'); // ← use your SQLite adapter

// GET /api/items/search?query=
exports.searchItems = (req, res) => {
  try {
    const q = (req.query.query || '').trim();

    // Early-out to avoid scanning everything; return [] when empty.
    // (If you prefer, you can return top available items instead.)
    if (!q) return res.json([]);

    const like = `%${q}%`;

    const rows = db.all(
      `
      SELECT
        gi.item_id,
        gi.description,
        gi.hs_code,
        gi.unit,
        gi.retail_price,
        gi.sale_price,
        COALESCE(SUM(inv.quantity_remaining), 0) AS available_total
      FROM gd_items gi
      LEFT JOIN inventory inv ON inv.item_id = gi.item_id
      WHERE gi.description LIKE @like OR gi.hs_code LIKE @like
      GROUP BY
        gi.item_id, gi.description, gi.hs_code, gi.unit, gi.retail_price, gi.sale_price
      HAVING available_total > 0
      ORDER BY available_total DESC
      LIMIT 200
      `,
      { like }
    );

    res.json(rows);
  } catch (err) {
    console.error('❌ /items/search error:', err);
    res.status(500).json([]);
  }
};

// GET /api/items/:itemId/availability
exports.getItemAvailability = (req, res) => {
  try {
    const itemId = Number(req.params.itemId);

    const rows = db.all(
      `
      SELECT
        inv.gd_entry_id       AS gd_id,
        ge.gd_number          AS gd_number,
        inv.quantity_remaining,
        gi.cost,
        gi.mrp
      FROM inventory inv
      JOIN gd_entries ge
        ON ge.id = inv.gd_entry_id
      JOIN gd_items gi
        ON gi.item_id = inv.item_id
       AND gi.gd_entry_id = inv.gd_entry_id
      WHERE inv.item_id = @itemId
        AND inv.quantity_remaining > 0
      ORDER BY ge.gd_date ASC, inv.id ASC
      `,
      { itemId }
    );

    res.json(rows);
  } catch (err) {
    console.error('❌ /items/:itemId/availability error:', err);
    res.status(500).json([]);
  }
};
