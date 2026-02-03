class RequestQueue {
  /**
   * @param {Object} options
   * @param {number} options.concurrency Cantidad máxima de tareas paralelas (default: 1)
   * @param {number} options.historyLimit Máximo historial de completed/failed (default: 100)
   */
  constructor({ concurrency = 1, historyLimit = 100 } = {}) {
    this.queue = [];
    this.processingCount = 0;
    this.concurrency = concurrency;
    this.historyLimit = historyLimit;

    this.completed = [];
    this.failed = [];
    this.currentTasks = new Set();
  }

  add(task, options = {}) {
    const normalizedTask =
      typeof task === 'function'
        ? { fn: task }
        : task;

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

      this._processQueue().catch(() => {});
    });
  }

  async _processQueue() {
    if (
      this.processingCount >= this.concurrency ||
      this.queue.length === 0
    ) return;

    const { task, resolve, reject, meta } = this.queue.shift();
    const now = new Date();
    const currentTask = { meta, startedAt: now };
    this.currentTasks.add(currentTask);
    this.processingCount++;

    try {
      const result = await Promise.resolve(task());

      this.completed.push({
        ...meta,
        finishedAt: new Date(),
        status: 'completed',
        result
      });
      if (this.completed.length > this.historyLimit)
        this.completed.shift();

      resolve(result);
    } catch (error) {
      this.failed.push({
        ...meta,
        finishedAt: new Date(),
        status: 'failed',
        error
      });
      if (this.failed.length > this.historyLimit)
        this.failed.shift();

      reject(error);
    } finally {
      this.currentTasks.delete(currentTask);
      this.processingCount--;
      setImmediate(() => this._processQueue().catch(() => {}));
    }
  }

  getPendingCount() {
    return this.queue.length + this.processingCount;
  }

  getCurrentTasks() {
    return Array.from(this.currentTasks);
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

  clearQueue() {
    this.queue = [];
  }
}

// Singleton
const apiQueue = new RequestQueue({ concurrency: 2, historyLimit: 200 });
module.exports = apiQueue;
