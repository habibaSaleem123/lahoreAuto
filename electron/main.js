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
  while (Date.now() - start < timeoutMs) {
    if (await ping(health)) return;
    await new Promise(r => setTimeout(r, intervalMs));
  }
  throw new Error(`Server did not become ready at ${url} within ${timeoutMs}ms`);
}

function startApi(port) {
  const serverRoot = isDev ? path.join(__dirname, '..', 'server')
                           : path.join(process.resourcesPath, 'server');
  const serverEntry = path.join(serverRoot, 'server.js');
  const logFile = path.join(app.getPath('userData'), 'server.log');

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
  apiProc.stdout?.on('data', d => logStream.write(`[OUT] ${d}`));
  apiProc.stderr?.on('data', d => logStream.write(`[ERR] ${d}`));
  apiProc.on('exit', (code, sig) => logStream.write(`[EXIT] code=${code} sig=${sig}\n`));
}

async function createWindow() {
  const getPort = await loadGetPort();
  // Try 5000; fall back to a free port if busy (antivirus, other instance, etc.)
  const apiPort = isDev ? 5000 : await getPort({ port: 5000 });
  const serverBase = `http://127.0.0.1:${apiPort}`;

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
    try { await waitForServer(serverBase, { timeoutMs: 30000 }); } catch {}
  } else {
    // Start local API
    startApi(apiPort);

    // Redirect hard-coded localhost:5000 (HTTP + WS) to the actual port we picked
    const httpFrom = ['http://localhost:5000/', 'http://127.0.0.1:5000/'];
    const wsFrom   = ['ws://localhost:5000/',   'ws://127.0.0.1:5000/'];
    const toHttp   = `${serverBase}/`;
    const toWs     = `ws://127.0.0.1:${apiPort}/`;

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
        return callback({ redirectURL });
      }
      callback({});
    });

    try { await waitForServer(serverBase, { timeoutMs: 45000 }); }
    catch (e) {
      const msg = encodeURIComponent('The local server failed to start. Please check server.log in the app data folder and your antivirus/firewall.');
      await win.loadURL(`data:text/html;charset=utf-8,<h2>Startup Error</h2><p>${msg}</p>`);
      win.show();
      return;
    }

    // Pop DevTools once in packaged builds to surface UI errors fast
    try { win.webContents.openDevTools({ mode: 'detach' }); } catch {}
  }

  await win.loadURL(serverBase);
  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });
}

app.whenReady().then(async () => {
  if (process.platform === 'win32') app.setAppUserModelId('Lahore Auto Traders');
  setEditMenu();
  await createWindow();
});

app.on('before-quit', () => { try { apiProc?.kill(); } catch {} });
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
