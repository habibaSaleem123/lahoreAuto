const db = require('../config/db');

exports.createGdItems = async (items, gd_entry_id, charges = []) => {
  const totalOtherCharges = charges.reduce((sum, c) => sum + Number(c.charge_amount || 0), 0);
  const totalGrossWeight = items.reduce((sum, item) => sum + Number(item.gross_weight || 0), 0);

  const values = items.map(item => {
    let quantity = Number(item.quantity || 0);
    if (quantity === 0) quantity = 1;

    const grossWeight = Number(item.gross_weight || 0);
    const importPrice = Number(item.unit_price || 0);
    const customs = Number(item.custom_duty || 0) + Number(item.acd || 0) + Number(item.income_tax || 0);
    const perUnitDuty = customs / quantity;
    const otherCost = totalGrossWeight ? ((grossWeight * totalOtherCharges) / totalGrossWeight) / quantity : 0;

    const cost = importPrice + perUnitDuty + otherCost;

    const totalSalesTax = Number(item.sales_tax || 0) + Number(item.gst || 0);
    const perUnitSalesTax = totalSalesTax / quantity;

    const retailPrice = perUnitSalesTax / 0.18;
    const mrp = retailPrice + perUnitSalesTax;
    const grossMargin = retailPrice - cost;

    const incomeTax = Number(item.income_tax || 0);
    const perUnitProfit = incomeTax / 0.35 / quantity;
    const salePrice = cost + perUnitProfit;

    return [
      gd_entry_id,
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
      cost,            // landed_cost
      retailPrice,
      perUnitSalesTax,
      mrp,
      cost,
      grossMargin,
      salePrice
    ];
  });

  await db.query(`
    INSERT INTO gd_items (
      gd_entry_id,
      item_id,
      item_number,
      description,
      hs_code,
      quantity,
      unit_price,
      total_value,
      total_custom_value,
      invoice_value,
      unit_cost,
      unit,
      gross_weight,
      custom_duty,
      sales_tax,
      gst,
      ast,
      income_tax,
      acd,
      regulatory_duty,
      landed_cost,
      retail_price,
      per_unit_sales_tax,
      mrp,
      cost,
      gross_margin,
      sale_price
    ) VALUES ?`, [values]);
};
