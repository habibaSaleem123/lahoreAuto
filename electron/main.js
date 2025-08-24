// electron/main.js
const { app, BrowserWindow, shell } = require('electron');
const path = require('path');
const isDev = !app.isPackaged;

function startServer() {
  process.env.NODE_ENV = isDev ? 'development' : 'production';
  process.env.APP_DATA_DIR = app.getPath('userData');

  // In production we start Express inside Electron.
  if (!isDev) {
    require(path.join(__dirname, '..', 'server', 'server.js'));
  }
}

async function createWindow() {
  const win = new BrowserWindow({
    width: 1300,
    height: 850,
    minWidth: 1100,
    minHeight: 700,
    title: 'Lahore Auto Traders',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      devTools: true,
    },
  });

  if (isDev) {
    await win.loadURL('http://localhost:3000');
  } else {
    await win.loadURL('http://localhost:5000');
  }

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

app.whenReady().then(() => {
  startServer();
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
