const mysql = require('mysql2/promise');

const db = mysql.createPool({
  host: '100.79.155.103',
  user: 'remote_user',
  password: 'strongpassword',
  database: 'lahoreAuto'
});

module.exports = db;
