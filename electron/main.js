// electron/main.js
const { app, BrowserWindow, shell, Menu, session } = require('electron');
const path = require('path');
const { fork } = require('child_process');
const http = require('http');
const fs = require('fs');

// ESM import helper for get-port (v6/v7 are ESM-only)
async function loadGetPort() {
  const mod = await import('get-port');    // dynamic import works in CJS
  return mod.default || mod;               // .default in ESM
}

const isDev = !app.isPackaged;
let apiProc;

// ── single-instance lock
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) app.quit();
app.on('second-instance', () => {
  const [win] = BrowserWindow.getAllWindows();
  if (win) { if (win.isMinimized()) win.restore(); win.focus(); }
});

function setEditMenu() {
  const isMac = process.platform === 'darwin';
  const template = [
    ...(isMac ? [{ role: 'appMenu' }] : []),
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' }, { role: 'redo' }, { type: 'separator' },
        { role: 'cut' }, { role: 'copy' }, { role: 'paste' },
        { role: 'pasteAndMatchStyle' }, { role: 'delete' },
        { role: 'selectAll' }
      ]
    }
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function ping(url) {
  return new Promise((resolve) => {
    const req = http.get(url, (res) => { res.resume(); resolve(res.statusCode >= 200 && res.statusCode < 500); });
    req.on('error', () => resolve(false));
    req.setTimeout(1500, () => { req.destroy(); resolve(false); });
  });
}

async function waitForServer(url, { timeoutMs = 45000, intervalMs = 300 } = {}) {
  const start = Date.now();
  const health = url.replace(/\/?$/, '/health');
  console.log(`[MAIN] Waiting for server at ${health}...`);

  while (Date.now() - start < timeoutMs) {
    const elapsed = Date.now() - start;
    if (await ping(health)) {
      console.log(`[MAIN] Server ready after ${elapsed}ms`);
      return;
    }
    if (elapsed % 3000 < intervalMs) {
      console.log(`[MAIN] Still waiting... (${Math.floor(elapsed/1000)}s)`);
    }
    await new Promise(r => setTimeout(r, intervalMs));
  }
  throw new Error(`Server did not become ready at ${url} within ${timeoutMs}ms`);
}

function startApi(port) {
  const serverRoot = isDev ? path.join(__dirname, '..', 'server')
                           : path.join(process.resourcesPath, 'server');
  const serverEntry = path.join(serverRoot, 'server.js');
  const logFile = path.join(app.getPath('userData'), 'server.log');

  console.log(`[MAIN] Starting API server on port ${port}`);
  console.log(`[MAIN] Server root: ${serverRoot}`);
  console.log(`[MAIN] Log file: ${logFile}`);

  if (!fs.existsSync(serverEntry)) {
    throw new Error(`Server entry point not found: ${serverEntry}`);
  }

  apiProc = fork(serverEntry, [], {
    cwd: serverRoot,
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    env: {
      ...process.env,
      NODE_ENV: isDev ? 'development' : 'production',
      PORT: String(port),
      APP_DATA_DIR: app.getPath('userData'),
      COOKIE_SECURE: '0'
    }
  });

  const logStream = fs.createWriteStream(logFile, { flags: 'a' });
  logStream.write(`\n[${new Date().toISOString()}] Starting server on port ${port}\n`);

  apiProc.stdout?.on('data', d => {
    console.log(`[SERVER] ${d.toString().trim()}`);
    logStream.write(`[OUT] ${d}`);
  });

  apiProc.stderr?.on('data', d => {
    console.error(`[SERVER] ${d.toString().trim()}`);
    logStream.write(`[ERR] ${d}`);
  });

  apiProc.on('exit', (code, sig) => {
    const msg = `[EXIT] code=${code} sig=${sig}\n`;
    console.log(`[SERVER] ${msg.trim()}`);
    logStream.write(msg);
  });

  apiProc.on('error', (err) => {
    const msg = `[ERROR] Failed to start server: ${err.message}\n`;
    console.error(`[SERVER] ${msg.trim()}`);
    logStream.write(msg);
  });
}

async function validateReactBuild() {
  const buildPath = isDev
    ? path.join(__dirname, '..', 'client', 'build')
    : path.join(process.resourcesPath, 'client', 'build');

  const indexPath = path.join(buildPath, 'index.html');

  if (!fs.existsSync(buildPath)) {
    console.warn(`[MAIN] React build directory not found: ${buildPath}`);
    return false;
  }

  if (!fs.existsSync(indexPath)) {
    console.warn(`[MAIN] React index.html not found: ${indexPath}`);
    return false;
  }

  console.log(`[MAIN] React build validated: ${buildPath}`);
  return true;
}

async function createWindow() {
  const getPort = await loadGetPort();
  // Try 5000; fall back to a free port if busy (antivirus, other instance, etc.)
  const apiPort = isDev ? 5000 : await getPort({ port: 5000 });
  const serverBase = `http://127.0.0.1:${apiPort}`;

  console.log(`[MAIN] Creating window, server will be at ${serverBase}`);

  const win = new BrowserWindow({
    width: 1300, height: 850, minWidth: 1100, minHeight: 700,
    title: 'Lahore Auto Traders',
    icon: process.platform === 'win32' ? path.join(__dirname, '..', 'assets', 'icon.ico') : undefined,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    },
    show: false
  });

  // Ensure the window becomes visible even if 'ready-to-show' is delayed
  let showed = false;
  win.once('ready-to-show', () => { showed = true; win.show(); });
  setTimeout(() => { if (!showed) try { win.show(); } catch {} }, 4000);

  if (isDev) {
    try {
      await waitForServer(serverBase, { timeoutMs: 30000 });
    } catch (e) {
      console.error(`[MAIN] Dev server not ready: ${e.message}`);
      const errorHTML = `<!DOCTYPE html><html><head><title>Development Error</title></head><body><h2>Development Error</h2><p>Development servers are not running. Please run "npm run dev" first.</p></body></html>`;
      await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(errorHTML)}`);
      win.show();
      return;
    }
  } else {
    // Validate React build first
    const hasValidBuild = await validateReactBuild();
    if (!hasValidBuild) {
      const errorHTML = `<!DOCTYPE html><html><head><title>Build Error</title></head><body><h2>Build Error</h2><p>React build not found. Please run "npm run build:react" first.</p></body></html>`;
      await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(errorHTML)}`);
      win.show();
      return;
    }

    // Start local API
    try {
      startApi(apiPort);
    } catch (e) {
      console.error(`[MAIN] Failed to start API server: ${e.message}`);
      const errorHTML = `<!DOCTYPE html><html><head><title>Server Error</title></head><body><h2>Server Error</h2><p>Failed to start server: ${e.message}</p></body></html>`;
      await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(errorHTML)}`);
      win.show();
      return;
    }

    // Set up port redirection ONLY if we're using a different port than 5000
    if (apiPort !== 5000) {
      const httpFrom = ['http://localhost:5000/', 'http://127.0.0.1:5000/'];
      const wsFrom   = ['ws://localhost:5000/',   'ws://127.0.0.1:5000/'];
      const toHttp   = `${serverBase}/`;
      const toWs     = `ws://127.0.0.1:${apiPort}/`;

      console.log(`[MAIN] Setting up port redirection: 5000 -> ${apiPort}`);

      session.defaultSession.webRequest.onBeforeRequest((details, callback) => {
        const reqUrl = details.url;
        let redirectURL = null;

        for (const h of httpFrom) {
          if (reqUrl.startsWith(h)) {
            redirectURL = toHttp + reqUrl.slice(h.length);
            break;
          }
        }
        if (!redirectURL) {
          for (const w of wsFrom) {
            if (reqUrl.startsWith(w)) {
              redirectURL = toWs + reqUrl.slice(w.length);
              break;
            }
          }
        }

        if (redirectURL) {
          // Normalize accidental double slashes (excluding scheme)
          redirectURL = redirectURL
            .replace(/^(https?:\/\/|ws:\/\/)/, '$1')
            .replace(/([^:])\/\/+/g, '$1/');
          console.log(`[MAIN] Redirecting ${reqUrl} -> ${redirectURL}`);
          return callback({ redirectURL });
        }
        callback({});
      });
    } else {
      console.log(`[MAIN] Using default port ${apiPort}, no redirection needed`);
    }

    // Wait for server with better error handling
    try {
      await waitForServer(serverBase, { timeoutMs: 45000 });
    }
    catch (e) {
      console.error(`[MAIN] Server startup failed: ${e.message}`);
      const logPath = path.join(app.getPath('userData'), 'server.log');
      const errorHTML = `<!DOCTYPE html><html><head><title>Startup Error</title></head><body><h2>Startup Error</h2><p>The local server failed to start. Error: ${e.message}</p><p>Check the log file at: ${logPath}</p></body></html>`;
      await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(errorHTML)}`);
      win.show();
      return;
    }

    // Pop DevTools once in packaged builds to surface UI errors fast
    try { win.webContents.openDevTools({ mode: 'detach' }); } catch {}
  }

  // Load the server URL with timeout and error handling
  console.log(`[MAIN] Loading URL: ${serverBase}`);

  try {
    // Show loading state first
    const loadingHTML = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Lahore Auto Traders - Loading</title>
        <style>
          body {
            margin: 0; padding: 0;
            background: #f5f5f5;
            font-family: Arial, sans-serif;
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
            flex-direction: column;
          }
          .spinner {
            width: 50px; height: 50px;
            border: 5px solid #ddd;
            border-top: 5px solid #007bff;
            border-radius: 50%;
            animation: spin 1s linear infinite;
            margin-bottom: 20px;
          }
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
          .title { color: #333; margin-bottom: 10px; }
          .subtitle { color: #666; }
        </style>
      </head>
      <body>
        <div class="spinner"></div>
        <h2 class="title">Lahore Auto Traders</h2>
        <p class="subtitle">Loading application...</p>
      </body>
      </html>
    `;

    await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(loadingHTML)}`);
    win.show();

    // Small delay to let loading screen show
    await new Promise(r => setTimeout(r, 500));

    // Now load the actual application
    await win.loadURL(serverBase);
    console.log(`[MAIN] Successfully loaded application`);

  } catch (e) {
    console.error(`[MAIN] Failed to load URL: ${e.message}`);
    const errorHTML = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Lahore Auto Traders - Load Error</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 50px; }
          .error { color: #d32f2f; }
          button { padding: 10px 20px; background: #007bff; color: white; border: none; border-radius: 5px; cursor: pointer; }
        </style>
      </head>
      <body>
        <h2 class="error">Load Error</h2>
        <p>Failed to load the application: ${e.message}</p>
        <p>Server URL: ${serverBase}</p>
        <button onclick="location.reload()">Retry</button>
      </body>
      </html>
    `;
    await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(errorHTML)}`);
    win.show();
    return;
  }

  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });
}

app.whenReady().then(async () => {
  if (process.platform === 'win32') app.setAppUserModelId('Lahore Auto Traders');
  setEditMenu();
  await createWindow();
});

app.on('before-quit', () => { try { apiProc?.kill(); } catch {} });
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
