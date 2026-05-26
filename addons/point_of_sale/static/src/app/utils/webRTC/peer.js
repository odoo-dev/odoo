import { logPosMessage } from "../pretty_console_log";

export const CONSOLE_COLOR = "#FF9933";

const CONNECTION_TIMEOUT_MS = 15000;
const RTC_CONFIG = {
    iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:stun1.l.google.com:19302" },
        { urls: "stun:stun.parth-patel.in:3478" },
        {
            urls: "turn:stun.parth-patel.in:3478",
            username: "pp021",
            credential: "AGk0c8QGKrvp5NGk",
        },
    ],
    iceCandidatePoolSize: 8,
};

/**
 * Wrap a single WebRTC peer connection and its data channel lifecycle.
 */
export class Peer {
    constructor({ peerId, localPeerId, onSignal, onRemove, onMessage }) {
        this.peerId = peerId;
        this.localPeerId = localPeerId;
        this.onSignal = onSignal;
        this.onRemove = onRemove;
        this.onMessage = onMessage;

        this.channel = null;
        this.connectionTimer = null;
        this.isClosing = false;
        this.isRemoved = false;
        this.peerConnection = new RTCPeerConnection(RTC_CONFIG);

        this._bindPeerConnectionEvents();
    }

    isConnected() {
        return (
            this.channel?.readyState === "open" &&
            this.peerConnection?.connectionState === "connected"
        );
    }

    /**
     * Start a timer that removes stale peers which never finish connecting.
     */
    startTimeout() {
        this.clearTimeout();
        this.connectionTimer = setTimeout(() => {
            if (!this.isConnected()) {
                this.closePeer();
            }
        }, CONNECTION_TIMEOUT_MS);
    }

    clearTimeout() {
        if (this.connectionTimer) {
            clearTimeout(this.connectionTimer);
        }
        this.connectionTimer = null;
    }

    createDataChannel(name) {
        const channel = this.peerConnection.createDataChannel(name);
        this.setChannel(channel, "send");
        return channel;
    }

    /**
     * Attach the negotiated or received RTC data channel to this peer wrapper.
     *
     * @param {RTCDataChannel} channel
     * @param {"send" | "receive"} direction
     */
    setChannel(channel, direction) {
        this.channel = channel;
        this._bindChannelEvents(direction);
    }

    /**
     * Ask the service to remove this peer from its registry.
     */
    closePeer() {
        if (this.isRemoved) {
            return;
        }
        this.isRemoved = true;
        this.clearTimeout();
        this.onRemove(this.peerId);
    }

    close() {
        if (this.isClosing) {
            return;
        }
        this.isClosing = true;
        this.clearTimeout();

        if (this.channel) {
            this.channel.close();
        }
        if (this.peerConnection) {
            this.peerConnection.close();
        }
    }

    _bindPeerConnectionEvents() {
        this.peerConnection.onicecandidate = (event) => this._handleIceCandidate(event);
        this.peerConnection.onconnectionstatechange = () => this._handleConnectionStateChange();
        this.peerConnection.oniceconnectionstatechange = () =>
            this._handleIceConnectionStateChange();
    }

    _bindChannelEvents(direction) {
        this.channel.onopen = () => this._handleChannelStateChange(direction);
        this.channel.onclose = () => this._handleChannelStateChange(direction);
        this.channel.onmessage = (event) => this.onMessage(event.data);
        this.channel.onerror = (event) => this._handleChannelError(event);
    }

    _handleChannelStateChange(direction) {
        if (this.isClosing || !this.channel) {
            return;
        }

        const readyState = this.channel.readyState;
        if (readyState === "open") {
            this.clearTimeout();
        } else {
            this.closePeer();
        }

        logPosMessage(
            "PosWebrtcService",
            "ChannelState",
            `Channel ${direction} ${readyState} for peer ${this.peerId}`,
            CONSOLE_COLOR
        );
    }

    _handleChannelError(event) {
        logPosMessage(
            "PosWebrtcService",
            "ChannelError",
            `Channel error for peer ${this.peerId}`,
            CONSOLE_COLOR,
            [event]
        );
        this.closePeer();
    }

    _handleIceCandidate(event) {
        const message = {
            type: "candidate",
            fromPeerId: this.localPeerId,
            toPeerId: this.peerId,
            candidate: null,
            sdpMid: null,
            sdpMLineIndex: null,
        };

        if (event.candidate) {
            message.candidate = event.candidate.candidate;
            message.sdpMid = event.candidate.sdpMid;
            message.sdpMLineIndex = event.candidate.sdpMLineIndex;
        }

        this.onSignal(message);
    }

    _handleConnectionStateChange() {
        if (this.isClosing) {
            return;
        }

        const state = this.peerConnection.connectionState;
        if (state === "connected") {
            this.clearTimeout();
        } else if (["closed", "disconnected", "failed"].includes(state)) {
            this.closePeer();
        }
    }

    _handleIceConnectionStateChange() {
        if (this.isClosing) {
            return;
        }

        if (["disconnected", "failed"].includes(this.peerConnection.iceConnectionState)) {
            this.closePeer();
        }
    }
}
