// server/server.js
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const session = require('express-session');
const path = require('path');

const app = express();

app.use(cors({
  origin: 'http://localhost:3000', // your frontend URL
  credentials: true
}));
app.use(bodyParser.json());

app.use(session({
  secret: 'yourSecretKey',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: false, // set true if using https
    httpOnly: true
  }
}));

// ✅ Import routes
const authRoutes = require('./routes/authRoutes');
const customerRoutes = require('./routes/customerRoutes');
const gdRoutes = require('./routes/gdRoutes');
const stockRoutes = require('./routes/stockRoutes');
const salesRoutes = require('./routes/salesRoutes');
const paymentRoutes = require('./routes/paymentRoutes');
const bankRoutes = require('./routes/bankRoutes');
const reportRoutes = require('./routes/reportRoutes');

// ✅ Mount routes
app.use('/api', authRoutes);
app.use('/api', customerRoutes);
app.use('/api', gdRoutes);
app.use('/api/stock', stockRoutes);
app.use('/api/sales', salesRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/banks', bankRoutes);
app.use('/api/reports', reportRoutes);

// ✅ Serve uploads
app.use('/uploads/receipts', express.static(path.join(__dirname, 'uploads/receipts')));

// ✅ Fallback
app.use((req, res) => {
  res.status(404).json({ error: 'API route not found' });
});

// ✅ Start server
app.listen(5000, () => {
  console.log('✅ Server running on http://localhost:5000');
});
