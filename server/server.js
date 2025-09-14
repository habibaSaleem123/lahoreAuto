// server/server.js
const express = require('express');
const cors = require('cors');
const session = require('express-session');
const path = require('path');
const fs = require('fs');

require('dotenv').config({ path: path.join(__dirname, '.env') });

const {
  migrate,
  dbFile,
  ping: dbPing,
  selfTest: dbSelfTest,
  db, // <-- the better-sqlite3 Database instance (exported from ./config/db)
} = require('./config/db');

const app = express();
const isProd = process.env.NODE_ENV === 'production';

// ─────────────────────────────────────────────
// Boot diagnostics (helps on user machines)
// ─────────────────────────────────────────────
try {
  console.log('[BOOT] __dirname               =', __dirname);
  console.log('[BOOT] process.resourcesPath   =', process.resourcesPath);
  console.log('[BOOT] NODE_ENV                =', process.env.NODE_ENV);
  console.log('[BOOT] APP_DATA_DIR            =', process.env.APP_DATA_DIR);
  console.log('[BOOT] process.versions        =', JSON.stringify(process.versions));
} catch { /* ignore */ }

// Basics
app.disable('x-powered-by');
if (isProd) app.set('trust proxy', 1);

// ─────────────────────────────────────────────
// DB migrate + diagnostics
// ─────────────────────────────────────────────
try {
  migrate();
  console.log('🗄️ Using SQLite file:', dbFile);
  console.log('📡 DB ping:', dbPing());
  if (!isProd) console.log('🧪 DB self-test:', dbSelfTest());
} catch (e) {
  console.error('❌ DB initialization failed:', e);
  process.exit(1);
}

// ─────────────────────────────────────────────
// Middleware
// ─────────────────────────────────────────────
if (!isProd) {
  app.use(
    cors({
      origin: ['http://localhost:3000', 'http://127.0.0.1:3000'],
      credentials: true,
    })
  );
} else {
  // In production (Electron), allow requests from same-origin
  app.use(
    cors({
      origin: function (origin, callback) {
        // Allow requests with no origin (like mobile apps or curl requests)
        if (!origin) return callback(null, true);

        // Allow localhost and 127.0.0.1 on any port (for Electron)
        if (origin.includes('localhost') || origin.includes('127.0.0.1')) {
          return callback(null, true);
        }

        // Allow same-origin requests
        callback(null, true);
      },
      credentials: true,
    })
  );
}

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// ─────────────────────────────────────────────
// Sessions — use better-sqlite3-session-store WITH your db client
// ─────────────────────────────────────────────
const SESSION_COOKIE_NAME = process.env.SESSION_COOKIE_NAME || 'lat.sid';
const secureCookie = process.env.COOKIE_SECURE === '1'; // false in Electron local HTTP
const writableRoot = process.env.APP_DATA_DIR || __dirname;

// Make sure writable root exists
if (!fs.existsSync(writableRoot)) fs.mkdirSync(writableRoot, { recursive: true });

// Use better-sqlite3-session-store (no sqlite3 builds)
const BetterSqlite3Store = require('better-sqlite3-session-store')(session);

// You MUST pass the existing better-sqlite3 Database instance via `client`
app.use(
  session({
    name: SESSION_COOKIE_NAME,
    secret: process.env.SESSION_SECRET || 'yourSecretKey',
    resave: false,
    saveUninitialized: false,
    store: new BetterSqlite3Store({
      client: db,                 // <-- critical fix
      expired: { clear: true },   // periodically clear expired sessions
      // table: 'sessions',        // (optional) table name override
    }),
    cookie: {
      path: '/',                  // keep in sync with clearCookie()
      secure: secureCookie,       // false for local HTTP
      httpOnly: true,
      sameSite: 'lax',
      // maxAge: 7 * 24 * 60 * 60 * 1000, // optional
    },
  })
);

// ─────────────────────────────────────────────
// Writable dirs (DB/uploads) under APP_DATA_DIR in packaged app
// ─────────────────────────────────────────────
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
// API routes
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
      const { all, get, db: raw } = require('./config/db');
      const meta = {
        database_list: raw.prepare('PRAGMA database_list').all(),
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
// Serve React build (prod)
// ─────────────────────────────────────────────
const buildPath = isProd
  ? path.resolve(process.resourcesPath, 'client', 'build')  // from extraResources
  : path.resolve(__dirname, '..', 'client', 'build');

const indexPath = path.join(buildPath, 'index.html');

if (fs.existsSync(buildPath) && fs.existsSync(indexPath)) {
  console.log('🖼️ Serving React build from:', buildPath);
  app.use(express.static(buildPath));

  // Any GET that is not /api/* or /uploads/* returns index.html
  app.get(/^\/(?!api|uploads)(.*)$/, (req, res) => {
    try {
      res.sendFile(indexPath);
    } catch (e) {
      console.error('Failed to serve index.html:', e);
      res.status(500).send(`
        <h2>Application Error</h2>
        <p>Failed to load the application. Please check if the React build exists.</p>
        <p>Build path: ${buildPath}</p>
        <p>Error: ${e.message}</p>
      `);
    }
  });
} else {
  console.warn('❌ No React build found at', buildPath);
  console.warn('   Index file check:', fs.existsSync(indexPath) ? 'EXISTS' : 'MISSING');

  // Fallback for missing build
  app.get(/^\/(?!api|uploads)(.*)$/, (req, res) => {
    res.status(503).send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Lahore Auto Traders - Build Missing</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 50px; }
          .error { color: #d32f2f; }
          .info { color: #1976d2; }
          pre { background: #f5f5f5; padding: 15px; border-radius: 5px; }
        </style>
      </head>
      <body>
        <h1 class="error">Application Not Built</h1>
        <p>The React application has not been built yet.</p>
        <h3>To fix this:</h3>
        <ol>
          <li>Run <code class="info">npm run build:react</code> in the project root</li>
          <li>Restart the application</li>
        </ol>
        <h3>Build Information:</h3>
        <pre>Expected build path: ${buildPath}
Index file path: ${indexPath}
Build directory exists: ${fs.existsSync(buildPath)}
Index file exists: ${fs.existsSync(indexPath)}
Node environment: ${process.env.NODE_ENV}
Working directory: ${process.cwd()}</pre>
      </body>
      </html>
    `);
  });
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

// ─────────────────────────────────────────────
// Start server with optional port fallback
// ─────────────────────────────────────────────
const BASE_PORT = Number(process.env.PORT || 5000);
const ALLOW_PORT_FALLBACK = process.env.ALLOW_PORT_FALLBACK === '1';

function startListening(port, attemptsLeft = ALLOW_PORT_FALLBACK ? 10 : 1) {
  const server = app.listen(port, '127.0.0.1', () => {
    console.log(`✅ Server running on http://127.0.0.1:${port}`);
    console.log('📂 Serving uploads at /uploads (dir: ' + uploadsRoot + ')');
    if (fs.existsSync(buildPath)) console.log('🖼️ React build served from', buildPath);
  });

  server.on('error', (err) => {
    if (err && err.code === 'EADDRINUSE' && attemptsLeft > 1) {
      const nextPort = port + 1;
      console.warn(`⚠️ Port ${port} in use. Retrying on ${nextPort}...`);
      startListening(nextPort, attemptsLeft - 1);
    } else {
      console.error('❌ Failed to start server:', err);
      process.exit(1);
    }
  });

  const shutdown = (sig) => () => {
    console.log(`🔻 Received ${sig}, shutting down...`);
    server.close(() => {
      console.log('🧹 HTTP server closed.');
      process.exit(0);
    });
    setTimeout(() => process.exit(0), 5000).unref();
  };
  process.on('SIGINT', shutdown('SIGINT'));
  process.on('SIGTERM', shutdown('SIGTERM'));
}

startListening(BASE_PORT);
