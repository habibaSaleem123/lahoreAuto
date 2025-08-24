const { contextBridge } = require('electron');
contextBridge.exposeInMainWorld('appInfo', { isDesktop: true });
