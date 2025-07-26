const db = require('../config/db');

// GET /api/customers
// Supports optional query params: search, balance_gt (number), credit_exceeded (true/false)
exports.getCustomers = async (req, res) => {
  try {
    const { search = '', balance_gt, credit_exceeded } = req.query;

    // 1️⃣ Base query: customers + total purchases from sales_invoices
    let sql = `
      SELECT 
        c.id,
        c.name,
        c.business_name,
        c.address,
        c.cnic,
        c.mobile,
        c.filer_status,
        c.balance,
        c.credit_limit,
        COALESCE(SUM(si.gross_total), 0) AS total_purchases
      FROM customers c
      LEFT JOIN sales_invoices si ON si.customer_id = c.id
      WHERE 1=1
    `;
    const params = [];

    // 2️⃣ Filters
    if (search) {
      sql += ` AND (c.name LIKE ? OR c.cnic LIKE ? OR c.mobile LIKE ?)`;
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }
    // only show those with balance > 0
    if (balance_gt !== undefined) {
      sql += ` AND c.balance > ?`;
      params.push(balance_gt);
    }
    // only show credit_limit exceeded
    if (credit_exceeded === 'true') {
      sql += ` AND c.balance > c.credit_limit`;
    }

    sql += `
      GROUP BY c.id
      ORDER BY c.name
    `;

    const [rows] = await db.query(sql, params);
    res.json(rows);
  } catch (err) {
    console.error('Error fetching customers:', err);
    res.status(500).json({ error: 'Failed to fetch customers' });
  }
};

// POST /api/customers
exports.addCustomer = async (req, res) => {
  try {
    const {
      name, business_name, address,
      cnic, mobile, filer_status = 'non-filer',
      credit_limit = 0
    } = req.body;

    const [result] = await db.query(
      `INSERT INTO customers
         (name, business_name, address, cnic, mobile, filer_status, credit_limit)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [name, business_name, address, cnic, mobile, filer_status, credit_limit]
    );

    const newCust = {
      id: result.insertId,
      name,
      business_name,
      address,
      cnic,
      mobile,
      filer_status,
      balance: 0,
      credit_limit,
      total_purchases: 0
    };
    res.status(201).json(newCust);
  } catch (err) {
    console.error('Error adding customer:', err);
    // catch duplicate‐cnic
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ error: 'CNIC must be unique' });
    }
    res.status(500).json({ error: 'Failed to add customer' });
  }
};

// PUT /api/customers/:id
exports.updateCustomer = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      name, business_name, address,
      cnic, mobile, filer_status, credit_limit
    } = req.body;

    // update fields
    await db.query(
      `UPDATE customers
         SET name=?, business_name=?, address=?, cnic=?, mobile=?, filer_status=?, credit_limit=?
       WHERE id=?`,
      [name, business_name, address, cnic, mobile, filer_status, credit_limit, id]
    );

    res.json({ message: 'Customer updated' });
  } catch (err) {
    console.error('Error updating customer:', err);
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ error: 'CNIC must be unique' });
    }
    res.status(500).json({ error: 'Failed to update customer' });
  }
};

// DELETE /api/customers/:id
exports.deleteCustomer = async (req, res) => {
  try {
    const { id } = req.params;
    // 1️⃣ check if sales exist
    const [[countRow]] = await db.query(
      `SELECT COUNT(*) AS cnt FROM sales_invoices WHERE customer_id = ?`,
      [id]
    );
    if (countRow.cnt > 0) {
      return res.status(400).json({ error: 'Cannot delete: sales history exists' });
    }
    // 2️⃣ delete
    await db.query(`DELETE FROM customers WHERE id = ?`, [id]);
    res.json({ message: 'Customer deleted' });
  } catch (err) {
    console.error('Error deleting customer:', err);
    res.status(500).json({ error: 'Failed to delete customer' });
  }
};
