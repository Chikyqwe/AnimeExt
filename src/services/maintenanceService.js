// src/services/maintenanceService.js
const { Worker } = require('worker_threads');
const path = require('path');
const { setUpdatingStatus } = require('../middleware/maintenanceBlock');

async function iniciarMantenimiento() {
  // Aqu� usamos la funci�n que modifica el estado global del middleware,
  // para mantener una �nica fuente de verdad sobre si se est� actualizando.
  if (setUpdatingStatus(true)) { // setUpdatingStatus devuelve el estado anterior
    console.log(`[MANTENIMIENTO] Ya se esta ejecutando mantenimiento, ignorando nueva solicitud`);
    return;
  }

  console.log(`[MANTENIMIENTO] Iniciando mantenimiento en hilo separado...`);

  const worker = new Worker(path.join(__dirname, '..', '..', 'worker-mantenimiento.js'));

  worker.on('message', (msg) => {
    if (msg.type === 'log') {
      console.log(`[MANTENIMIENTO][WORKER] `);
    } else if (msg.type === 'done') {
      console.log(`[MANTENIMIENTO][WORKER] Finalizado correctamente`);
      setUpdatingStatus(false);
    } else if (msg.type === 'error') {
      console.error(`[MANTENIMIENTO][WORKER] Error reportado:`, msg.err);
      setUpdatingStatus(false);
    } else {
      console.log(`[MANTENIMIENTO][WORKER] Mensaje desconocido:`, msg);
    }
  });

  worker.on('error', (err) => {
    console.error(`[MANTENIMIENTO] Error en worker:`, err);
    setUpdatingStatus(false);
  });

  worker.on('exit', (code) => {
    if (code !== 0) {
      console.error(`[MANTENIMIENTO] Worker termin� con c�digo `);
    } else {
      console.log(`[MANTENIMIENTO] Worker sali� correctamente`);
    }
    setUpdatingStatus(false);
  });
}

module.exports = {
  iniciarMantenimiento,
};
