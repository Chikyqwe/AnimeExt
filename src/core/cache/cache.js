const { TextStore, keyStore, SimpleCache, MemCache } = require('./cacheStorage');

// --- CACHE DE TEXTO (DISK + GZIP) ---
class TextCache {
    constructor(options = { ttlMs: 5 * 60 * 1000 }) {
        this.cache = new TextStore(options);
        setInterval(() => this.cache.cleanup(), 60_000).unref();
    }

    save(uuid, text) {
        return this.cache.set(uuid, text);
    }

    load(uuid) {
        return this.cache.get(uuid);
    }

    exists(uuid) {
        return this.cache.has(uuid);
    }

    remove(uuid) {
        this.cache.delete(uuid);
    }
}

// --- CACHE DE LLAVES/OBJETOS (DISK + GZIP) ---
class KeyCache {
    constructor(options = { ttlMs: 15 * 60 * 1000 }) {
        this.key = new keyStore(options);
        setInterval(() => this.key.cleanup(), 60_000).unref();
    }

    save(keyId, keyData) {
        this.key.set(keyId, keyData);
    }

    load(keyId) {
        return this.key.get(keyId);
    }

    exists(keyId) {
        return this.key.has(keyId);
    }

    remove(keyId) {
        this.key.delete(keyId);
    }
}

// --- CACHE SIMPLE (DISK + JSON) ---
class DiskCache {
    constructor(cleanInterval = 60_000) {
        this.cache = new SimpleCache(cleanInterval);
    }

    save(key, value, ttl) {
        this.cache.set(key, value, ttl);
    }

    load(key) {
        return this.cache.get(key);
    }

    exists(key) {
        return this.cache.has(key);
    }

    remove(key) {
        this.cache.del(key);
    }
}

// --- CACHE RÁPIDA (MEMORY RAM - LIMITADA) ---
class MemoryCache {
    constructor(options = { maxEntries: 100, maxStringLength: 50000 }) {
        this.cache = new MemCache(options);
    }

    save(key, value, ttl) {
        return this.cache.set(key, value, ttl);
    }

    load(key) {
        return this.cache.get(key);
    }

    exists(key) {
        // En MemCache, si el get devuelve undefined es que no existe/expiró
        return this.cache.get(key) !== undefined;
    }

    remove(key) {
        this.cache.delete(key);
    }
}

module.exports = { 
    TextCache, 
    KeyCache, 
    DiskCache, 
    MemoryCache 
};