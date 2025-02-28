export class Cache {
    constructor(getValue, getKey) {
        this.cache = {};
        this.getKey = getKey;
        this.getValue = getValue;
    }
    _getCacheAndKey(...path) {
        let cache = this.cache;
        let key;
        if (this.getKey) {
            key = this.getKey(...path);
        } else {
            for (let i = 0; i < path.length - 1; i++) {
                cache = cache[path[i]] = cache[path[i]] || {};
            }
            key = path[path.length - 1];
        }
        return { cache, key };
    }
    clear(...path) {
        const { cache, key } = this._getCacheAndKey(...path);
        delete cache[key];
    }
    invalidate() {
        this.cache = {};
    }
    read(...path) {
        const { cache, key } = this._getCacheAndKey(...path);
        if (!(key in cache)) {
            cache[key] = this.getValue(...path);
        }
        return cache[key];
    }
}

export class CacheWeak {
    constructor(getValue, getPath) {
        this.cache = new Map();
        // this.getKey = getKey;
        this.getValue = getValue;

        this.getPath = getPath;
    }
    _getCacheAndKey(...path) {
        let cache = this.cache;
        let key;
        if (this.getKey) {
            key = this.getKey(...path);
        } else {
            if (this.getPath) {
                path = this.getPath(...path);
            }
            for (let i = 0; i < path.length - 1; i++) {
                if (!cache.has(path[i])) {
                    cache.set(path[i], new Map());
                }
                cache = cache.get(path[i]);
            }
            key = path[path.length - 1];
        }
        return { cache, key };
    }
    clear(...path) {
        const { cache, key } = this._getCacheAndKey(...path);
        delete cache[key];
    }
    invalidate() {
        this.cache = new Map();
    }
    read(...path) {
        const { cache, key } = this._getCacheAndKey(...path);
        if (!cache.has(key)) {
            cache.set(key, this.getValue(...path));
        }
        return cache.get(key);
    }
}
