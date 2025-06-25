const { parentPort } = require('worker_threads');
const { main } = require('./anim');

(async () => {
  try {
    await main({ log: msg => parentPort.postMessage({ type: 'log', msg }) });
    parentPort.postMessage({ type: 'done' });
  } catch (err) {
    parentPort.postMessage({ type: 'error', err: err.message || String(err) });
  }
})();
