const M3U8Store = require('./cacheStorage');

class M3U8Cache {
    constructor(options = {}) {
        this.cache = new M3U8Store(options);

        setInterval(() => {
            this.cache.cleanup();
        }, 60_000).unref();
    }

    save(uuid, m3u8Text) {
        // Retornamos la info que devuelve el store
        return this.cache.set(uuid, m3u8Text);
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



module.exports = M3U8Cache;
