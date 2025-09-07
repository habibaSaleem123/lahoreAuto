// server/controllers/itemsController.js
const dbx = require('../config/db');

// GET /api/items/search?query=
exports.searchItems = (req, res) => {
  try {
    const q = (req.query.query || '').trim();

    let rows;
    if (q === '') {
      // empty query: top in-stock items
      rows = dbx.all(`
        SELECT
          gi.item_id,
          gi.description,
          gi.hs_code,
          gi.unit,
          gi.retail_price,
          gi.sale_price,
          COALESCE(SUM(CAST(inv.quantity_remaining AS REAL)), 0) AS available_total
        FROM gd_items gi
        JOIN inventory inv ON inv.item_id = gi.item_id
        WHERE CAST(inv.quantity_remaining AS REAL) > 0
        GROUP BY gi.item_id, gi.description, gi.hs_code, gi.unit, gi.retail_price, gi.sale_price
        ORDER BY available_total DESC, gi.description ASC
        LIMIT 200
      `);
    } else {
      const like = `%${q}%`;
      rows = dbx.all(`
        SELECT
          gi.item_id,
          gi.description,
          gi.hs_code,
          gi.unit,
          gi.retail_price,
          gi.sale_price,
          COALESCE(SUM(CAST(inv.quantity_remaining AS REAL)), 0) AS available_total
        FROM gd_items gi
        JOIN inventory inv ON inv.item_id = gi.item_id
        WHERE (gi.description LIKE @like OR CAST(gi.hs_code AS TEXT) LIKE @like)
          AND CAST(inv.quantity_remaining AS REAL) > 0
        GROUP BY gi.item_id, gi.description, gi.hs_code, gi.unit, gi.retail_price, gi.sale_price
        ORDER BY available_total DESC, gi.description ASC
        LIMIT 200
      `, { like });
    }

    res.json(rows);
  } catch (err) {
    console.error('❌ /items/search error:', err);
    res.status(500).json([]);
  }
};

// GET /api/items/:id/availability
exports.getItemAvailability = (req, res) => {
  try {
    const itemId = String(req.params.id); // keep as string
    const rows = dbx.all(`
      SELECT
        inv.gd_entry_id  AS gd_id,
        ge.gd_number     AS gd_number,
        inv.quantity_remaining,
        inv.cost,
        inv.mrp
      FROM inventory inv
      JOIN gd_entries ge ON ge.id = inv.gd_entry_id
      WHERE inv.item_id = @itemId
        AND CAST(inv.quantity_remaining AS REAL) > 0
      ORDER BY ge.gd_date ASC, inv.id ASC
    `, { itemId });

    res.json(rows);
  } catch (err) {
    console.error('❌ /items/:id/availability error:', err);
    res.status(500).json([]);
  }
};
