// server/server.js
const express = require('express');
const cors = require('cors');
const session = require('express-session');
const path = require('path');
const fs = require('fs');

// Load env from server/.env in dev
require('dotenv').config({ path: path.join(__dirname, '.env') });

const {
  migrate,
  dbFile,
  ping: dbPing,
  selfTest: dbSelfTest,
} = require('./config/db');

const app = express();
const isProd = process.env.NODE_ENV === 'production';
const PORT = process.env.PORT || 5000;

app.disable('x-powered-by');
if (isProd) app.set('trust proxy', 1);

// ─────────────────────────────────────────────
// DB migrate + diagnostics
// ─────────────────────────────────────────────
migrate();
console.log('🗄️ Using SQLite file:', dbFile);
try {
  console.log('📡 DB ping:', dbPing());
  if (!isProd) console.log('🧪 DB self-test:', dbSelfTest());
} catch (e) {
  console.error('❌ DB diagnostics failed:', e);
}

// ─────────────────────────────────────────────
// Middleware
// ─────────────────────────────────────────────
if (!isProd) {
  app.use(
    cors({
      origin: 'http://localhost:3000',
      credentials: true,
    })
  );
}

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// IMPORTANT: cookies must not be "secure" on HTTP localhost
const secureCookie = process.env.COOKIE_SECURE === '1'; // default false
app.use(
  session({
    secret: process.env.SESSION_SECRET || 'yourSecretKey',
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: secureCookie,   // false for local HTTP
      httpOnly: true,
      sameSite: 'lax',        // same-origin -> OK
    },
  })
);

// ─────────────────────────────────────────────
/** Writable dirs (DB/uploads) under APP_DATA_DIR in packaged app */
// ─────────────────────────────────────────────
const writableRoot = process.env.APP_DATA_DIR || __dirname;
const uploadsRoot = path.join(writableRoot, 'uploads');
const paymentsDir = path.join(uploadsRoot, 'payments');
const receiptsDir = path.join(uploadsRoot, 'receipts');
[uploadsRoot, paymentsDir, receiptsDir].forEach((dir) => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// Legacy redirects
app.use('/receipts', (req, res) =>
  res.redirect(301, `/uploads/receipts${req.path}`)
);
app.use('/payments', (req, res) =>
  res.redirect(301, `/uploads/payments${req.path}`)
);

// Serve uploads
app.use('/uploads', express.static(uploadsRoot));

// ─────────────────────────────────────────────
/** API routes */
// ─────────────────────────────────────────────
app.use('/api', require('./routes/authRoutes'));
app.use('/api', require('./routes/customerRoutes'));
app.use('/api', require('./routes/gdRoutes'));
app.use('/api/stock', require('./routes/stockRoutes'));
app.use('/api/sales', require('./routes/salesRoutes'));
app.use('/api/payments', require('./routes/paymentRoutes'));
app.use('/api/banks', require('./routes/bankRoutes'));
app.use('/api/reports', require('./routes/reportRoutes'));
app.use('/api/items', require('./routes/items'));

// Health
app.get('/health', (_, res) => {
  let ok = true;
  let info = null;
  try {
    info = dbPing();
  } catch (e) {
    ok = false;
    info = { error: String(e?.message || e) };
  }
  res.setHeader('Cache-Control', 'no-store');
  res.status(ok ? 200 : 500).json({ ok, db: info, serverTime: new Date().toISOString() });
});

// Dev-only debug endpoints
if (!isProd) {
  app.get('/api/_debug/db', (req, res) => {
    try {
      const { all, get, db } = require('./config/db');
      const meta = {
        database_list: db.prepare('PRAGMA database_list').all(),
        customers_count: get('SELECT COUNT(*) as c FROM customers')?.c ?? 0,
        sample_customers: all(
          'SELECT id, name, cnic, created_at FROM customers ORDER BY id DESC LIMIT 5'
        ),
        dbFile,
      };
      res.json(meta);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/_debug/selftest', (req, res) => {
    try {
      res.json(dbSelfTest());
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });
}

// ─────────────────────────────────────────────
/** Serve React build (prod) */
// ─────────────────────────────────────────────
const buildPath = isProd
  ? path.resolve(process.resourcesPath, 'client', 'build')  // from extraResources
  : path.resolve(__dirname, '..', 'client', 'build');

if (fs.existsSync(buildPath)) {
  // Serve static assets first
  app.use(express.static(buildPath));

  // ✅ Express-5 safe SPA fallback (no '*')
  // Any GET that is not /api/* or /uploads/* returns index.html
  app.get(/^\/(?!api|uploads)(.*)$/, (req, res) => {
    res.sendFile(path.join(buildPath, 'index.html'));
  });
} else {
  console.log('ℹ️ No React build found at', buildPath);
}

// 404 for API only
app.use('/api', (req, res) => {
  res.status(404).json({ error: 'API route not found' });
});

// Error handler
/* eslint-disable no-unused-vars */
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  const status = err.status || 500;
  res.status(status).json({
    error: isProd ? 'Internal Server Error' : String(err?.message || err),
  });
});
/* eslint-enable no-unused-vars */

app.listen(PORT, () => {
  console.log(`✅ Server running on http://127.0.0.1:${PORT}`);
  console.log('📂 Serving uploads at /uploads (dir: ' + uploadsRoot + ')');
  if (fs.existsSync(buildPath)) console.log('🖼️ React build served from', buildPath);
});
