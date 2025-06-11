import { Deferred } from "@web/core/utils/concurrency";
import { IndexedDB } from "@web/core/utils/indexed_db";

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

export class PersistentCache {
    constructor(name, version, idbSecret) {
        this.indexedDB = new IndexedDB(name, version);
        this.ramCache = new RamCache();
        if (window.isSecureContext && idbSecret) {
            window.crypto.subtle
                .importKey("raw", new TextEncoder().encode(idbSecret), "AES-CTR", true, [
                    "encrypt",
                    "decrypt",
                ])
                .then((encryptedKey) => {
                    this.cryptoKey = encryptedKey;
                });
        }
    }

    read(table, key, fallback, { onUpdate } = {}) {
        const ramValue = this.ramCache.read(table, key);
        if (ramValue && !onUpdate) {
            return ramValue;
        }
        const def = new Deferred();
        let fromCache = false;
        const prom = fallback()
            .then((result) => {
                if (this.cryptoKey) {
                    const counter = window.crypto.getRandomValues(new Uint8Array(16)); // 16-byte counter for CTR
                    window.crypto.subtle
                        .encrypt(
                            {
                                name: "AES-CTR",
                                counter,
                                length: 64, // Length of the counter in bits
                            },
                            this.cryptoKey,
                            new TextEncoder().encode(JSON.stringify(result)) //encoded Data
                        )
                        .then((ciphertext) => {
                            this.indexedDB.write(table, key, {
                                ciphertext,
                                counter,
                            });
                        });
                } else {
                    this.indexedDB.write(table, key, result);
                }
                this.ramCache.write(table, key, Promise.resolve(result));
                def.resolve(result);
                if (onUpdate && fromCache && fromCache !== JSON.stringify(result)) {
                    onUpdate(result);
                }
                return result;
            })
            .catch((error) => {
                if (fromCache) {
                    throw error;
                }
                this.ramCache.delete(table, key);
                def.reject(error);
            });
        if (ramValue) {
            ramValue.then((value) => {
                fromCache = JSON.stringify(value);
                def.resolve(value);
            });
        } else {
            this.ramCache.write(table, key, prom);
            this.indexedDB.read(table, key).then((result) => {
                if (result) {
                    if (this.cryptoKey) {
                        window.crypto.subtle
                            .decrypt(
                                {
                                    name: "AES-CTR",
                                    counter: result.counter,
                                    length: 64,
                                },
                                this.cryptoKey,
                                result.ciphertext
                            )
                            .then((decrypted) => {
                                const decoded = new TextDecoder().decode(decrypted);
                                const result = JSON.parse(decoded);
                                fromCache = decoded;
                                this.ramCache.write(table, key, Promise.resolve(result));
                                def.resolve(result);
                            })
                            .catch(() => {
                                // Do nothing ! The cryptoKey is probably different.
                                // The data will be upgrade with the new cryptoKey.
                            });
                    } else {
                        fromCache = JSON.stringify(result);
                        this.ramCache.write(table, key, Promise.resolve(result));
                        def.resolve(result);
                    }
                }
            });
        }
        return def;
    }

    invalidate(tables) {
        this.indexedDB.invalidate(tables);
        this.ramCache.invalidate(tables);
    }
}
