const { Worker } = require('worker_threads');
const path = require('path');

let restarting = false;

function startEpisodeWorker(delay = 0) {
  if (restarting) return;
  restarting = true;

  setTimeout(() => {
    restarting = false;

    const worker = new Worker(
      path.resolve(__dirname, '..', 'scripts', 'fcmService.js')
    );

    worker.on('online', () => {
      console.log('[Main] Worker de episodios iniciado');
    });

    worker.on('message', (msg) => {
      if (msg.type === 'log') {
        console.log('[Worker]', msg.msg);
      }
    });

    worker.on('error', (err) => {
      console.error('[Main] Error en worker:', err);
    });

    worker.on('exit', (code) => {
      if (code !== 0) {
        console.warn(`[Main] Worker terminó con código ${code}, reiniciando en 10s...`);
        startEpisodeWorker(10_000); // delay seguro
      } else {
        console.log('[Main] Worker finalizó correctamente, reprogramando en 15 min');
        startEpisodeWorker(15 * 60 * 1000);
      }
    });

  }, delay);
}

module.exports = { startEpisodeWorker };
