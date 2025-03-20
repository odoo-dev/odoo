import { _t } from "@web/core/l10n/translation";

export default class IndexedDB {
    /**
     * @param {string} dbName - The name of the database.
     * @param {Array<[string, string]>} dbStores - An array of [keyPath, storeName] pairs.
     */
    constructor(dbName, dbStores) {
        this.dbName = dbName;
        this.dbStores = dbStores;
        this.db = null;
        this.indexedDB =
            window.indexedDB || window.mozIndexedDB || window.webkitIndexedDB || window.msIndexedDB;
    }

    get name() {
        return this.dbName;
    }
    /**
     * Initialize the database and create any missing object stores.
     * @returns {Promise<void>}
     */
    async init() {
        if (!this.indexedDB) {
            throw new Error(
                _t(
                    "Warning: Your browser doesn't support IndexedDB. The data won't be saved. Please use a modern browser."
                )
            );
        }

        // Open the database without specifying a version
        let db = await this._openDB();
        // Check for missing stores.
        const missingStores = [];
        for (const [, storeName] of this.dbStores) {
            if (!db.objectStoreNames.contains(storeName)) {
                missingStores.push(storeName);
            }
        }
        if (missingStores.length > 0) {
            db.close();
            // Increment the database version to add the missing stores.
            db = await this._openDB(db.version + 1);
        }
        this.db = db;
    }

    /**
     * Checks if the database is ready.
     * @returns {boolean}
     */
    isReady() {
        return !!this.db;
    }

    /**
     * Adds or updates record(s) in the specified store.
     * @param {string} storeName - The object store name.
     * @param {Object| Array<Object>} data - A record or array of records to add.
     */
    add(storeName, data) {
        return this._performAction(storeName, data, "put");
    }

    /**
     * Deletes record(s) from a specified store.
     * @param {string} storeName - The object store name.
     * @param {any|Array<any>} ids - The key or keys of the record(s) to delete.
     * @returns {Promise<Array<PromiseSettledResult<void>>|undefined>}
     */
    delete(storeName, ids) {
        return this._performAction(storeName, ids, "delete");
    }

    /**
     * Reads all records from the specified object stores.
     * If no store names are provided, reads from all configured stores.
     * @param {Array<string>} [storeNames=[]] - Array of store names to read from.
     * @returns {Promise<Object>} - An object mapping store names to their records.
     */
    readAll(storeNames = []) {
        if (!this.isReady()) {
            return false;
        }

        storeNames =
            storeNames.length > 0 ? storeNames : this.dbStores.map(([, storeName]) => storeName);
        const transaction = this.db.transaction(storeNames, "readonly");
        const promises = storeNames.map(
            (store) =>
                new Promise((resolve, reject) => {
                    const objectStore = transaction.objectStore(store);
                    const request = objectStore.getAll();
                    request.onerror = (event) => {
                        reject(event.target.error);
                    };
                    request.onsuccess = (event) => {
                        const result = event.target.result;
                        resolve({ [store]: result });
                    };
                })
        );

        return Promise.allSettled(promises).then((results) =>
            results.reduce((acc, result) => {
                if (result.status === "fulfilled") {
                    return { ...acc, ...result.value };
                }
                return acc;
            }, {})
        );
    }

    close() {
        this.db?.close();
        this.db = null;
    }

    /**
     * Deletes the entire database.
     * @returns {Promise<boolean>} - Resolves to true when deletion is successful.
     */
    deleteDatabase() {
        if (!this.indexedDB) {
            return false;
        }

        return new Promise((resolve, reject) => {
            this.close();
            const request = this.indexedDB.deleteDatabase(this.dbName);
            request.onerror = (event) => reject(event.target.error);
            request.onsuccess = () => {
                this.db = null;
                resolve(true);
            };
        });
    }

    /**
     * Opens the database
     * @param {number} [version] - Optional version number.
     * @returns {Promise<IDBDatabase>}
     */
    _openDB(version) {
        return new Promise((resolve, reject) => {
            const request = version
                ? this.indexedDB.open(this.dbName, version)
                : this.indexedDB.open(this.dbName);

            request.onerror = (event) => reject(event.target.error);
            request.onsuccess = (event) => resolve(event.target.result);
            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                // Create any missing object stores.
                for (const [id, storeName] of this.dbStores) {
                    if (!db.objectStoreNames.contains(storeName)) {
                        db.createObjectStore(storeName, { keyPath: id });
                    }
                }
            };
        });
    }

    /**
     * Performs a database operation (e.g., "put", "delete") on a specified store.
     * @param {string} storeName - The object store name.
     * @param {Array<any>} arrData - Array of data items (or keys for delete).
     * @param {string} method - The method to call on the object store.
     * @returns {Promise<Array<PromiseSettledResult<void>>>}
     */
    async _performAction(storeName, arrData, method) {
        if (!this.isReady() || !arrData) {
            return false;
        }

        arrData = Array.isArray(arrData) ? arrData : [arrData];
        if (arrData.length === 0) {
            return false;
        }

        const transaction = this.db.transaction([storeName], "readwrite");
        const objectStore = transaction.objectStore(storeName);

        const promises = arrData.map(
            (data) =>
                new Promise((resolve, reject) => {
                    const request = objectStore[method](data);
                    request.onsuccess = () => resolve();
                    request.onerror = (event) => reject(event.target.error);
                })
        );
        return Promise.allSettled(promises);
    }
}
