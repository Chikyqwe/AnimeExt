class SimpleCache {
  constructor(cleanInterval = 60_000) {
    this.store = new Map();
    this.cleanInterval = setInterval(() => this.cleanUp(), cleanInterval);
  }

  set(key, value, ttl = 60_000) {
    const expiresAt = Date.now() + ttl;
    this.store.set(key, { value, expiresAt });
  }

  get(key) {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return undefined;
    }
    return entry.value;
  }

  has(key) {
    return this.get(key) !== undefined;
  }

  del(key) {
    this.store.delete(key);
  }

  clear() {
    this.store.clear();
  }

  cleanUp() {
    const now = Date.now();
    for (const [key, { expiresAt }] of this.store.entries()) {
      if (expiresAt <= now) this.store.delete(key);
    }
  }

  // Llamar cuando quieras detener el servidor para evitar interval leak
  stop() {
    clearInterval(this.cleanInterval);
  }
}

module.exports = new SimpleCache();
