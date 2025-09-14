const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('appInfo', { isDesktop: true });

contextBridge.exposeInMainWorld('electronAPI', {
  // Secure credential storage
  saveCredentials: (credentials) => ipcRenderer.invoke('save-credentials', credentials),
  getCredentials: () => ipcRenderer.invoke('get-credentials'),
  deleteCredentials: () => ipcRenderer.invoke('delete-credentials'),

  // Auto-login check
  checkAutoLogin: () => ipcRenderer.invoke('check-auto-login')
});
