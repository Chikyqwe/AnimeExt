const { TextStore, keyStore, SimpleCache, MemCache } = require('./cacheStorage');
const { CACHE } = require("../../config");

// --- CACHE DE TEXTO ---
class TextCache {
    constructor(options = { ttlMs: 5 * 60 * 1000 }) {
        this.cache = new TextStore(options);
        if (CACHE) {
            setInterval(() => this.cache.cleanup(), 60_000).unref();
        }
    }

    save(uuid, text) {
        if (!CACHE) return;
        return this.cache.set(uuid, text);
    }

    load(uuid) {
        if (!CACHE) return null;
        return this.cache.get(uuid);
    }

    exists(uuid) {
        if (!CACHE) return false;
        return this.cache.has(uuid);
    }

    remove(uuid) {
        if (!CACHE) return;
        this.cache.delete(uuid);
    }
}

// --- CACHE DE LLAVES ---
class KeyCache {
    constructor(options = { ttlMs: 15 * 60 * 1000 }) {
        this.key = new keyStore(options);
        if (CACHE) {
            setInterval(() => this.key.cleanup(), 60_000).unref();
        }
    }

    save(keyId, keyData) {
        if (!CACHE) return;
        this.key.set(keyId, keyData);
    }

    load(keyId) {
        if (!CACHE) return null;
        return this.key.get(keyId);
    }

    exists(keyId) {
        if (!CACHE) return false;
        return this.key.has(keyId);
    }

    remove(keyId) {
        if (!CACHE) return;
        this.key.delete(keyId);
    }
}

// --- CACHE DISCO SIMPLE ---
class DiskCache {
    constructor(cleanInterval = 60_000) {
        this.cache = new SimpleCache(cleanInterval);
    }

    save(key, value, ttl) {
        if (!CACHE) return;
        this.cache.set(key, value, ttl);
    }

    load(key) {
        if (!CACHE) return null;
        return this.cache.get(key);
    }

    exists(key) {
        if (!CACHE) return false;
        return this.cache.has(key);
    }

    remove(key) {
        if (!CACHE) return;
        this.cache.del(key);
    }
}

// --- CACHE MEMORIA ---
class MemoryCache {
    constructor(options = { maxEntries: 100, maxStringLength: 50000 }) {
        this.cache = new MemCache(options);
    }

    save(key, value, ttl) {
        if (!CACHE) return;
        return this.cache.set(key, value, ttl);
    }

    load(key) {
        if (!CACHE) return null;
        return this.cache.get(key);
    }

    exists(key) {
        if (!CACHE) return false;
        return this.cache.get(key) !== undefined;
    }

    remove(key) {
        if (!CACHE) return;
        this.cache.delete(key);
    }
}

module.exports = {
    TextCache,
    KeyCache,
    DiskCache,
    MemoryCache
};