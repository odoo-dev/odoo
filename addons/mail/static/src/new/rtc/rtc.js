/** @odoo-module */

import { browser } from "@web/core/browser/browser";

import { monitorAudio } from "./media_monitoring";
import { sprintf } from "@web/core/utils/strings";
import { _t } from "@web/core/l10n/translation";
import { reactive } from "@odoo/owl";

import { RtcSession } from "./rtc_session_model";
import { createLocalId } from "../core/thread_model.create_local_id";
import { debounce } from "@web/core/utils/timing";

const TRANSCEIVER_ORDER = ["audio", "video"];
const PEER_NOTIFICATION_WAIT_DELAY = 50;
const RECOVERY_TIMEOUT = 15_000;
const RECOVERY_DELAY = 3_000;
const VIDEO_CONFIG = {
    aspectRatio: 16 / 9,
    frameRate: {
        max: 30,
    },
};
const INVALID_ICE_CONNECTION_STATES = new Set(["disconnected", "failed", "closed"]);
const IS_CLIENT_RTC_COMPATIBLE = Boolean(window.RTCPeerConnection && window.MediaStream);
const DEFAULT_ICE_SERVERS = [
    { urls: ["stun:stun1.l.google.com:19302", "stun:stun2.l.google.com:19302"] },
];

let tmpId = 0;

/**
 * Returns a string representation of a data channel for logging and
 * debugging purposes.
 *
 * @param {RTCDataChannel} dataChannel
 * @returns string
 */
function serializeRTCDataChannel(data) {
    const toLog = [
        "binaryType",
        "bufferedAmount",
        "bufferedAmountLowThreshold",
        "id",
        "label",
        "maxPacketLifeTime",
        "maxRetransmits",
        "negotiated",
        "ordered",
        "protocol",
        "readyState",
    ];
    return JSON.stringify(Object.fromEntries(toLog.map((p) => [p, data[p]])));
}

/**
 * @param {RTCPeerConnection} peerConnection
 * @param {String} trackKind
 * @returns {RTCRtpTransceiver} the transceiver used for this trackKind.
 */
function getTransceiver(peerConnection, trackKind) {
    const transceivers = peerConnection.getTransceivers();
    return transceivers[TRANSCEIVER_ORDER.indexOf(trackKind)];
}

export class Rtc {
    constructor(env, messaging, notification, rpc, soundEffects, userSettings) {
        // services
        this.env = env;
        this.messaging = messaging;
        this.notification = notification;
        this.rpc = rpc;
        this.soundEffects = soundEffects;
        this.userSettings = userSettings;
        this.state = reactive({
            hasPendingRtcRequest: false,
            currentRtcSession: undefined,
            channel: undefined,
            iceServers: DEFAULT_ICE_SERVERS,
            logs: new Map(),
            sendCamera: false,
            sendScreen: false,
            updateAndBroadcastDebounce: undefined,
            pendingNotifyPeers: false,
            peerNotificationsToSend: new Map(),
            audioTrack: undefined,
            videoTrack: undefined,
            /**
             * Object { rtcSessionId: dataChannel<RTCDataChannel> }
             * Contains the RTCDataChannels with the other rtc sessions.
             */
            dataChannels: new Map(),
            /**
             * callback to properly end the audio monitoring.
             * If set it indicates that we are currently monitoring the local
             * audioTrack for the voice activation feature.
             */
            disconnectAudioMonitor: undefined,
            /**
             * Object { rtcSessionId: timeoutId<Number> }
             * Contains the timeoutIds of the reconnection attempts.
             */
            recoverTimeouts: new Map(),
            /**
             * Set of rtcSessionIds, used to track which calls are outgoing,
             * which is used when attempting to recover a failed peer connection by
             * inverting the call direction.
             */
            outgoingSessionIds: new Set(),
            /**
             * Object { rtcSessionId: peerConnection<RTCPeerConnection> }
             * Contains the RTCPeerConnection established with the other rtc sessions.
             * Exposing this field and keeping references to closed peer connections may lead
             * to difficulties reconnecting to the same peer.
             */
            peerConnections: new Map(),
            pushToTalkReleaseTimeout: undefined,
        });
        // discuss refactor: use observe util when available
        const proxyBlur = reactive(this.userSettings, () => {
            if (!this.state.sendCamera) {
                return;
            }
            this.toggleVideoBroadcast("camera");
            void proxyBlur.useBlur;
        }).useBlur;
        const proxyVoiceActivation = reactive(this.userSettings, async () => {
            await this.updateVoiceActivation();
            void proxyVoiceActivation.voiceActivationThreshold;
        }).voiceActivationThreshold;
        const proxyPushToTalk = reactive(this.userSettings, async () => {
            await this.updateVoiceActivation();
            void proxyPushToTalk.usePushToTalk;
        }).usePushToTalk;
        const proxyAudioInputDevice = reactive(this.userSettings, async () => {
            this.resetAudioTrack();
            void proxyAudioInputDevice.audioInputDeviceId;
        }).audioInputDeviceId;

        browser.addEventListener("keydown", (ev) => {
            if (
                !this.state.channel ||
                this.userSettings.isRegisteringKey ||
                !this.userSettings.usePushToTalk ||
                !this.userSettings.isPushToTalkKey(ev)
            ) {
                return;
            }
            browser.clearTimeout(this.state.pushToTalkReleaseTimeout);
            if (!this.state.currentRtcSession.isTalking && !this.state.currentRtcSession.isMute) {
                this.soundEffects.play("push-to-talk-on", { volume: 0.3 });
            }
            this.setTalking(true);
        });
        browser.addEventListener("keyup", (ev) => {
            if (
                !this.state.channel ||
                !this.userSettings.usePushToTalk ||
                !this.userSettings.isPushToTalkKey(ev, { ignoreModifiers: true }) ||
                !this.state.currentRtcSession.isTalking
            ) {
                return;
            }
            if (!this.state.currentRtcSession.isMute) {
                this.soundEffects.play("push-to-talk-off", { volume: 0.3 });
            }
            this.state.pushToTalkReleaseTimeout = browser.setTimeout(
                () => this.setTalking(false),
                this.userSettings.voiceActiveDuration || 0
            );
        });

        // Disconnects the RTC session if the page is closed or reloaded.
        browser.addEventListener("pagehide", async (ev) => {
            if (this.state.channel && !ev.persisted) {
                await this.performRpcLeaveCall(this.state.channel.id);
            }
        });
        /**
         * Call all sessions for which no peerConnection is established at
         * a regular interval to try to recover any connection that failed
         * to start.
         *
         * This is distinct from this.recoverConnection which tries to restores
         * connection that were established but failed or timed out.
         */
        browser.setInterval(async () => {
            if (!this.state.currentRtcSession || !this.state.channel) {
                return;
            }
            await this.pingServer();
            if (!this.state.currentRtcSession || !this.state.channel) {
                return;
            }
            this.callSessions();
        }, 30_000);
    }

    /**
     * Notifies the server and does the cleanup of the current call.
     */
    async leaveCall(channelId = this.state.channel.id) {
        await this.performRpcLeaveCall(channelId);
        this.endCall(channelId);
    }
    //
    /**
     * discuss refactor: todo public because we need to end call without doing the rpc when the server notifies that we have been removed
     * should only be called if the channel of the notification is the channel of this call
     */
    endCall(channelId = this.state.channel.id) {
        this.messaging.state.threads[createLocalId("mail.channel", channelId)].rtcInvitingSession =
            undefined;
        if (this.state.channel.id === channelId) {
            this.reset();
            this.soundEffects.play("channel-leave");
        }
    }

    async deafen() {
        await this.setDeaf(true);
        this.soundEffects.play("deafen");
    }
    /**
     * @param {array} [rtcSessionIds] rtcSessionId of the peerConnections for which
     * the incoming video traffic is allowed. If undefined, all traffic is
     * allowed. TODO: this should be done based on views
     */
    filterIncomingVideoTraffic(rtcSessionIds) {
        const ids = new Set(rtcSessionIds);
        for (const [rtcSessionId, peerConnection] of this.state.peerConnections) {
            const fullDirection = this.state.videoTrack ? "sendrecv" : "recvonly";
            const limitedDirection = this.state.videoTrack ? "sendonly" : "inactive";
            const transceiver = getTransceiver(peerConnection, "video");
            if (!transceiver) {
                continue;
            }
            transceiver.direction =
                !ids.size || ids.has(rtcSessionId) ? fullDirection : limitedDirection;
        }
    }

    async handleNotification(rtcSessionId, content) {
        const { event, channelId, payload } = JSON.parse(content);
        const rtcSession = this.state.channel.rtcSessions.get(rtcSessionId);
        if (
            !rtcSession ||
            rtcSession.channelId !== this.state.channel.id || // does handle notifications targeting a different session
            !IS_CLIENT_RTC_COMPATIBLE ||
            (!this.state.peerConnections.get(rtcSession.id) &&
                (!channelId || !this.state.channel || channelId !== this.state.channel.id))
        ) {
            return;
        }
        switch (event) {
            case "offer": {
                this.addLog(rtcSessionId, `received notification: ${event}`, {
                    step: "received offer",
                });
                const peerConnection =
                    this.state.peerConnections.get(rtcSessionId) ||
                    this.createPeerConnection(rtcSessionId);
                if (
                    !peerConnection ||
                    INVALID_ICE_CONNECTION_STATES.has(peerConnection.iceConnectionState) ||
                    peerConnection.signalingState === "have-remote-offer"
                ) {
                    return;
                }
                const rtcSessionDescription = new window.RTCSessionDescription(payload.sdp);
                try {
                    await peerConnection.setRemoteDescription(rtcSessionDescription);
                } catch (e) {
                    this.addLog(
                        rtcSessionId,
                        "offer handling: failed at setting remoteDescription",
                        {
                            error: e,
                        }
                    );
                    return;
                }
                await this.updateRemoteTrack(peerConnection, "audio", rtcSessionId);
                await this.updateRemoteTrack(peerConnection, "video", rtcSessionId);

                let answer;
                try {
                    answer = await peerConnection.createAnswer();
                } catch (e) {
                    this.addLog(rtcSessionId, "offer handling: failed at creating answer", {
                        error: e,
                    });
                    return;
                }
                try {
                    await peerConnection.setLocalDescription(answer);
                } catch (e) {
                    this.addLog(
                        rtcSessionId,
                        "offer handling: failed at setting localDescription",
                        {
                            error: e,
                        }
                    );
                    return;
                }

                this.addLog(rtcSessionId, "sending notification: answer", {
                    step: "sending answer",
                });
                await this.notifyPeers([rtcSessionId], "answer", {
                    sdp: peerConnection.localDescription,
                });
                this.recoverConnection(rtcSessionId, RECOVERY_TIMEOUT, "standard answer timeout");
                break;
            }
            case "answer": {
                this.addLog(rtcSessionId, `received notification: ${event}`, {
                    step: "received answer",
                });
                const peerConnection = this.state.peerConnections.get(rtcSessionId);
                if (
                    !peerConnection ||
                    INVALID_ICE_CONNECTION_STATES.has(peerConnection.iceConnectionState) ||
                    peerConnection.signalingState === "stable" ||
                    peerConnection.signalingState === "have-remote-offer"
                ) {
                    return;
                }
                const rtcSessionDescription = new window.RTCSessionDescription(payload.sdp);
                try {
                    await peerConnection.setRemoteDescription(rtcSessionDescription);
                } catch (e) {
                    this.addLog(
                        rtcSessionId,
                        "answer handling: Failed at setting remoteDescription",
                        {
                            error: e,
                        }
                    );
                    // ignored the transaction may have been resolved by another concurrent offer.
                }
                break;
            }
            case "ice-candidate": {
                const peerConnection = this.state.peerConnections.get(rtcSessionId);
                if (
                    !peerConnection ||
                    INVALID_ICE_CONNECTION_STATES.has(peerConnection.iceConnectionState)
                ) {
                    return;
                }
                const rtcIceCandidate = new window.RTCIceCandidate(payload.candidate);
                try {
                    await peerConnection.addIceCandidate(rtcIceCandidate);
                } catch (error) {
                    this.addLog(
                        rtcSessionId,
                        "ICE candidate handling: failed at adding the candidate to the connection",
                        { error }
                    );
                    this.recoverConnection(
                        rtcSessionId,
                        RECOVERY_TIMEOUT,
                        "failed at adding ice candidate"
                    );
                }
                break;
            }
            case "disconnect":
                this.addLog(rtcSessionId, `received notification: ${event}`, {
                    step: " peer cleanly disconnected ",
                });
                this.removePeer(rtcSession.id);
                break;
            case "trackChange": {
                const { isSelfMuted, isTalking, isSendingVideo, isDeaf } = payload.state;
                if (payload.type === "audio") {
                    if (!rtcSession.audioStream) {
                        return;
                    }
                    Object.assign(rtcSession, {
                        isSelfMuted,
                        isTalking,
                        isDeaf,
                    });
                }
                if (payload.type === "video" && isSendingVideo === false) {
                    /**
                     * Since WebRTC "unified plan", the local track is tied to the
                     * remote transceiver.sender and not the remote track. Therefore
                     * when the remote track is 'ended' the local track is not 'ended'
                     * but only 'muted'. This is why we do not stop the local track
                     * until the peer is completely removed.
                     */
                    rtcSession.videoStream = undefined;
                }
                break;
            }
        }
    }

    async mute() {
        await this.setMute(true);
        this.soundEffects.play("mute");
    }

    /**
     * Leaves the current call if there is one, joins the call if the user was
     * not yet in it.
     */
    async toggleCall(channelId, startWithVideo) {
        this.state.hasPendingRtcRequest = true;
        const isActiveCall = Boolean(this.state.channel && this.state.channel.id === channelId);
        if (this.state.channel) {
            await this.leaveCall(this.state.channel.id);
        }
        if (isActiveCall) {
            this.state.hasPendingRtcRequest = false;
            return;
        }
        await this.joinCall(channelId, startWithVideo);
        this.state.hasPendingRtcRequest = false;
    }

    /**
     * Mutes and unmutes the microphone, will not unmute if deaf.
     */
    async toggleMicrophone() {
        if (this.state.currentRtcSession.isMute) {
            await this.unmute();
        } else {
            await this.mute();
        }
    }

    async undeafen() {
        await this.setDeaf(false);
        this.soundEffects.play("undeafen");
    }

    async unmute() {
        if (this.state.audioTrack) {
            await this.setMute(false);
        } else {
            // if we don't have an audioTrack, we try to request it again
            await this.resetAudioTrack(true);
        }
        this.soundEffects.play("unmute");
    }

    //----------------------------------------------------------------------
    // Private
    //----------------------------------------------------------------------

    /**
     * @param {number} rtcSessionId
     * @param {String} entry
     * @param {Object} [param2]
     * @param {Error} [param2.error]
     * @param {String} [param2.step] current step of the flow
     * @param {String} [param2.state] current state of the connection
     */
    addLog(rtcSessionId, entry, { error, step, state } = {}) {
        if (!(rtcSessionId in this.state.logs)) {
            this.state.logs.set(rtcSessionId, { step: "", state: "", logs: [] });
        }
        const trace = window.Error().stack || "";
        this.state.logs.get(rtcSessionId).logs.push({
            event: `${window.moment().format("h:mm:ss")}: ${entry}`,
            error: error && {
                name: error.name,
                message: error.message,
                stack: error.stack && error.stack.split("\n"),
            },
            trace: trace.split("\n"),
        });
        if (step) {
            this.state.logs.get(rtcSessionId).step = step;
        }
        if (state) {
            this.state.logs.get(rtcSessionId).state = state;
        }
    }

    /**
     * @param {number} rtcSessionId
     */
    async callPeer(rtcSessionId) {
        const peerConnection = this.createPeerConnection(rtcSessionId);
        for (const trackKind of TRANSCEIVER_ORDER) {
            await this.updateRemoteTrack(peerConnection, trackKind, rtcSessionId, true);
        }
        this.state.outgoingSessionIds.add(rtcSessionId);
    }

    /**
     * Call all the sessions that do not have an already initialized peerConnection.
     */
    callSessions() {
        if (!this.state.channel.rtcSessions) {
            return;
        }
        for (const session of this.state.channel.rtcSessions.values()) {
            if (
                session.id in this.state.peerConnections ||
                session.id === this.state.currentRtcSession.id
            ) {
                continue;
            }
            session.connectionState = "Not connected: sending initial RTC offer";
            this.addLog(session.id, "init call", { step: "init call" });
            this.callPeer(session.id);
        }
    }

    /**
     * Creates and setup a RTCPeerConnection.
     *
     * @param {number} rtcSessionId
     */
    createPeerConnection(rtcSessionId) {
        const peerConnection = new window.RTCPeerConnection({ iceServers: this.state.iceServers });
        this.addLog(rtcSessionId, "RTCPeerConnection created", {
            step: "peer connection created",
        });
        peerConnection.onicecandidate = async (event) => {
            if (!event.candidate) {
                return;
            }
            await this.notifyPeers([rtcSessionId], "ice-candidate", {
                candidate: event.candidate,
            });
        };
        peerConnection.oniceconnectionstatechange = async (event) => {
            this.addLog(
                rtcSessionId,
                `ICE connection state changed: ${peerConnection.iceConnectionState}`,
                {
                    state: peerConnection.iceConnectionState,
                }
            );
            const rtcSession = this.state.channel.rtcSessions.get(rtcSessionId);
            if (!rtcSession) {
                return;
            }
            rtcSession.connectionState = peerConnection.iceConnectionState;
            switch (peerConnection.iceConnectionState) {
                case "closed":
                    this.removePeer(rtcSessionId);
                    break;
                case "failed":
                case "disconnected":
                    await this.recoverConnection(
                        rtcSessionId,
                        RECOVERY_DELAY,
                        `ice connection ${peerConnection.iceConnectionState}`
                    );
                    break;
            }
        };
        peerConnection.onconnectionstatechange = async (event) => {
            this.addLog(
                rtcSessionId,
                `connection state changed: ${peerConnection.connectionState}`
            );
            switch (peerConnection.connectionState) {
                case "closed":
                    this.removePeer(rtcSessionId);
                    break;
                case "failed":
                case "disconnected":
                    await this.recoverConnection(
                        rtcSessionId,
                        RECOVERY_DELAY,
                        `connection ${peerConnection.connectionState}`
                    );
                    break;
            }
        };
        peerConnection.onicecandidateerror = async (error) => {
            this.addLog(rtcSessionId, "ice candidate error");
            this.recoverConnection(rtcSessionId, RECOVERY_TIMEOUT, "ice candidate error");
        };
        peerConnection.onnegotiationneeded = async (event) => {
            const offer = await peerConnection.createOffer();
            try {
                await peerConnection.setLocalDescription(offer);
            } catch (error) {
                // Possibly already have a remote offer here: cannot set local description
                this.addLog(rtcSessionId, "couldn't setLocalDescription", { error });
                return;
            }
            this.addLog(rtcSessionId, "sending notification: offer", {
                step: "sending offer",
            });
            await this.notifyPeers([rtcSessionId], "offer", {
                sdp: peerConnection.localDescription,
            });
        };
        peerConnection.ontrack = ({ transceiver, track }) => {
            this.addLog(rtcSessionId, `received ${track.kind} track`);
            const rtcSession = this.state.channel.rtcSessions.get(rtcSessionId);
            const volume = this.userSettings.partnerVolumes.get(rtcSession.channelMember.partnerId);
            rtcSession?.updateStream(track, {
                mute: this.state.currentRtcSession.isDeaf,
                volume: volume ?? 1,
            });
        };
        const dataChannel = peerConnection.createDataChannel("notifications", {
            negotiated: true,
            id: 1,
        });
        dataChannel.onmessage = (event) => {
            this.handleNotification(rtcSessionId, event.data);
        };
        dataChannel.onopen = async () => {
            /**
             * FIXME? it appears that the track yielded by the peerConnection's 'ontrack' event is always enabled,
             * even when it is disabled on the sender-side.
             */
            try {
                await this.notifyPeers([rtcSessionId], "trackChange", {
                    type: "audio",
                    state: {
                        isTalking: this.state.currentRtcSession.isTalking,
                        isSelfMuted: this.state.currentRtcSession.isSelfMuted,
                    },
                });
            } catch (e) {
                if (!(e instanceof DOMException) || e.name !== "OperationError") {
                    throw e;
                }
                this.addLog(
                    rtcSessionId,
                    `failed to send on datachannel; dataChannelInfo: ${serializeRTCDataChannel(
                        dataChannel
                    )}`,
                    { error: e }
                );
            }
        };
        this.state.peerConnections.set(rtcSessionId, peerConnection);
        this.state.dataChannels.set(rtcSessionId, dataChannel);
        return peerConnection;
    }

    async initSession({
        channel,
        iceServers,
        invitedPartners,
        rtcSessions,
        sessionId,
        startWithVideo,
    }) {
        // Initializing a new session implies closing the current session.
        this.reset();
        this.state.channel = channel;
        this.state.channel.update({
            serverData: {
                rtcSessions,
                invitedPartners,
            },
        });
        this.state.currentRtcSession = this.messaging.state.rtcSessions.get(sessionId);
        this.state.iceServers = iceServers || DEFAULT_ICE_SERVERS;
        const channelProxy = reactive(this.state.channel, () => {
            if (channel !== this.state.channel) {
                throw new Error("channel has changed");
            }
            if (this.state.channel) {
                if (
                    this.state.channel &&
                    !channelProxy.rtcSessions.has(this.state.currentRtcSession.id)
                ) {
                    // if the current RTC session is not in the channel sessions, this call is no longer valid.
                    this.endCall();
                    return;
                }
                for (const rtcSessionId of this.state.peerConnections.keys()) {
                    if (!channelProxy.rtcSessions.has(rtcSessionId)) {
                        this.addLog(rtcSessionId, "session removed from the server");
                        this.removePeer(rtcSessionId);
                    }
                }
            }
            void channelProxy.rtcSessions.size;
        });
        this.state.channel.rtcInvitingSession = undefined;
        // discuss refactor: todo call channel.update below when availalbe and do the formatting in update
        this.callSessions();
        this.soundEffects.play("channel-join");
        await this.resetAudioTrack();
        if (startWithVideo) {
            await this.toggleVideoBroadcast("camera");
        }
    }

    /**
     * @param {number} channelId
     */
    async joinCall(channelId, startWithVideo = false) {
        if (!IS_CLIENT_RTC_COMPATIBLE) {
            this.notification.add(_t("Your browser does not support webRTC."), { type: "warning" });
            return;
        }
        const channel = this.messaging.state.threads[createLocalId("mail.channel", channelId)];
        const { rtcSessions, iceServers, sessionId, invitedPartners } = await this.rpc(
            "/mail/rtc/channel/join_call",
            {
                channel_id: channelId,
                check_rtc_session_ids: channel.rtcSessions.keys(),
            },
            { silent: true }
        );
        await this.initSession({
            channel,
            iceServers,
            invitedPartners,
            rtcSessions,
            sessionId,
            startWithVideo,
        });
    }

    /**
     * @param {String[]} rtcSessionId
     * @param {String} event
     * @param {Object} [payload]
     */
    async notifyPeers(rtcSessionIds, event, payload) {
        if (!rtcSessionIds.length || !this.state.channel.id || !this.state.currentRtcSession) {
            return;
        }
        if (event === "trackChange") {
            // p2p
            for (const rtcSessionId of rtcSessionIds) {
                const dataChannel = this.state.dataChannels.get(rtcSessionId);
                if (!dataChannel || dataChannel.readyState !== "open") {
                    continue;
                }
                dataChannel.send(
                    JSON.stringify({
                        event,
                        channelId: this.state.channel.id,
                        payload,
                    })
                );
            }
        } else {
            // server
            this.state.peerNotificationsToSend.set(++tmpId, {
                channelId: this.state.channel.id,
                event,
                payload,
                senderId: this.state.currentRtcSession.id,
                rtcSessionIds,
            });
            await this.sendPeerNotifications();
        }
    }

    async performRpcLeaveCall(channelId) {
        await this.rpc(
            "/mail/rtc/channel/leave_call",
            {
                channel_id: channelId,
            },
            { silent: true }
        );
    }

    async pingServer() {
        const { rtcSessions } = await this.rpc(
            "/mail/channel/ping",
            {
                channel_id: this.state.channel.id,
                check_rtc_session_ids: this.state.channel.rtcSessions.keys(),
                rtc_session_id: this.state.currentRtcSession.id,
            },
            { silent: true }
        );
        if (this.state.channel) {
            const activeSessionsData = rtcSessions[0][1];
            for (const rtcSessionData of activeSessionsData) {
                const rtcSession = RtcSession.insert(this.messaging.state, rtcSessionData);
                this.state.channel.rtcSessions.set(rtcSession.id, rtcSession);
            }
            const outdatedSessionsData = rtcSessions[1][1];
            for (const rtcSessionData of outdatedSessionsData) {
                const rtcSession = RtcSession.delete(this.messaging.state, rtcSessionData);
                this.state.channel.rtcSessions.delete(rtcSession.id);
            }
        }
    }

    /**
     * Attempts a connection recovery by closing and restarting the call
     * from the receiving end.
     *
     * @param {number} rtcSessionId
     * @param {number} [delay] in ms
     */
    recoverConnection(rtcSessionId, delay = 0, reason = "") {
        if (this.state.recoverTimeouts.get(rtcSessionId)) {
            return;
        }
        this.state.recoverTimeouts.set(
            rtcSessionId,
            browser.setTimeout(async () => {
                this.state.recoverTimeouts.delete(rtcSessionId);
                const peerConnection = this.state.peerConnections.get(rtcSessionId);
                if (
                    !peerConnection ||
                    !this.state.channel.id ||
                    this.state.outgoingSessionIds.has(rtcSessionId) ||
                    peerConnection.iceConnectionState === "connected"
                ) {
                    return;
                }
                this.addLog(
                    rtcSessionId,
                    `calling back to recover ${peerConnection.iceConnectionState} connection, reason: ${reason}`
                );
                await this.notifyPeers([rtcSessionId], "disconnect");
                this.removePeer(rtcSessionId);
                this.callPeer(rtcSessionId);
            }, delay)
        );
    }

    /**
     * Cleans up a peer by closing all its associated content and the connection.
     *
     * @param {number} rtcSessionId
     */
    removePeer(rtcSessionId) {
        const rtcSession = this.state.channel.rtcSessions.get(rtcSessionId);
        if (rtcSession) {
            rtcSession.reset();
        }
        const dataChannel = this.state.dataChannels.get(rtcSessionId);
        if (dataChannel) {
            dataChannel.close();
        }
        this.state.dataChannels.delete(rtcSessionId);
        const peerConnection = this.state.peerConnections.get(rtcSessionId);
        if (peerConnection) {
            this.removeRemoteTracks(peerConnection);
            peerConnection.close();
        }
        this.state.peerConnections.delete(rtcSessionId);
        browser.clearTimeout(this.state.recoverTimeouts.get(rtcSessionId));
        this.state.recoverTimeouts.delete(rtcSessionId);

        this.state.outgoingSessionIds.delete(rtcSessionId);
        this.addLog(rtcSessionId, "peer removed", { step: "peer removed" });
    }

    /**
     * Terminates the Transceivers of the peer connection.
     *
     * @param {RTCPeerConnection} peerConnection
     */
    removeRemoteTracks(peerConnection) {
        const RTCRtpSenders = peerConnection.getSenders();
        for (const sender of RTCRtpSenders) {
            try {
                peerConnection.removeTrack(sender);
            } catch {
                // ignore error
            }
        }
        for (const transceiver of peerConnection.getTransceivers()) {
            try {
                transceiver.stop();
            } catch {
                // transceiver may already be stopped by the remote.
            }
        }
    }

    /**
     * Resets the state of the model and cleanly ends all connections and
     * streams.
     */
    reset() {
        for (const rtcSessionId of this.state.peerConnections.keys()) {
            this.removePeer(rtcSessionId);
        }
        this.state.peerConnections.clear();
        for (const timeoutId of this.state.recoverTimeouts.values()) {
            clearTimeout(timeoutId);
        }
        this.state.recoverTimeouts.clear();
        this.state.updateAndBroadcastDebounce?.cancel();
        this.state.disconnectAudioMonitor?.();
        this.state.audioTrack?.stop();
        this.state.videoTrack?.stop();
        this.state.dataChannels.clear();
        this.state.peerNotificationsToSend.clear();
        this.state.logs.clear();
        Object.assign(this.state, {
            updateAndBroadcastDebounce: undefined,
            disconnectAudioMonitor: undefined,
            outgoingSessionIds: new Set(),
            videoTrack: undefined,
            audioTrack: undefined,
            currentRtcSession: undefined,
            sendCamera: false,
            sendScreen: false,
            channel: undefined,
        });
    }

    /**
     * Sends this peer notifications to send as soon as the last pending
     * sending finishes.
     */
    async sendPeerNotifications() {
        if (this.state.pendingNotifyPeers) {
            return;
        }
        this.state.pendingNotifyPeers = true;
        await new Promise((resolve) => setTimeout(resolve, PEER_NOTIFICATION_WAIT_DELAY));
        const ids = [];
        const notifications = [];
        this.state.peerNotificationsToSend.forEach((peerNotification, id) => {
            ids.push(id);
            notifications.push([
                peerNotification.senderId,
                peerNotification.rtcSessionIds,
                JSON.stringify({
                    event: peerNotification.event,
                    channelId: peerNotification.channelId,
                    payload: peerNotification.payload,
                }),
            ]);
        });
        try {
            await this.rpc(
                "/mail/rtc/session/notify_call_members",
                {
                    peer_notifications: notifications,
                },
                { silent: true }
            );
            for (const id of ids) {
                this.state.peerNotificationsToSend.delete(id);
            }
        } finally {
            this.state.pendingNotifyPeers = false;
            if (this.state.peerNotificationsToSend.size > 0) {
                this.sendPeerNotifications();
            }
        }
    }

    /**
     * @param {Boolean} isDeaf
     */
    async setDeaf(isDeaf) {
        this.updateAndBroadcast(this.state.currentRtcSession, { isDeaf });
        for (const session of this.messaging.state.rtcSessions.values()) {
            if (!session.audioElement) {
                continue;
            }
            session.audioElement.muted = isDeaf;
        }
        await this.refreshAudioTrack();
    }
    /**
     * @param {Boolean} isSelfMuted
     */
    async setMute(isSelfMuted) {
        this.updateAndBroadcast(this.state.currentRtcSession, { isSelfMuted });
        await this.refreshAudioTrack();
    }

    /**
     * @param {boolean} isTalking
     */
    async setTalking(isTalking) {
        if (!this.state.currentRtcSession || isTalking === this.state.currentRtcSession.isTalking) {
            return;
        }
        this.state.currentRtcSession.isTalking = isTalking;
        if (!this.state.currentRtcSession.isMute) {
            await this.refreshAudioTrack();
        }
    }

    /**
     * @param {string} type
     * @param {boolean} [force]
     */
    async toggleVideoBroadcast(type, force) {
        if (!this.state.channel.id) {
            return;
        }
        await this.toggleLocalVideoTrack(type, force);
        for (const [rtcSessionId, peerConnection] of this.state.peerConnections) {
            await this.updateRemoteTrack(peerConnection, "video", rtcSessionId);
        }
        if (!this.state.currentRtcSession) {
            return;
        }
        this.updateAndBroadcast(this.state.currentRtcSession, {
            isScreenSharingOn: !!this.state.sendScreen,
            isCameraOn: !!this.state.sendCamera,
        });
    }

    /**
     * @param {String} type 'camera' or 'display' (eg: screen sharing)
     * @param {boolean} [force]
     */
    async toggleLocalVideoTrack(type, force) {
        switch (type) {
            case "camera": {
                const sendCamera = force ?? !this.state.sendCamera;
                await this.updateLocalVideoTrack(type, sendCamera);
                break;
            }
            case "screen": {
                const sendScreen = force ?? !this.state.sendScreen;
                await this.updateLocalVideoTrack(type, sendScreen);
                break;
            }
        }
        if (!this.state.currentRtcSession) {
            return;
        }
        if (!this.state.videoTrack) {
            this.state.currentRtcSession.removeVideo();
        } else {
            this.state.currentRtcSession.updateStream(this.state.videoTrack);
        }
    }

    /**
     * @param {RtcSession} rtcSession
     * @param {Object} data
     */
    updateAndBroadcast(rtcSession, data) {
        Object.assign(rtcSession, data);
        this.state.updateAndBroadcastDebounce = debounce(async () => {
            await this.rpc(
                "/mail/rtc/session/update_and_broadcast",
                {
                    session_id: rtcSession.id,
                    values: {
                        is_camera_on: rtcSession.isCameraOn,
                        is_deaf: rtcSession.isDeaf,
                        is_muted: rtcSession.isSelfMuted,
                        is_screen_sharing_on: rtcSession.isScreenSharingOn,
                    },
                },
                { silent: true }
            );
        }, 3000);
    }

    /**
     * Sets the enabled property of the local audio track based on the
     * current session state. And notifies peers of the new audio state.
     */
    async refreshAudioTrack() {
        if (!this.state.audioTrack) {
            return;
        }
        this.state.audioTrack.enabled =
            !this.state.currentRtcSession.isMute && this.state.currentRtcSession.isTalking;
        await this.notifyPeers(Object.keys(this.state.peerConnections), "trackChange", {
            type: "audio",
            state: {
                isTalking:
                    this.state.currentRtcSession.isTalking &&
                    !this.state.currentRtcSession.isSelfMuted,
                isSelfMuted: this.state.currentRtcSession.isSelfMuted,
                isDeaf: this.state.currentRtcSession.isDeaf,
            },
        });
    }

    /**
     * @param {String} type 'camera' or 'screen'
     */
    async updateLocalVideoTrack(type, activateVideo = false) {
        this.state.sendScreen = false;
        this.state.sendCamera = false;
        const stopVideo = () => {
            if (this.state.videoTrack) {
                this.state.videoTrack.stop();
            }
            this.state.videoTrack = undefined;
        };
        if (!activateVideo) {
            if (type === "screen") {
                this.soundEffects.play("screen-sharing");
            }
            stopVideo();
            return;
        }
        let stream;
        try {
            if (type === "camera") {
                stream = await browser.navigator.mediaDevices.getUserMedia({
                    video: VIDEO_CONFIG,
                });
            }
            if (type === "screen") {
                stream = await browser.navigator.mediaDevices.getDisplayMedia({
                    video: VIDEO_CONFIG,
                });
                this.soundEffects.play("screen-sharing");
            }
        } catch {
            const str =
                type === "camera"
                    ? _t('%s" requires "camera" access')
                    : _t('%s" requires "screen recording" access');
            this.messaging.notify({
                message: sprintf(str, window.location.host),
                type: "warning",
            });
            stopVideo();
            return;
        }
        const track = stream ? stream.getVideoTracks()[0] : undefined;
        if (track) {
            track.addEventListener("ended", async () => {
                await this.toggleVideoBroadcast(type, false);
            });
        }
        Object.assign(this.state, {
            videoTrack: track,
            sendCamera: type === "camera" && track,
            sendScreen: type === "screen" && track,
        });
    }

    /**
     * Updates the track that is broadcasted to the RTCPeerConnection.
     * This will start new transaction by triggering a negotiationneeded event
     * on the peerConnection given as parameter.
     *
     * negotiationneeded -> offer -> answer -> ...
     *
     * @param {RTCPeerConnection} peerConnection
     * @param {String} trackKind
     * @param {number} rtcSessionId
     */
    async updateRemoteTrack(peerConnection, trackKind, rtcSessionId, initTransceiver = false) {
        this.addLog(rtcSessionId, `updating ${trackKind} transceiver`);
        const track = trackKind === "audio" ? this.state.audioTrack : this.state.videoTrack;
        const fullDirection = track ? "sendrecv" : "recvonly";
        const limitedDirection = track ? "sendonly" : "inactive";
        let transceiverDirection = fullDirection;
        if (trackKind === "video") {
            transceiverDirection =
                !this.messaging.focusedRtcSessionId ||
                this.messaging.focusedRtcSessionId === rtcSessionId
                    ? fullDirection
                    : limitedDirection;
        }
        let transceiver;
        if (initTransceiver) {
            transceiver = peerConnection.addTransceiver(trackKind);
        } else {
            transceiver = getTransceiver(peerConnection, trackKind);
        }
        if (track) {
            try {
                await transceiver.sender.replaceTrack(track);
                transceiver.direction = transceiverDirection;
            } catch {
                // ignored, the track is probably already on the peerConnection.
            }
            return;
        }
        try {
            await transceiver.sender.replaceTrack(null);
            transceiver.direction = transceiverDirection;
        } catch {
            // ignored, the transceiver is probably already removed
        }
        if (trackKind === "video") {
            this.notifyPeers([rtcSessionId], "trackChange", {
                type: "video",
                state: { isSendingVideo: false },
            });
        }
    }

    async resetAudioTrack(audio = false) {
        if (this.state.audioTrack) {
            this.state.audioTrack.stop();
            this.state.audioTrack = undefined;
        }
        if (!this.state.channel.id) {
            return;
        }
        if (audio) {
            let audioTrack;
            try {
                const audioStream = await browser.navigator.mediaDevices.getUserMedia({
                    audio: this.userSettings.audioConstraints,
                });
                audioTrack = audioStream.getAudioTracks()[0];
            } catch {
                this.notification.add(
                    sprintf(_t('"%(hostname)s" requires microphone access'), {
                        hostname: window.location.host,
                    }),
                    { type: "warning" }
                );
                if (this.state.currentRtcSession) {
                    this.updateAndBroadcast(this.state.currentRtcSession, { isSelfMuted: true });
                }
                return;
            }
            if (!this.state.currentRtcSession) {
                // The getUserMedia promise could resolve when the call is ended
                // in which case the track is no longer relevant.
                audioTrack.stop();
                return;
            }
            audioTrack.addEventListener("ended", async () => {
                // this mostly happens when the user retracts microphone permission.
                await this.resetAudioTrack(false);
                this.updateAndBroadcast(this.state.currentRtcSession, { isSelfMuted: true });
                await this.refreshAudioTrack();
            });
            this.updateAndBroadcast(this.state.currentRtcSession, { isSelfMuted: false });
            audioTrack.enabled =
                !this.state.currentRtcSession.isMute && this.state.currentRtcSession.isTalking;
            this.state.audioTrack = audioTrack;
            await this.updateVoiceActivation();
            for (const [rtcSessionId, peerConnection] of this.state.peerConnections) {
                await this.updateRemoteTrack(peerConnection, "audio", rtcSessionId);
            }
        }
    }

    /**
     * Updates the way broadcast of the local audio track is handled,
     * attaches an audio monitor for voice activation if necessary.
     */
    async updateVoiceActivation() {
        this.state.disconnectAudioMonitor?.();
        if (this.userSettings.usePushToTalk || !this.state.channel || !this.state.audioTrack) {
            this.state.currentRtcSession.isTalking = false;
            await this.refreshAudioTrack();
            return;
        }
        try {
            this.state.disconnectAudioMonitor = await monitorAudio(this.state.audioTrack, {
                onThreshold: async (isAboveThreshold) => {
                    this.setTalking(isAboveThreshold);
                },
                volumeThreshold: this.userSettings.voiceActivationThreshold,
            });
        } catch {
            /**
             * The browser is probably missing audioContext,
             * in that case, voice activation is not enabled
             * and the microphone is always 'on'.
             */
            this.notification.add(_t("Your browser does not support voice activation"), {
                type: "warning",
            });
            this.state.currentRtcSession.isTalking = true;
        }
        await this.refreshAudioTrack();
    }
}
