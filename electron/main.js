const { app, BrowserWindow, shell } = require('electron');
const path = require('path');
const isDev = !app.isPackaged;

function startServer() {
  process.env.NODE_ENV = isDev ? 'development' : 'production';
  process.env.APP_DATA_DIR = app.getPath('userData');
  if (!isDev) require(path.join(__dirname, '..', 'server', 'server.js'));
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
  await win.loadURL(isDev ? 'http://localhost:3000' : 'http://localhost:5000');
  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });
}

app.whenReady().then(() => { startServer(); createWindow(); });
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
