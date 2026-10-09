import { Plugin } from "@html_editor/plugin";
import { RequestError } from "./PeerToPeer";

export { RequestError };

/**
 * @typedef { Object } CollaborationNetworkShared
 * @property { CollaborationNetworkPlugin['ready'] } ready
 * @property { CollaborationNetworkPlugin['join'] } join
 * @property { CollaborationNetworkPlugin['broadcast'] } broadcast
 * @property { CollaborationNetworkPlugin['request'] } request
 * @property { CollaborationNetworkPlugin['getPeerIds'] } getPeerIds
 * @property { CollaborationNetworkPlugin['fetchServerContent'] } fetchServerContent
 */

/**
 * @typedef {{
 *     type: string,
 *     provide: (payload: any, context: { fromPeerId: string }) => any,
 * }[]} peer_request_providers
 *
 * @typedef {((peerId: string) => void | Promise<void>)[]} on_peer_connected_handlers
 * @typedef {((peerId: string) => void)[]} on_peer_disconnected_handlers
 * @typedef {((message: { type: string, payload: any, fromPeerId: string }) => void | Promise<void>)[]} on_peer_message_handlers
 * @typedef {((params: { lastCommitId: string | null }) => void)[]} on_server_content_saved_handlers
 */

/**
 * Owns everything that travels between the editor and the outside world for
 * the collaboration: the bus channel, the RPCs, the ORM read of the record and
 * the peer to peer connections. Other plugins only use the shared methods and
 * the resources above, and never know which transport is used.
 */
export class CollaborationNetworkPlugin extends Plugin {
    static id = "collaborationNetwork";
    static shared = ["ready", "join", "broadcast", "request", "getPeerIds", "fetchServerContent"];

    setup() {}

    destroy() {
        super.destroy();
    }

    // -------------------------------------------------------------------------
    // Shared
    // -------------------------------------------------------------------------

    /**
     * Wait until the network can reach the other peers.
     *
     * @returns {Promise<boolean>} false if the network is not available (e.g.
     *     the record is not saved yet) or has been destroyed.
     */
    async ready() {
        return false;
    }

    /**
     * Start receiving messages from the other peers and announce this peer to
     * them.
     */
    join() {}

    /**
     * Send a message to every peer.
     *
     * @param {string} type
     * @param {any} payload
     */
    broadcast(type, payload) {}

    /**
     * Ask a peer for something and wait for its answer.
     *
     * @param {string} peerId
     * @param {string} type one of the `peer_request_providers` types
     * @param {any} [payload]
     * @param {Object} [options]
     * @param {AbortSignal} [options.signal]
     * @returns {Promise<any>} rejects with a `RequestError` on timeout, abort,
     *     or if the network is not available.
     */
    async request(peerId, type, payload, { signal } = {}) {
        throw new RequestError("The network is not available.");
    }

    /**
     * @returns {string[]} the ids of the known peers, including the ones that
     *     are still connecting.
     */
    getPeerIds() {
        return [];
    }

    /**
     * @returns {Promise<string>} the value of the collaborative field currently
     *     saved on the server.
     */
    async fetchServerContent() {}

    // -------------------------------------------------------------------------
    // Private
    // -------------------------------------------------------------------------

    /**
     * Listen to the record's bus channel: `html_field_write` notifications and
     * peer to peer signaling.
     */
    subscribeToBus() {}

    /**
     * Fetch the ICE servers, then create the peer to peer connection manager.
     */
    async loadPeerToPeer() {}

    /**
     * @param {RTCIceServer[]} iceServers
     * @returns {import("./PeerToPeer").PeerToPeer}
     */
    createPeerToPeer(iceServers) {}

    /**
     * Turn the notifications of the peer to peer layer into editor events.
     *
     * @param {Object} notification
     * @param {string} [notification.fromPeerId]
     * @param {string} notification.notificationName
     * @param {any} notification.notificationPayload
     */
    handlePeerNotification(notification) {}
}
