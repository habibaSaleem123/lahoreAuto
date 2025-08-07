const db = require('../config/db');
const fs = require('fs');
const path = require('path');

// POST /api/payments
exports.createPayment = async (req, res) => {
  const conn = await db.getConnection();
  try {
    const {
      date,
      type,
      payment_for,
      customer_id,
      invoice_id,
      amount,
      mode,
      bank_id,
      bank_name,
      remarks
    } = req.body;

    const numericAmount = parseFloat(amount);
    if (isNaN(numericAmount) || numericAmount <= 0) {
      return res.status(400).json({ error: 'Invalid payment amount' });
    }

    // ✅ Upload receipt
    let receiptPath = null;
    if (req.file) {
      const uploadDir = path.join(__dirname, '../uploads/receipts');
      if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

      const filename = Date.now() + '_' + req.file.originalname;
      const filepath = path.join(uploadDir, filename);
      fs.writeFileSync(filepath, req.file.buffer);
      receiptPath = `/uploads/receipts/${filename}`;
    }

    await conn.beginTransaction();

    // ✅ Insert payment
    const [result] = await conn.query(`
      INSERT INTO payments (
        date, type, payment_for, customer_id, invoice_id,
        amount, mode, bank_id, remarks, receipt_path
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        date,
        type,
        payment_for,
        customer_id || null,
        payment_for === 'invoice' ? invoice_id : null,
        numericAmount,
        mode,
        mode === 'bank' ? bank_id : null,
        remarks || '',
        receiptPath
      ]
    );

    const paymentId = result.insertId;

    if (payment_for === 'invoice') {
      // 🎯 Mark that specific invoice as paid
      await conn.query(`
        UPDATE sales_invoices
        SET is_paid = 1,
            paid_bank = ?,
            paid_by = ?,
            paid_date = ?,
            paid_receipt_path = ?
        WHERE invoice_number = ?`,
        [
          bank_name || 'Cash',
          remarks || 'Manual entry',
          date,
          receiptPath,
          invoice_id
        ]
      );

    } else if (payment_for === 'customer') {
      // 📌 Apply just this payment across unpaid invoices

      const [unpaidInvoices] = await conn.query(`
        SELECT id, gross_total,
        (SELECT COALESCE(SUM(amount), 0)
         FROM payment_allocations
         WHERE invoice_id = si.id) AS already_allocated
        FROM sales_invoices si
        WHERE customer_id = ? AND is_paid = 0
        ORDER BY created_at ASC
      `, [customer_id]);

      let allocRemaining = numericAmount;

      for (const inv of unpaidInvoices) {
        const due = inv.gross_total - inv.already_allocated;
        if (allocRemaining >= due) {
          await conn.query(`
            INSERT INTO payment_allocations (payment_id, invoice_id, amount)
            VALUES (?, ?, ?)`, [paymentId, inv.id, due]);

          await conn.query(`UPDATE sales_invoices SET is_paid = 1 WHERE id = ?`, [inv.id]);
          allocRemaining -= due;
        } else if (allocRemaining > 0) {
          await conn.query(`
            INSERT INTO payment_allocations (payment_id, invoice_id, amount)
            VALUES (?, ?, ?)`, [paymentId, inv.id, allocRemaining]);

          allocRemaining = 0;
          break;
        }
      }
    }

    await conn.commit();
    res.status(201).json({ message: '✅ Payment recorded and processed' });

  } catch (err) {
    await conn.rollback();
    console.error('❌ Payment Error:', err);
    res.status(500).json({ error: 'Failed to record payment' });
  } finally {
    conn.release();
  }
};


