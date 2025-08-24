// server/controllers/paymentsController.js
const dbx = require('../config/db'); // { db, get, all, run }
const { db } = dbx;           // raw better-sqlite3 Database for transactions

// POST /api/payments
// Body: { date, type: 'received'|'paid', payment_for: 'customer'|'invoice',
//         customer_id?, invoice_id?, amount, mode: 'cash'|'bank', bank_id?, bank_name?, remarks? }
// Multer provides req.file (optional); we store /uploads/payments/<filename>
exports.createPayment = (req, res) => {
  // Basic input parsing/validation (same as your original)
  const {
    date,
    type,              // 'received' | 'paid'
    payment_for,       // 'customer' | 'invoice'
    customer_id,
    invoice_id,        // invoice_number if payment_for==='invoice'
    amount,
    mode,              // 'cash' | 'bank'
    bank_id,
    bank_name,
    remarks
  } = req.body;

  const numericAmount = parseFloat(amount);
  if (isNaN(numericAmount) || numericAmount <= 0) {
    return res.status(400).json({ error: 'Invalid payment amount' });
  }
  if (!['received', 'paid'].includes(type)) {
    return res.status(400).json({ error: 'Invalid payment type' });
  }
  if (!['cash', 'bank'].includes(mode)) {
    return res.status(400).json({ error: 'Invalid payment mode' });
  }
  if (mode === 'bank' && !bank_id) {
    return res.status(400).json({ error: 'bank_id is required for bank payments' });
  }

  // Receipt path written by multer (if any)
  let receiptPath = null;
  if (req.file && req.file.filename) {
    receiptPath = `/uploads/payments/${req.file.filename}`;
  }

  // Prepare transaction
  const txn = db.transaction((payload) => {
    const {
      date, type, payment_for, customer_id, invoice_id, numericAmount,
      mode, bank_id, bank_name, remarks, receiptPath
    } = payload;

    // 1) Insert into payments
    const stInsertPayment = db.prepare(`
      INSERT INTO payments (
        date, type, payment_for, customer_id, invoice_id,
        amount, mode, bank_id, remarks, receipt_path
      ) VALUES (
        @date, @type, @payment_for, @customer_id, @invoice_id,
        @amount, @mode, @bank_id, @remarks, @receipt_path
      )
    `);

    const infoPay = stInsertPayment.run({
      date,
      type,
      payment_for,
      customer_id: customer_id ? Number(customer_id) : null,
      // store invoice_number when payment_for === 'invoice'; else NULL
      invoice_id: payment_for === 'invoice' ? (invoice_id || null) : null,
      amount: numericAmount,
      mode,
      bank_id: mode === 'bank' ? (bank_id ? Number(bank_id) : null) : null,
      remarks: remarks || '',
      receipt_path: receiptPath
    });

    const paymentId = infoPay.lastInsertRowid;

    // 2) If paying a specific invoice → mark paid and store metadata
    if (payment_for === 'invoice' && invoice_id) {
      db.prepare(`
        UPDATE sales_invoices
           SET is_paid = 1,
               paid_bank = @paid_bank,
               paid_by = @paid_by,
               paid_date = @paid_date,
               paid_receipt_path = @receipt_path
         WHERE invoice_number = @invoice_number
      `).run({
        paid_bank: bank_name || (mode === 'bank' ? 'Bank' : 'Cash'),
        paid_by: remarks || 'Manual entry',
        paid_date: date,
        receipt_path: receiptPath,
        invoice_number: invoice_id
      });
    }

    // 3) If paying for a customer → allocate FIFO across unpaid invoices
    if (payment_for === 'customer' && customer_id) {
      const unpaidInvoices = dbx.all(
        `
        SELECT
          si.id,
          si.gross_total,
          COALESCE((
            SELECT SUM(pa.amount)
              FROM payment_allocations pa
             WHERE pa.invoice_id = si.id
          ), 0) AS already_allocated
        FROM sales_invoices si
        WHERE si.customer_id = @cid AND si.is_paid = 0
        ORDER BY si.created_at ASC
        `,
        { cid: Number(customer_id) }
      );

      let remaining = numericAmount;

      const stAlloc = db.prepare(`
        INSERT INTO payment_allocations (payment_id, invoice_id, amount)
        VALUES (@payment_id, @invoice_id, @amount)
      `);
      const stMarkPaid = db.prepare(`UPDATE sales_invoices SET is_paid = 1 WHERE id = @id`);

      for (const inv of unpaidInvoices) {
        if (remaining <= 0) break;

        const due = Number(inv.gross_total || 0) - Number(inv.already_allocated || 0);
        if (due <= 0) continue;

        if (remaining >= due) {
          stAlloc.run({ payment_id: paymentId, invoice_id: inv.id, amount: due });
          stMarkPaid.run({ id: inv.id });
          remaining -= due;
        } else {
          stAlloc.run({ payment_id: paymentId, invoice_id: inv.id, amount: remaining });
          remaining = 0;
          break;
        }
      }
    }

    // 4) Bank balance sync (if mode === 'bank')
    if (mode === 'bank' && bank_id) {
      const delta = type === 'received' ? numericAmount : -numericAmount;
      db.prepare(`UPDATE banks SET balance = balance + @delta WHERE id = @id`)
        .run({ delta, id: Number(bank_id) });
    }

    return { paymentId };
  });

  try {
    const { paymentId } = txn({
      date,
      type,
      payment_for,
      customer_id,
      invoice_id,
      numericAmount,
      mode,
      bank_id,
      bank_name,
      remarks,
      receiptPath
    });

    res.status(201).json({
      message: '✅ Payment recorded and processed',
      payment_id: paymentId,
      receipt_path: receiptPath
    });
  } catch (err) {
    console.error('❌ Payment Error:', err);
    res.status(500).json({ error: 'Failed to record payment' });
  }
};
