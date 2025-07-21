const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');

const app = express();
app.use(cors());
app.use(bodyParser.json());

// ✅ Import routes
const customerRoutes = require('./routes/customerRoutes');
const gdRoutes = require('./routes/gdRoutes');
const stockRoutes = require('./routes/stockRoutes');
const salesRoutes = require('./routes/salesRoutes');

// ✅ Mount
app.use('/api', customerRoutes);  // /api/customers
app.use('/api', gdRoutes);        // /api/gd-list etc.
app.use('/api/stock', stockRoutes);
app.use('/api/sales', salesRoutes);

// Catch-all
app.use((req, res) => {
  res.status(404).json({ error: 'API route not found' });
});

// Start server
app.listen(5000, () => console.log('✅ Server running on http://localhost:5000'));
