const zlib = require('zlib');

class M3U8Store {
    constructor({ ttlMs = 5 * 60 * 1000 } = {}) {
        this.ttlMs = ttlMs;
        this.store = new Map();
    }

    _compress(text) {
        return zlib.gzipSync(text);
    }

    _decompress(buffer) {
        return zlib.gunzipSync(buffer).toString();
    }

    set(uuid, m3u8Text) {
        const compressed = this._compress(m3u8Text);

        this.store.set(uuid, {
            data: compressed,
            expiresAt: Date.now() + this.ttlMs
        });

        // Retornar info de compresi ón
        return {
            ok: true,
            originalSize: Buffer.byteLength(m3u8Text, 'utf8'),
            compressedSize: compressed.length
        };
    }

    get(uuid) {
        const entry = this.store.get(uuid);
        if (!entry) return null;

        if (Date.now() > entry.expiresAt) {
            this.store.delete(uuid);
            return null;
        }

        return this._decompress(entry.data);
    }

    has(uuid) {
        return this.get(uuid) !== null;
    }

    delete(uuid) {
        this.store.delete(uuid);
    }

    cleanup() {
        const now = Date.now();
        for (const [key, value] of this.store.entries()) {
            if (now > value.expiresAt) {
                this.store.delete(key);
            }
        }
    }
}

module.exports = M3U8Store;
