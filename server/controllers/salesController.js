const db = require('../config/db');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');
const ExcelJS = require('exceljs');


exports.createInvoice = async (req, res) => {
  const {
    customer_id,
    gd_entry_id,
    items,
    withholding_rate,
    tax_section
  } = req.body;

  const conn = await db.getConnection();
  await conn.beginTransaction();

  try {
    const invoiceId = uuidv4().slice(0, 8).toUpperCase();

    const [[customer]] = await conn.query(`SELECT * FROM customers WHERE id = ?`, [customer_id]);
    if (!customer) throw new Error('Customer not found');

    let gross_total = 0;
    let total_sales_tax = 0;
    let total_cost = 0;

    const [invoiceInsert] = await conn.query(`
      INSERT INTO sales_invoices (
        invoice_number, customer_id, gd_entry_id,
        gross_total, withholding_tax, sales_tax,
        income_tax_paid, gross_profit, tax_section, filer_status
      ) VALUES (?, ?, ?, 0, 0, 0, 0, 0, ?, ?)`,
      [
        invoiceId, customer_id, gd_entry_id,
        tax_section, customer.filer_status
      ]
    );
    const invoice_db_id = invoiceInsert.insertId;

    for (const item of items) {
      const {
        item_id,
        quantity,
        sale_rate,
        retail_price,
        unit
      } = item;

      const gross_line_total = quantity * parseFloat(sale_rate);
      gross_total += gross_line_total;
      total_sales_tax += quantity * retail_price * 0.18;

      // FIFO cost deduction
      let qtyToDeduct = quantity;
      let totalItemCost = 0;
      const [batches] = await conn.query(`
        SELECT * FROM inventory
        WHERE item_id = ? AND gd_entry_id = ?
        ORDER BY stocked_at ASC`,
        [item_id, gd_entry_id]);

      for (const batch of batches) {
        if (qtyToDeduct <= 0) break;
        const deduct = Math.min(qtyToDeduct, batch.quantity_remaining);
        const remaining = batch.quantity_remaining - deduct;

        await conn.query(`UPDATE inventory SET quantity_remaining = ? WHERE id = ?`, [remaining, batch.id]);

        await conn.query(`
          INSERT INTO inventory_log (item_id, gd_entry_id, action, quantity_changed, resulting_quantity, action_by)
          VALUES (?, ?, 'sale', ?, ?, ?)`,
          [item_id, gd_entry_id, -deduct, remaining, customer.name]);

        totalItemCost += deduct * batch.cost;
        qtyToDeduct -= deduct;

        if (remaining === 0) {
          await conn.query(`DELETE FROM inventory WHERE id = ?`, [batch.id]);
        }
      }

      const itemCostPerUnit = quantity > 0 ? totalItemCost / quantity : 0;
      total_cost += totalItemCost;

      // Insert item with cost and mrp
      await conn.query(`
        INSERT INTO sales_invoice_items (
          invoice_id, item_id, gd_entry_id,
          quantity_sold, retail_price, sale_rate,
          cost, mrp, unit, gross_line_total
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          invoice_db_id, item_id, gd_entry_id,
          quantity, retail_price, sale_rate,
          itemCostPerUnit, retail_price,
          unit, gross_line_total
        ]
      );
    }

    const [[{ remaining }]] = await conn.query(
      `SELECT COUNT(*) AS remaining FROM inventory WHERE gd_entry_id = ?`, [gd_entry_id]);

    if (remaining === 0) {
      await conn.query(`DELETE FROM gd_entries WHERE id = ?`, [gd_entry_id]);
      await conn.query(`INSERT INTO gd_deletion_log (gd_entry_id, deleted_by) VALUES (?, ?)`,
        [gd_entry_id, customer.name]);
    }

    const [[taxRow]] = await conn.query(`
      SELECT SUM(income_tax) AS total_income_tax
      FROM gd_items
      WHERE gd_entry_id = ?`,
      [gd_entry_id]);

    const income_tax_paid = taxRow?.total_income_tax || 0;
    const withholding_tax = gross_total * parseFloat(withholding_rate || 0.01);
    const gross_profit = gross_total - total_cost;

    await conn.query(`
      UPDATE sales_invoices
      SET gross_total = ?, sales_tax = ?, withholding_tax = ?,
          gross_profit = ?, income_tax_paid = ?
      WHERE id = ?`,
      [gross_total, total_sales_tax, withholding_tax, gross_profit, income_tax_paid, invoice_db_id]);

    await conn.query(`CALL cleanup_gd_if_empty(?, ?)`, [gd_entry_id, customer.name]);

    await conn.commit();
    res.json({ message: 'Invoice created', invoice_number: invoiceId });
  } catch (err) {
    await conn.rollback();
    console.error(err);
    res.status(500).json({ error: err.message });
  } finally {
    conn.release();
  }
};


// 🔍 Get invoice for printing/viewing
exports.getInvoiceById = async (req, res) => {
  const conn = await db.getConnection();
  try {
    const [invoiceRows] = await conn.query(`
      SELECT i.*, c.name AS customer_name, c.business_name, c.filer_status
      FROM sales_invoices i
      JOIN customers c ON c.id = i.customer_id
      WHERE i.invoice_number = ?
    `, [req.params.id]);

    if (!invoiceRows.length) return res.status(404).json({ error: "Invoice not found" });

    const invoice = invoiceRows[0];

    const [items] = await conn.query(`
      SELECT sii.*, gi.description, gi.hs_code
      FROM sales_invoice_items sii
      JOIN gd_items gi ON gi.item_id = sii.item_id
      WHERE sii.invoice_id = ?
    `, [invoice.id]);

    res.json({ invoice, items });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load invoice' });
  } finally {
    conn.release();
  }
};
// Get all invoices with optional filters
exports.getAllInvoices = async (req, res) => {
  const {
    search = '',
    tax_section = '',
    filer_status = '',
    from_date,
    to_date,
    payment_status = ''
  } = req.query;
  
  
    let sql = `
      SELECT i.*, c.name AS customer_name 
      FROM sales_invoices i
      JOIN customers c ON c.id = i.customer_id
      WHERE 1=1
    `;
    const params = [];
  
    if (search) {
      sql += ` AND (c.name LIKE ? OR i.invoice_number LIKE ?)`;
      params.push(`%${search}%`, `%${search}%`);
    }
  
    if (tax_section) {
      sql += ` AND i.tax_section = ?`;
      params.push(tax_section);
    }
  
    if (filer_status && filer_status !== 'all') {
      sql += ` AND i.filer_status = ?`;
      params.push(filer_status);
    }
  
    if (from_date) {
      sql += ` AND DATE(i.created_at) >= ?`;
      params.push(from_date);
    }
  
    if (to_date) {
      sql += ` AND DATE(i.created_at) <= ?`;
      params.push(to_date);
    }

    if (payment_status === 'paid') {
      sql += ` AND i.is_paid = 1`;
    } else if (payment_status === 'unpaid') {
      sql += ` AND i.is_paid = 0`;
    }
    
  
    sql += ` ORDER BY i.created_at DESC`;
  
    try {
      const [rows] = await db.query(sql, params);
      res.json(rows);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Failed to fetch invoices" });
    }
  };
  
  // DELETE /api/sales/invoice/:invoice_number
  exports.deleteInvoice = async (req, res) => {
    const conn = await db.getConnection();
    await conn.beginTransaction();
  
    try {
      const { invoice_number } = req.params;
  
      // Get invoice ID
      const [[invoice]] = await conn.query(
        `SELECT id FROM sales_invoices WHERE invoice_number = ?`,
        [invoice_number]
      );
      if (!invoice) return res.status(404).json({ error: 'Invoice not found' });
  
      // Delete returns first to satisfy FK constraints
      await conn.query(`DELETE FROM sales_returns WHERE invoice_id = ?`, [invoice.id]);
  
      // Then delete invoice items
      await conn.query(`DELETE FROM sales_invoice_items WHERE invoice_id = ?`, [invoice.id]);
  
      // Then delete the invoice
      await conn.query(`DELETE FROM sales_invoices WHERE id = ?`, [invoice.id]);
  
      await conn.commit();
      res.json({ message: 'Invoice deleted successfully' });
    } catch (err) {
      await conn.rollback();
      console.error('❌ Error deleting invoice:', err);
      res.status(500).json({ error: 'Failed to delete invoice' });
    } finally {
      conn.release();
    }
  };
  
  
  
  
  exports.exportInvoicesToFBR = async (req, res) => {
    const { invoice_numbers } = req.body;
    if (!invoice_numbers?.length) {
      return res.status(400).json({ error: 'No invoice numbers provided' });
    }
  
    const conn = await db.getConnection();
    try {
      const placeholders = invoice_numbers.map(() => '?').join(',');
      const [invoices] = await conn.query(`
        SELECT i.*, c.name AS customer_name, c.business_name, sii.*, gi.hs_code, gi.description
        FROM sales_invoices i
        JOIN customers c ON c.id = i.customer_id
        JOIN sales_invoice_items sii ON sii.invoice_id = i.id
        JOIN gd_items gi ON gi.item_id = sii.item_id
        WHERE i.invoice_number IN (${placeholders})
      `, invoice_numbers);
  
      // Load template
      const templatePath = path.join(__dirname, '../templates/Sales_Invoice_Template.xlsm');
      const tempExportPath = path.join(__dirname, '../tmp/fbr_export.xlsm');
  
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.readFile(templatePath);
      const sheet = workbook.worksheets[0];
  
      let rowNum = 2;
      for (const invoice of invoices) {
        sheet.getRow(rowNum).values = [
          invoice.invoice_number,
          invoice.customer_name,
          invoice.business_name,
          invoice.tax_section,
          invoice.filer_status === "filer" ? 'Filer' : 'Non-Filer',
          invoice.hs_code,
          invoice.description,
          invoice.quantity_sold,
          invoice.sale_rate,
          invoice.retail_price,
          invoice.sales_tax,
          invoice.income_tax_paid,
          invoice.withholding_tax,
          invoice.gross_total
        ];
        rowNum++;
      }
  
      await workbook.xlsx.writeFile(tempExportPath);
      res.download(tempExportPath, 'FBR_Export.xlsm', () => {
        fs.unlinkSync(tempExportPath); // cleanup temp file
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to export invoices' });
    } finally {
      conn.release();
    }
  };
    

  exports.markInvoiceAsPaid = async (req, res) => {
    const bank = req.body.bank_name;
    const payer = req.body.payer_name;
    const date = req.body.payment_date;
    const invoice_number = req.params.invoice_number;
  
    const file = req.file; // ✅ FIX: capture uploaded file here
  
    console.log('📥 Received payment data:', { invoice_number, bank, payer, date });
    console.log('📎 Uploaded file:', file);
  
    try {
      const uploadDir = path.join(__dirname, '../receipts');
      if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);
  
      const receiptFileName = file ? `${invoice_number}_${Date.now()}_${file.originalname}` : null;
      const receiptPath = file ? path.join('receipts', receiptFileName) : null;
  
      if (file) {
        const fullPath = path.join(__dirname, '..', receiptPath);
        fs.renameSync(file.path, fullPath);
      }
  
      const [result] = await db.query(`
        UPDATE sales_invoices
        SET is_paid = 1,
            paid_bank = ?,
            paid_by = ?,
            paid_date = ?,
            paid_receipt_path = ?
        WHERE invoice_number = ?`,
        [bank, payer, date, receiptPath, invoice_number]
      );
  
      console.log('✅ MySQL update result:', result);
  
      if (result.affectedRows === 0) {
        console.warn('⚠️ Invoice not found or already updated:', invoice_number);
        return res.status(404).json({ error: 'Invoice not found' });
      }
  
      res.json({ message: 'Invoice marked as paid' });
    } catch (err) {
      console.error('❌ Mark paid error:', err);
      res.status(500).json({ error: 'Failed to mark invoice as paid' });
    }
  };

  // Returns management
  
  // GET /api/sales/invoice/:invoice_number/returns
exports.getReturnsByInvoice = async (req, res) => {
  const conn = await db.getConnection();
  try {
    const { invoice_number } = req.params;
    // find invoice id
    const [[inv]] = await conn.query(
      `SELECT id FROM sales_invoices WHERE invoice_number = ?`,
      [invoice_number]
    );
    if (!inv) return res.status(404).json({ error: 'Invoice not found' });

    // fetch return rows
    const [rows] = await conn.query(
      `SELECT * FROM sales_returns WHERE invoice_id = ? ORDER BY created_at DESC`,
      [inv.id]
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  } finally {
    conn.release();
  }
};

// POST /api/sales/returns
exports.createReturn = async (req, res) => {
  const {
    invoice_number,
    items,
    refund_method // 'cash' or 'withholding'
  } = req.body;

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const [[invoice]] = await conn.query(
      `SELECT id, customer_id FROM sales_invoices WHERE invoice_number = ?`,
      [invoice_number]
    );
    if (!invoice) throw new Error("Invoice not found");

    const invoice_id = invoice.id;
    const customer_id = invoice.customer_id;

    let totalRefund = 0;
    let totalTax = 0;

    for (const item of items) {
      const {
        invoice_item_id,
        quantity_returned,
        reason,
        restock
      } = item;

      if (quantity_returned <= 0) continue;

      const [rows] = await conn.query(
        `SELECT sii.*, gi.hs_code
         FROM sales_invoice_items sii
         JOIN gd_items gi ON gi.item_id = sii.item_id
         WHERE sii.id = ?`,
        [invoice_item_id]
      );
      if (!rows.length) throw new Error("Invoice item not found");

      const original = rows[0];
      const soldQty = parseFloat(original.quantity_sold);
      const returnedQty = parseFloat(original.quantity_returned || 0);
      const toReturn = parseFloat(quantity_returned);

      if (returnedQty + toReturn > soldQty) {
        throw new Error(`Return exceeds sold quantity. Already returned ${returnedQty}`);
      }

      const refundAmount = toReturn * parseFloat(original.sale_rate);
      const taxReversal = toReturn * parseFloat(original.retail_price) * 0.18;
      const return_number = `RET-${Math.floor(100000 + Math.random() * 900000)}`;

      await conn.query(
        `INSERT INTO sales_returns 
         (return_number, invoice_id, invoice_item_id, item_id, quantity_returned, reason, restock, refund_amount, tax_reversal, refund_method)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          return_number,
          invoice_id,
          invoice_item_id,
          original.item_id,
          toReturn,
          reason || 'N/A',
          restock ? 1 : 0,
          refundAmount,
          taxReversal,
          refund_method
        ]
      );

      await conn.query(
        `UPDATE sales_invoice_items
         SET quantity_returned = quantity_returned + ?
         WHERE id = ?`,
        [toReturn, invoice_item_id]
      );

      totalRefund += refundAmount;
      totalTax += taxReversal;

      if (restock) {
        const [batches] = await conn.query(`
          SELECT id, quantity_remaining
          FROM inventory
          WHERE gd_entry_id = ? AND item_id = ?
          ORDER BY stocked_at ASC
          LIMIT 1
        `, [original.gd_entry_id, original.item_id]);

        if (batches.length > 0) {
          const batch = batches[0];
          const newQty = batch.quantity_remaining + toReturn;

          await conn.query(`
            UPDATE inventory
            SET quantity_remaining = ?, last_updated = NOW()
            WHERE id = ?`,
            [newQty, batch.id]
          );

          await conn.query(`
            INSERT INTO inventory_log 
            (item_id, gd_entry_id, action, quantity_changed, resulting_quantity, action_by)
            VALUES (?, ?, 'restock-merge', ?, ?, ?)`,
            [
              original.item_id,
              original.gd_entry_id,
              toReturn,
              newQty,
              req.user?.name || 'System'
            ]
          );
        } else {
          await conn.query(`
            INSERT INTO inventory 
            (gd_entry_id, item_id, quantity_remaining, cost, mrp, stocked_by, stocked_at, source_return_id)
            VALUES (?, ?, ?, ?, ?, ?, NOW(), ?)`,
            [
              original.gd_entry_id,
              original.item_id,
              toReturn,
              original.cost || 0,
              original.mrp || 0,
              req.user?.name || 'System',
              retInsert.insertId
            ]
          );
        }

        await conn.query(`
          UPDATE gd_items
          SET quantity = quantity + ?
          WHERE gd_entry_id = ? AND item_id = ?`,
          [toReturn, original.gd_entry_id, original.item_id]
        );
      }
    }

    // Update invoice totals
    await conn.query(`
      UPDATE sales_invoices
      SET total_refund = COALESCE(total_refund, 0) + ?,
          total_refund_tax = COALESCE(total_refund_tax, 0) + ?
      WHERE id = ?`,
      [totalRefund, totalTax, invoice_id]
    );

    // ⚖️ Apply refund toward unpaid invoices first (only for 'withholding')
    if (refund_method === 'withholding') {
      const totalCredit = totalRefund + totalTax;
      let creditRemaining = totalCredit;
    
      // Pay off unpaid invoices first
      const [unpaidInvoices] = await conn.query(`
        SELECT id, gross_total
        FROM sales_invoices
        WHERE customer_id = ? AND is_paid = 0
        ORDER BY created_at ASC
      `, [customer_id]);
    
      for (const inv of unpaidInvoices) {
        if (creditRemaining <= 0) break;
    
        const [[{ paidAmount = 0 }]] = await conn.query(`
          SELECT COALESCE(SUM(refund_amount + tax_reversal), 0) AS paidAmount
          FROM sales_returns
          WHERE invoice_id = ?
        `, [inv.id]);
    
        const unpaid = inv.gross_total - paidAmount;
    
        if (creditRemaining >= unpaid) {
          await conn.query(`UPDATE sales_invoices SET is_paid = 1 WHERE id = ?`, [inv.id]);
          creditRemaining -= unpaid;
        } else {
          creditRemaining = 0;
        }
      }
    
      // 👇 THIS NEEDS FIX
      if (creditRemaining > 0) {
        const [[cust]] = await conn.query(
          `SELECT balance FROM customer_balances WHERE customer_id = ?`, [customer_id]
        );
    
        const bal = parseFloat(cust?.balance || 0);
        const adjustment = Math.min(bal, creditRemaining);
    
        if (adjustment > 0) {
          // Reduce existing balance
          await conn.query(`
            UPDATE customers SET balance = balance - ? WHERE id = ?
          `, [adjustment, customer_id]);
    
          creditRemaining -= adjustment;
        }
    
        if (creditRemaining > 0) {
          // Only then add to credit (we owe)
          await conn.query(`
            UPDATE customers SET balance = balance + ? WHERE id = ?
          `, [creditRemaining, customer_id]);
        }
      }
    }
    
    // Check if invoice fully refunded
    const [allItems] = await conn.query(
      `SELECT quantity_sold, quantity_returned 
       FROM sales_invoice_items WHERE invoice_id = ?`,
      [invoice_id]
    );
    const fullyReturned = allItems.every(i => Number(i.quantity_returned) >= Number(i.quantity_sold));

    if (fullyReturned) {
      await conn.query(
        `UPDATE sales_invoices SET fully_refunded = 1 WHERE id = ?`,
        [invoice_id]
      );
    }

    await conn.commit();

    res.json({
      message: 'Return processed successfully',
      refundAmount: totalRefund,
      refundTax: totalTax,
      fullyReturned,
      refundMethod: refund_method
    });

  } catch (err) {
    await conn.rollback();
    console.error('❌ Return error:', err);
    res.status(500).json({ error: err.message || 'Return failed' });
  } finally {
    conn.release();
  }
};








// POST /api/sales/returns/validate
exports.validateReturnRestocks = async (req, res) => {
  const { invoice_number, items } = req.body;
  const conn = await db.getConnection();
  try {
    const [[invoice]] = await conn.query(
      `SELECT id FROM sales_invoices WHERE invoice_number = ?`,
      [invoice_number]
    );
    if (!invoice) throw new Error("Invoice not found");

    const missingGds = [];

    for (const it of items) {
      const { item_id, quantity_returned, restock } = it;
      if (!restock || quantity_returned <= 0) continue;

      const [[info]] = await conn.query(
        `SELECT sii.gd_entry_id, gi.hs_code
         FROM sales_invoice_items sii
         JOIN gd_items gi ON gi.item_id = sii.item_id
         WHERE sii.invoice_id = ? AND sii.item_id = ?`,
        [invoice.id, item_id]
      );

      if (!info) continue;

      const [[gdExists]] = await conn.query(
        `SELECT COUNT(*) AS found FROM gd_entries WHERE id = ?`,
        [info.gd_entry_id]
      );

      if (!gdExists.found) {
        // Try to find alternate GDs with same HS code
        const [alternates] = await conn.query(
          `SELECT ge.id, ge.declaration_number
           FROM gd_items gi
           JOIN gd_entries ge ON ge.id = gi.gd_entry_id
           WHERE gi.hs_code = ?`,
          [info.hs_code]
        );

        missingGds.push({
          item_id,
          hs_code: info.hs_code,
          gd_options: alternates
        });
      }
    }

    if (missingGds.length) {
      return res.status(200).json({ missingGds });
    }

    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  } finally {
    conn.release();
  }
};

  

// returns up to 10 invoices that still have >0 units left to return
exports.getInvoiceSuggestions = async (req, res) => {
  try {
    const q = (req.query.q || '').trim();
    if (!q) return res.json([]);

    const sql = `
      SELECT t.invoice_number, t.customer_name
      FROM (
        SELECT 
          i.id,
          i.invoice_number,
          c.name AS customer_name,
          SUM(sii.quantity_sold)               AS total_sold,
          COALESCE(SUM(r.quantity_returned),0)  AS total_returned
        FROM sales_invoices i
        JOIN customers c            ON c.id = i.customer_id
        JOIN sales_invoice_items sii ON sii.invoice_id = i.id
        LEFT JOIN sales_returns r   ON r.invoice_id = i.id
        GROUP BY i.id
      ) AS t
      WHERE (t.invoice_number LIKE ? OR t.customer_name LIKE ?)
        AND (t.total_sold - t.total_returned) > 0
      ORDER BY t.id DESC
      LIMIT 10
    `;
    const like = `%${q}%`;
    const [rows] = await db.query(sql, [like, like]);

    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch suggestions' });
  }
};
   


  