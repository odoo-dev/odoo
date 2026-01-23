/**
 * @import { WorkerChannelClient } from "@bus/services/worker_service"
 *
 * Represents a communication channel within the worker. Each channel
 * acts as a dedicated controller that isolates specific domain logic
 * and manages its own set of connected clients. It serves as the
 * worker side counterpart to a  {@link WorkerChannelClient}.
 */
export class WorkerChannelController {
    constructor(name) {
        this._channel = name;
        this._clients = new Set();
    }

    /** Register a client listen to this channel.
     *
     * @param {MessagePort} client
     */
    registerClient(client) {
        this._clients.add(client);
    }

    /** @param {MessagePort} client */
    unregisterClient(client) {
        this._clients.delete(client);
    }

    /**
     * Handles a request sent by a client to this channel.
     *
     * @param {MessagePort} client The MessagePort that issued the
     * request
     * @param {string} type The request type
     * @param {any} payload The request payload
     *
     * @returns {any} The value returned (or resolved) will be sent back to
     * the requesting client as the response payload.
     */
    async handleRequest(client, type, payload) {}

    /**
     * Sends a namespaced message to a specific client.
     *
     * @param {MessagePort} client The target client MessagePort
     * @param {string} type The channel local message type
     * @param {any} payload The message payload
     */
    send(client, type, payload) {
        client.postMessage({ type: `${this._channel}:${type}`, payload });
    }

    /**
     * Broadcasts a message to all clients currently registered with this
     * channel.
     *
     * @param {string} type The channel local message type
     * @param {any} payload The message payload
     */
    broadcast(type, payload) {
        const msg = { type: `${this._channel}:${type}`, payload };
        for (const client of this._clients) {
            client.postMessage(msg);
        }
    }
}

/**
 * The central management point inside the worker. The Hub is
 * responsible for:
 * - Handling the initial handshake with new clients.
 * - Dispatching incoming messages to the appropriate WorkerChannelController.
 * - Managing the lifecycle of all connected MessagePorts.
 */
export class WorkerChannelHub {
    static _controllerRegistry = new Map();

    constructor() {
        this.controllers = new Map();
        this.allClients = new Set();
        for (const [name, ControllerClass] of WorkerChannelHub._controllerRegistry) {
            this.controllers.set(name, new ControllerClass(name));
        }
    }

    static register(channel, WorkerClass) {
        if (this._controllerRegistry.has(channel)) {
            throw new Error(`channel ${channel} already registered.`);
        }
        this._controllerRegistry.set(channel, WorkerClass);
    }

    registerClient(client) {
        this.allClients.add(client);
        client.onmessage = (ev) => this._onMessage(client, ev.data);
    }

    async _onMessage(client, { action, data }) {
        const [channel, type] = action.split(":");
        if (channel === "BASE") {
            if (type === "INITIALIZE") {
                client.postMessage({ type: "BASE:INITIALIZED" });
            }
            if (type === "LEAVE") {
                this._unregisterClient(client);
            }
            return;
        }
        const controller = this.controllers.get(channel);
        if (controller) {
            if (!controller._clients.has(client)) {
                controller.registerClient(client);
            }
            const response = await controller.handleRequest(client, type, data.payload);
            client.postMessage({
                type: "BASE:RESPONSE",
                data: { requestId: data.requestId, response },
            });
        } else {
            console.warn(`Unknown channel: ${channel} for action: ${action}`);
        }
    }

    _unregisterClient(client) {
        this.allClients.delete(client);
        for (const controller of this.controllers.values()) {
            if (controller._clients.has(client)) {
                controller.unregisterClient(client);
            }
        }
    }
}
