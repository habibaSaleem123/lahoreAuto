const db = require('../config/db');

// Utility to group by item + unit
const normalizeKey = (desc, unit) => `${desc.trim().toLowerCase()}__${unit.trim().toLowerCase()}`;

exports.getStockReport = async (req, res) => {
  try {
    // 1️⃣ Get GD (incoming) stock
    const [gds] = await db.query(`
      SELECT description, unit, SUM(quantity) AS gd_in
      FROM gd_items
      GROUP BY description, unit
    `);

    // 2️⃣ Get Sales (outgoing)
    const [sales] = await db.query(`
      SELECT description, unit, SUM(quantity) AS sold
      FROM sales_invoice_items
      GROUP BY description, unit
    `);

    // 3️⃣ Get Returns (stock back)
    const [returns] = await db.query(`
      SELECT description, unit, SUM(quantity) AS returned
      FROM sales_returns
      GROUP BY description, unit
    `);

    // 4️⃣ Merge all sources
    const stockMap = {};

    // Incoming
    for (const row of gds) {
      const key = normalizeKey(row.description, row.unit);
      stockMap[key] = {
        description: row.description,
        unit: row.unit,
        gd_in: Number(row.gd_in),
        sold: 0,
        returned: 0
      };
    }

    // Sales
    for (const row of sales) {
      const key = normalizeKey(row.description, row.unit);
      if (!stockMap[key]) {
        stockMap[key] = { description: row.description, unit: row.unit, gd_in: 0, sold: 0, returned: 0 };
      }
      stockMap[key].sold = Number(row.sold);
    }

    // Returns
    for (const row of returns) {
      const key = normalizeKey(row.description, row.unit);
      if (!stockMap[key]) {
        stockMap[key] = { description: row.description, unit: row.unit, gd_in: 0, sold: 0, returned: 0 };
      }
      stockMap[key].returned = Number(row.returned);
    }

    // 5️⃣ Calculate current stock
    const finalReport = Object.values(stockMap).map(item => {
      const available = item.gd_in - item.sold + item.returned;
      return {
        ...item,
        available,
        stock_value: null, // Fill from inventory if needed
        last_purchase: null,
        last_sale: null
      };
    });

    res.json(finalReport);
  } catch (err) {
    console.error('❌ Stock report error:', err);
    res.status(500).json({ error: 'Failed to fetch stock report' });
  }
};
