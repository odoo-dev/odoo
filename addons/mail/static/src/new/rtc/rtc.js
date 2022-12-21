/** @odoo-module */

import { browser } from "@web/core/browser/browser";

import { monitorAudio } from "./media_monitoring";
import { sprintf } from "@web/core/utils/strings";
import { _t } from "@web/core/l10n/translation";
import { reactive } from "@odoo/owl";

import { RtcSession } from "./rtc_session_model";
import { createLocalId } from "../core/thread_model.create_local_id";

const TRANSCEIVER_ORDER = ["audio", "video"];

let tmpId = 0;

export class Rtc {
    constructor(env, messaging, notification, rpc, soundEffects, userSettings) {
        // services
        this.env = env;
        this.messaging = messaging;
        this.notification = notification;
        this.rpc = rpc;
        this.soundEffects = soundEffects;
        this.userSettings = userSettings;
        // discuss refactor: use observe util when available
        const proxyBlur = reactive(this.userSettings, () => {
            if (!this.sendUserVideo) {
                return;
            }
            this.toggleUserVideo({ force: true });
            void proxyBlur.useBlur;
        }).useBlur;
        const proxyVoiceActivation = reactive(this.userSettings, async () => {
            await this._updateVoiceActivation();
            void proxyVoiceActivation.voiceActivationThreshold;
        }).voiceActivationThreshold;
        const proxyPushToTalk = reactive(this.userSettings, async () => {
            await this._updateVoiceActivation();
            void proxyPushToTalk.usePushToTalk;
        }).usePushToTalk;
        const proxyAudioInputDevice = reactive(this.userSettings, async () => {
            this._updateLocalAudioTrack();
            void proxyAudioInputDevice.audioInputDeviceId;
        }).audioInputDeviceId;

        this._onKeyDown = this._onKeyDown.bind(this);
        this._onKeyUp = this._onKeyUp.bind(this);
        browser.addEventListener("keydown", this._onKeyDown);
        browser.addEventListener("keyup", this._onKeyUp);

        // Disconnects the RTC session if the page is closed or reloaded.
        this._onPageHide = this._onPageHide.bind(this);
        browser.addEventListener("pagehide", this._onPageHide);
        /**
         * Call all sessions for which no peerConnection is established at
         * a regular interval to try to recover any connection that failed
         * to start.
         *
         * This is distinct from this._recoverConnection which tries to restores
         * connection that were established but failed or timed out.
         */
        this._intervalId = browser.setInterval(async () => {
            if (!this.currentRtcSession || !this.channel) {
                return;
            }
            await this._pingServer();
            if (!this.currentRtcSession || !this.channel) {
                return;
            }
            this._callSessions();
        }, 30000); // 30 seconds
    }
    currentRtcSession;
    channel;
    iceServers = [{ urls: ["stun:stun1.l.google.com:19302", "stun:stun2.l.google.com:19302"] }];
    isClientRtcCompatible = Boolean(window.RTCPeerConnection && window.MediaStream);
    invalidIceConnectionStates = new Set(["disconnected", "failed", "closed"]);
    logs = new Map();
    sendUserVideo = false;
    sendDisplay = false;
    videoConfig = {
        aspectRatio: 16 / 9,
        frameRate: {
            max: 30,
        },
    };

    _blurManager; // discuss refactor: make blur manager class
    _isNotifyPeersRPCInProgress = false;
    _debounceIds = new Map();
    _peerNotificationsToSend = new Map();
    _peerNotificationWaitDelay = 50;
    _recoveryTimeout = 15000;
    _recoveryDelay = 3000;
    _audioTrack;
    _videoTrack;
    /**
     * Object { rtcSessionId: dataChannel<RTCDataChannel> }
     * Contains the RTCDataChannels with the other rtc sessions.
     */
    _dataChannels = new Map();
    /**
     * callback to properly end the audio monitoring.
     * If set it indicates that we are currently monitoring the local
     * audioTrack for the voice activation feature.
     */
    _disconnectAudioMonitor;
    /**
     * Object { rtcSessionId: timeoutId<Number> }
     * Contains the timeoutIds of the reconnection attempts.
     */
    _fallBackTimeouts = new Map();
    /**
     * Set of rtcSessionIds, used to track which calls are outgoing,
     * which is used when attempting to recover a failed peer connection by
     * inverting the call direction.
     */
    _outGoingCallSessionIds = new Set();
    /**
     * Object { rtcSessionId: peerConnection<RTCPeerConnection> }
     * Contains the RTCPeerConnection established with the other rtc sessions.
     * Exposing this field and keeping references to closed peer connections may lead
     * to difficulties reconnecting to the same peer.
     */
    _peerConnections = new Map();
    /**
     *  timeoutId for the push to talk release delay.
     */
    _pushToTalkTimeoutId;

    /**
     * Notifies the server and does the cleanup of the current call.
     */
    async leaveCall(channelId = this.channel.id) {
        await this._performRpcLeaveCall(channelId);
        this.endCall(channelId);
    }
    //
    /**
     * discuss refactor: todo public because we need to end call without doing the rpc when the server notifies that we have been removed
     * should only be called if the channel of the notification is the channel of this call
     */
    endCall(channelId = this.channel.id) {
        this.messaging.state.threads[createLocalId("mail.channel", channelId)].rtcInvitingSession =
            undefined;
        if (this.channel.id === channelId) {
            this._reset();
            this.soundEffects.play("channelLeave");
        }
    }

    async deafen() {
        await this._setDeafState(true);
        this.soundEffects.play("deafen");
    }
    /**
     * @param {array} [rtcSessionIds] rtcSessionId of the peerConnections for which
     * the incoming video traffic is allowed. If undefined, all traffic is
     * allowed. TODO: this should be done based on views
     */
    filterIncomingVideoTraffic(rtcSessionIds) {
        const ids = new Set(rtcSessionIds);
        for (const [rtcSessionId, peerConnection] of this._peerConnections) {
            const fullDirection = this._videoTrack ? "sendrecv" : "recvonly";
            const limitedDirection = this._videoTrack ? "sendonly" : "inactive";
            const transceiver = this._getTransceiver(peerConnection, "video");
            if (!transceiver) {
                continue;
            }
            if (!ids.size || ids.has(rtcSessionId)) {
                transceiver.direction = fullDirection;
            } else {
                transceiver.direction = limitedDirection;
            }
        }
    }

    async handleNotification(rtcSessionId, content) {
        const { event, channelId, payload } = JSON.parse(content);
        const rtcSession = this.channel.rtcSessions.get(rtcSessionId);
        if (!rtcSession || rtcSession.channelId !== this.channel.id) {
            // does handle notifications targeting a different session
            return;
        }
        if (!this.isClientRtcCompatible) {
            return;
        }
        if (
            !this._peerConnections.get(rtcSession.id) &&
            (!channelId || !this.channel || channelId !== this.channel.id)
        ) {
            return;
        }
        switch (event) {
            case "offer":
                this._addLogEntry(rtcSessionId, `received notification: ${event}`, {
                    step: "received offer",
                });
                await this._handleRtcTransactionOffer(rtcSession.id, payload);
                break;
            case "answer":
                this._addLogEntry(rtcSessionId, `received notification: ${event}`, {
                    step: "received answer",
                });
                await this._handleRtcTransactionAnswer(rtcSession.id, payload);
                break;
            case "ice-candidate":
                await this._handleRtcTransactionICECandidate(rtcSession.id, payload);
                break;
            case "disconnect":
                this._addLogEntry(rtcSessionId, `received notification: ${event}`, {
                    step: " peer cleanly disconnected ",
                });
                this._removePeer(rtcSession.id);
                break;
            case "trackChange":
                this._handleTrackChange(rtcSession, payload);
                break;
        }
    }

    async mute() {
        await this._setMuteState(true);
        this.soundEffects.play("mute");
    }

    /**
     * Leaves the current call if there is one, joins the call if the user was
     * not yet in it.
     *
     * @param {Object} [options]
     */
    async toggleCall(channelId, options = {}) {
        this.hasPendingRtcRequest = true;
        const isActiveCall = Boolean(this.channel && this.channel.id === channelId);
        if (this.channel) {
            await this.leaveCall(this.channel.id);
        }
        if (isActiveCall) {
            this.hasPendingRtcRequest = false;
            return;
        }
        await this._joinCall(channelId, options);
        this.hasPendingRtcRequest = false;
    }

    /**
     * Mutes and unmutes the microphone, will not unmute if deaf.
     */
    async toggleMicrophone() {
        if (this.currentRtcSession.isMute) {
            await this.unmute();
        } else {
            await this.mute();
        }
    }

    /**
     * toggles screen broadcasting to peers.
     */
    async toggleScreenShare() {
        this._toggleVideoBroadcast({ type: "display" });
    }

    /**
     * Toggles user video (eg: webcam) broadcasting to peers.
     */
    async toggleUserVideo() {
        this._toggleVideoBroadcast({ type: "user-video" });
    }

    async undeafen() {
        await this._setDeafState(false);
        this.soundEffects.play("undeafen");
    }

    async unmute() {
        if (this._audioTrack) {
            await this._setMuteState(false);
        } else {
            // if we don't have an audioTrack, we try to request it again
            await this._updateLocalAudioTrack(true);
        }
        this.soundEffects.play("unmute");
    }

    //----------------------------------------------------------------------
    // Private
    //----------------------------------------------------------------------

    /**
     * @private
     * @param {number} rtcSessionId
     * @param {String} entry
     * @param {Object} [param2]
     * @param {Error} [param2.error]
     * @param {String} [param2.step] current step of the flow
     * @param {String} [param2.state] current state of the connection
     */
    _addLogEntry(rtcSessionId, entry, { error, step, state } = {}) {
        /*
        if (!this.modelManager.isDebug) {
            return;
        }
        */
        if (!(rtcSessionId in this.logs)) {
            this.logs.set(rtcSessionId, { step: "", state: "", logs: [] });
        }
        const trace = window.Error().stack || "";
        this.logs.get(rtcSessionId).logs.push({
            event: `${window.moment().format("h:mm:ss")}: ${entry}`,
            error: error && {
                name: error.name,
                message: error.message,
                stack: error.stack && error.stack.split("\n"),
            },
            trace: trace.split("\n"),
        });
        if (step) {
            this.logs.get(rtcSessionId).step = step;
        }
        if (state) {
            this.logs.get(rtcSessionId).state = state;
        }
    }

    /**
     * @private
     * @param {number} rtcSessionId
     */
    async _callPeer(rtcSessionId) {
        const peerConnection = this._createPeerConnection(rtcSessionId);
        for (const trackKind of TRANSCEIVER_ORDER) {
            await this._updateRemoteTrack(peerConnection, trackKind, {
                initTransceiver: true,
                rtcSessionId,
            });
        }
        this._outGoingCallSessionIds.add(rtcSessionId);
    }

    /**
     * Call all the sessions that do not have an already initialized peerConnection.
     *
     * @private
     */
    _callSessions() {
        if (!this.channel.rtcSessions) {
            return;
        }
        for (const session of this.channel.rtcSessions.values()) {
            if (session.id in this._peerConnections) {
                continue;
            }
            if (session.id === this.currentRtcSession.id) {
                continue;
            }
            session.connectionState = "Not connected: sending initial RTC offer";
            this._addLogEntry(session.id, "init call", { step: "init call" });
            this._callPeer(session.id);
        }
    }

    /**
     * Creates and setup a RTCPeerConnection.
     *
     * @private
     * @param {number} rtcSessionId
     */
    _createPeerConnection(rtcSessionId) {
        const peerConnection = new window.RTCPeerConnection({ iceServers: this.iceServers });
        this._addLogEntry(rtcSessionId, `RTCPeerConnection created`, {
            step: "peer connection created",
        });
        peerConnection.onicecandidate = async (event) => {
            if (!event.candidate) {
                return;
            }
            await this._notifyPeers([rtcSessionId], {
                event: "ice-candidate",
                payload: { candidate: event.candidate },
            });
        };
        peerConnection.oniceconnectionstatechange = (event) => {
            this._onICEConnectionStateChange(peerConnection.iceConnectionState, rtcSessionId);
        };
        peerConnection.onconnectionstatechange = (event) => {
            this._onConnectionStateChange(peerConnection.connectionState, rtcSessionId);
        };
        peerConnection.onicecandidateerror = async (error) => {
            this._addLogEntry(rtcSessionId, `ice candidate error`);
            this._recoverConnection(rtcSessionId, {
                delay: this._recoveryTimeout,
                reason: "ice candidate error",
            });
        };
        peerConnection.onnegotiationneeded = async (event) => {
            const offer = await peerConnection.createOffer();
            try {
                await peerConnection.setLocalDescription(offer);
            } catch (e) {
                // Possibly already have a remote offer here: cannot set local description
                this._addLogEntry(rtcSessionId, `couldn't setLocalDescription`, { error: e });
                return;
            }
            this._addLogEntry(rtcSessionId, `sending notification: offer`, {
                step: "sending offer",
            });
            await this._notifyPeers([rtcSessionId], {
                event: "offer",
                payload: { sdp: peerConnection.localDescription },
            });
        };
        peerConnection.ontrack = ({ transceiver, track }) => {
            this._addLogEntry(rtcSessionId, `received ${track.kind} track`);
            const rtcSession = this.channel.rtcSessions.get(rtcSessionId);
            const volume = this.userSettings.partnerVolumes.get(rtcSession.channelMember.partnerId);
            rtcSession?.updateStream(track, {
                mute: this.currentRtcSession.isDeaf,
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
                await this._notifyPeers([rtcSessionId], {
                    event: "trackChange",
                    type: "peerToPeer",
                    payload: {
                        type: "audio",
                        state: {
                            isTalking: this.currentRtcSession.isTalking,
                            isSelfMuted: this.currentRtcSession.isSelfMuted,
                        },
                    },
                });
            } catch (e) {
                if (!(e instanceof DOMException) || e.name !== "OperationError") {
                    throw e;
                }
                this._addLogEntry(
                    rtcSessionId,
                    `failed to send on datachannel; dataChannelInfo: ${this._serializeRTCDataChannel(
                        dataChannel
                    )}`,
                    { error: e }
                );
            }
        };
        this._peerConnections.set(rtcSessionId, peerConnection);
        this._dataChannels.set(rtcSessionId, dataChannel);
        return peerConnection;
    }

    /**
     * @private
     */
    _debounce(key, f, delay) {
        const debounceId = this._debounceIds.get(key);
        if (debounceId) {
            browser.clearTimeout(debounceId);
        }
        this._debounceIds.set(
            key,
            browser.setTimeout(() => {
                f();
            }, delay)
        );
    }

    /**
     * @private
     * @param {RTCPeerConnection} peerConnection
     * @param {String} trackKind
     * @returns {RTCRtpTransceiver} the transceiver used for this trackKind.
     */
    _getTransceiver(peerConnection, trackKind) {
        const transceivers = peerConnection.getTransceivers();
        return transceivers[TRANSCEIVER_ORDER.indexOf(trackKind)];
    }

    /**
     * @private
     * @param {number} rtcSessionId
     * @param {Object} param1
     * @param {Object} param1.sdp Session Description Protocol
     */
    async _handleRtcTransactionAnswer(rtcSessionId, { sdp }) {
        const peerConnection = this._peerConnections.get(rtcSessionId);
        if (
            !peerConnection ||
            this.invalidIceConnectionStates.has(peerConnection.iceConnectionState) ||
            peerConnection.signalingState === "stable"
        ) {
            return;
        }
        if (peerConnection.signalingState === "have-remote-offer") {
            // we already have an offer
            return;
        }
        const rtcSessionDescription = new window.RTCSessionDescription(sdp);
        try {
            await peerConnection.setRemoteDescription(rtcSessionDescription);
        } catch (e) {
            this._addLogEntry(
                rtcSessionId,
                "answer handling: Failed at setting remoteDescription",
                {
                    error: e,
                }
            );
            // ignored the transaction may have been resolved by another concurrent offer.
        }
    }

    /**
     * @private
     * @param {number} rtcSessionId
     * @param {Object} param1
     * @param {Object} param1.candidate RTCIceCandidateInit
     */
    async _handleRtcTransactionICECandidate(rtcSessionId, { candidate }) {
        const peerConnection = this._peerConnections.get(rtcSessionId);
        if (
            !peerConnection ||
            this.invalidIceConnectionStates.has(peerConnection.iceConnectionState)
        ) {
            return;
        }
        const rtcIceCandidate = new window.RTCIceCandidate(candidate);
        try {
            await peerConnection.addIceCandidate(rtcIceCandidate);
        } catch (error) {
            this._addLogEntry(
                rtcSessionId,
                "ICE candidate handling: failed at adding the candidate to the connection",
                { error }
            );
            this._recoverConnection(rtcSessionId, {
                delay: this._recoveryTimeout,
                reason: "failed at adding ice candidate",
            });
        }
    }

    /**
     * @private
     * @param {number} rtcSessionId
     * @param {Object} param1
     * @param {Object} param1.sdp Session Description Protocol
     */
    async _handleRtcTransactionOffer(rtcSessionId, { sdp }) {
        const peerConnection =
            this._peerConnections.get(rtcSessionId) || this._createPeerConnection(rtcSessionId);

        if (
            !peerConnection ||
            this.invalidIceConnectionStates.has(peerConnection.iceConnectionState)
        ) {
            return;
        }
        if (peerConnection.signalingState === "have-remote-offer") {
            // we already have an offer
            return;
        }
        const rtcSessionDescription = new window.RTCSessionDescription(sdp);
        try {
            await peerConnection.setRemoteDescription(rtcSessionDescription);
        } catch (e) {
            this._addLogEntry(rtcSessionId, "offer handling: failed at setting remoteDescription", {
                error: e,
            });
            return;
        }
        await this._updateRemoteTrack(peerConnection, "audio", { rtcSessionId });
        await this._updateRemoteTrack(peerConnection, "video", { rtcSessionId });

        let answer;
        try {
            answer = await peerConnection.createAnswer();
        } catch (e) {
            this._addLogEntry(rtcSessionId, "offer handling: failed at creating answer", {
                error: e,
            });
            return;
        }
        try {
            await peerConnection.setLocalDescription(answer);
        } catch (e) {
            this._addLogEntry(rtcSessionId, "offer handling: failed at setting localDescription", {
                error: e,
            });
            return;
        }

        this._addLogEntry(rtcSessionId, `sending notification: answer`, { step: "sending answer" });
        await this._notifyPeers([rtcSessionId], {
            event: "answer",
            payload: { sdp: peerConnection.localDescription },
        });
        this._recoverConnection(rtcSessionId, {
            delay: this._recoveryTimeout,
            reason: "standard answer timeout",
        });
    }

    /**
     * @private
     * @param {mail.rtc_session} rtcSession
     * @param {Object} param1
     * @param {String} param1.type 'audio' or 'video'
     * @param {Object} param1.state
     */
    _handleTrackChange(rtcSession, { type, state }) {
        const { isSelfMuted, isTalking, isSendingVideo, isDeaf } = state;
        if (type === "audio") {
            if (!rtcSession.audioStream) {
                return;
            }
            Object.assign(rtcSession, {
                isSelfMuted,
                isTalking,
                isDeaf,
            });
        }
        if (type === "video" && isSendingVideo === false) {
            /**
             * Since WebRTC "unified plan", the local track is tied to the
             * remote transceiver.sender and not the remote track. Therefore
             * when the remote track is 'ended' the local track is not 'ended'
             * but only 'muted'. This is why we do not stop the local track
             * until the peer is completely removed.
             */
            rtcSession.videoStream = undefined;
        }
    }

    /**
     * @param {Object} param0
     */
    async _initSession({
        channel,
        iceServers,
        invitedPartners,
        rtcSessions,
        sessionId,
        startWithAudio,
        startWithVideo,
        videoType = "user-video",
    }) {
        // Initializing a new session implies closing the current session.
        this._reset();
        this.channel = channel;
        this.channel.update({
            serverData: {
                rtcSessions,
                invitedPartners,
            },
        });
        this.currentRtcSession = this.messaging.state.rtcSessions.get(sessionId);
        this.iceServers = iceServers || this.iceServers;
        const channelProxy = reactive(this.channel, () => {
            if (channel !== this.channel) {
                throw new Error("channel has changed");
            }
            if (this.channel) {
                this._onUpdateRtcSessions(channelProxy.rtcSessions);
            }
            void channelProxy.rtcSessions.size;
        });
        this.channel.rtcInvitingSession = undefined;
        // discuss refactor: todo call channel.update below when availalbe and do the formatting in update
        this._callSessions();
        this.soundEffects.play("channelJoin");
        await this._updateLocalAudioTrack(startWithAudio);
        if (startWithVideo) {
            await this._toggleVideoBroadcast({ type: videoType });
        }
    }

    /**
     * @param {number} channelId
     * @param {Object} [param1]
     * @param {boolean} [param1.startWithAudio] whether or not to start the call with the audio on
     * @param {boolean} [param1.startWithVideo] whether or not to start the call with the video on
     * @param {boolean} [param1.videoType] type of the video: 'user-video' or 'display'
     */
    async _joinCall(channelId, { startWithAudio = true, startWithVideo = false, videoType } = {}) {
        if (!this.isClientRtcCompatible) {
            this.notification.notify({
                message: _t("Your browser does not support webRTC."),
                type: "warning",
            });
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
        await this._initSession({
            channel,
            iceServers,
            invitedPartners,
            rtcSessions,
            sessionId,
            startWithAudio,
            startWithVideo,
            videoType,
        });
    }

    /**
     * @private
     * @param {String[]} rtcSessionId
     * @param {Object} param1
     * @param {String} param1.event
     * @param {Object} [param1.payload]
     * @param {String} [param1.type] 'server' or 'peerToPeer',
     *                 'peerToPeer' requires an active RTCPeerConnection
     */
    async _notifyPeers(rtcSessionIds, { event, payload, type = "server" }) {
        if (!rtcSessionIds.length || !this.channel.id || !this.currentRtcSession) {
            return;
        }
        if (type === "server") {
            this._peerNotificationsToSend.set(++tmpId, {
                channelId: this.channel.id,
                event,
                payload,
                senderId: this.currentRtcSession.id,
                rtcSessionIds,
            });
            await this._sendPeerNotifications();
        }

        if (type === "peerToPeer") {
            for (const rtcSessionId of rtcSessionIds) {
                const dataChannel = this._dataChannels.get(rtcSessionId);
                if (!dataChannel || dataChannel.readyState !== "open") {
                    continue;
                }
                dataChannel.send(
                    JSON.stringify({
                        event,
                        channelId: this.channel.id,
                        payload,
                    })
                );
            }
        }
    }

    /**
     * Performs the rpc to leave the rtc call of the channel.
     */
    async _performRpcLeaveCall(channelId) {
        await this.rpc(
            "/mail/rtc/channel/leave_call",
            {
                channel_id: channelId,
            },
            { silent: true }
        );
    }

    /**
     * Pings the server to ensure this session is kept alive.
     */
    async _pingServer() {
        const { rtcSessions } = await this.rpc(
            "/mail/channel/ping",
            {
                channel_id: this.channel.id,
                check_rtc_session_ids: this.channel.rtcSessions.keys(),
                rtc_session_id: this.currentRtcSession.id,
            },
            { silent: true }
        );
        if (this.channel) {
            const activeSessionsData = rtcSessions[0][1];
            for (const rtcSessionData of activeSessionsData) {
                const rtcSession = RtcSession.insert(this.messaging.state, rtcSessionData);
                this.channel.rtcSessions.set(rtcSession.id, rtcSession);
            }
            const outdatedSessionsData = rtcSessions[1][1];
            for (const rtcSessionData of outdatedSessionsData) {
                const rtcSession = RtcSession.delete(this.messaging.state, rtcSessionData);
                this.channel.rtcSessions.delete(rtcSession.id);
            }
        }
    }

    /**
     * Attempts a connection recovery by closing and restarting the call
     * from the receiving end.
     *
     * @private
     * @param {number} rtcSessionId
     * @param {Object} [param1]
     * @param {number} [param1.delay] in ms
     * @param {string} [param1.reason]
     */
    _recoverConnection(rtcSessionId, { delay = 0, reason = "" } = {}) {
        if (this._fallBackTimeouts.get(rtcSessionId)) {
            return;
        }
        this._fallBackTimeouts.set(
            rtcSessionId,
            browser.setTimeout(async () => {
                this._fallBackTimeouts.delete(rtcSessionId);
                const peerConnection = this._peerConnections.get(rtcSessionId);
                if (!peerConnection || !this.channel.id) {
                    return;
                }
                if (this._outGoingCallSessionIds.has(rtcSessionId)) {
                    return;
                }
                if (peerConnection.iceConnectionState === "connected") {
                    return;
                }
                this._addLogEntry(
                    rtcSessionId,
                    `calling back to recover ${peerConnection.iceConnectionState} connection, reason: ${reason}`
                );
                await this._notifyPeers([rtcSessionId], {
                    event: "disconnect",
                });
                this._removePeer(rtcSessionId);
                this._callPeer(rtcSessionId);
            }, delay)
        );
    }

    /**
     * Cleans up a peer by closing all its associated content and the connection.
     *
     * @private
     * @param {number} rtcSessionId
     */
    _removePeer(rtcSessionId) {
        const rtcSession = this.channel.rtcSessions.get(rtcSessionId);
        if (rtcSession) {
            rtcSession.reset();
        }
        const dataChannel = this._dataChannels.get(rtcSessionId);
        if (dataChannel) {
            dataChannel.close();
        }
        this._dataChannels.delete(rtcSessionId);
        const peerConnection = this._peerConnections.get(rtcSessionId);
        if (peerConnection) {
            this._removeRemoteTracks(peerConnection);
            peerConnection.close();
        }
        this._peerConnections.delete(rtcSessionId);
        browser.clearTimeout(this._fallBackTimeouts.get(rtcSessionId));
        this._fallBackTimeouts.delete(rtcSessionId);

        this._outGoingCallSessionIds.delete(rtcSessionId);
        this._addLogEntry(rtcSessionId, "peer removed", { step: "peer removed" });
    }

    /**
     * Terminates the Transceivers of the peer connection.
     *
     * @private
     * @param {RTCPeerConnection} peerConnection
     */
    _removeRemoteTracks(peerConnection) {
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
     *
     * @private
     */
    _reset() {
        for (const rtcSessionId of this._peerConnections.keys()) {
            this._removePeer(rtcSessionId);
        }
        this._peerConnections.clear();
        for (const timeoutId of this._fallBackTimeouts.values()) {
            clearTimeout(timeoutId);
        }
        this._fallBackTimeouts.clear();
        for (const timeoutId of this._debounceIds.values()) {
            clearTimeout(timeoutId);
        }
        this._debounceIds.clear();

        this._disconnectAudioMonitor?.();
        this._audioTrack?.stop();
        this._videoTrack?.stop();
        this._disconnectAudioMonitor = undefined;
        this._dataChannels.clear();
        this._outGoingCallSessionIds = new Set();
        this._videoTrack = undefined;
        this._audioTrack = undefined;
        this._peerNotificationsToSend.clear();
        this.currentRtcSession = undefined;
        this.sendUserVideo = false;
        this.sendDisplay = false;
        this.channel = undefined;
        this.channelProxy = undefined;
        this.logs.clear();
    }

    /**
     * Sends this peer notifications to send as soon as the last pending
     * sending finishes.
     *
     * @private
     */
    async _sendPeerNotifications() {
        if (this._isNotifyPeersRPCInProgress) {
            return;
        }
        this._isNotifyPeersRPCInProgress = true;
        await new Promise((resolve) => setTimeout(resolve, this._peerNotificationWaitDelay));
        const ids = [];
        const notifications = [];
        this._peerNotificationsToSend.forEach((peerNotification, id) => {
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
                this._peerNotificationsToSend.delete(id);
            }
        } finally {
            this._isNotifyPeersRPCInProgress = false;
            if (this._peerNotificationsToSend.size > 0) {
                this._sendPeerNotifications();
            }
        }
    }

    /**
     * Returns a string representation of a data channel for logging and
     * debugging purposes.
     *
     * @private
     * @param {RTCDataChannel} dataChannel
     * @returns string
     */
    _serializeRTCDataChannel(dataChannel) {
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
        return JSON.stringify(Object.fromEntries(toLog.map((p) => [p, dataChannel[p]])));
    }

    /**
     * @param {Boolean} isDeaf
     */
    async _setDeafState(isDeaf) {
        this._updateAndBroadcast(this.currentRtcSession, { isDeaf });
        for (const session of this.messaging.state.rtcSessions.values()) {
            if (!session.audioElement) {
                continue;
            }
            session.audioElement.muted = isDeaf;
        }
        await this._updateLocalAudioTrackEnabledState();
    }
    /**
     * @param {Boolean} isSelfMuted
     */
    async _setMuteState(isSelfMuted) {
        this._updateAndBroadcast(this.currentRtcSession, { isSelfMuted });
        await this._updateLocalAudioTrackEnabledState();
    }

    /**
     * Updates the "isTalking" state of the current user and sets the
     * enabled state of its audio track accordingly.
     *
     * @private
     * @param {boolean} isTalking
     */
    async _setSoundBroadcast(isTalking) {
        if (!this.currentRtcSession) {
            return;
        }
        if (isTalking === this.currentRtcSession.isTalking) {
            return;
        }
        this.currentRtcSession.isTalking = isTalking;
        if (!this.currentRtcSession.isMute) {
            await this._updateLocalAudioTrackEnabledState();
        }
    }

    /**
     * @private
     * @param {Object} trackOptions
     */
    async _toggleVideoBroadcast(trackOptions) {
        if (!this.channel.id) {
            return;
        }
        await this._toggleLocalVideoTrack(trackOptions);
        for (const [rtcSessionId, peerConnection] of this._peerConnections) {
            await this._updateRemoteTrack(peerConnection, "video", { rtcSessionId });
        }
        if (!this.currentRtcSession) {
            return;
        }
        this._updateAndBroadcast(this.currentRtcSession, {
            isScreenSharingOn: !!this.sendDisplay,
            isCameraOn: !!this.sendUserVideo,
        });
    }

    /**
     * @private
     * @param {Object} param0
     * @param {String} param0.type 'user-video' (eg: webcam) or 'display' (eg: screen sharing)
     * @param {boolean} [param0.force]
     */
    async _toggleLocalVideoTrack({ type, force }) {
        if (type === "user-video") {
            const sendUserVideo = force ?? !this.sendUserVideo;
            await this._updateLocalVideoTrack(type, sendUserVideo);
        }
        if (type === "display") {
            const sendDisplay = force ?? !this.sendDisplay;
            await this._updateLocalVideoTrack(type, sendDisplay);
        }
        if (!this.currentRtcSession) {
            return;
        }
        if (!this._videoTrack) {
            this.currentRtcSession.removeVideo();
        } else {
            this.currentRtcSession.updateStream(this._videoTrack);
        }
    }

    /**
     * updates the record and notifies the server of the change
     *
     * @param {Object} data
     */
    _updateAndBroadcast(rtcSession, data) {
        Object.assign(rtcSession, data);
        this._debounce(
            "_updateAndBroadcast",
            async () => {
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
            },
            3000
        );
    }

    /**
     * Sets the enabled property of the local audio track based on the
     * current session state. And notifies peers of the new audio state.
     *
     * @private
     */
    async _updateLocalAudioTrackEnabledState() {
        if (!this._audioTrack) {
            return;
        }
        this._audioTrack.enabled =
            !this.currentRtcSession.isMute && this.currentRtcSession.isTalking;
        await this._notifyPeers(Object.keys(this._peerConnections), {
            event: "trackChange",
            type: "peerToPeer",
            payload: {
                type: "audio",
                state: {
                    isTalking:
                        this.currentRtcSession.isTalking && !this.currentRtcSession.isSelfMuted,
                    isSelfMuted: this.currentRtcSession.isSelfMuted,
                    isDeaf: this.currentRtcSession.isDeaf,
                },
            },
        });
    }

    /**
     * @private
     * TODO refactor
     * @param {String} type 'user-video' or 'display'
     * @param {boolean} activateVideo true if we want to activate the video
     */
    async _updateLocalVideoTrack(type, activateVideo) {
        this.sendDisplay = false;
        this.sendUserVideo = false;
        const stopVideo = () => {
            if (this._videoTrack) {
                this._videoTrack.stop();
            }
            this._sourceStream = undefined;
            this._videoTrack = undefined;
        };
        if (!activateVideo) {
            if (this.blurManager) {
                this.blurManager.srcStream = undefined;
            }
            if (type === "display") {
                this.soundEffects.play("screenSharing");
            }
            stopVideo();
            return;
        }
        let sourceWebMediaStream;
        try {
            if (type === "user-video") {
                if (this?.blurManager?.srcStream) {
                    sourceWebMediaStream = this.blurManager.srcStream.webMediaStream;
                } else {
                    sourceWebMediaStream = await browser.navigator.mediaDevices.getUserMedia({
                        video: this.videoConfig,
                    });
                }
            }
            if (type === "display") {
                sourceWebMediaStream = await browser.navigator.mediaDevices.getDisplayMedia({
                    video: this.videoConfig,
                });
                this.soundEffects.play("screenSharing");
            }
        } catch {
            this.messaging.notify({
                message: sprintf(
                    _t(`"%s" requires "%s" access`),
                    window.location.host,
                    type === "user-video" ? "camera" : "display"
                ),
                type: "warning",
            });
            stopVideo();
            return;
        }
        let videoStream = sourceWebMediaStream;
        if (this.userSettings.useBlur && type === "user-video") {
            try {
                this.update({
                    blurManager: {
                        srcStream: {
                            webMediaStream: sourceWebMediaStream,
                            id: sourceWebMediaStream.id,
                        },
                    },
                });
                const mediaStream = await this.blurManager.stream;
                videoStream = mediaStream.webMediaStream;
            } catch (error) {
                this.messaging.notify({
                    message: sprintf(_t("To %(name)s: %(message)s)"), {
                        name: error.name,
                        message: error.message,
                    }),
                    type: "warning",
                });
                this.userSettings.useBlur = false;
            }
        }
        const videoTrack = videoStream ? videoStream.getVideoTracks()[0] : undefined;
        if (videoTrack) {
            videoTrack.addEventListener("ended", async () => {
                await this._toggleVideoBroadcast({ force: false, type });
            });
        }
        this._videoTrack = videoTrack;
        this.sendUserVideo = type === "user-video" && !!videoTrack;
        this.sendDisplay = type === "display" && !!videoTrack;
        // below was used to use the causal + clear track on delete of the mediaStream model.
        /*
        this.update({
            sourceVideoStream: {
                webMediaStream: sourceWebMediaStream,
                id: sourceWebMediaStream.id,
            },
        });
        */
    }

    /**
     * Updates the track that is broadcasted to the RTCPeerConnection.
     * This will start new transaction by triggering a negotiationneeded event
     * on the peerConnection given as parameter.
     *
     * negotiationneeded -> offer -> answer -> ...
     *
     * @private
     * @param {RTCPeerConnection} peerConnection
     * @param {String} trackKind
     * @param {Object} [param2]
     * @param {boolean} [param2.initTransceiver]
     * @param {number} [param2.rtcSessionId]
     */
    async _updateRemoteTrack(peerConnection, trackKind, { initTransceiver, rtcSessionId } = {}) {
        this._addLogEntry(rtcSessionId, `updating ${trackKind} transceiver`);
        const track = trackKind === "audio" ? this._audioTrack : this._videoTrack;
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
            transceiver = this._getTransceiver(peerConnection, trackKind);
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
            this._notifyPeers([rtcSessionId], {
                event: "trackChange",
                type: "peerToPeer",
                payload: {
                    type: "video",
                    state: { isSendingVideo: false },
                },
            });
        }
    }

    /**
     * @param {Boolean} audio
     */
    async _updateLocalAudioTrack(audio) {
        if (this._audioTrack) {
            this._audioTrack.stop();
            this._audioTrack = undefined;
        }
        if (!this.channel.id) {
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
                this.notification.notify({
                    message: _.str.sprintf(
                        _t(`"%s" requires microphone access`),
                        window.location.host
                    ),
                    type: "warning",
                });
                if (this.currentRtcSession) {
                    this._updateAndBroadcast(this.currentRtcSession, { isSelfMuted: true });
                }
                return;
            }
            if (!this.currentRtcSession) {
                // The getUserMedia promise could resolve when the call is ended
                // in which case the track is no longer relevant.
                audioTrack.stop();
                return;
            }
            audioTrack.addEventListener("ended", async () => {
                // this mostly happens when the user retracts microphone permission.
                await this._updateLocalAudioTrack(false);
                this._updateAndBroadcast(this.currentRtcSession, { isSelfMuted: true });
                await this._updateLocalAudioTrackEnabledState();
            });
            this._updateAndBroadcast(this.currentRtcSession, { isSelfMuted: false });
            audioTrack.enabled = !this.currentRtcSession.isMute && this.currentRtcSession.isTalking;
            this._audioTrack = audioTrack;
            await this._updateVoiceActivation();
            for (const [rtcSessionId, peerConnection] of this._peerConnections) {
                await this._updateRemoteTrack(peerConnection, "audio", { rtcSessionId });
            }
        }
    }

    /**
     * Updates the way broadcast of the local audio track is handled,
     * attaches an audio monitor for voice activation if necessary.
     */
    async _updateVoiceActivation() {
        this._disconnectAudioMonitor?.();
        if (this.userSettings.usePushToTalk || !this.channel || !this._audioTrack) {
            this.currentRtcSession.isTalking = false;
            await this._updateLocalAudioTrackEnabledState();
            return;
        }
        try {
            this._disconnectAudioMonitor = await monitorAudio(this._audioTrack, {
                onThreshold: async (isAboveThreshold) => {
                    this._setSoundBroadcast(isAboveThreshold);
                },
                volumeThreshold: this.userSettings.voiceActivationThreshold,
            });
        } catch {
            /**
             * The browser is probably missing audioContext,
             * in that case, voice activation is not enabled
             * and the microphone is always 'on'.
             */
            this.notification.notify({
                message: _t("Your browser does not support voice activation"),
                type: "warning",
            });
            this.currentRtcSession.isTalking = true;
        }
        await this._updateLocalAudioTrackEnabledState();
    }

    //----------------------------------------------------------------------
    // Handlers
    //----------------------------------------------------------------------

    /**
     * @private
     * @param {Event} ev
     */
    async _onPageHide(ev) {
        if (this.channel && !ev.persisted) {
            await this._performRpcLeaveCall(this.channel.id);
        }
    }

    /**
     * @private
     * @param {String} state the new state of the connection
     * @param {number} rtcSessionId of the peer whose the connection changed
     */
    async _onConnectionStateChange(state, rtcSessionId) {
        this._addLogEntry(rtcSessionId, `connection state changed: ${state}`);
        switch (state) {
            case "closed":
                this._removePeer(rtcSessionId);
                break;
            case "failed":
            case "disconnected":
                await this._recoverConnection(rtcSessionId, {
                    delay: this._recoveryDelay,
                    reason: `connection ${state}`,
                });
                break;
        }
    }

    /**
     * @private
     * @param {String} connectionState the new state of the connection
     * @param {number} rtcSessionId of the peer whose the connection changed
     */
    async _onICEConnectionStateChange(connectionState, rtcSessionId) {
        this._addLogEntry(rtcSessionId, `ICE connection state changed: ${connectionState}`, {
            state: connectionState,
        });
        const rtcSession = this.channel.rtcSessions.get(rtcSessionId);
        if (!rtcSession) {
            return;
        }
        rtcSession.connectionState = connectionState;
        switch (connectionState) {
            case "closed":
                this._removePeer(rtcSessionId);
                break;
            case "failed":
            case "disconnected":
                await this._recoverConnection(rtcSessionId, {
                    delay: this._recoveryDelay,
                    reason: `ice connection ${connectionState}`,
                });
                break;
        }
    }

    /**
     * @private
     * @param {keyboardEvent} ev
     */
    _onKeyDown(ev) {
        if (!this.channel) {
            return;
        }
        if (this.userSettings.isRegisteringKey) {
            return;
        }
        if (!this.userSettings.usePushToTalk || !this.userSettings.isPushToTalkKey(ev)) {
            return;
        }
        if (this._pushToTalkTimeoutId) {
            browser.clearTimeout(this._pushToTalkTimeoutId);
        }
        if (!this.currentRtcSession.isTalking && !this.currentRtcSession.isMute) {
            this.soundEffects.play("pushToTalk", { volume: 0.3 });
        }
        this._setSoundBroadcast(true);
    }

    /**
     * @private
     * @param {keyboardEvent} ev
     */
    _onKeyUp(ev) {
        if (!this.channel) {
            return;
        }
        if (
            !this.userSettings.usePushToTalk ||
            !this.userSettings.isPushToTalkKey(ev, { ignoreModifiers: true })
        ) {
            return;
        }
        if (!this.currentRtcSession.isTalking) {
            return;
        }
        if (!this.currentRtcSession.isMute) {
            this.soundEffects.play("pushToTalk", { volume: 0.3 });
        }
        this._pushToTalkTimeoutId = browser.setTimeout(() => {
            this._setSoundBroadcast(false);
        }, this.userSettings.voiceActiveDuration || 0);
    }

    /**
     * Removes and disconnects all the peerConnections that are not current members of the call.
     *
     * @param {Map} currentSessions list of sessions of this call.
     */
    async _onUpdateRtcSessions(currentSessions) {
        if (this.channel && !currentSessions.has(this.currentRtcSession.id)) {
            // if the current RTC session is not in the channel sessions, this call is no longer valid.
            this.endCall();
            return;
        }
        for (const rtcSessionId of this._peerConnections.keys()) {
            if (!currentSessions.has(rtcSessionId)) {
                this._addLogEntry(rtcSessionId, "session removed from the server");
                this._removePeer(rtcSessionId);
            }
        }
    }
}
