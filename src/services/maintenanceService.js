// src/services/maintenanceService.js
const { Worker } = require('worker_threads');
const path = require('path');
const { setUpdatingStatus } = require('../middleware/maintenanceBlock');

async function iniciarMantenimiento() {
  // Aqui se verifica si ya se está ejecutando el mantenimiento y se evita iniciar otro si ya hay uno en curso.
  // setUpdatingStatus devuelve el estado anterior, por lo que si es true, significa que ya hay un mantenimiento en curso.
  console.log(`[MANTENIMIENTO] Verificando estado de mantenimiento...`);
  if (setUpdatingStatus(true)) { // setUpdatingStatus devuelve el estado anterior
    console.log(`[MANTENIMIENTO] Ya se esta ejecutando mantenimiento, ignorando nueva solicitud`);
    return;
  }

  console.log(`[MANTENIMIENTO] Iniciando mantenimiento en hilo separado...`);

  const worker = new Worker(path.join(__dirname, '..', '..', 'worker-mantenimiento.js'));

  worker.on('message', (msg) => {
    if (msg.type === 'log') {
      console.log(`[MANTENIMIENTO][WORKER]`, msg.msg);
    } else if (msg.type === 'done') {
      console.log(`[MANTENIMIENTO][WORKER] Mantenimiento completado`);
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
      console.error(`[MANTENIMIENTO] Worker terminó con código ${code}`);
    } else {
      console.log(`[MANTENIMIENTO] Worker salió correctamente`);
    }
    setUpdatingStatus(false);
  });
}

module.exports = {
  iniciarMantenimiento,
};
