import { markRaw } from "@odoo/owl";
import { browser } from "@web/core/browser/browser";
import { ConnectionLostError, rpc, rpcBus } from "@web/core/network/rpc";
import { registry } from "@web/core/registry";
import { IndexedDB } from "@web/core/utils/indexed_db";
import { Reactive } from "@web/core/utils/reactive";
import { session } from "@web/session";

class OfflineManager extends Reactive {
    static TABLE_NAME = "visited-ui-items";
    static TABLE_NAME_DEBUG = "visited-ui-items-debug";

    static SELECTORS_TO_DISABLE = [
        "button:not([data-available-offline]):not([disabled])",
        "input[type='checkbox']:not([data-available-offline]):not([disabled])",
    ];

    constructor(env) {
        super(...arguments);

        this.env = env;
        this._idb = markRaw(new IndexedDB("offline", session.registry_hash));
        this._idbTable = this.env.debug
            ? OfflineManager.TABLE_NAME_DEBUG
            : OfflineManager.TABLE_NAME;
        this._visited = {}; // stores items that are available offline (only populated when offline)
        this._timeout = null; // used to repeatedly ping the server when offline
        this._observer = null; // used to detect DOM mutations and disable the UI when offline
        this._offline = false;

        // Use "offline" and "online" events for instant detection of connection lost/restored.
        browser.addEventListener("offline", () => {
            if (!this.offline) {
                this.checkConnection();
            }
        });
        browser.addEventListener("online", () => {
            if (this.offline) {
                this.checkConnection();
            }
        });

        // Use RPC:RESPONSE to validate the current offline status, which is more accurate than
        // the "offline"/"online" events (e.g. server is down).
        rpcBus.addEventListener("RPC:RESPONSE", async (ev) => {
            this.offline = ev.detail.error instanceof ConnectionLostError;
        });

        // When the "CLEAR-CACHES" event is triggered, the rpc cache is wiped out, so we must also
        // clear the information about elements that are available offline, as they aren't anymore.
        rpcBus.addEventListener("CLEAR-CACHES", () => {
            this._idb.invalidate([OfflineManager.TABLE_NAME, OfflineManager.TABLE_NAME_DEBUG]);
            this._visited = {};
        });
    }

    get offline() {
        return this._offline;
    }

    /**
     * Sets the offline status.
     *
     * If we're going offline, we must get the information about actions, views, records that
     * are available offline before toggling the status, such that the rest of the UI can
     * synchronously access the information when rendering offline. As reading from indexeddb
     * is async, we read everything once, and store it in an plain object. We also ensure that
     * buttons and inputs in the UI that haven't been tagged as "available-offline" are
     * disabled while being offline. Finally, we repeatedly try to ping the server to detect if
     * connection is back.
     *
     * If we're going online, we re-enable the UI and update the offline status.
     *
     * @param {boolean} offline
     */
    set offline(offline) {
        if (offline === this._offline) {
            return;
        }
        this._offline = offline;
        this._visited = {};
        if (offline) {
            // Disable everything in the UI that isn't marked as available offline.
            this._offlineUI();
            // Create an observer instance linked to the callback function to keep disabling
            // elements that would appear in the DOM while being offline.
            this._observer = new MutationObserver(() => {
                if (this._offline) {
                    this._offlineUI();
                }
            });
            this._observer.observe(document.body, {
                childList: true, // listen for direct children being added/removed
                subtree: true, // also observe descendants (not just direct children)
                attributeFilter: ["data-available-offline"], // listen for specific attribute change
            });

            // Repeatedly check if connection is back.
            let delay = 2000;
            const _checkConnection = async () => {
                if (this._offline) {
                    await this.checkConnection();
                    // exponential backoff, with some jitter
                    delay = delay * 1.5 + 500 * Math.random();
                    this._timeout = browser.setTimeout(_checkConnection, delay);
                }
            };
            this._timeout = browser.setTimeout(_checkConnection, delay);

            // Retrieve the information about visited items from indexeddb.
            this._idb.getAllEntries(this._idbTable).then((result) => {
                if (offline !== this._offline) {
                    return; // status changed again meanwhile
                }
                for (const { key, value } of result) {
                    const { action, viewType, resId } = JSON.parse(key);
                    this._visited[action] = this._visited[action] || { views: {} };
                    if (viewType === "form") {
                        this._visited[action].views.form = this._visited[action].views.form || [];
                        this._visited[action].views.form.push(resId);
                    } else {
                        this._visited[action].views[viewType] = value;
                    }
                }
            });
        } else {
            this._onlineUI();
            this._observer?.disconnect();
            browser.clearTimeout(this._timeout);
        }
    }

    /**
     * Pings the server to check if it is reachable.
     */
    async checkConnection() {
        try {
            await rpc("/web/webclient/version_info", {});
        } catch {
            // just catch the error, the offline status will be updated with RPC:RESPONSE
        }
    }

    /**
     * Returns search queries that are available offline, their facets and the number of times they
     * have been accessed, given an action id and a view type.
     *
     * @param {number} actionId
     * @param {"kanban"|"list"}
     * @returns Object
     */
    async getAvailableQueries(actionId, viewType) {
        // return this._visited[actionId]?.views[viewType] || {};
        let queries;
        if (actionId) {
            const key = JSON.stringify({ action: actionId, viewType });
            queries = await this._idb.read(this._idbTable, key);
        }
        return queries || {};
    }

    /**
     * Returns a boolean indicating whether the requested element is available offline, i.e.
     * if it has been visited online and stored in cache.
     *
     * @param {number} actionId
     * @param {"kanban"|"list"|"form"} [viewType]
     * @param {Object} params
     * @param {number} [params.resId]
     * @param {?} [params.query]
     * @returns boolean
     */
    isAvailableOffline(actionId, viewType, { resId, query } = {}) {
        const action = this._visited[actionId];
        if (!viewType) {
            return !!action;
        }
        const view = action?.views[viewType];
        if (viewType === "form") {
            return view?.includes(resId);
        }
        return view && JSON.stringify(query) in view;
    }

    /**
     * Mark an action, view type and optionally record as available offline.
     *
     * @param {number} actionId
     * @param {"kanban"|"list"|"form"} viewType
     * @param {Object} params
     * @param {number} [params.resId] the record id, when viewType is "form"
     */
    async setAvailableOffline(actionId, viewType, { resId, facets, query }) {
        if (!this.offline) {
            const key = JSON.stringify({ action: actionId, viewType, resId });
            let value;
            if (viewType === "form") {
                value = true;
            } else {
                value = (await this._idb.read(this._idbTable, key)) || {};
                const queryStr = JSON.stringify(query);
                let count = value[queryStr]?.count || 0;
                delete value[queryStr]; // delete and re-add to mark it as "last visited"
                value[queryStr] = {
                    count: count++,
                    facets,
                };
            }
            this._idb.write(this._idbTable, key, value);
        }
    }

    // -------------------------------------------------------------------------
    // Private
    // -------------------------------------------------------------------------

    /**
     * Disables interactive elements (e.g. buttons) that haven't been tagged as "available-offline".
     *
     * @private
     */
    _offlineUI() {
        // Re-enable elements that have been marked as available offline
        document.querySelectorAll(".o_disabled_offline[data-available-offline]").forEach((el) => {
            el.removeAttribute("disabled");
            el.classList.remove("o_disabled_offline");
        });
        document.querySelectorAll(OfflineManager.SELECTORS_TO_DISABLE.join(", ")).forEach((el) => {
            el.setAttribute("disabled", "");
            el.classList.add("o_disabled_offline");
        });
    }

    /**
     * Re-enables elements that have previously been disabled by @_offlineUI.
     *
     * @private
     */
    _onlineUI() {
        document.querySelectorAll(".o_disabled_offline").forEach((el) => {
            el.removeAttribute("disabled");
            el.classList.remove("o_disabled_offline");
        });
    }
}

export const offlineService = {
    async start(env) {
        return new OfflineManager(env);
    },
};

registry.category("services").add("offline", offlineService);
