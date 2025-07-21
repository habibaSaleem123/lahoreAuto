const db = require('../config/db');

// GET /api/customers — Fetch all customers
exports.getCustomers = async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM customers ORDER BY name');
    res.json(rows);
  } catch (err) {
    console.error('Error fetching customers:', err);
    res.status(500).json({ error: 'Failed to fetch customers' });
  }
};

// POST /api/customers — Add new customer and return it
exports.addCustomer = async (req, res) => {
  try {
    const {
      name,
      business_name,
      address,
      cnic,
      filer_status = 'non-filer',
    } = req.body;

    const [result] = await db.query(
      `INSERT INTO customers (name, business_name, address, cnic, filer_status)
       VALUES (?, ?, ?, ?, ?)`,
      [name, business_name, address, cnic, filer_status]
    );

    const newCustomer = {
      id: result.insertId,
      name,
      business_name,
      address,
      cnic,
      filer_status
    };

    res.status(201).json(newCustomer);
  } catch (err) {
    console.error('Error adding customer:', err);
    res.status(500).json({ error: 'Failed to add customer' });
  }
};
