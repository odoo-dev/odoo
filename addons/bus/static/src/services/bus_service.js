import { browser } from "@web/core/browser/browser";
import { _t } from "@web/core/l10n/translation";
import { Deferred } from "@web/core/utils/concurrency";
import { registry } from "@web/core/registry";
import { session } from "@web/session";
import { EventBus, reactive } from "@odoo/owl";
import { user } from "@web/core/user";

// Slightly delay the reconnection when coming back online as the network is not
// ready yet and the exponential backoff would delay the reconnection by a lot.
export const BACK_ONLINE_RECONNECT_DELAY = 5000;
/**
 * Communicate with a SharedWorker in order to provide a single websocket
 * connection shared across multiple tabs.
 *
 *  @emits CONNECT
 *  @emits DISCONNECT
 *  @emits RECONNECT
 *  @emits RECONNECTING
 *  @emits WORKER_STATE_UPDATED
 */
export const busService = {
    dependencies: ["bus.parameters", "localization", "multi_tab", "notification", "worker_service"],

    start(
        env,
        {
            multi_tab: multiTab,
            notification,
            "bus.parameters": params,
            worker_service: workerService,
        }
    ) {
        const bus = new EventBus();
        const notificationBus = new EventBus();
        const subscribeFnToWrapper = new Map();
        let backOnlineTimeout;
        const startedAt = luxon.DateTime.now().set({ milliseconds: 0 });
        let connectionInitializedDeferred;

        const busWorkerClient = workerService.get("BUS");
        busWorkerClient.subscribe("NOTIFICATION", (payload) => {
            const notifications = payload.map(({ id, message }) => ({ id, ...message }));
            state.lastNotificationId = notifications.at(-1).id;
            localStorage.setItem("bus.last_notification_id", state.lastNotificationId);
            for (const { id, type, payload } of notifications) {
                notificationBus.trigger(type, { id, payload });
                busService._onMessage(env, id, type, payload);
            }
        });
        busWorkerClient.subscribe("CONNECT", () => bus.trigger("CONNECT"));
        busWorkerClient.subscribe("DISCONNECT", () => bus.trigger("DISCONNECT"));
        busWorkerClient.subscribe("RECONNECT", () => bus.trigger("RECONNECT"));
        busWorkerClient.subscribe("RECONNECTING", () => bus.trigger("RECONNECTING"));
        busWorkerClient.subscribe("WORKER_STATE_UPDATED", (newState) => {
            state.workerState = newState;
            bus.trigger("WORKER_STATE_UPDATED", newState);
        });

        function onTabOutdated() {
            multiTab.unregister();
            notification.add(
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
                            onClick: () => {
                                browser.location.reload();
                            },
                        },
                    ],
                }
            );
        }

        /**
         * Start the "bus_service" workerService.
         */
        async function ensureWorkerStarted() {
            if (!connectionInitializedDeferred) {
                connectionInitializedDeferred = new Deferred();
                await busWorkerClient.ensureStarted();
                let uid = Array.isArray(session.user_id) ? session.user_id[0] : user.userId;
                if (!uid && uid !== undefined) {
                    uid = false;
                }
                const upToDate = await busWorkerClient.send("INITIALIZE_CONNECTION", {
                    websocketURL: `${params.serverURL.replace("http", "ws")}/websocket?version=${
                        session.websocket_worker_version
                    }`,
                    db: session.db,
                    lastNotificationId: parseInt(
                        localStorage.getItem("bus.last_notification_id") ?? 0
                    ),
                    uid,
                    startTs: startedAt.valueOf(),
                });
                connectionInitializedDeferred.resolve();
                if (!upToDate) {
                    onTabOutdated();
                }
            }
            await connectionInitializedDeferred;
        }

        browser.addEventListener(
            "online",
            () => {
                backOnlineTimeout = browser.setTimeout(() => {
                    if (state.isActive) {
                        busWorkerClient.send("START");
                    }
                }, BACK_ONLINE_RECONNECT_DELAY);
            },
            { capture: true }
        );
        browser.addEventListener(
            "offline",
            () => {
                clearTimeout(backOnlineTimeout);
                busWorkerClient.send("STOP");
            },
            {
                capture: true,
            }
        );
        const state = reactive({
            addEventListener: bus.addEventListener.bind(bus),
            addChannel: async (channel) => {
                await ensureWorkerStarted();
                busWorkerClient.send("START");
                busWorkerClient.send("ADD_CHANNEL", channel);
                state.isActive = true;
            },
            deleteChannel: (channel) => {
                busWorkerClient.send("DELETE_CHANNEL", channel);
            },
            setLoggingEnabled: (isEnabled) =>
                busWorkerClient.send("SET_LOGGING_ENABLED", isEnabled),
            async downloadLogs() {
                const data = await busWorkerClient.send("REQUEST_LOGS");
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
            },
            forceUpdateChannels: () => busWorkerClient.send("FORCE_UPDATE_CHANNELS"),
            trigger: bus.trigger.bind(bus),
            removeEventListener: bus.removeEventListener.bind(bus),
            send: (eventName, data) =>
                busWorkerClient.send("SEND", { event_name: eventName, data }),
            start: async () => {
                await ensureWorkerStarted();
                busWorkerClient.send("START");
                state.isActive = true;
            },
            stop: () => {
                busWorkerClient.send("LEAVE");
                state.isActive = false;
            },
            isActive: false,
            /**
             * Subscribe to a single notification type.
             *
             * @param {string} notificationType
             * @param {function} callback
             */
            subscribe(notificationType, callback) {
                const wrapper = ({ detail }) => {
                    const { id, payload } = detail;
                    callback(JSON.parse(JSON.stringify(payload)), { id });
                };
                subscribeFnToWrapper.set(callback, wrapper);
                notificationBus.addEventListener(notificationType, wrapper);
            },
            /**
             * Unsubscribe from a single notification type.
             *
             * @param {string} notificationType
             * @param {function} callback
             */
            unsubscribe(notificationType, callback) {
                notificationBus.removeEventListener(
                    notificationType,
                    subscribeFnToWrapper.get(callback)
                );
                subscribeFnToWrapper.delete(callback);
            },
            startedAt,
            workerState: null,
            /** The id of the last notification received by this tab. */
            lastNotificationId: null,
        });
        return state;
    },
    /** Overriden to provide logs in tests. Use subscribe() in production. */
    _onMessage(env, id, type, payload) {},
};
registry.category("services").add("bus_service", busService);
