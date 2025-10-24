import { browser } from "@web/core/browser/browser";
import { session } from "@web/session";

const LOCAL_STORAGE_SUBVERSION = 0;

/**
 * @typedef {Object} VersionedValue
 * @property {any} value
 * @property {string} version
 */

export function getCurrentLocalStorageVersion() {
    const [major, minor] = session.server_version_info ?? "1.0";
    return [major, minor, LOCAL_STORAGE_SUBVERSION].join(".");
}

/**
 * Utility class to simplify interaction on local storage with constant local storage key and with versioning.
 * When a value is set, this is done as `{ value, version }`.
 * Note: The object syntax is necessary to properly handle types, like "false" vs false.
 */
export class LocalStorageEntry {
    /** @type {string} */
    key;
    constructor(key) {
        this.key = key;
    }
    get() {
        const rawValue = this.rawGet();
        if (rawValue === null) {
            return undefined;
        }
        return parseRawValue(rawValue)?.value;
    }
    set(value) {
        const oldValue = this.get();
        if (oldValue !== undefined && oldValue === value) {
            return;
        }
        browser.localStorage.setItem(this.key, toRawValue(value));
    }
    rawGet() {
        return browser.localStorage.getItem(this.key);
    }
    remove() {
        if (this.rawGet() === null) {
            return;
        }
        browser.localStorage.removeItem(this.key);
    }
}

export function toRawValue(value) {
    return JSON.stringify({ value });
}

/**
 * @param {string} rawValue
 * @returns {VersionedValue}
 */
export function parseRawValue(rawValue) {
    try {
        return JSON.parse(rawValue);
    } catch {
        // noop
    }
}
