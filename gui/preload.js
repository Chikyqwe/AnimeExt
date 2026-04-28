const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  getStats: () => ipcRenderer.invoke('get-stats'),
  runMaintenance: () => ipcRenderer.invoke('run-maintenance'),
  clearLogs: () => ipcRenderer.invoke('clear-logs'),
  restartApp: () => ipcRenderer.invoke('restart-app'),

  onLog: (callback) => ipcRenderer.on('log-data', (event, data) => callback(data))
});
