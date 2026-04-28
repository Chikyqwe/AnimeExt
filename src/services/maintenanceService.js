const { Worker } = require("worker_threads");
const path = require("path");
const { setUpdatingStatus } = require("../middlewares/maintenanceBlock");

async function iniciarMantenimiento({ timeoutMs = 8 * 60 * 1000 } = {}) {

  if (setUpdatingStatus(true)) {
    console.log("[MANTENIMIENTO] Ya en ejecución");
    return;
  }

  const workerPath = path.join(__dirname, "..", "jobs", "maintenimanceWorker.js");
  let cleaned = false;
  let timeoutHandle;
  let worker = new Worker(workerPath);

  const cleanUp = async () => {
    if (cleaned) return;
    cleaned = true;

    if (timeoutHandle) clearTimeout(timeoutHandle);
    
    if (worker) {
      worker.removeAllListeners();
      await worker.terminate();
      worker = null;
    }
    
    setUpdatingStatus(false);

    // 🔥 Forzar GC si está disponible
    if (global.gc) {
      console.log("[MANTENIMIENTO] Ejecutando GC post-mantenimiento...");
      global.gc();
    }
  };


  timeoutHandle = setTimeout(() => {
    console.warn("[MANTENIMIENTO] Timeout alcanzado, matando worker");
    worker.terminate().then(cleanUp);
  }, timeoutMs);

  worker.on("message", msg => {
    if (msg.type === "log") console.log("[WORKER]", msg.msg);
    if (msg.type === "done") cleanUp();
    if (msg.type === "error") {
      console.error("[WORKER ERROR]", msg.err);
      cleanUp();
    }
  });

  worker.on("error", err => {
    console.error("[WORKER FATAL]", err);
    cleanUp();
  });

  worker.on("exit", code => {
    if (code !== 0) console.warn(`[WORKER] Salió con código ${code}`);
    cleanUp();
  });
}

module.exports = { iniciarMantenimiento };
