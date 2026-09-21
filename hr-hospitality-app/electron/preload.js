/* eslint-disable */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  getAppConfig: () => ipcRenderer.sendSync('get-app-config'),
  saveAppConfig: (config) => ipcRenderer.send('save-app-config', config),
});
