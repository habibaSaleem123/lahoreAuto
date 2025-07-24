const mysql = require('mysql2/promise');

const db = mysql.createPool({
  host: '100.79.155.103',  // ✅ Tailscale IP of the MySQL host
  user: 'root',
  password: 'lahoreautotraders123',
  database: 'lahoreAuto'
});

module.exports = db;
