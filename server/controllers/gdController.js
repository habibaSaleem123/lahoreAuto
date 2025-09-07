const dbx = require('../config/db'); // { db, get, all, run }
const { db } = dbx;                  // raw better-sqlite3 Database (for transactions)

const DEFAULT_TAX_RATE = 0.35;

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

// Sum sales-tax-like fields safely
function computeTotalSalesTax(item) {
  return ['sales_tax', 'gst', 'ast']
    .reduce((sum, key) => sum + Number(item[key] || 0), 0);
}

// Round to 2 decimals and keep it NUMBER (SQLite REAL), not string
const round2 = (v) => Math.round((Number(v || 0) + Number.EPSILON) * 100) / 100;

// Normalize numeric fields in a row to 2dp (helper for inserts/updates)
function to2dpRow(row, keys) {
  const out = { ...row };
  for (const k of keys) out[k] = round2(out[k]);
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// Create GD Entry (atomic)
// POST /api/gd-entry   (alias: /api/gd)
// Body: { header: {...}, items: [...], charges: [...], taxRate?: number }
// ─────────────────────────────────────────────────────────────────────────────
exports.createGD = (req, res) => {
  const { header, items = [], charges = [] } = req.body;
  const taxRate = Number(req.body?.taxRate ?? DEFAULT_TAX_RATE) || DEFAULT_TAX_RATE;

  const createTxn = db.transaction(({ header, items, charges, taxRate }) => {
    // 1) Insert gd_entries
    const stInsertGd = db.prepare(`
      INSERT INTO gd_entries (
        gd_number, gd_date, supplier_name, invoice_value, freight, insurance,
        clearing_charges, port_charges, gross_weight, net_weight, number_of_packages,
        container_no, vessel_name, port_of_loading, port_of_discharge, delivery_terms,
        bl_awb_no, exchange_rate, invoice_currency, assessed_value, payment_mode,
        psid_no, bank_name, total_gd_amount, challan_no, landed_cost
      ) VALUES (
        @gd_number, @gd_date, @supplier_name, @invoice_value, @freight, @insurance,
        @clearing_charges, @port_charges, @gross_weight, @net_weight, @number_of_packages,
        @container_no, @vessel_name, @port_of_loading, @port_of_discharge, @delivery_terms,
        @bl_awb_no, @exchange_rate, @invoice_currency, @assessed_value, @payment_mode,
        @psid_no, @bank_name, @total_gd_amount, @challan_no, 0
      )
    `);

    // Round numeric header fields we care about
    const header2 = to2dpRow(
      { ...header },
      [
        'invoice_value', 'freight', 'insurance', 'clearing_charges', 'port_charges',
        'gross_weight', 'net_weight', 'assessed_value', 'exchange_rate', 'total_gd_amount'
      ]
    );
    // Keep count-like integer fields intact
    if (header2.number_of_packages != null) {
      header2.number_of_packages = Number(header2.number_of_packages || 0);
    }

    const infoGd = stInsertGd.run(header2);
    const gdId = infoGd.lastInsertRowid;

    // 2) Insert charges (if any)
    if (charges && charges.length > 0) {
      const stCharge = db.prepare(`
        INSERT INTO gd_charges (gd_entry_id, charge_type, charge_amount)
        VALUES (@gd_entry_id, @charge_type, @charge_amount)
      `);
      const insertManyCharges = db.transaction((rows) => {
        for (const c of rows) stCharge.run(c);
      });
      insertManyCharges(charges.map(c => ({
        gd_entry_id: gdId,
        charge_type: c.charge_type,
        charge_amount: round2(c.charge_amount)
      })));
    }

    // 3) Compute derived item fields
    const totalOtherCharges = (charges || []).reduce((sum, c) => sum + Number(c.charge_amount || 0), 0);
    const totalGrossWeight = (items || []).reduce((sum, item) => sum + Number(item.gross_weight || 0), 0);

    const updatedItems = (items || []).map((item, index) => {
      let quantity = Number(item.quantity || 0);
      if (quantity === 0) quantity = 1;

      const grossWeight = Number(item.gross_weight || 0);
      const importPrice = Number(item.unit_price || 0);

      const customs = Number(item.custom_duty || 0) + Number(item.acd || 0) + Number(item.income_tax || 0);
      const perUnitDuty = customs / quantity;

      const otherCost = totalGrossWeight
        ? ((grossWeight * totalOtherCharges) / totalGrossWeight) / quantity
        : 0;

      const cost = importPrice + perUnitDuty + otherCost;

      const totalSalesTax = computeTotalSalesTax(item);
      const perUnitSalesTax = totalSalesTax / quantity;

      // Reverse out 18% tax slice: retailPrice is the pre-tax retail base
      const retailPrice = perUnitSalesTax / 0.18;
      const mrp = retailPrice + perUnitSalesTax;
      const grossMargin = retailPrice - cost;

      const incomeTax = Number(item.income_tax || 0);
      const perUnitProfit = (taxRate > 0 ? (incomeTax / taxRate) : 0) / quantity;
      let salePrice = cost + perUnitProfit;

      // ✅ Over-retail fallback: give retailer 10% of (retail - cost) margin
      if (salePrice > retailPrice) {
        salePrice = cost + 0.9 * (retailPrice - cost);
      }

      const item_number = `${String(header.gd_number || '').replace(/\s+/g, '')}-${item.hs_code}`;
      const item_id = `${String(header.gd_number || '').replace(/\s+/g, '')}-${item.hs_code}-${index + 1}`;

      // Round only at the end (before persistence)
      return {
        ...item,
        gd_entry_id: gdId,
        item_id,
        item_number,
        landed_cost: round2(cost),
        retail_price: round2(retailPrice),
        per_unit_sales_tax: round2(perUnitSalesTax),
        mrp: round2(mrp),
        cost: round2(cost),
        gross_margin: round2(grossMargin),
        sale_price: round2(salePrice),
      };
    });

    // 4) Insert gd_items (batch)
    if (updatedItems.length > 0) {
      const stItem = db.prepare(`
        INSERT INTO gd_items (
          gd_entry_id, item_id, item_number, description, hs_code, quantity,
          unit_price, total_value, total_custom_value, invoice_value, unit_cost,
          unit, gross_weight, custom_duty, sales_tax, gst, ast, income_tax,
          acd, regulatory_duty, landed_cost, retail_price,
          per_unit_sales_tax, mrp, cost, gross_margin, sale_price
        ) VALUES (
          @gd_entry_id, @item_id, @item_number, @description, @hs_code, @quantity,
          @unit_price, @total_value, @total_custom_value, @invoice_value, @unit_cost,
          @unit, @gross_weight, @custom_duty, @sales_tax, @gst, @ast, @income_tax,
          @acd, @regulatory_duty, @landed_cost, @retail_price,
          @per_unit_sales_tax, @mrp, @cost, @gross_margin, @sale_price
        )
      `);

      const insertManyItems = db.transaction((rows) => {
        for (const row of rows) {
          // Normalize numerics to two decimals (except quantity which should remain numeric/int)
          const numericKeys2dp = [
            'unit_price', 'total_value', 'total_custom_value', 'invoice_value', 'unit_cost',
            'gross_weight', 'custom_duty', 'sales_tax', 'gst', 'ast', 'income_tax', 'acd',
            'regulatory_duty', 'landed_cost', 'retail_price', 'per_unit_sales_tax', 'mrp',
            'cost', 'gross_margin', 'sale_price'
          ];
          const normalized = to2dpRow(row, numericKeys2dp);
          stItem.run({
            ...normalized,
            gd_entry_id: normalized.gd_entry_id,
            quantity: Number(row.quantity || 0),
          });
        }
      });

      insertManyItems(updatedItems);
    }

    // 5) Update gd_entries.landed_cost (average)
    const totalLanded = updatedItems.reduce((sum, it) => sum + Number(it.landed_cost || 0) * Number(it.quantity || 0), 0);
    const totalQty = updatedItems.reduce((sum, it) => sum + Number(it.quantity || 0), 0);
    const avgLandedCost = totalQty ? round2(totalLanded / totalQty) : 0;

    db.prepare(`UPDATE gd_entries SET landed_cost = @avg WHERE id = @id`)
      .run({ avg: avgLandedCost, id: gdId });

    return { gdId, avgLandedCost };
  });

  try {
    const result = createTxn({ header, items, charges, taxRate });
    res.status(201).json({ message: 'GD Entry Created', gdId: result.gdId, landed_cost: result.avgLandedCost });
  } catch (err) {
    console.error('createGD error:', err);
    res.status(500).json({ error: 'Failed to create GD entry', details: err.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Update GD Items (recompute costs & prices, then update avg landed)
// PUT /api/gd-items/:id
// Body: { items: [...], taxRate?: number }
// ─────────────────────────────────────────────────────────────────────────────
exports.updateGdItems = (req, res) => {
  const { id } = req.params;
  const { items = [] } = req.body;
  const taxRate = Number(req.body?.taxRate ?? DEFAULT_TAX_RATE) || DEFAULT_TAX_RATE;

  const updateTxn = db.transaction(({ id, items, taxRate }) => {
    const charges = dbx.all(
      'SELECT charge_amount FROM gd_charges WHERE gd_entry_id = @id',
      { id: Number(id) }
    );
    const totalOtherCharges = charges.reduce((sum, c) => sum + Number(c.charge_amount || 0), 0);
    const totalGrossWeight = items.reduce((sum, it) => sum + Number(it.gross_weight || 0), 0);

    const stUpdate = db.prepare(`
      UPDATE gd_items SET 
        description = @description, hs_code = @hs_code, quantity = @quantity, unit_price = @unit_price,
        total_value = @total_value, total_custom_value = @total_custom_value, invoice_value = @invoice_value,
        unit_cost = @unit_cost, unit = @unit, gross_weight = @gross_weight,
        custom_duty = @custom_duty, sales_tax = @sales_tax, gst = @gst, ast = @ast, income_tax = @income_tax, acd = @acd,
        regulatory_duty = @regulatory_duty, landed_cost = @landed_cost, retail_price = @retail_price,
        per_unit_sales_tax = @per_unit_sales_tax, mrp = @mrp, cost = @cost, gross_margin = @gross_margin, sale_price = @sale_price
      WHERE gd_entry_id = @gd_entry_id AND item_id = @item_id
    `);

    for (const item of items) {
      let quantity = Number(item.quantity || 0);
      if (quantity === 0) quantity = 1;

      const grossWeight = Number(item.gross_weight || 0);
      const importPrice = Number(item.unit_price || 0);
      const customs = Number(item.custom_duty || 0) + Number(item.acd || 0) + Number(item.income_tax || 0);
      const perUnitDuty = customs / quantity;
      const otherCost = totalGrossWeight ? ((grossWeight * totalOtherCharges) / totalGrossWeight) / quantity : 0;
      const cost = importPrice + perUnitDuty + otherCost;

      const totalSalesTax = computeTotalSalesTax(item);
      const perUnitSalesTax = totalSalesTax / quantity;

      const retailPrice = perUnitSalesTax / 0.18;
      const mrp = retailPrice + perUnitSalesTax;
      const grossMargin = retailPrice - cost;

      const incomeTax = Number(item.income_tax || 0);
      const perUnitProfit = (taxRate > 0 ? (incomeTax / taxRate) : 0) / quantity;
      let salePrice = cost + perUnitProfit;

      // ✅ Over-retail fallback: give retailer 10% of (retail - cost) margin
      if (salePrice > retailPrice) {
        salePrice = cost + 0.9 * (retailPrice - cost);
      }

      // Round only at the end (before persistence)
      stUpdate.run({
        gd_entry_id: Number(id),
        item_id: item.item_id,

        description: item.description,
        hs_code: item.hs_code,
        quantity: Number(item.quantity || 0),

        unit_price: round2(item.unit_price),
        total_value: round2(item.total_value),
        total_custom_value: round2(item.total_custom_value),
        invoice_value: round2(item.invoice_value),
        unit_cost: round2(item.unit_cost),

        unit: item.unit,
        gross_weight: round2(item.gross_weight),

        custom_duty: round2(item.custom_duty),
        sales_tax: round2(item.sales_tax),
        gst: round2(item.gst),
        ast: round2(item.ast),
        income_tax: round2(item.income_tax),
        acd: round2(item.acd),
        regulatory_duty: round2(item.regulatory_duty),

        landed_cost: round2(cost),
        retail_price: round2(retailPrice),
        per_unit_sales_tax: round2(perUnitSalesTax),
        mrp: round2(mrp),
        cost: round2(cost),
        gross_margin: round2(grossMargin),
        sale_price: round2(salePrice),
      });
    }

    const updated = dbx.all(
      'SELECT quantity, landed_cost FROM gd_items WHERE gd_entry_id = @id',
      { id: Number(id) }
    );

    const totalLanded = updated.reduce((sum, it) => sum + Number(it.landed_cost || 0) * Number(it.quantity || 0), 0);
    const totalQty = updated.reduce((sum, it) => sum + Number(it.quantity || 0), 0);
    const avgLandedCost = totalQty ? round2(totalLanded / totalQty) : 0;

    db.prepare('UPDATE gd_entries SET landed_cost = @avg WHERE id = @id')
      .run({ avg: avgLandedCost, id: Number(id) });

    return { avgLandedCost };
  });

  try {
    const result = updateTxn({ id, items, taxRate });
    res.json({ message: 'Items updated', landed_cost: result.avgLandedCost });
  } catch (err) {
    console.error('updateGdItems error:', err);
    res.status(500).json({ error: 'Failed to update items', details: err.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/gd/filter?gd_number=&gd_date=&supplier_name=&hs_code=
// (Note: exposed by routes as /api/gd-list and /api/gds)
// ─────────────────────────────────────────────────────────────────────────────
exports.getFilteredGds = (req, res) => {
  const { gd_number, gd_date, supplier_name, hs_code } = req.query;

  let sql = `
    SELECT DISTINCT
      g.id, g.gd_number, g.gd_date, g.supplier_name, g.landed_cost,
      (SELECT COUNT(*) FROM gd_items i2 WHERE i2.gd_entry_id = g.id) AS item_count
    FROM gd_entries g
    LEFT JOIN gd_items i ON i.gd_entry_id = g.id
    WHERE 1=1
  `;
  const params = {};

  if (gd_number) {
    sql += ` AND g.gd_number LIKE @gd_number`;
    params.gd_number = `%${gd_number}%`;
  }
  if (gd_date) {
    sql += ` AND g.gd_date = @gd_date`;
    params.gd_date = gd_date;
  }
  if (supplier_name) {
    sql += ` AND g.supplier_name LIKE @supplier_name`;
    params.supplier_name = `%${supplier_name}%`;
  }
  if (hs_code) {
    sql += ` AND i.hs_code LIKE @hs_code`;
    params.hs_code = `%${hs_code}%`;
  }

  sql += ` ORDER BY g.gd_date DESC`;

  try {
    const rows = dbx.all(sql, params);
    res.json(rows);
  } catch (err) {
    console.error('getFilteredGds error:', err);
    res.status(500).json({ error: 'Error fetching filtered GD list' });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
/** GET /api/gd-details/:id (details) */
// ─────────────────────────────────────────────────────────────────────────────
exports.getGdDetails = (req, res) => {
  const { id } = req.params;
  try {
    const gd = dbx.get('SELECT * FROM gd_entries WHERE id = @id', { id: Number(id) });
    if (!gd) return res.status(404).json({ error: 'GD Entry not found' });

    const items = dbx.all('SELECT * FROM gd_items WHERE gd_entry_id = @id', { id: Number(id) });
    const charges = dbx.all('SELECT * FROM gd_charges WHERE gd_entry_id = @id', { id: Number(id) });

    res.json({ gd, items, charges });
  } catch (err) {
    console.error('getGdDetails error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/gd/item/:id?code=XYZ   (safer: use item_id param directly)
// ─────────────────────────────────────────────────────────────────────────────
exports.deleteItem = (req, res) => {
  try {
    const itemId = req.params.id;          // expected to be gd_items.item_id
    const code = req.query.code || itemId; // fallback

    // Check if item is referenced elsewhere (inventory or sales lines)
    const inUseRow = dbx.get(
      `
      SELECT
        (SELECT COUNT(*) FROM inventory WHERE item_id = @code) +
        (SELECT COUNT(*) FROM sales_invoice_items WHERE item_id = @code)
        AS cnt
      `,
      { code }
    );
    if ((inUseRow?.cnt || 0) > 0) {
      return res.status(400).json({ error: 'Item is used in GD or sales and cannot be deleted.' });
    }

    const info = dbx.run('DELETE FROM gd_items WHERE item_id = @code', { code });
    if (info.changes === 0) {
      return res.status(404).json({ error: 'Item not found' });
    }
    res.json({ message: 'Item deleted' });
  } catch (err) {
    console.error('deleteItem error:', err);
    res.status(500).json({ error: 'Failed to delete item' });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/gds/:id/items (items usable for sales/inventory view)
// ─────────────────────────────────────────────────────────────────────────────
exports.getItemsByGd = (req, res) => {
  try {
    const id = Number(req.params.id);
    const rows = dbx.all(
      `
      SELECT 
        inv.item_id, 
        gi.description, 
        gi.hs_code, 
        gi.unit, 
        gi.mrp, 
        gi.retail_price,
        gi.sale_price, 
        inv.quantity_remaining
      FROM inventory inv
      JOIN gd_items gi ON gi.item_id = inv.item_id
      WHERE inv.gd_entry_id = @id
      `,
      { id }
    );
    res.json(rows);
  } catch (err) {
    console.error('❌ Failed to fetch GD items:', err);
    res.status(500).json({ error: 'Failed to fetch GD items' });
  }
};
