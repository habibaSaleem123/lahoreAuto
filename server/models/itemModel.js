const db = require('../config/db');

const Item = {
  getAll: async () => {
    const [rows] = await db.query('SELECT * FROM items');
    return rows;
  },

  getById: async (id) => {
    const [rows] = await db.query('SELECT * FROM items WHERE id = ?', [id]);
    return rows[0];
  },

  getByCode: async (item_code) => {
    const [rows] = await db.query('SELECT * FROM items WHERE item_code = ?', [item_code]);
    return rows[0];
  },

  create: async (item) => {
    const { item_code, name, hs_code, unit, default_margin, status } = item;
    const [result] = await db.query(
      `INSERT INTO items (item_code, name, hs_code, unit, default_margin, status)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [item_code, name, hs_code, unit, default_margin, status]
    );
    return result.insertId;
  },

  update: async (id, item) => {
    const { item_code, name, hs_code, unit, default_margin, status } = item;
    await db.query(
      `UPDATE items
       SET item_code = ?, name = ?, hs_code = ?, unit = ?, default_margin = ?, status = ?
       WHERE id = ?`,
      [item_code, name, hs_code, unit, default_margin, status, id]
    );
  },

  delete: async (id) => {
    await db.query('DELETE FROM items WHERE id = ?', [id]);
  }
};

module.exports = Item;
