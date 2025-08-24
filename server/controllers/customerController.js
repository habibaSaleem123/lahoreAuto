// server/controllers/customersController.js
const db = require('../config/db'); // { get, all, run }

// SELECT view used by several handlers
const CUSTOMER_SELECT = `
  SELECT 
    c.id,
    c.name,
    c.business_name,
    c.address,
    c.cnic,
    c.mobile,
    c.filer_status,
    c.credit_limit,
    COALESCE(b.total_purchases, 0)     AS total_purchases,
    COALESCE(b.receivable, 0)          AS receivable,
    COALESCE(b.withholding_payable, 0) AS withholding_payable,
    COALESCE(b.balance, 0)             AS balance
  FROM customers c
  LEFT JOIN customer_balances b ON b.customer_id = c.id
`;

// ─────────────────────────────────────────────
// GET /api/customers
// ─────────────────────────────────────────────
exports.getCustomers = (req, res) => {
  try {
    const { search = '', balance_gt, credit_exceeded } = req.query;

    let sql = `${CUSTOMER_SELECT} WHERE 1=1`;
    const params = {};

    if (search) {
      sql += ` AND (c.name LIKE @s OR c.cnic LIKE @s OR c.mobile LIKE @s)`;
      params.s = `%${search}%`;
    }

    if (balance_gt !== undefined) {
      sql += ` AND COALESCE(b.balance, 0) > @balance_gt`;
      params.balance_gt = Number(balance_gt);
    }

    if (credit_exceeded === 'true') {
      sql += ` AND COALESCE(b.balance, 0) > c.credit_limit`;
    }

    sql += ` ORDER BY c.name`;

    const rows = db.all(sql, params);
    res.json(rows);
  } catch (err) {
    console.error('❌ Error fetching customers:', err);
    res.status(500).json({ error: 'Failed to fetch customers' });
  }
};

// ─────────────────────────────────────────────
// POST /api/customers
// ─────────────────────────────────────────────
exports.addCustomer = (req, res) => {
  try {
    const {
      name,
      business_name,
      address,
      cnic,
      mobile,
      filer_status = 'non-filer',
      credit_limit = 0,
    } = req.body || {};

    if (!name) return res.status(400).json({ error: 'name is required' });
    if (!cnic) return res.status(400).json({ error: 'cnic is required' });

    const info = db.run(
      `INSERT INTO customers
         (name, business_name, address, cnic, mobile, filer_status, credit_limit, created_at)
       VALUES (@name, @business_name, @address, @cnic, @mobile, @filer_status, @credit_limit, datetime('now'))`,
      {
        name,
        business_name,
        address,
        cnic,
        mobile,
        filer_status,
        credit_limit: Number(credit_limit) || 0,
      }
    );

    // Seed balances so joins always find a row
    db.run(
      `INSERT OR IGNORE INTO customer_balances
         (customer_id, total_purchases, receivable, withholding_payable, balance)
       VALUES (@id, 0, 0, 0, 0)`,
      { id: info.lastInsertRowid }
    );

    const newCust = db.get(
      `${CUSTOMER_SELECT} WHERE c.id = @id`,
      { id: info.lastInsertRowid }
    );

    res.status(201).json(newCust);
  } catch (err) {
    console.error('Error adding customer:', err);
    const msg = String(err?.message || '');
    if (msg.includes('SQLITE_CONSTRAINT') && msg.includes('cnic')) {
      return res.status(409).json({ error: 'CNIC already exists' });
    }
    res.status(500).json({ error: 'Failed to add customer' });
  }
};

// ─────────────────────────────────────────────
// PUT /api/customers/:id
// ─────────────────────────────────────────────
exports.updateCustomer = (req, res) => {
  try {
    const { id } = req.params;
    const {
      name,
      business_name,
      address,
      cnic,
      mobile,
      filer_status,
      credit_limit,
    } = req.body || {};

    const info = db.run(
      `UPDATE customers
         SET name=@name,
             business_name=@business_name,
             address=@address,
             cnic=@cnic,
             mobile=@mobile,
             filer_status=@filer_status,
             credit_limit=COALESCE(@credit_limit, credit_limit)
       WHERE id=@id`,
      {
        id: Number(id),
        name,
        business_name,
        address,
        cnic,
        mobile,
        filer_status,
        credit_limit:
          credit_limit === undefined || credit_limit === null
            ? null
            : Number(credit_limit),
      }
    );

    if (info.changes === 0) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    // return the updated row
    const updated = db.get(`${CUSTOMER_SELECT} WHERE c.id = @id`, {
      id: Number(id),
    });
    res.json(updated);
  } catch (err) {
    console.error('Error updating customer:', err);
    const msg = String(err?.message || '');
    if (msg.includes('SQLITE_CONSTRAINT') && msg.includes('cnic')) {
      return res.status(409).json({ error: 'CNIC already exists' });
    }
    res.status(500).json({ error: 'Failed to update customer' });
  }
};

// ─────────────────────────────────────────────
// DELETE /api/customers/:id
// ─────────────────────────────────────────────
exports.deleteCustomer = (req, res) => {
  try {
    const { id } = req.params;

    const countRow = db.get(
      `SELECT COUNT(*) AS cnt FROM sales_invoices WHERE customer_id = @id`,
      { id: Number(id) }
    );
    if ((countRow?.cnt || 0) > 0) {
      return res.status(400).json({ error: 'Cannot delete: sales history exists' });
    }

    const info = db.run(`DELETE FROM customers WHERE id = @id`, {
      id: Number(id),
    });
    if (info.changes === 0) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    // customer_balances has ON DELETE CASCADE in schema; if not, you can also clean explicitly here.
    res.json({ ok: true });
  } catch (err) {
    console.error('Error deleting customer:', err);
    res.status(500).json({ error: 'Failed to delete customer' });
  }
};

// ─────────────────────────────────────────────
// GET /api/customers/:id
// ─────────────────────────────────────────────
exports.getCustomerById = (req, res) => {
  try {
    const { id } = req.params;

    const cust = db.get(`${CUSTOMER_SELECT} WHERE c.id = @id`, {
      id: Number(id),
    });

    if (!cust) return res.status(404).json({ error: 'Customer not found' });

    res.json(cust);
  } catch (err) {
    console.error('❌ Error fetching customer details:', err);
    res.status(500).json({ error: 'Failed to fetch customer details' });
  }
};
