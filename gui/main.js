const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const server = require('../src/server');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 900,
    height: 700,
    backgroundColor: '#0a0a0a',
    titleBarStyle: 'hidden',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'index.html'));

  // Capturar logs para la UI
  function sendLog(data) {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('log-data', data.toString());
    }
  }
  
  process.stdout.write = (write => function(string, encoding, fd) {
    sendLog(string);
    return write.apply(process.stdout, arguments);
  })(process.stdout.write);

  process.stderr.write = (write => function(string, encoding, fd) {
    sendLog(string);
    return write.apply(process.stderr, arguments);
  })(process.stderr.write);

  // mainWindow.webContents.openDevTools();

  mainWindow.on('closed', function () {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  // Iniciar el servidor de AnimeExt
  server.startServer();
  server.startMaintenanceScheduler();
  setInterval(server.monitorMemoria, 10000);

  createWindow();

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});

// IPC Handlers para conectar UI con el servidor
ipcMain.handle('get-stats', () => {
  return server.getStats();
});

ipcMain.handle('run-maintenance', async () => {
  await server.ejecutarMantenimiento();
  return { success: true };
});

ipcMain.handle('clear-logs', () => {

  // Podríamos limpiar el archivo de logs aquí si quisiéramos
  return { success: true };
});

ipcMain.handle('restart-app', () => {
  app.relaunch();
  app.exit();
});
