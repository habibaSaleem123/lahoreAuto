const db = require('../config/db');

exports.createCharges = async (charges, gd_entry_id) => {
  const values = charges
    .filter(charge =>
      charge.charge_type?.trim() !== '' &&
      charge.charge_amount !== '' &&
      !isNaN(charge.charge_amount)
    )
    .map(charge => [
      gd_entry_id,
      charge.charge_type.trim(),
      parseFloat(charge.charge_amount)
    ]);

  if (values.length === 0) return;

  await db.query(`
    INSERT INTO gd_charges (gd_entry_id, charge_type, charge_amount)
    VALUES ?`, [values]);
};

exports.getTotalCharges = async (gd_entry_id) => {
  const [rows] = await db.query(`
    SELECT SUM(charge_amount) as total FROM gd_charges WHERE gd_entry_id = ?`, [gd_entry_id]);
  return rows[0]?.total || 0;
};
