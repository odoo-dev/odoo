import { EventBus } from "@odoo/owl";

import { browser } from "@web/core/browser/browser";
import { _t } from "@web/core/l10n/translation";
import { registry } from "@web/core/registry";
import { user } from "@web/core/user";
import { reactive } from "@web/owl2/utils";
import { session } from "@web/session";

// List of worker events that should not be broadcasted.
const INTERNAL_EVENTS = new Set([
    "BUS:INITIALIZED",
    "BUS:OUTDATED",
    "BUS:NOTIFICATION",
    "BUS:PROVIDE_LOGS",
]);

export const BACK_ONLINE_RECONNECT_DELAY = 5000;

/**
 * @typedef {Exclude<
 *   import("@bus/workers/websocket_worker").WorkerEvent,
 *   "BUS:INITIALIZED" |
 *   "BUS:OUTDATED" |
 *   "BUS:NOTIFICATION" |
 *   "BUS:PROVIDE_LOGS"
 * >} BusServiceEvent
 */

/**
 * Handle real-time communication with the server. Emits events defined in
 * {@link BusServiceEvent}.
 */
export class BusService {
    /**
     * @private
     * Timeout before attempting to reconnect after coming back online. The first
     * reconnect attempt often fails because the network is not yet stable, which can lead
     * to long delays due to exponential backoff.
     */
    _backOnlineTimeout;
    /** @private */
    _eventBus = new EventBus();
    /** @private @type {?PromiseWithResolvers<void>} */
    _initializedResolvers;
    /** @private */
    _multiTabService;
    /** @private */
    _notificationBus = new EventBus();
    /** @private */
    _notificationService;
    /** @private */
    _serverURL;
    /** @private */
    _startedAt = luxon.DateTime.now().set({ milliseconds: 0 });
    /** @private @type {"idle" | "started" | "unregistered"}*/
    _state = "idle";
    /**
     * @private
     * @type {Map<Function, Function>} Map from callback functions, passed to subscribe
     * and their wrapper, which is used to get a simpler API.
     */
    _subscribeFnToWrapper = new Map();
    /** @private */
    _workerService;
    /** @private */
    _workerState = null;
    /**
     * @param {import("@web/env").OdooEnv} env
     * @param {Pick<import("services").ServiceFactories, "bus.parameters" |  "multi_tab" | "notification" | "worker_service">} services
     */
    constructor(env, services) {
        this._env = env;
        this._serverURL = services["bus.parameters"].serverURL;
        this._multiTabService = services.multi_tab;
        this._notificationService = services.notification;
        this._workerService = services.worker_service;
        const reactiveThis = reactive(this);
        this.setup.call(reactiveThis);
        return reactiveThis;
    }

    setup() {
        browser.addEventListener("pagehide", ({ persisted }) => {
            if (!persisted) {
                // Page is gonna be unloaded, disconnect this client from the worker.
                this._sendToWorker("BUS:LEAVE");
            }
        });
        browser.addEventListener(
            "online",
            () => {
                this._backOnlineTimeout = browser.setTimeout(() => {
                    if (this._state === "started") {
                        this._sendToWorker("BUS:START");
                    }
                }, BACK_ONLINE_RECONNECT_DELAY);
            },
            { capture: true }
        );
        browser.addEventListener(
            "offline",
            () => {
                clearTimeout(this._backOnlineTimeout);
                if (this._state === "started") {
                    this._sendToWorker("BUS:STOP");
                }
            },
            { capture: true }
        );
    }

    /**
     * @private
     * Ensure the worker service is started, and properly initialized.
     */
    async _ensureWorkerInitialized() {
        if (!this._initializedResolvers) {
            this._state = "started";
            this._initializedResolvers = Promise.withResolvers();
            let uid = Array.isArray(session.user_id) ? session.user_id[0] : user.userId;
            if (!uid && uid !== undefined) {
                uid = false;
            }
            await this._workerService.ensureWorkerStarted();
            await this._workerService.registerHandler(this._onWorkerMessage.bind(this));
            this._workerService.send("BUS:INITIALIZE_CONNECTION", {
                websocketURL: `${this._serverURL.replace("http", "ws")}/websocket?version=${
                    session.websocket_worker_version
                }`,
                db: session.db,
                lastNotificationId: parseInt(localStorage.getItem("bus.last_notification_id") ?? 0),
                uid,
                startTs: this._startedAt.valueOf(),
            });
        }
        await this._initializedResolvers.promise;
    }

    /**
     * @private
     * @param {MessageEvent} messageEv
     * @param {{type: WorkerEvent, data: any}[]}  messageEv.data
     */
    _onWorkerMessage(messageEv) {
        const { type, data } = messageEv.data;
        switch (type) {
            case "BUS:PROVIDE_LOGS": {
                const blob = new Blob([JSON.stringify(data, null, 2)], {
                    type: "application/json",
                });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = `bus_logs_${luxon.DateTime.now().toFormat(
                    "yyyy-LL-dd-HH-mm-ss"
                )}.json`;
                a.click();
                URL.revokeObjectURL(url);
                break;
            }
            case "BUS:NOTIFICATION": {
                const notifications = data.map(({ id, message }) => ({ id, ...message }));
                const receivedLastId = notifications.at(-1).id;
                const lsLastId = parseInt(localStorage.getItem("bus.last_notification_id") ?? 0);
                if (receivedLastId > lsLastId) {
                    localStorage.setItem("bus.last_notification_id", receivedLastId);
                }
                for (const { id, type, payload } of notifications) {
                    this._notificationBus.trigger(type, { id, payload });
                }
                break;
            }
            case "BUS:INITIALIZED": {
                this._initializedResolvers.resolve();
                break;
            }
            case "BUS:WORKER_STATE_UPDATED":
                this._workerState = data;
                break;
            case "BUS:OUTDATED": {
                if (data.unregisterMultiTab) {
                    this._multiTabService.unregister();
                    this.stop();
                    this._state = "unregistered";
                }
                this._notificationService.add(
                    _t(
                        "Save your work and refresh to get the latest updates and avoid potential issues."
                    ),
                    {
                        title: _t("The page is out of date"),
                        type: "warning",
                        sticky: true,
                        buttons: [
                            {
                                name: _t("Refresh"),
                                primary: true,
                                onClick: () => browser.location.reload(),
                            },
                        ],
                    }
                );
                break;
            }
        }
        if (!INTERNAL_EVENTS.has(type)) {
            this._eventBus.trigger(type, data);
        }
    }

    /**
     * @private
     * @param {import("@bus/workers/websocket_worker").WorkerAction} workerAction
     * @param {*} payload
     * @returns
     */
    _sendToWorker(workerAction, payload) {
        if (this._state === "unregistered") {
            return;
        }
        this._ensureWorkerInitialized().then(() => {
            this._workerService.send(workerAction, payload);
        });
    }

    // =========================================================
    // Public API
    // =========================================================

    get isActive() {
        return this._state === "started";
    }

    get startedAt() {
        return this._startedAt;
    }

    get workerState() {
        return this._workerState;
    }

    /** @type {(type: BusServiceEvent, listener: Function) => void} */
    addEventListener = this._eventBus.addEventListener.bind(this._eventBus);

    /** @type {(type: BusServiceEvent, listener: Function) => void} */
    removeEventListener = this._eventBus.removeEventListener.bind(this._eventBus);

    /** @param {string} channel */
    addChannel(channel) {
        this._sendToWorker("BUS:ADD_CHANNEL", channel);
        this.start();
    }

    /** @param {string} channel */
    deleteChannel(channel) {
        this._sendToWorker("BUS:DELETE_CHANNEL", channel);
    }

    downloadLogs() {
        this._sendToWorker("BUS:REQUEST_LOGS");
    }

    forceUpdateChannels() {
        this._sendToWorker("BUS:FORCE_UPDATE_CHANNELS");
    }

    /**
     * Send a message to the server through the WebSocket.
     *
     * @param {string} eventName
     * @param {any} data
     */
    send(eventName, data) {
        this._sendToWorker("BUS:SEND", { event_name: eventName, data });
    }

    /** @param {boolean} isEnabled */
    setLoggingEnabled(isEnabled) {
        this._sendToWorker("BUS:SET_LOGGING_ENABLED", isEnabled);
    }

    start() {
        this._sendToWorker("BUS:START");
    }

    /**
     * Disconnect from the worker. The bus stops receiving messages until `start` is
     * called again.
     */
    stop() {
        this._sendToWorker("BUS:LEAVE");
        this._state = "stopped";
    }

    /**
     * Subscribe to a specific notification type.
     *
     * @param {string} notificationType
     * @param {(payload: any, meta: { id: number }) => void} callback
     */
    subscribe(notificationType, callback) {
        const wrapper = ({ detail }) => {
            const { id, payload } = detail;
            callback(JSON.parse(JSON.stringify(payload)), { id });
        };
        this._subscribeFnToWrapper.set(callback, wrapper);
        this._notificationBus.addEventListener(notificationType, wrapper);
    }

    /**
     * Remove a previously registered notification listener.
     *
     * @param {string} notificationType
     * @param {Function} callback
     */
    unsubscribe(notificationType, callback) {
        const wrapper = this._subscribeFnToWrapper.get(callback);
        if (wrapper) {
            this._notificationBus.removeEventListener(notificationType, wrapper);
            this._subscribeFnToWrapper.delete(callback);
        }
    }
}

export const busService = {
    dependencies: ["bus.parameters", "multi_tab", "notification", "worker_service"],

    start(env, services) {
        return new BusService(env, services);
    },
};

registry.category("services").add("bus_service", busService);
