import { browser } from "@web/core/browser/browser";
import { registry } from "@web/core/registry";
import { Deferred } from "@web/core/utils/concurrency";
import { session } from "@web/session";

export const WORKER_STATE = Object.freeze({
    UNINITIALIZED: "UNINITIALIZED",
    INITIALIZING: "INITIALIZING",
    INITIALIZED: "INITIALIZED",
    FAILED: "FAILED",
});

/**
 * @import { WorkerChannelController } from "@bus/workers/worker_hub"
 *
 * Represents a communication channel to a specific {@link WorkerChannelController}. It
 * handles the addressing of messages so that every request is
 * automatically routed to the correct logic inside the worker.
 */
export class WorkerChannelClient {
    constructor(workerService, namespace) {
        this._workerService = workerService;
        this._name = namespace;
    }
    async ensureStarted() {
        return this._workerService.ensureWorkerStarted();
    }
    send(action, payload) {
        return this._workerService.sendRequest(`${this._name}:${action}`, payload);
    }
    async subscribe(type, callback) {
        const fullType = `${this._name}:${type}`;
        await this._workerService.connectionInitializedDeferred;
        if (this._workerService._state === WORKER_STATE.FAILED) {
            return;
        }
        this._workerService._registerHandler((ev) => {
            if (ev.data.type === fullType) {
                callback(ev.data.payload);
            }
        });
    }
}

export class WorkerService {
    constructor(env, services) {
        this.params = services["bus.parameters"];
        this.worker = null;
        this.isUsingSharedWorker = Boolean(browser.SharedWorker);
        this._state = WORKER_STATE.UNINITIALIZED;
        this.connectionInitializedDeferred = new Deferred();
        this._requestResolverById = new Map();
        this._currentRequestId = 0;
        browser.addEventListener("pagehide", ({ persisted }) => {
            if (!persisted) {
                // Page is gonna be unloaded, disconnect this client
                // from the worker.
                this.send("BASE:LEAVE");
            }
        });
    }

    startWorker() {
        this._state = WORKER_STATE.INITIALIZING;
        let workerURL = `${this.params.serverURL}/bus/websocket_worker_bundle?v=${session.websocket_worker_version}`;
        if (this.params.serverURL !== window.origin) {
            // Worker service can be loaded from a different origin than the
            // bundle URL. The Worker expects an URL from this origin, give
            // it a base64 URL that will then load the bundle via "importScripts"
            // which allows cross origin.
            const source = `importScripts("${workerURL}");`;
            workerURL = "data:application/javascript;base64," + window.btoa(source);
        }
        const workerClass = this.isUsingSharedWorker ? browser.SharedWorker : browser.Worker;
        this.worker = new workerClass(workerURL, {
            name: this.isUsingSharedWorker ? "odoo:bus_shared_worker" : "odoo:bus_worker",
        });
        this.worker.onerror = (e) => this.onInitError(e);
        this._registerHandler((ev) => {
            if (ev.data.type === "BASE:INITIALIZED") {
                this._state = WORKER_STATE.INITIALIZED;
                this.connectionInitializedDeferred.resolve();
            }
            if (ev.data.type === "BASE:RESPONSE") {
                const { requestId, response } = ev.data.data;
                const resolver = this._requestResolverById.get(requestId);
                if (resolver) {
                    this._requestResolverById.delete(requestId);
                    resolver.resolve(response);
                }
            }
        });
        if (this.isUsingSharedWorker) {
            this.worker.port.start();
        }
        this._send("BASE:INITIALIZE");
    }

    async ensureWorkerStarted() {
        if (this._state === WORKER_STATE.UNINITIALIZED) {
            this.startWorker();
        }
        await this.connectionInitializedDeferred;
    }

    onInitError(e) {
        // FIXME: SharedWorker can still fail for unknown reasons even when it is supported.
        if (this._state === WORKER_STATE.INITIALIZING && this.isUsingSharedWorker) {
            console.warn("Error while loading SharedWorker, fallback on Worker: ", e);
            this.isUsingSharedWorker = false;
            this.worker?.port?.close?.();
            this.startWorker();
        } else if (this._state === WORKER_STATE.INITIALIZING) {
            this._state = WORKER_STATE.FAILED;
            this.connectionInitializedDeferred.resolve();
            console.warn("Worker service failed to initialize: ", e);
        }
    }

    _registerHandler(handler) {
        if (this.isUsingSharedWorker) {
            this.worker.port.addEventListener("message", handler);
        } else {
            this.worker.addEventListener("message", handler);
        }
    }

    _send(action, data) {
        const message = { action, data };
        if (this.isUsingSharedWorker) {
            this.worker.port.postMessage(message);
        } else {
            this.worker.postMessage(message);
        }
    }

    /**
     * Sends a request to the worker and waits for a response.
     * The returned promise resolves with the response payload.
     */
    async sendRequest(action, payload) {
        const requestId = this._currentRequestId++;
        const resolver = Promise.withResolvers();
        this._requestResolverById.set(requestId, resolver);
        this.send(action, { payload, requestId });
        return resolver.promise;
    }

    /**
     * Send a message to the worker. If the worker is not yet started,
     * ignore the message. One should call `ensureWorkerStarted` if one
     * really needs the message to reach the worker.
     *
     * @param {String} action Action to be executed by the worker.
     * @param {Object|undefined} data Data required for the action to be
     * executed.
     */
    async send(action, data) {
        if (this._state === WORKER_STATE.UNINITIALIZED) {
            return;
        }
        await this.connectionInitializedDeferred;
        if (this._state === WORKER_STATE.FAILED) {
            console.warn("Worker service failed to initialize, cannot send message.");
        }
        this._send(action, data);
    }

    get state() {
        return this._state;
    }
}

export const workerService = {
    dependencies: ["bus.parameters"],
    start(env, services) {
        const worker = new WorkerService(env, services);
        return {
            connectionInitializedDeferred: worker.connectionInitializedDeferred,
            /**
             * Returns a namespaced client for a specific domain.
             * @param {string} namespace
             */
            get(namespace) {
                return new WorkerChannelClient(worker, namespace);
            },
        };
    },
};

registry.category("services").add("worker_service", workerService);
