// src/services/maintenanceService.js
const { Worker } = require('worker_threads');
const path = require('path');
const { setUpdatingStatus } = require('../middlewares/maintenanceBlock');

async function iniciarMantenimiento({ timeoutMs = 8 * 60 * 1000 } = {}) { // timeout por defecto: 8 min
  console.log(`[MANTENIMIENTO] Verificando estado de mantenimiento...`);

  if (setUpdatingStatus(true)) { 
    console.log(`[MANTENIMIENTO] Ya se está ejecutando mantenimiento, ignorando nueva solicitud`);
    return;
  }

  console.log(`[MANTENIMIENTO] Iniciando mantenimiento en hilo separado...`);

  const workerPath = path.join(__dirname, '..', 'maintenimance', 'worker-mantenimiento.js');
  const worker = new Worker(workerPath);

  let timeoutHandle = null;

  const cleanUp = () => {
    if (timeoutHandle) clearTimeout(timeoutHandle);
    worker.removeAllListeners();
    setUpdatingStatus(false);
  };

  if (timeoutMs > 0) {
    timeoutHandle = setTimeout(() => {
      console.warn(`[MANTENIMIENTO] Worker excedió tiempo límite de ${timeoutMs}ms, terminando...`);
      worker.terminate().then(() => cleanUp());
    }, timeoutMs);
  }

  worker.on('message', (msg) => {
    switch (msg.type) {
      case 'log':
        console.log(`[MANTENIMIENTO][WORKER][MSG]`, msg.msg);
        break;
      case 'done':
        console.log(`[MANTENIMIENTO][WORKER] Mantenimiento completado`);
        cleanUp();
        break;
      case 'error':
        console.error(`[MANTENIMIENTO][WORKER] Error reportado:`, msg.err);
        cleanUp();
        break;
      default:
        console.log(`[MANTENIMIENTO][WORKER] Mensaje desconocido:`, msg);
    }
  });

  worker.on('error', (err) => {
    console.error(`[MANTENIMIENTO] Error en worker:`, err);
    cleanUp();
  });

  worker.on('exit', (code) => {
    if (code !== 0) {
      console.error(`[MANTENIMIENTO] Worker terminó con código ${code}`);
    } else {
      console.log(`[MANTENIMIENTO] Worker salió correctamente`);
    }
    cleanUp();
  });
}

module.exports = {
  iniciarMantenimiento,
};
