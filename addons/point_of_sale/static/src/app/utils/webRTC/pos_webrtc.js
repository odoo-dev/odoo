import { rpc } from "@web/core/network/rpc";
import { getOnNotified, uuidv4 } from "@point_of_sale/utils";
import { logPosMessage } from "../pretty_console_log";
import { Peer, CONSOLE_COLOR } from "./peer";

/**
 * WebRTC-based service to enable direct peer-to-peer communication between
 * multiple PoS entities (e.g. POS terminals, customer displays, etc).
 *
 * This service replaces the traditional server-mediated communication flow
 * (RPC → server → bus notification) with a more efficient peer-to-peer channel
 * when no server-side processing or persistence is required.
 *
 * Instead of routing messages through the backend, peers establish a direct
 * WebRTC data channel and exchange messages in real time, reducing latency
 * and server load.
 *
 * ---------------------------------------------------------------------------
 * How it works
 * ---------------------------------------------------------------------------
 *
 * 1. Signaling phase (via server/bus):
 *
 *        ┌───────────────┐                           ┌───────────────┐
 *        │    Peer A     │                           │    Peer B     │
 *        └──────┬────────┘                           └──────┬────────┘
 *               │                                           │
 *               │   ready                                   │
 *               ├───────────────RPC/Bus─────────────────────▶
 *               │                                           │
 *               │                               ready       │
 *               ◀──────────────RPC/Bus──────────────────────┤
 *               │                                           │
 *               │   offer (SDP)                             │
 *               ├───────────────RPC/Bus─────────────────────▶
 *               │                                           │
 *               │                               answer (SDP)│
 *               ◀──────────────RPC/Bus──────────────────────┤
 *               │                                           │
 *               │   ICE candidates exchange (multiple)      │
 *               ◀───────────────────────────────────────────▶
 *               │                                           │
 *
 *    - Peers discover each other using "ready" messages.
 *    - One peer initiates the connection by sending an "offer".
 *    - The other peer responds with an "answer".
 *    - ICE candidates are exchanged to establish the best network path.
 *    - All signaling messages are routed via RPC + bus (server acts only as relay).
 *
 * 2. Connection establishment:
 *    - RTCPeerConnection is created and negotiation is completed.
 *
 * 3. Data channel communication:
 *    - A WebRTC DataChannel is opened after successful negotiation.
 *    - Messages are exchanged directly between peers (P2P).
 * ---------------------------------------------------------------------------
 * Typical Use Cases
 * ---------------------------------------------------------------------------
 * - Updating customer display in real time
 * - Broadcasting lightweight events without server involvement
 *
 * ---------------------------------------------------------------------------
 * Notes
 * ---------------------------------------------------------------------------
 * - The server is only used for signaling, not for actual data transfer.
 * - STUN and TURN servers are used to establish connectivity across networks.
 * - This service assumes all peers are within the same POS configuration scope.
 */
export class PosWebrtcService {
    constructor(env, identifier, accessToken, configId, opts = {}) {
        this.env = env;
        this.identifier = identifier;
        this.configId = configId;

        this.peerId = uuidv4();
        this.knownPeers = new Set();
        this.pendingCandidates = new Map();
        this.peers = new Map();

        this.listeners = new Set(); // callback listeners to handle received data from Peers
        this.signalingOpts = opts.signalingOpts || {};
        getOnNotified(env.services.bus_service, accessToken)(
            this.channelName,
            this.handleSignalingMessage.bind(this)
        );
        this.sendSignal({ type: "ready", fromPeerId: this.peerId });
    }

    get channelName() {
        return `POS_WEBRTC_SIGNALING-${this.identifier}`;
    }

    /**
     * Broadcast an application payload to every open RTC data channel.
     *
     * @param {Object} data
     */
    send(data) {
        const payload = JSON.stringify(data);
        let sent = false;

        for (const peer of this.peers.values()) {
            if (peer.channel?.readyState !== "open") {
                continue;
            }

            try {
                peer.channel.send(payload);
                sent = true;
            } catch (error) {
                logPosMessage(
                    "PosWebrtcService",
                    "send",
                    `Failed to send data to peer ${peer.peerId}`,
                    CONSOLE_COLOR,
                    [error]
                );
                this.removePeer(peer.peerId);
            }
        }

        if (!sent) {
            logPosMessage(
                "PosWebrtcService",
                "send",
                "No open data channels available",
                CONSOLE_COLOR
            );
        } else {
            logPosMessage("PosWebrtcService", "send", "data sent", CONSOLE_COLOR, [payload]);
        }
    }

    async sendSignal(payload) {
        try {
            await rpc("/pos_webrtc_signaling/", {
                pos_config_id: this.configId,
                identifier: this.identifier,
                payload,
                ...this.signalingOpts,
            });
        } catch (error) {
            logPosMessage(
                "PosWebrtcService",
                "sendSignal",
                "Failed to send signaling message",
                CONSOLE_COLOR,
                [error]
            );
        }
    }

    handleSignalingMessage(payload) {
        const { type, fromPeerId, toPeerId } = payload;
        if ((fromPeerId && fromPeerId === this.peerId) || (toPeerId && toPeerId !== this.peerId)) {
            return;
        }

        logPosMessage(
            "PosWebrtcService",
            "Signaling Message Recived",
            `type: ${type}`,
            CONSOLE_COLOR,
            [payload]
        );
        switch (type) {
            case "ready":
                this.handleReady(payload);
                break;
            case "candidate":
                this.handleCandidate(payload);
                break;
            case "offer":
                this.handleOffer(payload);
                break;
            case "answer":
                this.handleAnswer(payload);
                break;
            default:
                logPosMessage(
                    "PosWebrtcService",
                    "handleSignalingMessage",
                    `Unhandled message type: ${type}`,
                    CONSOLE_COLOR,
                    [payload]
                );
        }
    }

    async handleReady({ fromPeerId }) {
        console.log(" handleReady :", fromPeerId);
        if (!fromPeerId || fromPeerId === this.peerId) {
            return;
        }

        this.knownPeers.add(fromPeerId);
        if (this.peers.has(fromPeerId)) {
            return;
        }

        if (this.shouldInitiate(fromPeerId)) {
            await this.establishConnection(fromPeerId);
            return;
        }

        await this.sendSignal({
            type: "ready",
            fromPeerId: this.peerId,
            toPeerId: fromPeerId,
        });
    }

    async handleOffer(offer) {
        const peerId = offer.fromPeerId;
        if (!peerId) {
            return;
        }
        if (this.peers.has(peerId)) {
            logPosMessage(
                "PosWebrtcService",
                "handleOffer",
                `Peer connection already exists for ${peerId}`,
                CONSOLE_COLOR
            );
            return;
        }

        const peer = this.createPeer(peerId);
        if (!peer) {
            return;
        }

        peer.peerConnection.ondatachannel = (event) => this.onDataChannelReceived(peerId, event);

        try {
            await peer.peerConnection.setRemoteDescription(this.toSessionDescription(offer));
            await this.flushBufferedCandidates(peerId);

            const answer = await peer.peerConnection.createAnswer();
            await peer.peerConnection.setLocalDescription(answer);

            await this.sendSignal({
                type: "answer",
                fromPeerId: this.peerId,
                toPeerId: peerId,
                sdp: answer.sdp,
            });
        } catch (error) {
            logPosMessage(
                "PosWebrtcService",
                "handleOffer",
                `Failed to handle offer from ${peerId}`,
                CONSOLE_COLOR,
                [error]
            );
            this.removePeer(peerId);
        }
    }

    async handleAnswer(answer) {
        const peerId = answer.fromPeerId;
        const peer = this.peers.get(peerId);
        if (!peer) {
            logPosMessage(
                "PosWebrtcService",
                "handleAnswer",
                `No peer connection for answer from ${peerId}`,
                CONSOLE_COLOR
            );
            return;
        }

        try {
            await peer.peerConnection.setRemoteDescription(this.toSessionDescription(answer));
            await this.flushBufferedCandidates(peerId);
        } catch (error) {
            logPosMessage(
                "PosWebrtcService",
                "handleAnswer",
                `Failed to apply answer from ${peerId}`,
                CONSOLE_COLOR,
                [error]
            );
            this.removePeer(peerId);
        }
    }

    async handleCandidate(candidate) {
        const peerId = candidate.fromPeerId;
        if (!peerId) {
            return;
        }
        const peer = this.peers.get(peerId);
        if (!peer) {
            this.bufferCandidate(peerId, candidate);
            logPosMessage(
                "PosWebrtcService",
                "handleCandidate",
                `No peer connection for candidate from ${peerId}`,
                CONSOLE_COLOR
            );
            return;
        }

        if (!peer.peerConnection.remoteDescription) {
            this.bufferCandidate(peerId, candidate);
            return;
        }

        await this.addIceCandidate(peer.peerConnection, candidate);
    }

    shouldInitiate(otherPeerId) {
        return String(this.peerId).localeCompare(String(otherPeerId)) > 0;
    }

    /**
     * Create an offer for a specific peer, or for every known peer when no id is given.
     *
     * @param {string} [targetPeerId]
     */
    async establishConnection(targetPeerId) {
        if (!targetPeerId) {
            for (const peerId of this.knownPeers) {
                if (this.shouldInitiate(peerId) && !this.peers.has(peerId)) {
                    await this.establishConnection(peerId);
                }
            }
            return;
        }

        const peer = this.createPeer(targetPeerId);
        if (!peer) {
            return;
        }

        peer.createDataChannel("notifications");

        try {
            const offer = await peer.peerConnection.createOffer();
            await peer.peerConnection.setLocalDescription(offer);

            await this.sendSignal({
                type: "offer",
                fromPeerId: this.peerId,
                toPeerId: targetPeerId,
                sdp: offer.sdp,
            });
        } catch (error) {
            logPosMessage(
                "PosWebrtcService",
                "establishConnection",
                `Failed to create offer for ${targetPeerId}`,
                CONSOLE_COLOR,
                [error]
            );
            this.removePeer(targetPeerId);
        }
    }

    createPeer(peerId) {
        if (!peerId || this.peers.has(peerId)) {
            return this.peers.get(peerId);
        }

        const peer = new Peer({
            peerId,
            localPeerId: this.peerId,
            onSignal: (message) => this.sendSignal(message),
            onRemove: (id) => this.removePeer(id),
            onMessage: (data) => this._notifyListeners(data),
        });

        this.peers.set(peerId, peer);
        peer.startTimeout();
        return peer;
    }

    onDataChannelReceived(peerId, event) {
        const peer = this.peers.get(peerId);
        if (peer) {
            peer.setChannel(event.channel, "receive");
        }
    }

    async addIceCandidate(peerConnection, candidate) {
        try {
            await peerConnection.addIceCandidate(this.toIceCandidate(candidate));
        } catch (error) {
            logPosMessage(
                "PosWebrtcService",
                "addIceCandidate",
                "Failed to add ICE candidate",
                CONSOLE_COLOR,
                [error]
            );
        }
    }

    bufferCandidate(peerId, candidate) {
        if (!peerId) {
            return;
        }
        if (!this.pendingCandidates.has(peerId)) {
            this.pendingCandidates.set(peerId, []);
        }
        this.pendingCandidates.get(peerId).push(candidate);
    }

    /**
     * Apply candidates that arrived before the remote description was ready.
     */
    async flushBufferedCandidates(peerId) {
        const peer = this.peers.get(peerId);
        const bufferedCandidates = this.pendingCandidates.get(peerId);

        if (!peer || !bufferedCandidates?.length) {
            return;
        }

        for (const candidate of bufferedCandidates) {
            await this.addIceCandidate(peer.peerConnection, candidate);
        }

        this.pendingCandidates.delete(peerId);
    }

    removePeer(peerId) {
        const peer = this.peers.get(peerId);
        if (!peer) {
            return;
        }

        peer.close();
        this.peers.delete(peerId);
        this.pendingCandidates.delete(peerId);
    }

    destroy() {
        for (const peer of this.peers.values()) {
            peer.close();
        }
        this.peers.clear();
        this.pendingCandidates.clear();
        this.knownPeers.clear();
        this.listeners.clear();
    }

    toSessionDescription({ type, sdp }) {
        return { type, sdp };
    }

    toIceCandidate(candidate) {
        if (!candidate?.candidate) {
            return null;
        }
        return {
            candidate: candidate.candidate,
            sdpMid: candidate.sdpMid ?? null,
            sdpMLineIndex: candidate.sdpMLineIndex ?? null,
        };
    }

    addListener(callback) {
        this.listeners.add(callback);
    }

    _notifyListeners(data) {
        logPosMessage("PosWebrtcService", "send", "data received", CONSOLE_COLOR, [data]);
        try {
            const payload = JSON.parse(data);
            for (const listener of this.listeners) {
                listener(payload);
            }
        } catch (error) {
            logPosMessage(
                "PosWebrtcService",
                "_notifyListeners",
                "A WebRTC listener raised an error",
                CONSOLE_COLOR,
                [error]
            );
        }
    }
}
