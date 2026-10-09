import { IDBQuotaExceededError, IndexedDB } from "@web/core/utils/indexed_db";
import { browser } from "../browser/browser";
import { router } from "../browser/router";
import { ConnectionLostError } from "./rpc";
import { deepCopy } from "../utils/objects";
import { Crypto, CRYPTO_ALGO } from "../crypto";

/**
 * The rpc cache can be turned off for the current browsing session by putting
 * `cache=0` in the url (see the "Disable RPC Cache" debug menu item). This is
 * useful to check whether a bug comes from stale cached data.
 *
 * Note that the router serializes falsy values as an empty string, so a `cache`
 * key kept in the url by a previous navigation reads as `cache=`, which must be
 * understood as disabled as well.
 *
 * @returns {boolean}
 */
export function isRPCCacheDisabled() {
    return [0, "", "false"].includes(router.current.cache);
}

/**
 * @typedef {{
 * callback?: function;
 * type?: "ram" | "disk";
 * update?: "once" | "always";
 * maxAge?: number; // Max age in milliseconds.
 *                  // Defines the validity of a new entry created by this call.
 *                  // On read, the entry is checked against last stored expiry time; if expired, it is ignored.
 * noCache?: boolean;
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

const ONE_YEAR = luxon.Duration.fromObject({ years: 1 }).toMillis();
const MAX_STORAGE_SIZE = 2 * 1024 * 1024 * 1024; // 2Gb
const ALL_TABLES = "*";

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
        this.staleSinceKey = `${name}_stale_since`;
        this.ramCache = new RamCache();
        this.pendingRequests = {};
        this.checkSize(); // we want to control the disk space used by Odoo
    }

    async checkSize() {
        const { usage } = await navigator.storage.estimate();
        if (usage > MAX_STORAGE_SIZE) {
            console.log(`Deleting indexedDB database as maximum storage size is reached`);
            return this.indexedDB.deleteDatabase();
        }
    }

    _getStaleSince() {
        return JSON.parse(browser.localStorage.getItem(this.staleSinceKey) || "{}");
    }

    _isStale(table, entry) {
        // the entry timestamp is the time its request started: a request started before the
        // invalidation (e.g. in another tab) writes a stale entry
        const staleSince = this._getStaleSince();
        return entry.timestamp <= Math.max(staleSince[table] || 0, staleSince[ALL_TABLES] || 0);
    }

    /**
     * @param {string} table
     * @param {string} key
     * @param {function} fallback
     * @param {RPCCacheSettings} settings
     */
    read(
        table,
        key,
        fallback,
        {
            callback = () => {},
            type = "ram",
            update = "once",
            maxAge = ONE_YEAR,
            noCache = false,
        } = {}
    ) {
        validateSettings({ type, update });

        const ramEntry = !noCache ? this.ramCache.read(table, key) : null;
        const isExpired = ramEntry?.expires && ramEntry?.expires < Date.now();
        let ramValue = !isExpired ? ramEntry?.data : null;

        const requestKey = `${table}/${key}`;
        const pendingRequest = this.pendingRequests[requestKey];
        if (pendingRequest) {
            if (!noCache) {
                // never do the same call multiple times in parallel => return the same value for all
                // those calls, but store their callback to call them when/if the real value is obtained
                pendingRequest.callbacks.push(callback);
                return ramValue.then((result) => deepCopy(result));
            } else {
                pendingRequest.invalidated = true;
            }
        }

        if (!ramValue || update === "always") {
            const request = { callbacks: [callback], invalidated: false };
            this.pendingRequests[requestKey] = request;
            const now = Date.now();

            // execute the fallback and write the result in the caches
            const prom = new Promise((resolve, reject) => {
                const fromCache = Promise.withResolvers();
                let fromCacheValue;
                let staleValue;
                const onFullfilled = (result) => {
                    resolve(result);
                    // call the pending request callbacks with the result
                    const hasChanged = !!fromCacheValue && !jsonEqual(fromCacheValue, result);
                    request.callbacks.forEach((cb) => cb(deepCopy(result), hasChanged));
                    if (request.invalidated) {
                        return result;
                    }
                    delete this.pendingRequests[requestKey];
                    // update the ram and optionally the disk caches with the latest data
                    this.ramCache.write(table, key, {
                        data: Promise.resolve(result),
                        timestamp: now,
                        expires: now + maxAge,
                    });
                    if (type === "disk") {
                        this.crypto.encrypt(result).then((encryptedResult) => {
                            const diskEntry = {
                                data: encryptedResult,
                                timestamp: now,
                                expires: now + maxAge,
                            };
                            this.indexedDB.write(table, key, diskEntry).catch((e) => {
                                if (e instanceof IDBQuotaExceededError) {
                                    this.indexedDB.deleteDatabase();
                                } else {
                                    throw e;
                                }
                            });
                        });
                    }
                    return result;
                };
                const onRejected = async (error) => {
                    await fromCache.promise;
                    if (!request.invalidated) {
                        delete this.pendingRequests[requestKey];
                        if (!fromCacheValue) {
                            this.ramCache.delete(table, key); // remove rejected prom from ram cache
                        }
                    }
                    if (fromCacheValue) {
                        // promise has already been fullfilled with the cached value
                        throw error;
                    }
                    if (staleValue && error instanceof ConnectionLostError) {
                        resolve(staleValue);
                        throw error;
                    }
                    reject(error);
                };
                fallback().then(onFullfilled, onRejected);

                // speed up the request by using the caches
                if (ramValue) {
                    // ramValue is always already resolved here, as it can't be pending (otherwise
                    // we would have early returned because of `pendingRequests`) and it would have
                    // been removed from the ram cache if it had been rejected
                    // => no need to define a `catch` callback.
                    ramValue.then((value) => {
                        resolve(value);
                        fromCacheValue = value;
                        fromCache.resolve();
                    });
                } else if (type === "disk" && !noCache) {
                    this.indexedDB
                        .read(table, key)
                        .then(async (result) => {
                            if (result) {
                                if (result.expires < now) {
                                    return;
                                }
                                let decrypted;
                                try {
                                    decrypted = await this.crypto.decrypt(result.data);
                                } catch {
                                    // Do nothing ! The cryptoKey is probably different.
                                    // The data will be updated with the new cryptoKey.
                                    return;
                                }
                                if (this._isStale(table, result)) {
                                    // only used offline, online we wait for the fresh value
                                    staleValue = decrypted;
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
            this.ramCache.write(table, key, { data: prom, timestamp: now, expires: now + maxAge });
            ramValue = prom;
        }

        return ramValue.then((result) => deepCopy(result));
    }

    /**
     * Disk entries are kept so that they remain available offline, they are
     * only marked as stale (in localStorage, to be shared with the other tabs
     * and survive reloads).
     *
     * @param {string|string[]} [tables] if not given, all tables are invalidated
     */
    invalidate(tables) {
        const now = Date.now();
        const staleSince = tables ? this._getStaleSince() : {};
        for (const table of tables ? [].concat(tables) : [ALL_TABLES]) {
            staleSince[table] = now;
        }
        browser.localStorage.setItem(this.staleSinceKey, JSON.stringify(staleSince));
        this.ramCache.invalidate(tables);
        // flag the pending requests as invalidated s.t. we don't write their results in caches
        for (const key in this.pendingRequests) {
            this.pendingRequests[key].invalidated = true;
        }
        this.pendingRequests = {};
    }
}
