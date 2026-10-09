import { Plugin } from "@html_editor/plugin";
import { rpc } from "@web/core/network/rpc";
import { Mutex } from "@web/core/utils/concurrency";
import { PeerToPeer, RequestError } from "./PeerToPeer";

export { RequestError };

// Time to consider a user offline in ms. This fixes the problem of the
// navigator closing rtc connection when the mac laptop screen is closed.
// const CONSIDER_OFFLINE_TIME = 1000;
// Check wether the computer could be offline. This fixes the problem of the
// navigator closing rtc connection when the mac laptop screen is closed.
// This case happens on Mac OS on every browser when the user close it's laptop
// screen. At first, the os/navigator closes all rtc connection, and after some
// times, the os/navigator internet goes offline without triggering an
// offline/online event.
// However, if the laptop screen is open and the connection is properly remove
// (e.g. disconnect wifi), the event is properly triggered.
// const CHECK_OFFLINE_TIME = 1000;
// const PTP_PEER_DISCONNECTED_STATES = ["failed", "closed", "disconnected"];

// this is a local cache for ice server descriptions
let ICE_SERVERS = null;

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

    setup() {
        // Whether the messages of the other peers are accepted.
        this.joined = false;

        const { collaborationModelName, collaborationFieldName, collaborationResId } =
            this.config.collaboration.collaborationChannel;
        // Without a record to collaborate on (e.g. it is not saved yet), there
        // is no channel to reach the other peers: the network stays unavailable.
        if (!(collaborationModelName && collaborationFieldName && collaborationResId)) {
            return;
        }
        this.subscribeToBus();
        this.peerToPeerLoading = this.loadPeerToPeer();

        // this.checkConnectionChange = () => {
        //     if (!this.ptp) {
        //         return;
        //     }
        //     if (!navigator.onLine) {
        //         this.signalOffline();
        //     } else {
        //         this.signalOnline();
        //     }
        // };

        // window.addEventListener("online", this.checkConnectionChange);
        // window.addEventListener("offline", this.checkConnectionChange);

        // this.collaborationInterval = setInterval(async () => {
        //     if (this.offlineTimeout || this.preSavePromise || !this.ptp) {
        //         return;
        //     }

        //     const peersInfos = Object.values(this.ptp.peersInfos);
        //     const couldBeDisconnected =
        //         Boolean(peersInfos.length) &&
        //         peersInfos.every((x) =>
        //             PTP_PEER_DISCONNECTED_STATES.includes(
        //                 x.peerConnection && x.peerConnection.connectionState
        //             )
        //         );

        //     if (couldBeDisconnected) {
        //         this.offlineTimeout = setTimeout(() => {
        //             this.signalOffline();
        //         }, CONSIDER_OFFLINE_TIME);
        //     }
        // }, CHECK_OFFLINE_TIME);
    }

    destroy() {
        this.stopBus?.();
        // If peer to peer is initializing, wait for properly closing it.
        this.peerToPeerLoading?.then(() => {
            this.ptp.abortCurrentRequests();
            this.ptp.stop();
        });
        // todo: to implement
        // clearInterval(this.collaborationInterval);
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
        if (!this.peerToPeerLoading) {
            return false;
        }
        await this.peerToPeerLoading;
        return !this.isDestroyed;
    }

    /**
     * Start receiving messages from the other peers and announce this peer to
     * them.
     */
    join() {
        if (!this.ptp) {
            return;
        }
        this.joined = true;
        this.ptp.notifyAllPeers("ptp_join");
    }

    /**
     * Send a message to every peer.
     *
     * @param {string} type
     * @param {any} payload
     */
    broadcast(type, payload) {
        this.ptp?.notifyAllPeers(type, payload, { transport: "rtc" });
    }

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
        if (signal?.aborted) {
            throw new RequestError("Request was aborted.");
        }
        const ptpRequest = this.ptp?.requestPeer(peerId, type, payload, { transport: "rtc" });
        if (!ptpRequest) {
            throw new RequestError("The network is not available.");
        }
        if (!signal) {
            return ptpRequest;
        }
        // Reject as soon as the caller aborts. The pending request itself is
        // cleaned up by the peer to peer layer when it times out.
        return new Promise((resolve, reject) => {
            const onAbort = () => reject(new RequestError("Request was aborted."));
            signal.addEventListener("abort", onAbort, { once: true });
            ptpRequest
                .then(resolve, reject)
                .finally(() => signal.removeEventListener("abort", onAbort));
        });
    }

    /**
     * @returns {string[]} the ids of the known peers, including the ones that
     *     are still connecting.
     */
    getPeerIds() {
        return this.ptp ? Object.keys(this.ptp.peersInfos) : [];
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
    subscribeToBus() {
        const { busService, collaborationChannel } = this.config.collaboration;
        const {
            collaborationModelName: modelName,
            collaborationFieldName: fieldName,
            collaborationResId: resId,
        } = collaborationChannel;
        const channelName = `editor_collaboration:${modelName}:${fieldName}:${resId}`;

        const busListener = (payload) => {
            if (
                payload.model_name !== modelName ||
                payload.field_name !== fieldName ||
                payload.res_id !== resId
            ) {
                return;
            }
            if (payload.notificationName === "html_field_write") {
                this.trigger("on_server_content_saved_handlers", {
                    lastCommitId: payload.notificationPayload.last_commit_id,
                });
            } else if (this.joined) {
                this.ptp.handleNotification(payload);
            }
        };
        busService.subscribe("editor_collaboration", busListener);
        busService.addChannel(channelName);
        this.stopBus = () => {
            busService.unsubscribe("editor_collaboration", busListener);
            busService.deleteChannel(channelName);
        };
    }

    /**
     * Fetch the ICE servers, then create the peer to peer connection manager.
     */
    async loadPeerToPeer() {
        if (!ICE_SERVERS) {
            ICE_SERVERS = await rpc("/html_editor/get_ice_servers");
        }
        let iceServers = ICE_SERVERS;
        if (!iceServers.length) {
            iceServers = [
                {
                    urls: ["stun:stun1.l.google.com:19302", "stun:stun2.l.google.com:19302"],
                },
            ];
        }
        this.ptp = this.createPeerToPeer(iceServers);
    }

    /**
     * @param {RTCIceServer[]} iceServers
     * @returns {PeerToPeer}
     */
    createPeerToPeer(iceServers) {
        const rpcMutex = new Mutex();
        const { collaborationModelName, collaborationFieldName, collaborationResId } =
            this.config.collaboration.collaborationChannel;

        const onRequest = {};
        for (const { type, provide } of this.getResource("peer_request_providers")) {
            onRequest[type] = ({ fromPeerId, requestPayload }) =>
                provide(requestPayload, { fromPeerId });
        }

        return new PeerToPeer({
            peerConnectionConfig: { iceServers },
            currentPeerId: this.config.collaboration.peerId,
            broadcastAll: (rpcData) =>
                rpcMutex.exec(async () =>
                    rpc("/html_editor/bus_broadcast", {
                        model_name: collaborationModelName,
                        field_name: collaborationFieldName,
                        res_id: collaborationResId,
                        bus_data: rpcData,
                    })
                ),
            onRequest,
            onNotification: (notification) => this.handlePeerNotification(notification),
        });
    }

    /**
     * Turn the notifications of the peer to peer layer into editor events.
     *
     * The returned promise resolves once the handlers are done, so that the
     * caller can wait for them.
     *
     * @param {Object} notification
     * @param {string} [notification.fromPeerId]
     * @param {string} notification.notificationName
     * @param {any} notification.notificationPayload
     */
    handlePeerNotification({ fromPeerId, notificationName, notificationPayload }) {
        // The peer to peer layer can still notify while it is being stopped.
        if (this.isDestroyed) {
            return;
        }
        switch (notificationName) {
            case "ptp_remove":
                return Promise.all(
                    this.trigger("on_peer_disconnected_handlers", notificationPayload)
                );
            case "ptp_disconnect":
                this.ptp.removePeer(fromPeerId);
                return;
            case "rtc_data_channel_open":
                return Promise.all(
                    this.trigger("on_peer_connected_handlers", notificationPayload.connectionPeerId)
                );
            default:
                return Promise.all(
                    this.trigger("on_peer_message_handlers", {
                        type: notificationName,
                        payload: notificationPayload,
                        fromPeerId,
                    })
                );
        }
    }
}
