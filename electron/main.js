// electron/main.js
const { app, BrowserWindow, shell, Menu } = require('electron');
const path = require('path');
const { fork } = require('child_process');

const isDev = !app.isPackaged;

let apiProc;

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

function startApi() {
  const serverEntry = isDev
    ? path.join(__dirname, '..', 'server', 'server.js')               // dev path
    : path.join(process.resourcesPath, 'server', 'server.js');         // packaged path

  apiProc = fork(serverEntry, [], {
    stdio: 'inherit',
    env: {
      ...process.env,
      NODE_ENV: 'production',
      PORT: '5000',
      // writable data dir for DB/uploads on user machines
      APP_DATA_DIR: app.getPath('userData'),
      // keep cookies usable over HTTP localhost
      COOKIE_SECURE: '0'
    }
  });
}

async function createWindow() {
  const win = new BrowserWindow({
    width: 1300,
    height: 850,
    minWidth: 1100,
    minHeight: 700,
    title: 'Lahore Auto Traders',
    icon: process.platform === 'win32'
      ? path.join(__dirname, '..', 'assets', 'icon.ico')
      : undefined,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  if (isDev) {
    await win.loadURL('http://localhost:3000');
  } else {
    // Load UI served by your Express server (same origin as API)
    await win.loadURL('http://127.0.0.1:5000');
  }

  // Open external links in the system browser
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  // Optional: enable DevTools in prod while debugging
  // win.webContents.openDevTools({ mode: 'detach' });
}

app.whenReady().then(() => {
  if (process.platform === 'win32') app.setAppUserModelId('Lahore Auto Traders');
  setEditMenu();
  if (!isDev) startApi();     // start backend in production
  createWindow();
});

app.on('before-quit', () => { try { apiProc?.kill(); } catch {} });
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
