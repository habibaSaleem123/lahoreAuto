const GdEntry = require('../models/gdEntryModel');
const GdItem = require('../models/itemModel');
const db = require('../config/db');

const TAX_RATE = 0.35;

function computeTotalSalesTax(item) {
  return ['sales_tax', 'gst', 'ast']
    .reduce((sum, key) => sum + Number(item[key] || 0), 0);
}

// Create GD Entry
exports.createGD = async (req, res) => {
  const conn = await db.getConnection();
  await conn.beginTransaction();

  try {
    const { header, items, charges } = req.body;

    const [gdResult] = await conn.query(`
      INSERT INTO gd_entries (
        gd_number, gd_date, supplier_name, invoice_value, freight, insurance,
        clearing_charges, port_charges, gross_weight, net_weight, number_of_packages,
        container_no, vessel_name, port_of_loading, port_of_discharge, delivery_terms,
        bl_awb_no, exchange_rate, invoice_currency, assessed_value, payment_mode,
        psid_no, bank_name, total_gd_amount, challan_no, landed_cost
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        header.gd_number, header.gd_date, header.supplier_name, header.invoice_value,
        header.freight, header.insurance, header.clearing_charges, header.port_charges,
        header.gross_weight, header.net_weight, header.number_of_packages,
        header.container_no, header.vessel_name, header.port_of_loading,
        header.port_of_discharge, header.delivery_terms, header.bl_awb_no,
        header.exchange_rate, header.invoice_currency, header.assessed_value,
        header.payment_mode, header.psid_no, header.bank_name, header.total_gd_amount,
        header.challan_no, 0
      ]
    );

    const gdId = gdResult.insertId;

    if (charges?.length > 0) {
      const chargeValues = charges.map(c => [gdId, c.charge_type, c.charge_amount]);
      await conn.query(
        'INSERT INTO gd_charges (gd_entry_id, charge_type, charge_amount) VALUES ?', [chargeValues]
      );
    }

    const totalOtherCharges = charges.reduce((sum, c) => sum + Number(c.charge_amount || 0), 0);
    const totalGrossWeight = items.reduce((sum, item) => sum + Number(item.gross_weight || 0), 0);

    const updatedItems = items.map((item, index) => {
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
      const perUnitProfit = (incomeTax / TAX_RATE) / quantity;
      const salePrice = cost + perUnitProfit;

      const item_number = `${header.gd_number.replace(/\s+/g, '')}-${item.hs_code}`;
      const item_id = `${header.gd_number.replace(/\s+/g, '')}-${item.hs_code}-${index + 1}`;

      return {
        ...item,
        item_number,
        item_id,
        landed_cost: cost,
        retail_price: retailPrice,
        per_unit_sales_tax: perUnitSalesTax,
        mrp,
        cost,
        gross_margin: grossMargin,
        sale_price: salePrice
      };
    });

    const itemValues = updatedItems.map(item => [
      gdId,
      item.item_id,
      item.item_number,
      item.description,
      item.hs_code,
      item.quantity,
      item.unit_price,
      item.total_value,
      item.total_custom_value,
      item.invoice_value,
      item.unit_cost,
      item.unit,
      item.gross_weight,
      item.custom_duty,
      item.sales_tax,
      item.gst,
      item.ast,
      item.income_tax,
      item.acd,
      item.regulatory_duty,
      item.landed_cost,
      item.retail_price,
      item.per_unit_sales_tax,
      item.mrp,
      item.cost,
      item.gross_margin,
      item.sale_price
    ]);

    await conn.query(`
      INSERT INTO gd_items (
        gd_entry_id, item_id, item_number, description, hs_code, quantity,
        unit_price, total_value, total_custom_value, invoice_value, unit_cost,
        unit, gross_weight, custom_duty, sales_tax, gst, ast, income_tax,
        acd, regulatory_duty, landed_cost, retail_price,
        per_unit_sales_tax, mrp, cost, gross_margin, sale_price
      ) VALUES ?`, [itemValues]);

    const totalLanded = updatedItems.reduce((sum, item) => sum + item.landed_cost * item.quantity, 0);
    const totalQty = updatedItems.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
    const avgLandedCost = totalQty ? (totalLanded / totalQty) : 0;

    await conn.query('UPDATE gd_entries SET landed_cost = ? WHERE id = ?', [avgLandedCost, gdId]);

    await conn.commit();
    res.status(201).json({ message: 'GD Entry Created', gdId, landed_cost: avgLandedCost });

  } catch (err) {
    await conn.rollback();
    console.error(err);
    res.status(500).json({ error: 'Failed to create GD entry', details: err.message });
  } finally {
    conn.release();
  }
};

// Update GD Items
exports.updateGdItems = async (req, res) => {
  const { id } = req.params;
  const { items } = req.body;

  const conn = await db.getConnection();
  await conn.beginTransaction();

  try {
    const [chargeRows] = await conn.query('SELECT charge_amount FROM gd_charges WHERE gd_entry_id = ?', [id]);
    const totalOtherCharges = chargeRows.reduce((sum, c) => sum + Number(c.charge_amount || 0), 0);
    const totalGrossWeight = items.reduce((sum, item) => sum + Number(item.gross_weight || 0), 0);

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
      const perUnitProfit = (incomeTax / TAX_RATE) / quantity;
      const salePrice = cost + perUnitProfit;

      await conn.query(`
        UPDATE gd_items SET 
          description = ?, hs_code = ?, quantity = ?, unit_price = ?, total_value = ?,
          total_custom_value = ?, invoice_value = ?, unit_cost = ?, unit = ?, gross_weight = ?,
          custom_duty = ?, sales_tax = ?, gst = ?, ast = ?, income_tax = ?, acd = ?,
          regulatory_duty = ?, landed_cost = ?, retail_price = ?, per_unit_sales_tax = ?,
          mrp = ?, cost = ?, gross_margin = ?, sale_price = ?
        WHERE gd_entry_id = ? AND item_id = ?`,
        [
          item.description, item.hs_code, item.quantity, item.unit_price, item.total_value,
          item.total_custom_value, item.invoice_value, item.unit_cost, item.unit, item.gross_weight,
          item.custom_duty, item.sales_tax, item.gst, item.ast, item.income_tax, item.acd,
          item.regulatory_duty, cost, retailPrice, perUnitSalesTax,
          mrp, cost, grossMargin, salePrice,
          id, item.item_id
        ]);
    }

    const [updatedItems] = await conn.query(
      'SELECT quantity, landed_cost FROM gd_items WHERE gd_entry_id = ?', [id]
    );

    const totalLanded = updatedItems.reduce((sum, item) => sum + item.landed_cost * item.quantity, 0);
    const totalQty = updatedItems.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
    const avgLandedCost = totalQty ? (totalLanded / totalQty) : 0;

    await conn.query('UPDATE gd_entries SET landed_cost = ? WHERE id = ?', [avgLandedCost, id]);

    await conn.commit();
    res.json({ message: 'Items updated', landed_cost: avgLandedCost });
  } catch (err) {
    await conn.rollback();
    console.error(err);
    res.status(500).json({ error: 'Failed to update items', details: err.message });
  } finally {
    conn.release();
  }
};

// Other functions unchanged
exports.getFilteredGds = async (req, res) => {
  const { gd_number, gd_date, supplier_name, hs_code } = req.query;

  let query = `
    SELECT DISTINCT g.id, g.gd_number, g.gd_date, g.supplier_name, g.landed_cost,
    (SELECT COUNT(*) FROM gd_items i WHERE i.gd_entry_id = g.id) AS item_count
    FROM gd_entries g
    LEFT JOIN gd_items i ON i.gd_entry_id = g.id
    WHERE 1=1
  `;

  const params = [];
  if (gd_number) {
    query += " AND g.gd_number LIKE ?";
    params.push(`%${gd_number}%`);
  }
  if (gd_date) {
    query += " AND g.gd_date = ?";
    params.push(gd_date);
  }
  if (supplier_name) {
    query += " AND g.supplier_name LIKE ?";
    params.push(`%${supplier_name}%`);
  }
  if (hs_code) {
    query += " AND i.hs_code LIKE ?";
    params.push(`%${hs_code}%`);
  }

  query += " ORDER BY g.gd_date DESC";

  try {
    const [rows] = await db.query(query, params);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error fetching filtered GD list' });
  }
};

exports.getGdDetails = async (req, res) => {
  const { id } = req.params;

  try {
    const [gdRows] = await db.query('SELECT * FROM gd_entries WHERE id = ?', [id]);
    if (gdRows.length === 0) {
      return res.status(404).json({ error: 'GD Entry not found' });
    }

    const [itemRows] = await db.query('SELECT * FROM gd_items WHERE gd_entry_id = ?', [id]);
    const [chargeRows] = await db.query('SELECT * FROM gd_charges WHERE gd_entry_id = ?', [id]);

    res.json({ gd: gdRows[0], items: itemRows, charges: chargeRows });
  } catch (err) {
    console.error('Error fetching GD details:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

exports.deleteItem = async (req, res) => {
  try {
    const code = req.query.code;
    const inUse = await GdItem.isItemInUse(code);
    if (inUse) return res.status(400).json({ error: 'Item is used in GD or sales and cannot be deleted.' });

    await GdItem.deleteItem(req.params.id);
    res.json({ message: 'Item deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete item' });
  }
};
// Add this if not already present
exports.getItemsByGd = async (req, res) => {
  try {
    const [items] = await db.query(`
      SELECT item_id, description, hs_code, unit, mrp AS retail_price, quantity_remaining
      FROM inventory
      WHERE gd_entry_id = ?`, [req.params.id]);
    res.json(items);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch GD items' });
  }
};
