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
   * @param {Function} task - función async. Puedes pasar un objeto: { fn, name, meta }
   * @param {Object} [options] - { name, meta }
   */
  add(task, options = {}) {
    const meta = {
      name: options.name || task.name || 'anonymous',
      addedAt: new Date(),
      ...options.meta
    };
    return new Promise((resolve, reject) => {
      this.queue.push({ task, resolve, reject, meta });
      this.processNext();
    });
  }

  async processNext() {
    if (this.processing || this.queue.length === 0) return;
    this.processing = true;
    const { task, resolve, reject, meta } = this.queue.shift();
    this.currentTask = { meta, startedAt: new Date() };
    try {
      const result = await (typeof task === 'function' ? task() : task.fn());
      this.completed.push({
        ...meta,
        finishedAt: new Date(),
        status: 'completed',
        result
      });
      resolve(result);
    } catch (e) {
      this.failed.push({
        ...meta,
        finishedAt: new Date(),
        status: 'failed',
        error: e
      });
      reject(e);
    } finally {
      this.currentTask = null;
      this.processing = false;
      this.processNext();
    }
  }

  getPendingCount() {
    return this.queue.length + (this.processing ? 1 : 0);
  }

  getCurrentTask() {
    return this.currentTask;
  }

  getPendingTasks() {
    return this.queue.map(item => item.meta);
  }

  getCompletedTasks(limit = 10) {
    return this.completed.slice(-limit);
  }

  getFailedTasks(limit = 10) {
    return this.failed.slice(-limit);
  }
}

const apiQueue = new RequestQueue();

module.exports = apiQueue;
