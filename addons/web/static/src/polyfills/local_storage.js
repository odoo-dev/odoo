// @odoo-module ignore
// Safari Private Browsing throws when accessing localStorage/sessionStorage.
// Replace them with in-memory implementations if that happens.
(function () {
    function makeRAMStorage() {
        var store = {};
        return {
            setItem: function (key, value) {
                var newValue = String(value);
                store[key] = newValue;
                window.dispatchEvent(new StorageEvent("storage", { key: key, newValue: newValue }));
            },
            getItem: function (key) {
                return Object.prototype.hasOwnProperty.call(store, key) ? store[key] : null;
            },
            clear: function () {
                store = {};
            },
            removeItem: function (key) {
                delete store[key];
                window.dispatchEvent(new StorageEvent("storage", { key: key, newValue: null }));
            },
            get length() {
                return Object.keys(store).length;
            },
            key: function () {
                return "";
            },
        };
    }

    try {
        window.localStorage.setItem("__test__", "1");
        window.localStorage.removeItem("__test__");
    } catch {
        Object.defineProperty(window, "localStorage", { value: makeRAMStorage() });
        Object.defineProperty(window, "sessionStorage", { value: makeRAMStorage() });
    }
})();
