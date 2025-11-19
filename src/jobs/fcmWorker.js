// workerLauncher.js
const { Worker } = require('worker_threads');
const path = require('path');

function startEpisodeWorker() {
    const worker = new Worker(path.resolve(__dirname, '..', 'scripts', 'fcmService.js'));

    worker.on('online', () => {
        console.log('[Main] Worker de episodios iniciado');
    });

    worker.on('error', (err) => {
        console.error('[Main] Error en worker:', err);
    });

    worker.on('exit', (code) => {
        if (code !== 0) {
            console.warn(`[Main] Worker terminado con código ${code}, reiniciando...`);
            startEpisodeWorker(); // reinicia automáticamente
        }
    });

    return worker;
}

module.exports = { startEpisodeWorker };
