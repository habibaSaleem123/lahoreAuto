const db = require('../config/db');

exports.createGdEntry = async (entryData) => {
  const [result] = await db.query(`
    INSERT INTO gd_entries (
      gd_number, gd_date, supplier_name, invoice_value, freight, insurance,
      clearing_charges, port_charges, gross_weight, net_weight, number_of_packages,
      container_no, vessel_name, port_of_loading, port_of_discharge, delivery_terms,
      bl_awb_no, exchange_rate, invoice_currency, assessed_value, payment_mode,
      psid_no, bank_name, total_gd_amount, challan_no
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      entryData.gd_number, entryData.gd_date, entryData.supplier_name,
      entryData.invoice_value, entryData.freight, entryData.insurance,
      entryData.clearing_charges, entryData.port_charges, entryData.gross_weight,
      entryData.net_weight, entryData.number_of_packages, entryData.container_no,
      entryData.vessel_name, entryData.port_of_loading, entryData.port_of_discharge,
      entryData.delivery_terms, entryData.bl_awb_no, entryData.exchange_rate,
      entryData.invoice_currency, entryData.assessed_value, entryData.payment_mode,
      entryData.psid_no, entryData.bank_name, entryData.total_gd_amount, entryData.challan_no
    ]);
  return result.insertId;
};
