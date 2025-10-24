import { Deferred } from "@web/core/utils/concurrency";
import { IndexedDB } from "@web/core/utils/indexed_db";
import { deepCopy } from "../utils/objects";

/**
 * @typedef {{
 * callback?: function;
 * type?: "ram" | "disk";
 * update?: "once" | "always";
 * maxAge?: number; // Max age in milliseconds. If the cached data is older, it will be refetched.
 * }} RPCCacheSettings
 */

function jsonEqual(v1, v2) {
    return JSON.stringify(v1) === JSON.stringify(v2);
}

function validateSettings({ type, update }) {
    if (!["ram", "disk"].includes(type)) {
        throw new Error(`Invalid "type" settings provided to RPCCache: ${type}`);
    }
    if (!["always", "once"].includes(update)) {
        throw new Error(`Invalid "update" settings provided to RPCCache: ${update}`);
    }
}

const CRYPTO_ALGO = "AES-GCM";
const ONE_WEEK = 7 * 24 * 60 * 60 * 1000;

class Crypto {
    constructor(secret) {
        this._cryptoKey = null;
        this._ready = window.crypto.subtle
            .importKey(
                "raw",
                new Uint8Array(secret.match(/../g).map((h) => parseInt(h, 16))).buffer,
                CRYPTO_ALGO,
                false,
                ["encrypt", "decrypt"]
            )
            .then((encryptedKey) => {
                this._cryptoKey = encryptedKey;
            });
    }

    async encrypt(value) {
        await this._ready;
        // The iv must never be reused with a given key.
        const iv = window.crypto.getRandomValues(new Uint8Array(12));
        const ciphertext = await window.crypto.subtle.encrypt(
            {
                name: CRYPTO_ALGO,
                iv,
                length: 64, // length of the counter in bits
            },
            this._cryptoKey,
            new TextEncoder().encode(JSON.stringify(value)) // encoded Data
        );
        return { ciphertext, iv };
    }

    async decrypt({ ciphertext, iv }) {
        await this._ready;
        const decrypted = await window.crypto.subtle.decrypt(
            {
                name: CRYPTO_ALGO,
                iv,
                length: 64,
            },
            this._cryptoKey,
            ciphertext
        );
        return JSON.parse(new TextDecoder().decode(decrypted));
    }
}

class RamCache {
    constructor() {
        this.ram = {};
    }

    write(table, key, value) {
        if (!(table in this.ram)) {
            this.ram[table] = {};
        }
        this.ram[table][key] = value;
    }

    read(table, key) {
        return this.ram[table]?.[key];
    }

    delete(table, key) {
        delete this.ram[table]?.[key];
    }

    invalidate(tables = null) {
        if (tables) {
            tables = typeof tables === "string" ? [tables] : tables;
            for (const table of tables) {
                if (table in this.ram) {
                    this.ram[table] = {};
                }
            }
        } else {
            this.ram = {};
        }
    }
}

export class RPCCache {
    constructor(name, version, secret) {
        this.crypto = new Crypto(secret);
        this.indexedDB = new IndexedDB(name, version + CRYPTO_ALGO);
        this.ramCache = new RamCache();
        this.pendingRequests = {};
    }

    /**
     * @param {string} table
     * @param {string} key
     * @param {function} fallback
     * @param {RPCCacheSettings} settings
     */
    read(table, key, fallback, { callback = () => {}, type = "ram", update = "once", maxAge = ONE_WEEK } = {}) {
        validateSettings({ type, update });

        let ramEntry = this.ramCache.read(table, key);
        let ramValue = ramEntry?.data;
        const ts = ramEntry?.timestamp;
        const isExpired = ts && (Date.now() - ts) > maxAge;

        const requestKey = `${table}/${key}`;
        const hasPendingRequest = requestKey in this.pendingRequests;
        if (hasPendingRequest) {
            // never do the same call multiple times in parallel => return the same value for all
            // those calls, but store their callback to call them when/if the real value is obtained
            this.pendingRequests[requestKey].push(callback);
            return ramValue.then((result) => deepCopy(result));
        }

        if (!ramValue || isExpired || update === "always") {
            this.pendingRequests[requestKey] = [];
            this.pendingRequests[requestKey].push(callback);
            const now = Date.now();

            // execute the fallback and write the result in the caches
            const prom = new Promise((resolve, reject) => {
                const fromCache = new Deferred();
                let fromCacheValue;
                const onFullfilled = (result) => {
                    resolve(result);
                    // call the pending request callbacks with the result
                    const hasChanged = !!fromCacheValue && !jsonEqual(fromCacheValue, result);
                    this.pendingRequests[requestKey]?.forEach((cb) =>
                        cb(deepCopy(result), hasChanged)
                    );
                    delete this.pendingRequests[requestKey];
                    // update the ram and optionally the disk caches with the latest data
                    this.ramCache.write(table, key, { data: Promise.resolve(result), timestamp: now });
                    if (type === "disk") {
                        this.crypto.encrypt(result).then((encryptedResult) => {
                            const diskEntry = { data: encryptedResult, timestamp: now };
                            this.indexedDB.write(table, key, diskEntry);
                        });
                    }
                    return result;
                };
                const onRejected = async (error) => {
                    await fromCache;
                    delete this.pendingRequests[requestKey];
                    if (fromCacheValue) {
                        // promise has already been fullfilled with the cached value
                        throw error;
                    }
                    this.ramCache.delete(table, key); // remove rejected prom from ram cache
                    reject(error);
                };
                fallback().then(onFullfilled, onRejected);

                // speed up the request by using the caches
                if (ramValue && !isExpired) {
                    // ramValue is always already resolved here, as it can't be pending (otherwise
                    // we would have early returned because of `pendingRequests`) and it would have
                    // been removed from the ram cache if it had been rejected
                    // => no need to define a `catch` callback.
                    ramValue.then((value) => {
                        resolve(value);
                        fromCacheValue = value;
                        fromCache.resolve();
                    });
                } else if (type === "disk") {
                    this.indexedDB
                        .read(table, key)
                        .then(async (result) => {
                            if (result) {
                                const encryptedData = result.data;
                                const isExpired = (Date.now() - result.timestamp) > maxAge;
                                if (isExpired) {
                                    return;
                                }
                                let decrypted;
                                try {
                                    decrypted = await this.crypto.decrypt(encryptedData);
                                } catch {
                                    // Do nothing ! The cryptoKey is probably different.
                                    // The data will be updated with the new cryptoKey.
                                    return;
                                }
                                resolve(decrypted);
                                fromCacheValue = decrypted;
                            }
                        })
                        .finally(() => fromCache.resolve());
                } else {
                    fromCache.resolve(); // fromCacheValue will remain undefined
                }
            });
            this.ramCache.write(table, key, { data: prom, timestamp: now });
            ramValue = prom;
        }

        return ramValue.then((result) => deepCopy(result));
    }

    invalidate(tables) {
        this.indexedDB.invalidate(tables);
        this.ramCache.invalidate(tables);
    }
}
