const mysql = require('mysql2/promise');

const db = mysql.createPool({
  host: 'localhost',
  user: 'root',
  password: 'lahoreautotraders123',
  database: 'lahoreAUto'
});

module.exports = db;
