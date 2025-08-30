// electron/main.js
const { app, BrowserWindow, shell } = require('electron');
const path = require('path');
const isDev = !app.isPackaged;

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
    // open the built React bundle
    const indexHtml = path.join(__dirname, '..', 'client', 'build', 'index.html');
    await win.loadFile(indexHtml);
  }

  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });
}

app.whenReady().then(() => { createWindow(); });
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
