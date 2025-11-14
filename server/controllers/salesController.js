// server/controllers/salesController.js
const dbx = require('../config/db');    // { db, get, all, run }
const { db } = dbx;              // raw better-sqlite3 Database (for transactions)
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');
const ExcelJS = require('exceljs');

// Utility: expand IN list to named params
function expandIn(list, key = 'v') {
  const names = [];
  const params = {};
  list.forEach((v, i) => { const k = `${key}${i}`; names.push(`@${k}`); params[k] = v; });
  return { clause: names.join(', '), params };
}

/* ----------------------------------------------------------------------------
 * POST /api/sales/invoice
 * Body: {
 *   customer_id,
 *   items: [{ item_id, gd_entry_id, quantity, sale_rate, retail_price, unit }],
 *   withholding_rate,
 *   tax_section,
 *   gd_entry_id (legacy fallback)
 * }
 * -------------------------------------------------------------------------- */
exports.createInvoice = (req, res) => {
  const {
    customer_id,
    items,
    withholding_rate,
    tax_section,
    gd_entry_id: legacyGd
  } = req.body;

  try {
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'No items provided' });
    }

    const txn = db.transaction((payload) => {
      const { customer_id, items, withholding_rate, tax_section, legacyGd } = payload;

      const customer = dbx.get(`SELECT * FROM customers WHERE id = @id`, { id: Number(customer_id) });
      if (!customer) throw new Error('Customer not found');

      // Normalize GD ids on each item
      const gdSet = new Set();
      for (const it of items) {
        const useGd = it.gd_entry_id || legacyGd;
        if (!useGd) throw new Error('gd_entry_id missing on item and no legacy GD provided');
        it._gd = useGd;
        gdSet.add(useGd);
      }

      const invoiceNumber = uuidv4().slice(0, 8).toUpperCase();

      // Insert invoice shell (multi-GD → store NULL gd_entry_id)
      const infoInv = db.prepare(`
        INSERT INTO sales_invoices (
          invoice_number, customer_id, gd_entry_id,
          gross_total, withholding_tax, sales_tax,
          income_tax_paid, gross_profit, tax_section, filer_status, created_at
        ) VALUES (
          @invoice_number, @customer_id, NULL,
          0, 0, 0, 0, 0, @tax_section, @filer_status, datetime('now')
        )
      `).run({
        invoice_number: invoiceNumber,
        customer_id: Number(customer_id),
        tax_section: tax_section || null,
        filer_status: customer.filer_status || 'non-filer'
      });
      const invoice_db_id = infoInv.lastInsertRowid;

      let gross_total = 0;
      let total_sales_tax = 0;
      let total_cost = 0;

      const stBatches = db.prepare(`
        SELECT * FROM inventory
        WHERE item_id = @item_id AND gd_entry_id = @gd
        ORDER BY stocked_at ASC, id ASC
      `);
      const stUpdateInv = db.prepare(`UPDATE inventory SET quantity_remaining = @qr WHERE id = @id`);
      const stDeleteInv = db.prepare(`DELETE FROM inventory WHERE id = @id`);
      const stLog = db.prepare(`
        INSERT INTO inventory_log
          (item_id, gd_entry_id, action, quantity_changed, resulting_quantity, action_by, action_at)
        VALUES
          (@item_id, @gd_entry_id, 'sale', @delta, @resulting_quantity, @actor, datetime('now'))
      `);
      const stInsertLine = db.prepare(`
        INSERT INTO sales_invoice_items
          (invoice_id, item_id, gd_entry_id, quantity_sold, retail_price, sale_rate,
           cost, mrp, unit, gross_line_total)
        VALUES
          (@invoice_id, @item_id, @gd_entry_id, @quantity_sold, @retail_price, @sale_rate,
           @cost, @mrp, @unit, @gross_line_total)
      `);

      for (const item of items) {
        const { item_id, quantity, sale_rate, retail_price, unit } = item;
        const lineGd = item._gd;

        const qty = Number(quantity || 0);
        const rate = Number(sale_rate || 0);
        const retail = Number(retail_price || 0);
        if (qty <= 0) continue;

        const gross_line_total = qty * rate;
        gross_total += gross_line_total;
        total_sales_tax += qty * retail * 0.18;

        // FIFO within this GD
        let qtyToDeduct = qty;
        let totalItemCost = 0;

        const batches = stBatches.all({ item_id, gd: lineGd });
        for (const batch of batches) {
          if (qtyToDeduct <= 0) break;

          const deduct = Math.min(qtyToDeduct, Number(batch.quantity_remaining || 0));
          if (deduct <= 0) continue;

          const remaining = Number(batch.quantity_remaining || 0) - deduct;

          stUpdateInv.run({ qr: remaining, id: batch.id });
          stLog.run({
            item_id,
            gd_entry_id: lineGd,
            delta: -deduct,
            resulting_quantity: remaining,
            actor: customer.name || 'Unknown'
          });

          totalItemCost += deduct * Number(batch.cost || 0);
          qtyToDeduct -= deduct;

          if (remaining === 0) stDeleteInv.run({ id: batch.id });
        }

        if (qtyToDeduct > 0) {
          throw new Error(`Insufficient stock for item ${item_id} in GD ${lineGd}`);
        }

        const itemCostPerUnit = qty > 0 ? totalItemCost / qty : 0;
        total_cost += totalItemCost;

        stInsertLine.run({
          invoice_id: invoice_db_id,
          item_id,
          gd_entry_id: lineGd,
          quantity_sold: qty,
          retail_price: retail,
          sale_rate: rate,
          cost: itemCostPerUnit,
          mrp: retail,
          unit,
          gross_line_total
        });
      }

      // Sum income tax across all GDs
      const gdIds = [...gdSet];
      if (gdIds.length) {
        const { clause, params } = expandIn(gdIds, 'gd');
        const row = dbx.get(
          `SELECT COALESCE(SUM(income_tax), 0) AS total_income_tax
             FROM gd_items WHERE gd_entry_id IN (${clause})`,
          params
        );
        var income_tax_paid = Number(row?.total_income_tax || 0);
      } else {
        var income_tax_paid = 0;
      }

      const withholding_tax = gross_total * Number(withholding_rate || 0.01);
      const gross_profit = gross_total - total_cost;

      db.prepare(`
        UPDATE sales_invoices
           SET gross_total = @gross_total,
               sales_tax = @sales_tax,
               withholding_tax = @withholding_tax,
               gross_profit = @gross_profit,
               income_tax_paid = @income_tax_paid
         WHERE id = @id
      `).run({
        id: invoice_db_id,
        gross_total,
        sales_tax: total_sales_tax,
        withholding_tax,
        gross_profit,
        income_tax_paid
      });

      // Cleanup per-GD (if no inventory rows remain)
      const stRemain = db.prepare(`SELECT COUNT(*) AS remaining FROM inventory WHERE gd_entry_id = @gd`);
      const stDeleteGd = db.prepare(`DELETE FROM gd_entries WHERE id = @gd`);
      const stLogDel = db.prepare(`
        INSERT INTO gd_deletion_log (gd_entry_id, deleted_by, deleted_at)
        VALUES (@gd, @by, datetime('now'))
      `);

      for (const gdId of gdIds) {
        const remaining = Number(stRemain.get({ gd: gdId })?.remaining || 0);
        if (remaining === 0) {
          stDeleteGd.run({ gd: gdId });
          stLogDel.run({ gd: gdId, by: customer.name || 'System' });
        }
        // No stored procedures in SQLite → we omit CALL cleanup_gd_if_empty
      }

      return { invoiceNumber };
    });

    const { invoiceNumber } = txn({ customer_id, items, withholding_rate, tax_section, legacyGd });
    res.json({ message: 'Invoice created', invoice_number: invoiceNumber });
  } catch (err) {
    console.error('createInvoice error:', err);
    res.status(500).json({ error: err.message || 'Failed to create invoice' });
  }
};

/* ----------------------------------------------------------------------------
 * GET /api/sales/invoice/:id  (for printing/viewing)
 * -------------------------------------------------------------------------- */
exports.getInvoiceById = (req, res) => {
  try {
    const invoice = dbx.get(
      `
      SELECT i.*, c.name AS customer_name, c.business_name, c.filer_status
        FROM sales_invoices i
        JOIN customers c ON c.id = i.customer_id
       WHERE i.invoice_number = @num
      `,
      { num: req.params.id }
    );
    if (!invoice) return res.status(404).json({ error: 'Invoice not found' });

    const items = dbx.all(
      `
      SELECT sii.*, gi.description, gi.hs_code
        FROM sales_invoice_items sii
        JOIN gd_items gi ON gi.item_id = sii.item_id
       WHERE sii.invoice_id = @id
      `,
      { id: invoice.id }
    );

    res.json({ invoice, items });
  } catch (err) {
    console.error('getInvoiceById error:', err);
    res.status(500).json({ error: 'Failed to load invoice' });
  }
};

/* ----------------------------------------------------------------------------
 * GET /api/sales/invoices?search=&tax_section=&filer_status=&from_date=&to_date=&payment_status=
 * -------------------------------------------------------------------------- */
exports.getAllInvoices = (req, res) => {
  try {
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
    const p = {};

    if (search) {
      sql += ` AND (c.name LIKE @like OR i.invoice_number LIKE @like)`;
      p.like = `%${search}%`;
    }
    if (tax_section) {
      sql += ` AND i.tax_section = @tax_section`;
      p.tax_section = tax_section;
    }
    if (filer_status && filer_status !== 'all') {
      sql += ` AND i.filer_status = @filer_status`;
      p.filer_status = filer_status;
    }
    if (from_date) {
      sql += ` AND date(i.created_at) >= date(@from_date)`;
      p.from_date = from_date;
    }
    if (to_date) {
      sql += ` AND date(i.created_at) <= date(@to_date)`;
      p.to_date = to_date;
    }
    if (payment_status === 'paid') {
      sql += ` AND i.is_paid = 1`;
    } else if (payment_status === 'unpaid') {
      sql += ` AND i.is_paid = 0`;
    }

    sql += ` ORDER BY i.created_at DESC`;

    const rows = dbx.all(sql, p);
    res.json(rows);
  } catch (err) {
    console.error('getAllInvoices error:', err);
    res.status(500).json({ error: 'Failed to fetch invoices' });
  }
};

/* ----------------------------------------------------------------------------
 * DELETE /api/sales/invoice/:invoice_number
 * -------------------------------------------------------------------------- */
exports.deleteInvoice = (req, res) => {
  const { invoice_number } = req.params;
  try {
    const txn = db.transaction((invoice_number) => {
      const inv = dbx.get(`SELECT id FROM sales_invoices WHERE invoice_number = @n`, { n: invoice_number });
      if (!inv) throw new Error('Invoice not found');

      db.prepare(`DELETE FROM sales_returns WHERE invoice_id = @id`).run({ id: inv.id });
      db.prepare(`DELETE FROM sales_invoice_items WHERE invoice_id = @id`).run({ id: inv.id });
      db.prepare(`DELETE FROM sales_invoices WHERE id = @id`).run({ id: inv.id });
    });

    txn(invoice_number);
    res.json({ message: 'Invoice deleted successfully' });
  } catch (err) {
    console.error('❌ Error deleting invoice:', err);
    res.status(500).json({ error: 'Failed to delete invoice' });
  }
};

/* ----------------------------------------------------------------------------
 * POST /api/sales/export/fbr
 * Body: { invoice_numbers: [...] }
 * Writes a temp .xlsm and downloads.
 * -------------------------------------------------------------------------- */
exports.exportInvoicesToFBR = async (req, res) => {
  const { invoice_numbers } = req.body;
  if (!invoice_numbers?.length) {
    return res.status(400).json({ error: 'No invoice numbers provided' });
  }

  try {
    const { clause, params } = expandIn(invoice_numbers, 'n');
    const rows = dbx.all(
      `
      SELECT i.*, c.name AS customer_name, c.business_name,
             sii.*, gi.hs_code, gi.description
        FROM sales_invoices i
        JOIN customers c        ON c.id = i.customer_id
        JOIN sales_invoice_items sii ON sii.invoice_id = i.id
        JOIN gd_items gi        ON gi.item_id = sii.item_id
       WHERE i.invoice_number IN (${clause})
      `,
      params
    );

    // Template + temp output
    const templatePath = path.join(__dirname, '../templates/Sales_Invoice_Template.xlsm');
    const tempExportPath = path.join(__dirname, '../tmp/fbr_export.xlsm');
    fs.mkdirSync(path.dirname(tempExportPath), { recursive: true });

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(templatePath);
    const sheet = workbook.worksheets[0];

    let rowNum = 2;
    for (const inv of rows) {
      sheet.getRow(rowNum).values = [
        inv.invoice_number,
        inv.customer_name,
        inv.business_name,
        inv.tax_section,
        inv.filer_status === 'filer' ? 'Filer' : 'Non-Filer',
        inv.hs_code,
        inv.description,
        inv.quantity_sold,
        inv.sale_rate,
        inv.retail_price,
        inv.sales_tax,
        inv.income_tax_paid,
        inv.withholding_tax,
        inv.gross_total
      ];
      rowNum++;
    }

    await workbook.xlsx.writeFile(tempExportPath);
    res.download(tempExportPath, 'FBR_Export.xlsm', () => {
      try { fs.unlinkSync(tempExportPath); } catch {}
    });
  } catch (err) {
    console.error('exportInvoicesToFBR error:', err);
    res.status(500).json({ error: 'Failed to export invoices' });
  }
};

/* ----------------------------------------------------------------------------
 * POST /api/sales/invoice/:invoice_number/mark-paid  (multer handles file)
 * -------------------------------------------------------------------------- */
exports.markInvoiceAsPaid = (req, res) => {
  const bank = req.body.bank_name;
  const payer = req.body.payer_name;
  const date = req.body.payment_date;
  const invoice_number = req.params.invoice_number;
  const file = req.file;

  try {
    let paid_receipt_path = null;
    if (file) paid_receipt_path = `/uploads/receipts/${file.filename}`;

    const info = db.prepare(
      `
      UPDATE sales_invoices
         SET is_paid = 1,
             paid_bank = @bank,
             paid_by = @payer,
             paid_date = @date,
             paid_receipt_path = @path
       WHERE invoice_number = @num
      `
    ).run({ bank, payer, date, path: paid_receipt_path, num: invoice_number });

    if (info.changes === 0) {
      if (file) { try { fs.unlinkSync(file.path); } catch {} }
      return res.status(404).json({ error: 'Invoice not found' });
    }

    res.json({ message: 'Invoice marked as paid', paid_receipt_path });
  } catch (err) {
    if (file) { try { fs.unlinkSync(file.path); } catch {} }
    console.error('❌ Mark paid error:', err);
    res.status(500).json({ error: 'Failed to mark invoice as paid' });
  }
};

/* ----------------------------------------------------------------------------
 * GET /api/sales/invoice/:invoice_number/returns
 * -------------------------------------------------------------------------- */
exports.getReturnsByInvoice = (req, res) => {
  try {
    const { invoice_number } = req.params;
    const inv = dbx.get(
      `SELECT id FROM sales_invoices WHERE invoice_number = @n`,
      { n: invoice_number }
    );
    if (!inv) return res.status(404).json({ error: 'Invoice not found' });

    const rows = dbx.all(
      `SELECT * FROM sales_returns WHERE invoice_id = @id ORDER BY created_at DESC`,
      { id: inv.id }
    );
    res.json(rows);
  } catch (err) {
    console.error('getReturnsByInvoice error:', err);
    res.status(500).json({ error: err.message });
  }
};

/* ----------------------------------------------------------------------------
 * POST /api/sales/returns
 * Body: { invoice_number, items: [{ invoice_item_id, quantity_returned, reason, restock }], refund_method }
 * refund_method: 'cash' | 'withholding'
 * -------------------------------------------------------------------------- */
exports.createReturn = (req, res) => {
  const { invoice_number, items, refund_method } = req.body;

  try {
    const txn = db.transaction(({ invoice_number, items, refund_method }) => {
      const invoice = dbx.get(
        `SELECT id, customer_id FROM sales_invoices WHERE invoice_number = @n`,
        { n: invoice_number }
      );
      if (!invoice) throw new Error('Invoice not found');

      const invoice_id = invoice.id;
      const customer_id = invoice.customer_id;

      let totalRefund = 0;
      let totalTax = 0;

      const stGetLine = db.prepare(`
        SELECT sii.*, gi.hs_code
          FROM sales_invoice_items sii
          JOIN gd_items gi ON gi.item_id = sii.item_id
         WHERE sii.id = @id
      `);
      const stUpdateLineReturned = db.prepare(`
        UPDATE sales_invoice_items
           SET quantity_returned = COALESCE(quantity_returned,0) + @add
         WHERE id = @id
      `);
      const stInsertReturn = db.prepare(`
        INSERT INTO sales_returns
          (return_number, invoice_id, invoice_item_id, item_id,
           quantity_returned, reason, restock, refund_amount, tax_reversal, refund_method, created_at)
        VALUES
          (@return_number, @invoice_id, @invoice_item_id, @item_id,
           @quantity_returned, @reason, @restock, @refund_amount, @tax_reversal, @refund_method, datetime('now'))
      `);

      // inventory helpers
      const stFindBatch = db.prepare(`
        SELECT id, quantity_remaining
          FROM inventory
         WHERE gd_entry_id = @gd AND item_id = @item
         ORDER BY stocked_at ASC, id ASC
         LIMIT 1
      `);
      const stUpdateBatch = db.prepare(`
        UPDATE inventory
           SET quantity_remaining = @qr, last_updated = datetime('now')
         WHERE id = @id
      `);
      const stInsertBatch = db.prepare(`
        INSERT INTO inventory
          (gd_entry_id, item_id, quantity_remaining, cost, mrp, stocked_by, stocked_at, source_return_id)
        VALUES
          (@gd, @item, @qty, @cost, @mrp, @by, datetime('now'), @ret_id)
      `);
      const stLogInv = db.prepare(`
        INSERT INTO inventory_log
          (item_id, gd_entry_id, action, quantity_changed, resulting_quantity, action_by, action_at)
        VALUES
          (@item, @gd, @action, @delta, @resulting, @by, datetime('now'))
      `);
      const stUpdateGdItemsQty = db.prepare(`
        UPDATE gd_items
           SET quantity = quantity + @q
         WHERE gd_entry_id = @gd AND item_id = @item
      `);

      for (const item of items) {
        const { invoice_item_id, quantity_returned, reason, restock } = item;
        const toReturn = Number(quantity_returned || 0);
        if (toReturn <= 0) continue;

        const original = stGetLine.get({ id: Number(invoice_item_id) });
        if (!original) throw new Error('Invoice item not found');

        const soldQty = Number(original.quantity_sold || 0);
        const returnedQty = Number(original.quantity_returned || 0);
        if (returnedQty + toReturn > soldQty) {
          throw new Error(`Return exceeds sold quantity. Already returned ${returnedQty}`);
        }

        const refundAmount = toReturn * Number(original.sale_rate || 0);
        const taxReversal = toReturn * Number(original.retail_price || 0) * 0.18;
        const return_number = `RET-${Math.floor(100000 + Math.random() * 900000)}`;

        stInsertReturn.run({
          return_number,
          invoice_id,
          invoice_item_id: Number(invoice_item_id),
          item_id: original.item_id,
          quantity_returned: toReturn,
          reason: reason || 'N/A',
          restock: restock ? 1 : 0,
          refund_amount: refundAmount,
          tax_reversal: taxReversal,
          refund_method
        });

        stUpdateLineReturned.run({ add: toReturn, id: Number(invoice_item_id) });

        totalRefund += refundAmount;
        totalTax += taxReversal;

        if (restock) {
          const batch = stFindBatch.get({ gd: original.gd_entry_id, item: original.item_id });
          if (batch) {
            const newQty = Number(batch.quantity_remaining || 0) + toReturn;
            stUpdateBatch.run({ qr: newQty, id: batch.id });
            stLogInv.run({
              item: original.item_id,
              gd: original.gd_entry_id,
              action: 'restock-merge',
              delta: toReturn,
              resulting: newQty,
              by: 'System'
            });
          } else {
            // Insert a new batch for the return
            const info = stInsertBatch.run({
              gd: original.gd_entry_id,
              item: original.item_id,
              qty: toReturn,
              cost: Number(original.cost || 0),
              mrp: Number(original.mrp || 0),
              by: 'System',
              ret_id: null
            });
            stLogInv.run({
              item: original.item_id,
              gd: original.gd_entry_id,
              action: 'restock-new',
              delta: toReturn,
              resulting: toReturn,
              by: 'System'
            });
          }
          stUpdateGdItemsQty.run({ q: toReturn, gd: original.gd_entry_id, item: original.item_id });
        }
      }

      // Update invoice totals
      db.prepare(`
        UPDATE sales_invoices
           SET total_refund = COALESCE(total_refund,0) + @r,
               total_refund_tax = COALESCE(total_refund_tax,0) + @t
         WHERE id = @id
      `).run({ r: totalRefund, t: totalTax, id: invoice_id });

      // Withholding: apply credit to oldest unpaid invoices for customer
      if (refund_method === 'withholding') {
        let creditRemaining = totalRefund + totalTax;

        const unpaid = dbx.all(
          `
          SELECT id, gross_total
            FROM sales_invoices
           WHERE customer_id = @cid AND is_paid = 0
           ORDER BY created_at ASC
          `,
          { cid: customer_id }
        );

        for (const inv of unpaid) {
          if (creditRemaining <= 0) break;

          const paidAmt = dbx.get(
            `
            SELECT COALESCE(SUM(refund_amount + tax_reversal), 0) AS paidAmount
              FROM sales_returns
             WHERE invoice_id = @id
            `,
            { id: inv.id }
          )?.paidAmount || 0;

          const unpaidAmt = Number(inv.gross_total || 0) - Number(paidAmt || 0);

          if (unpaidAmt <= 0) continue;

          if (creditRemaining >= unpaidAmt) {
            db.prepare(`UPDATE sales_invoices SET is_paid = 1 WHERE id = @id`).run({ id: inv.id });
            creditRemaining -= unpaidAmt;
          } else {
            creditRemaining = 0;
            break;
          }
        }

        // NOTE: Your previous MySQL code tried to adjust customers.balance.
        // If you truly maintain a running balance in SQLite, implement the same here.
        // For now we omit it (to avoid double-accounting) unless you confirm the schema.
      }

      // Mark fully refunded if every line returned fully
      const lines = dbx.all(
        `SELECT quantity_sold, COALESCE(quantity_returned,0) AS qr FROM sales_invoice_items WHERE invoice_id = @id`,
        { id: invoice_id }
      );
      const fullyReturned = lines.length > 0 && lines.every(i => Number(i.qr) >= Number(i.quantity_sold || 0));
      if (fullyReturned) {
        db.prepare(`UPDATE sales_invoices SET fully_refunded = 1 WHERE id = @id`).run({ id: invoice_id });
      }

      return { totalRefund, totalTax, fullyReturned, refund_method };
    });

    const result = txn({ invoice_number, items, refund_method });
    res.json({
      message: 'Return processed successfully',
      refundAmount: result.totalRefund,
      refundTax: result.totalTax,
      fullyReturned: result.fullyReturned,
      refundMethod: result.refund_method
    });
  } catch (err) {
    console.error('❌ Return error:', err);
    res.status(500).json({ error: err.message || 'Return failed' });
  }
};

/* ----------------------------------------------------------------------------
 * POST /api/sales/returns/validate
 * -------------------------------------------------------------------------- */
exports.validateReturnRestocks = (req, res) => {
  const { invoice_number, items } = req.body;

  try {
    const inv = dbx.get(
      `SELECT id FROM sales_invoices WHERE invoice_number = @n`,
      { n: invoice_number }
    );
    if (!inv) throw new Error('Invoice not found');

    const missingGds = [];

    for (const it of items || []) {
      const { item_id, quantity_returned, restock } = it || {};
      if (!restock || Number(quantity_returned || 0) <= 0) continue;

      const info = dbx.get(
        `
        SELECT sii.gd_entry_id, gi.hs_code
          FROM sales_invoice_items sii
          JOIN gd_items gi ON gi.item_id = sii.item_id
         WHERE sii.invoice_id = @inv AND sii.item_id = @item
        `,
        { inv: inv.id, item: item_id }
      );
      if (!info) continue;

      const gdExists = dbx.get(`SELECT COUNT(*) AS found FROM gd_entries WHERE id = @id`, { id: info.gd_entry_id })?.found || 0;
      if (!gdExists) {
        const alternates = dbx.all(
          `
          SELECT ge.id, ge.declaration_number
            FROM gd_items gi
            JOIN gd_entries ge ON ge.id = gi.gd_entry_id
           WHERE gi.hs_code = @hs
          `,
          { hs: info.hs_code }
        );
        missingGds.push({ item_id, hs_code: info.hs_code, gd_options: alternates });
      }
    }

    if (missingGds.length) return res.status(200).json({ missingGds });
    res.json({ ok: true });
  } catch (err) {
    console.error('validateReturnRestocks error:', err);
    res.status(500).json({ error: err.message });
  }
};

/* ----------------------------------------------------------------------------
 * GET /api/sales/invoices/suggest?q=...
 * Returns up to 10 invoices that still have >0 units left to return
 * -------------------------------------------------------------------------- */
exports.getInvoiceSuggestions = (req, res) => {
  try {
    const q = (req.query.q || '').trim();
    if (!q) return res.json([]);

    const like = `%${q}%`;
    const rows = dbx.all(
      `
      SELECT t.invoice_number, t.customer_name
      FROM (
        SELECT 
          i.id,
          i.invoice_number,
          c.name AS customer_name,
          SUM(sii.quantity_sold)                AS total_sold,
          COALESCE(SUM(r.quantity_returned),0)  AS total_returned
        FROM sales_invoices i
        JOIN customers c             ON c.id = i.customer_id
        JOIN sales_invoice_items sii ON sii.invoice_id = i.id
        LEFT JOIN sales_returns r    ON r.invoice_id = i.id
        GROUP BY i.id
      ) AS t
      WHERE (t.invoice_number LIKE @like OR t.customer_name LIKE @like)
        AND (t.total_sold - t.total_returned) > 0
      ORDER BY t.id DESC
      LIMIT 10
      `,
      { like }
    );

    res.json(rows);
  } catch (err) {
    console.error('getInvoiceSuggestions error:', err);
    res.status(500).json({ error: 'Failed to fetch suggestions' });
  }
};
