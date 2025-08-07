const express = require('express');
const router = express.Router();
const db = require('../config/db');

// Get all banks
router.get('/', async (req, res) => {
  const [banks] = await db.query('SELECT * FROM banks');
  res.json(banks);
});

// Add new bank
router.post('/', async (req, res) => {
  const { name, account_number, branch } = req.body;
  if (!name || !account_number || !branch) return res.status(400).json({ error: 'Missing fields' });
  await db.query(
    'INSERT INTO banks (name, account_number, branch, is_active, balance) VALUES (?, ?, ?, 1, 0)',
    [name, account_number, branch]
  );
  res.json({ message: '✅ Bank added' });
});
// Update bank details
router.put('/:id', async (req, res) => {
    const { name, account_number, branch } = req.body;
    const { id } = req.params;
    await db.query(
      'UPDATE banks SET name = ?, account_number = ?, branch = ? WHERE id = ?',
      [name, account_number, branch, id]
    );
    res.json({ message: '✅ Bank updated' });
  });
  

// Get payments made to a specific bank
// Get payments made to a specific bank, along with total sum
router.get('/:id/payments', async (req, res) => {
    const bankId = req.params.id;
  
    const [payments] = await db.query(`
      SELECT p.date, p.amount, c.name AS customer_name
      FROM payments p
      LEFT JOIN customers c ON p.customer_id = c.id
      WHERE p.bank_id = ?
      ORDER BY p.date DESC
    `, [bankId]);
  
    const [totalRow] = await db.query(`
      SELECT SUM(amount) AS total FROM payments WHERE bank_id = ?
    `, [bankId]);
  
    res.json({ payments, total: totalRow[0].total || 0 });
  });
  

module.exports = router;
