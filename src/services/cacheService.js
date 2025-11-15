// src/services/cacheService.js
// Caché simple por TTL. Uso: cache.get(key) / cache.set(key, value, ttlMs)
class SimpleCache {
  constructor() {
    this.store = new Map();
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
}

module.exports = new SimpleCache();
