/** @odoo-module **/

/**
 * Browser
 *
 * This file exports an object containing common browser API. It may not look
 * incredibly useful, but it is very convenient when one needs to test code using
 * these methods. With this indirection, it is possible to patch the browser
 * object for a test.
 */

let sessionStorage = window.sessionStorage;
let localStorage = window.localStorage;
try {
    // Safari crashes in Private Browsing
    localStorage.setItem("__localStorage__", "true");
    localStorage.removeItem("__localStorage__");
} catch (e) {
    localStorage = makeRAMLocalStorage();
    sessionStorage = makeRAMLocalStorage();
}

export const browser = {
    addEventListener: window.addEventListener.bind(window),
    removeEventListener: window.removeEventListener.bind(window),
    setTimeout: window.setTimeout.bind(window),
    clearTimeout: window.clearTimeout.bind(window),
    setInterval: window.setInterval.bind(window),
    clearInterval: window.clearInterval.bind(window),
    requestAnimationFrame: window.requestAnimationFrame.bind(window),
    cancelAnimationFrame: window.cancelAnimationFrame.bind(window),
    console: window.console,
    location: window.location,
    history: window.history,
    navigator: navigator,
    open: window.open.bind(window),
    XMLHttpRequest: window.XMLHttpRequest,
    localStorage,
    sessionStorage,
    fetch: (window.fetch || (() => {})).bind(window), // TOREVIEW NXOWL
};

// -----------------------------------------------------------------------------
// memory localStorage
// -----------------------------------------------------------------------------

/**
 * @returns {typeof window["localStorage"]}
 */
export function makeRAMLocalStorage() {
    let store = {};
    return {
        setItem(key, value) {
            store[key] = value;
        },
        getItem(key) {
            return store[key];
        },
        clear() {
            store = {};
        },
        removeItem(key) {
            delete store[key];
        },
        get length() {
            return Object.keys(store).length;
        },
        key() {
            return "";
        },
    };
}
