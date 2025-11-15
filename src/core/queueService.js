// src/services/queueService.js

class RequestQueue {
  constructor() {
    this.queue = [];
    this.processing = false;
    this.completed = [];
    this.failed = [];
    this.currentTask = null;
  }

  /**
   * Agrega una tarea a la cola.
   * @param {Function|Object} task  Función o { fn, name, meta }
   * @param {Object} [options] Opciones extra { name, meta }
   */
  add(task, options = {}) {
    const normalizedTask =
      typeof task === 'function'
        ? { fn: task }
        : task;

    // Metadata
    const meta = {
      name:
        options.name ||
        normalizedTask.name ||
        normalizedTask.fn?.name ||
        'anonymous',
      addedAt: new Date(),
      ...options.meta,
      ...normalizedTask.meta
    };

    return new Promise((resolve, reject) => {
      this.queue.push({
        task: normalizedTask.fn,
        resolve,
        reject,
        meta
      });

      // Inicia procesamiento
      this.processNext().catch(() => {});
    });
  }

  async processNext() {
    if (this.processing || this.queue.length === 0) return;

    this.processing = true;

    const { task, resolve, reject, meta } = this.queue.shift();
    this.currentTask = { meta, startedAt: new Date() };

    try {
      const result = await Promise.resolve(task());

      this.completed.push({
        ...meta,
        finishedAt: new Date(),
        status: 'completed',
        result
      });

      resolve(result);
    } catch (error) {
      this.failed.push({
        ...meta,
        finishedAt: new Date(),
        status: 'failed',
        error
      });

      reject(error);
    } finally {
      this.currentTask = null;
      this.processing = false;
      setTimeout(() => this.processNext().catch(() => {}), 0);
    }
  }

  getPendingCount() {
    return this.queue.length + (this.processing ? 1 : 0);
  }

  getCurrentTask() {
    return this.currentTask;
  }

  getPendingTasks() {
    return this.queue.map(({ meta }) => meta);
  }

  getCompletedTasks(limit = 10) {
    return this.completed.slice(-limit);
  }

  getFailedTasks(limit = 10) {
    return this.failed.slice(-limit);
  }

  clearHistory() {
    this.completed = [];
    this.failed = [];
  }
}

const apiQueue = new RequestQueue();
module.exports = apiQueue;
