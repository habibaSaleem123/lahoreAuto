const db = require('../config/db');

// GET /api/customers
// GET /api/customers
exports.getCustomers = async (req, res) => {
  try {
    const { search = '', balance_gt, credit_exceeded } = req.query;

    let sql = `
      SELECT 
        c.id,
        c.name,
        c.business_name,
        c.address,
        c.cnic,
        c.mobile,
        c.filer_status,
        c.credit_limit,

        b.total_purchases,
        b.receivable,
        b.withholding_payable,
        b.balance

      FROM customers c
      JOIN customer_balances b ON b.customer_id = c.id
      WHERE 1=1
    `;

    const params = [];
    const havingClauses = [];

    if (search) {
      sql += ` AND (c.name LIKE ? OR c.cnic LIKE ? OR c.mobile LIKE ?)`;
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    if (balance_gt !== undefined) {
      havingClauses.push(`b.balance > ?`);
      params.push(balance_gt);
    }

    if (credit_exceeded === 'true') {
      havingClauses.push(`b.balance > c.credit_limit`);
    }

    if (havingClauses.length > 0) {
      sql += ` HAVING ` + havingClauses.join(' AND ');
    }

    sql += ` ORDER BY c.name`;

    const [rows] = await db.query(sql, params);
    res.json(rows);
  } catch (err) {
    console.error('❌ Error fetching customers:', err);
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
// GET /api/customers/:id
exports.getCustomerById = async (req, res) => {
  const { id } = req.params;

  try {
    const [[cust]] = await db.query(
      `SELECT 
         c.id,
         c.name,
         c.business_name,
         c.address,
         c.cnic,
         c.mobile,
         c.filer_status,
         c.credit_limit,

         b.total_purchases,
         b.receivable AS unpaid_total,
         b.withholding_payable,
         b.balance

       FROM customers c
       JOIN customer_balances b ON b.customer_id = c.id
       WHERE c.id = ?`,
      [id]
    );

    if (!cust) return res.status(404).json({ error: 'Customer not found' });

    res.json(cust);
  } catch (err) {
    console.error('❌ Error fetching customer details:', err);
    res.status(500).json({ error: 'Failed to fetch customer details' });
  }
};


