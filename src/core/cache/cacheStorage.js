const zlib = require("zlib");
const fs = require("fs");
const path = require("path");

// CONFIGURACIÓN DE RUTAS
const REGISTRY_FILE = path.join(__dirname, "../tmp/reg.json");
const DATA_ROOT = path.join(__dirname, "../tmp/data");

const DIRS = {
    text: path.join(DATA_ROOT, "text"),
    keys: path.join(DATA_ROOT, "keys"),
    cache: path.join(DATA_ROOT, "cache")
};

// Crear estructura de directorios
if (!fs.existsSync(DATA_ROOT)) fs.mkdirSync(DATA_ROOT, { recursive: true });
Object.values(DIRS).forEach(dir => {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});
if (!fs.existsSync(REGISTRY_FILE)) fs.writeFileSync(REGISTRY_FILE, "{}", "utf8");

/**
 * GESTOR DE REGISTRO GLOBAL
 */
const GlobalRegistry = {
    load() {
        try { return JSON.parse(fs.readFileSync(REGISTRY_FILE, "utf8")); }
        catch { return {}; }
    },
    save(data) {
        fs.writeFileSync(REGISTRY_FILE, JSON.stringify(data, null, 4));
    }
};

/**
 * TEXTSTORE
 */
class TextStore {
    constructor({ ttlMs = 5 * 60 * 1000 } = {}) {
        this.ttlMs = ttlMs;
    }

    _compress(text) { return zlib.gzipSync(text); }
    _decompress(buffer) { return zlib.gunzipSync(buffer).toString(); }

    set(uuid, text) {
        const compressed = this._compress(text);
        const fileName = `${uuid}.gz`;
        const filePath = path.join(DIRS.text, fileName);

        fs.writeFileSync(filePath, compressed);

        const registry = GlobalRegistry.load();
        registry[uuid] = {
            type: "text",
            file: fileName,
            size: compressed.length,
            create: Date.now(),
            exp: Date.now() + this.ttlMs
        };
        GlobalRegistry.save(registry);

        return {
            ok: true,
            savedToDisk: true,
            originalSize: Buffer.byteLength(text, "utf8"),
            compressedSize: compressed.length
        };
    }

    get(uuid) {
        const registry = GlobalRegistry.load();
        const entry = registry[uuid];

        if (!entry || entry.type !== "text") return null;

        if (Date.now() > entry.exp) {
            this.delete(uuid);
            return null;
        }

        const filePath = path.join(DIRS.text, entry.file);
        if (!fs.existsSync(filePath)) return null;

        return this._decompress(fs.readFileSync(filePath));
    }

    delete(uuid) {
        const registry = GlobalRegistry.load();
        const entry = registry[uuid];
        if (entry) {
            try { fs.unlinkSync(path.join(DIRS.text, entry.file)); } catch {}
            delete registry[uuid];
            GlobalRegistry.save(registry);
        }
    }
    has(uuid) {
        const registry = GlobalRegistry.load();
        const entry = registry[uuid];
        if (!entry || entry.type !== "text") return false;
        
        // Verificar si expiró
        if (Date.now() > entry.exp) {
            this.delete(uuid);
            return false;
        }
        return true;
    }
    cleanup() {
        const now = Date.now();
        const registry = GlobalRegistry.load();
        let changed = false;

        for (const [id, entry] of Object.entries(registry)) {
            if (entry.type === "text" && now > entry.exp) {
                try {
                    fs.unlinkSync(path.join(DIRS.text, entry.file));
                } catch {}
                delete registry[id];
                changed = true;
            }
        }
        if (changed) GlobalRegistry.save(registry);
    }
}

/**
 * KEYSTORE
 */
class keyStore {
    constructor({ ttlMs = 15 * 60 * 1000 } = {}) {
        this.ttlMs = ttlMs;
    }

    _compress(obj) { return zlib.gzipSync(JSON.stringify(obj)); }
    _decompress(buffer) { return JSON.parse(zlib.gunzipSync(buffer).toString()); }

    set(keyId, keyData) {
        const compressed = this._compress(keyData);
        const fileName = `${keyId}.json.gz`;
        const filePath = path.join(DIRS.keys, fileName);

        fs.writeFileSync(filePath, compressed);

        const registry = GlobalRegistry.load();
        registry[keyId] = {
            type: "key",
            file: fileName,
            size: compressed.length,
            create: Date.now(),
            exp: Date.now() + this.ttlMs
        };
        GlobalRegistry.save(registry);
    }

    get(keyId) {
        const registry = GlobalRegistry.load();
        const entry = registry[keyId];

        if (!entry || entry.type !== "key") return null;

        if (Date.now() > entry.exp) {
            this.delete(keyId);
            return null;
        }

        const filePath = path.join(DIRS.keys, entry.file);
        if (!fs.existsSync(filePath)) return null;

        return this._decompress(fs.readFileSync(filePath));
    }

    delete(keyId) {
        const registry = GlobalRegistry.load();
        const entry = registry[keyId];
        if (entry) {
            try { fs.unlinkSync(path.join(DIRS.keys, entry.file)); } catch {}
            delete registry[keyId];
            GlobalRegistry.save(registry);
        }
    }
}

/**
 * SIMPLECACHE
 */
class SimpleCache {
    constructor(cleanInterval = 60_000) {
        this.cleanInterval = setInterval(() => this.cleanup(), cleanInterval);
    }

    set(key, value, ttl = 60_000) {
        const fileName = `${key}.json`;
        const filePath = path.join(DIRS.cache, fileName);
        
        fs.writeFileSync(filePath, JSON.stringify({ value }));

        const registry = GlobalRegistry.load();
        registry[key] = {
            type: "cache",
            file: fileName,
            exp: Date.now() + ttl
        };
        GlobalRegistry.save(registry);
    }

    get(key) {
        const registry = GlobalRegistry.load();
        const entry = registry[key];

        if (!entry || entry.type !== "cache") return undefined;

        if (Date.now() > entry.exp) {
            this.delete(key);
            return undefined;
        }

        try {
            const data = JSON.parse(fs.readFileSync(path.join(DIRS.cache, entry.file), "utf8"));
            return data.value;
        } catch { return undefined; }
    }

    delete(key) {
        const registry = GlobalRegistry.load();
        const entry = registry[key];
        if (entry) {
            try { fs.unlinkSync(path.join(DIRS.cache, entry.file)); } catch {}
            delete registry[key];
            GlobalRegistry.save(registry);
        }
    }

    cleanup() {
        const now = Date.now();
        const registry = GlobalRegistry.load();
        let changed = false;

        for (const [id, entry] of Object.entries(registry)) {
            if (now > entry.exp) {
                try {
                    const folder = DIRS[entry.type];
                    fs.unlinkSync(path.join(folder, entry.file));
                } catch {}
                delete registry[id];
                changed = true;
            }
        }

        if (changed) GlobalRegistry.save(registry);
    }

    stop() { clearInterval(this.cleanInterval); }
}
/**
 * MEMCACHE (In-Memory con límites estrictos)
 */
class MemCache {
    constructor({ 
        maxEntries = 100,           // Máximo de elementos en RAM
        maxStringLength = 50000,    // ~50KB por entrada de texto
        cleanInterval = 30000 
    } = {}) {
        this.cache = new Map();
        this.maxEntries = maxEntries;
        this.maxStringLength = maxStringLength;
        this.timer = setInterval(() => this.cleanup(), cleanInterval);
    }

    set(key, value, ttl = 60000) {
        // 1. Validar límites de tamaño si es string
        if (typeof value === 'string' && value.length > this.maxStringLength) {
            console.warn(`MemCache: Entry "${key}" exceeds size limit.`);
            return false;
        }

        // 2. Control de capacidad (Evicción simple)
        if (this.cache.size >= this.maxEntries) {
            const firstKey = this.cache.keys().next().value;
            this.delete(firstKey);
        }

        const expiresAt = Date.now() + ttl;
        this.cache.set(key, { value, exp: expiresAt });

        // Registrar en el registro global (marcado como tipo memoria)
        const registry = GlobalRegistry.load();
        registry[key] = {
            type: "mem",
            file: "RAM", // No tiene archivo físico
            exp: expiresAt
        };
        GlobalRegistry.save(registry);
        return true;
    }

    get(key) {
        const entry = this.cache.get(key);
        
        // Si no está en RAM o expiró
        if (!entry || Date.now() > entry.exp) {
            this.delete(key);
            return undefined;
        }

        return entry.value;
    }

    delete(key) {
        this.cache.delete(key);
        const registry = GlobalRegistry.load();
        if (registry[key] && registry[key].type === "mem") {
            delete registry[key];
            GlobalRegistry.save(registry);
        }
    }

    cleanup() {
        const now = Date.now();
        const registry = GlobalRegistry.load();
        let changed = false;

        // Limpiar RAM
        for (const [key, entry] of this.cache.entries()) {
            if (now > entry.exp) {
                this.cache.delete(key);
                if (registry[key]) {
                    delete registry[key];
                    changed = true;
                }
            }
        }

        if (changed) GlobalRegistry.save(registry);
    }

    stop() {
        clearInterval(this.timer);
    }
}
module.exports = { TextStore, keyStore, SimpleCache, MemCache };