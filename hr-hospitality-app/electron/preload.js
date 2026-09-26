/* eslint-disable */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  getAppConfig: () => ipcRenderer.sendSync('get-app-config'),
  saveAppConfig: (config) => ipcRenderer.send('save-app-config', config),
  authStorage: {
    getItem: (key) => ipcRenderer.sendSync('auth-storage-get', key),
    setItem: (key, value) => ipcRenderer.send('auth-storage-set', key, value),
    removeItem: (key) => ipcRenderer.send('auth-storage-remove', key)
  },
  localDb: {
    invoke: (operation, input = {}) => ipcRenderer.invoke('local-db-operation', { operation, input })
  },
  voice: {
    transcribe: (audioBase64, language = 'pt') => ipcRenderer.invoke('voice-transcribe', { audioBase64, language })
  }
});
