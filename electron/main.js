// electron/main.js
const { app, BrowserWindow, shell, Menu } = require('electron');
const path = require('path');
const isDev = !app.isPackaged;

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
    // win.webContents.openDevTools({ mode: 'detach' }); // helpful while debugging
  } else {
    const indexHtml = path.join(__dirname, '..', 'client', 'build', 'index.html');
    await win.loadFile(indexHtml);
  }

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

app.whenReady().then(() => {
  if (process.platform === 'win32') app.setAppUserModelId('Lahore Auto Traders');
  setEditMenu();       // <-- fixes Backspace/Delete/Cut/Paste behavior on Windows
  createWindow();
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
