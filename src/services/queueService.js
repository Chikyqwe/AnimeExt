// src/services/queueService.js
class RequestQueue {
  constructor() {
    this.queue = [];
    this.processing = false;
  }

  add(task) {
    return new Promise((resolve, reject) => {
      this.queue.push({ task, resolve, reject });
      this.processNext();
    });
  }

  async processNext() {
    if (this.processing || this.queue.length === 0) return;
    this.processing = true;

    const { task, resolve, reject } = this.queue.shift();
    try {
      const result = await task();
      resolve(result);
    } catch (e) {
      reject(e);
    } finally {
      this.processing = false;
      this.processNext();
    }
  }

  getPendingCount() {
    return this.queue.length + (this.processing ? 1 : 0);
  }
}

const apiQueue = new RequestQueue();

module.exports = apiQueue;
