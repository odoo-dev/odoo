/** @odoo-module **/

import { registerNewModel } from '@mail/model/model_core';
import { attr, one2one } from '@mail/model/model_field';
import { clear, insert } from '@mail/model/model_field_command';

import { monitorAudioThresholds } from '@mail/utils/media_monitoring/media_monitoring';

/**
 * The order in which transceivers are added, relevant for RTCPeerConnection.getTransceivers which returns
 * transceivers in insertion order as per webRTC specifications.
 *
 * TODO
 * const TRANSCEIVER_ORDER = [{ trackKind: 'audio', name: 'audio'}, { trackKind: 'video', name: 'user-video' }, { trackKind: 'video', name: 'display' }];
 * get index with TRANSCEIVER_ORDER.findIndex(o => o.name === 'user-video');
 */
const TRANSCEIVER_ORDER = ['audio', 'video'];

/**
 * backend
 * TODO REF turn update_and_broadcast into route
 * TODO IMP Remove offline members
 * TODO IMP nice-to-have? 1 'mail.rtc.session' per user session (tab/device)?
 *
 * frontend
 * TODO IMP updateVideoConfig, allow control of video (fps, resolution) by user,
 *      from a new option in the 'mail.RtcOptionList'
 * TODO IMP nice-to-have? "test microphone" in rtcConfigurationMenu, auto mutes, attach monitorAudio, audioVisual feedback,
 *      it needs a change in the normalization in threshold_processor.js (see comment L:27)
 * TODO REF html/scss classes naming (bad/inconsistent/outdated names, wrong order)
 *      for example, rtc_call_participant_card still has "video" css classes.
 * TODO REF rename ringing/invitation
 */

function factory(dependencies) {

    class Rtc extends dependencies['mail.model'] {

        /**
         * @override
         */
        _created() {
            const res = super._created(...arguments);
            /**
             * technical fields that are not exposed
             * Especially important for _peerConnections, as garbage connection of peerConnections is important for
             * peerConnection.close().
             */
             /**
             * Object { token: peerConnection<RTCPeerConnection> }
             * Contains the RTCPeerConnection established with the other rtc sessions.
             * Exposing this field and keeping references to closed peer connections may lead
             * to difficulties reconnecting to the same peer.
             */
            this._peerConnections = {};
            /**
             * Object { token: dataChannel<RTCDataChannel> }
             * Contains the RTCDataChannels with the other rtc sessions.
             */
            this._dataChannels = {};
            /**
             * Object { token: timeoutId<Number> }
             * Contains the timeoutIds of the reconnection attempts.
             */
            this._fallBackTimeouts = {};
            /**
             * Set of peerTokens, used to track which calls are outgoing,
             * which is used when attempting to recover a failed peer connection by
             * inverting the call direction.
             */
            this._outGoingCallTokens = new Set();
            /**
             *  { disconnect<function> }
             * Object that contains a disconnect callback, if set it indicates
             * that we are currently monitoring the local audioTrack for the
             * voice activation feature.
             */
            this._audioMonitor = undefined;
            /**
             *  timeoutId for the push to talk release delay.
             */
            this._pushToTalkTimeoutId = undefined;
            /**
             * PermissionStatus object for the microphone, contains information
             * regarding the microphone access granted by the browser.
             */
            this._microphonePermissionStatus = undefined;

            this._onMicrophonePermissionStatusChange = this._onMicrophonePermissionStatusChange.bind(this);
            this._onKeyDown = this._onKeyDown.bind(this);
            this._onKeyUp = this._onKeyUp.bind(this);
            window.addEventListener('keydown', this._onKeyDown);
            window.addEventListener('keyup', this._onKeyUp);
            window.addEventListener('beforeunload', async () => {
                this.channel && await this.channel.leaveCall();
            });
            return res;
        }

        /**
         * @override
         */
        async _willDelete() {
            window.removeEventListener('keydown', this._onKeyDown);
            window.removeEventListener('keyup', this._onKeyUp);
            return super._willDelete(...arguments);
        }

        //----------------------------------------------------------------------
        // Public
        //----------------------------------------------------------------------

        disconnectSession() {
            this._reset();
            this.env.messaging.soundEffects.channelLeave.play({ volume: 0.15 });
        }

        /**
         * removes and disconnect all the peers that are not current members of the call.
         *
         * @param {mail.rtc_session[]} currentSessions list of sessions of this call.
         */
        async filterCallees(currentSessions) {
            console.log(`MEMBERS UPDATE: ${currentSessions.length} members in call`);
            const currentSessionsToken = new Set(currentSessions.map(session => session.peerToken));
            for (const token of Object.keys(this._peerConnections)) {
                if (!currentSessionsToken.has(token)) {
                    this._removePeer(token);
                }
            }
        }

        /**
         * @param {String} sender id of the session that sent the notification
         * @param {String} content JSON
         */
        async handleNotification(sender, content) {
            const { event, channelId, payload } = JSON.parse(content);
            const rtcSession = this.env.models['mail.rtc_session'].findFromIdentifyingData({ id: sender });
            if (!rtcSession || rtcSession.channel !== this.channel) {
                // does handle notifications targeting a different session
                return;
            }
            if (event !== 'trackChange') {
                console.log(`RECEIVED NOTIFICATION: ${event} from: ${sender}`);
            }
            if (!this.isClientRtcCompatible) {
                return;
            }
            if (!this._peerConnections[sender] && (!channelId || channelId !== this.channel.id)) {
                return;
            }
            switch (event) {
                case "offer":
                    await this._handleRtcTransactionOffer(sender, payload);
                    break;
                case "answer":
                    await this._handleRtcTransactionAnswer(sender, payload);
                    break;
                case "ice-candidate":
                    await this._handleRtcTransactionICECandidate(sender, payload);
                    break;
                case "disconnect":
                    this._removePeer(sender);
                    break;
                case 'trackChange':
                    this._handleTrackChange(rtcSession, payload);
                    break;
                case 'onOpenDataChannel':
                    console.log(`DATA CHANNEL: onOpenDataChannel - peer connection with ${sender} established`);
            }
        }

        /**
         * @param {Object} param0
         * @param {string} [param0.rtcSessionId] the Id of the 'mail.rtc_session'
                  of the current partner for the current call
         * @param {mail.rtc_session[]} [param0.callees] the list of sessions to call
         * @param {Array<Object>} [param0.iceServers]
         * @param {boolean} [param0.audio] audio boolean
         * @param {boolean} [param0.video] video boolean
         * @returns {boolean} true if the session is successfully initialized
         */
        async initSession({ rtcSessionId, callees, iceServers, audio, video }) {
            // Initializing a new session implies closing the current session.
            this._reset();
            if (!this.isClientRtcCompatible) {
                return false;
            }
            this.update({
                currentRtcSession: insert({ id: rtcSessionId }),
                iceServers: iceServers || this.iceServers,
            });

            await this.updateAudioTrack(audio);
            if (navigator.permissions && navigator.permissions.query) {
                try {
                    this._microphonePermissionStatus = this._microphonePermissionStatus || await navigator.permissions.query({ name: 'microphone' });
                    this._microphonePermissionStatus.addEventListener('change', this._onMicrophonePermissionStatusChange);
                } catch (e) {
                    // permission query or microphone status may not be supported by this browser, experimental feature.
                }
            }
            if (video) {
                await this._toggleVideoBroadcast({ type: 'user-video' });
            }
            if (callees) {
                console.log(`init session: ${callees.length} members in call`);
                for (const session of callees) {
                    if (session.peerToken === this.currentRtcSession.peerToken) {
                        continue;
                    }
                    console.log('calling: ' + session.name);
                    this._callPeer(session.peerToken);
                }
            }
            return true;
        }

        /**
         * mutes and unmutes the microphone, will not unmute if deaf.
         * @param {Object} [param0]
         * @param {string} [param0.requestAudioDevice] true if requesting the audio input device
         *                 from the user
         */
        async toggleMicrophone({ requestAudioDevice = true } = {}) {
            const shouldMute = this.currentRtcSession.isDeaf || !this.currentRtcSession.isMuted;
            this.currentRtcSession.updateAndBroadcast({ isMuted: shouldMute || !this.audioTrack });
            if (!this.audioTrack && !shouldMute && requestAudioDevice) {
                // if we don't have an audioTrack, we try to request it again
                await this.updateAudioTrack(true);
            }
            await this.async(() => this._updateLocalAudioTrackEnabledState());
        }

        /**
         * toggles user video (eg: webcam) broadcasting to peers.
         * TODO maybe directly expose toggleVideoBroadcast(), to consider when
         * refactoring for simultaneous userVideo/display.
         */
        async toggleUserVideo() {
            this._toggleVideoBroadcast({ type: 'user-video' });
        }

        /**
         * toggles screen broadcasting to peers.
         */
        async toggleScreenShare() {
            this._toggleVideoBroadcast({ type: 'display' });
        }

        /**
         * @param {Boolean} audio
         */
        async updateAudioTrack(audio) {
            if (this.audioTrack) {
                this.audioTrack.stop();
            }
            this.update({ audioTrack: clear() });
            if (!this.channel) {
                return;
            }
            if (audio) {
                let audioTrack;
                try {
                    const audioStream = await navigator.mediaDevices.getUserMedia({ audio: this.env.messaging.userSetting.getAudioConstraints() });
                    audioTrack = audioStream.getAudioTracks()[0];
                    audioTrack.addEventListener('ended', async () => {
                        await this.async(() => this.updateAudioTrack(false));
                        this.currentRtcSession.updateAndBroadcast({ isMuted: true });
                        await this.async(() => this._updateLocalAudioTrackEnabledState());
                    });
                    this.currentRtcSession.updateAndBroadcast({ isMuted: false });
                } catch (e) {
                    this.env.services['notification'].notify({
                        message: _.str.sprintf(
                            this.env._t(`"%s" requires microphone access`),
                            window.location.host,
                        ),
                        type: 'warning',
                    });
                    this.currentRtcSession.updateAndBroadcast({ isMuted: true });
                    return;
                }
                audioTrack.enabled = !this.currentRtcSession.isMuted && this.currentRtcSession.isTalking;
                this.update({ audioTrack });
                await this.async(() => this.updateVoiceActivation());
                for (const peerConnection of Object.values(this._peerConnections)) {
                    await this._updateRemoteTrack(peerConnection, 'audio');
                }
            }
        }

        /**
         * Updates the way broadcast of the local audio track is handled,
         * attaches an audio monitor for voice activation if necessary.
         */
        async updateVoiceActivation() {
            this._audioMonitor && this._audioMonitor.disconnect();
            if (this.env.messaging.userSetting.usePushToTalk || !this.channel || !this.audioTrack) {
                this.currentRtcSession.update({ isTalking: false });
                return;
            }
            try {
                this._audioMonitor = await monitorAudioThresholds(this.audioTrack, {
                    onStateChange: async (state) => {
                        this._setSoundBroadcast(state);
                    },
                    minimumActiveCycles: 10,
                    baseLevel: this.env.messaging.userSetting.voiceActivationThreshold,
                });
            } catch (e) {
                /**
                 * The browser is probably missing audioContext,
                 * in that case, voice activation is not enabled
                 * and the microphone is always 'on'.
                 */
                this.env.services['notification'].notify({
                    message: this.env._t("Your browser does not support voice activation"),
                    type: 'warning',
                });
                this.currentRtcSession.update({ isTalking: true });
            }
        }

        /**
         * @param {MediaTrackConstraints Object} constraints
         */
        updateVideoConfig(constraints) {
            const videoConfig = Object.assign(this.videoConfig, constraints);
            this.update({ videoConfig });
            this.videoTrack && this.videoTrack.applyConstraints(this.videoConfig);
        }

        //----------------------------------------------------------------------
        // Private
        //----------------------------------------------------------------------

        /**
         * @private
         * @param {Object} trackOptions
         */
        async _toggleVideoBroadcast(trackOptions) {
            if (!this.channel) {
                return;
            }
            await this._toggleVideoTrack(trackOptions);
            for (const peerConnection of Object.values(this._peerConnections)) {
                await this._updateRemoteTrack(peerConnection, 'video', { remove: !this.videoTrack });
            }
            const isScreenSharingOn = !!this.sendDisplay;
            const isCameraOn = !!this.sendUserVideo;
            this.currentRtcSession.updateAndBroadcast({
                isScreenSharingOn,
                isCameraOn,
            });
            if (isScreenSharingOn || isCameraOn) {
                // the peer already gets notified through RTC transaction.
                return;
            }
            this._notifyPeers(Object.keys(this._peerConnections), {
                event: 'trackChange',
                type: 'peerToPeer',
                payload: {
                    type: 'video',
                    state: { isSendingVideo: false },
                },
            });
        }

        /**
         * @private
         * @param {Object} param0
         * @param {String} param0.type 'user-video' (eg: webcam) or 'display' (eg: screen sharing)
         * @param {boolean} param0.force
         */
        async _toggleVideoTrack({ force, type }) {
            if (type === 'user-video') {
                const sendUserVideo = force !== undefined ? force : !this.sendUserVideo;
                await this._updateLocalVideoTrack(type, sendUserVideo);
            }
            if (type === 'display') {
                const sendDisplay = force !== undefined ? force : !this.sendDisplay;
                await this._updateLocalVideoTrack(type, sendDisplay);
            }
            if (!this.videoTrack) {
                if (this.env.messaging.focusedRtcSession === this.currentRtcSession) {
                    this.env.messaging.toggleFocusedRtcSession();
                }
                this.currentRtcSession.removeVideo();
            } else {
                this._updateDisplayableStreams(this.videoTrack, this.currentRtcSession.peerToken);
            }
        }

        /**
         * @private
         * @param {RTCPeerConnection} peerConnection
         * @param {String} trackKind
         * @param {Object} [param3]
         * @param {boolean} [param3.initTransceiver]
         * @param {Boolean} [param3.remove]
         */
        async _updateRemoteTrack(peerConnection, trackKind, { initTransceiver, remove } = {}) {
            const track = trackKind === 'audio' ? this.audioTrack : this.videoTrack;
            let transceiver;
            if (initTransceiver) {
                transceiver = peerConnection.addTransceiver(trackKind);
                transceiver.direction = 'recvonly';
            } else {
                transceiver = this._getTransceiver(peerConnection, trackKind);
            }

            if (remove) {
                try {
                    await transceiver.sender.replaceTrack(null);
                    transceiver.direction = 'recvonly';
                } catch (e) {
                    // ignored, the transceiver is probably already removed
                    console.groupCollapsed('=== ERROR: remove transceiver track ===');
                    console.trace(e);
                    console.groupEnd();
                }
            }
            if (track) {
                try {
                    await transceiver.sender.replaceTrack(track);
                    transceiver.direction = 'sendrecv';
                } catch (e) {
                    // ignored, the track is probably already on the peerConnection.
                    console.groupCollapsed('=== ERROR: replace transceiver track ===');
                    console.trace(e);
                    console.groupEnd();
                }
            }
        }

        /**
         * @private
         * @param {String} token
         */
        async _callPeer(token) {
            const peerConnection = this._createPeerConnection(token);
            for (const trackKind of TRANSCEIVER_ORDER) {
                await this._updateRemoteTrack(peerConnection, trackKind, { initTransceiver: true });
            }
            this._outGoingCallTokens.add(token);
        }

        /**
         * @private
         * @returns {boolean}
         */
        _computeIsClientRtcCompatible() {
            return window.RTCPeerConnection && window.MediaStream && navigator.mediaDevices;
        }

        /**
         * Creates and setup a RTCPeerConnection
         *
         * @private
         * @param {String} token
         */
        _createPeerConnection(token) {
            const peerConnection = new RTCPeerConnection({ iceServers: this.iceServers });
            peerConnection.onicecandidate = async (event) => {
                if (!event.candidate) {
                    return;
                }
                await this._notifyPeers([token], {
                    event: 'ice-candidate',
                    payload: { candidate: event.candidate },
                });
            };
            peerConnection.oniceconnectionstatechange = (event) => {
                console.log('ICE STATE UPDATE: ' + peerConnection.iceConnectionState);
                this._onICEConnectionStateChange(peerConnection.iceConnectionState, token);
            };
            peerConnection.onconnectionstatechange = (event) => {
                console.log('CONNECTION STATE UPDATE:' + peerConnection.connectionState);
                this._onConnectionStateChange(peerConnection.connectionState, token);
            };
            peerConnection.onicecandidateerror = async (error) => {
                console.groupCollapsed('=== ERROR: onIceCandidate ===');
                console.log('coState: ' + peerConnection.connectionState + ' - iceState: ' + peerConnection.iceConnectionState);
                console.trace(error);
                console.groupEnd();
                this._recoverConnection(token, { delay: 15000, reason: 'ice candidate error' });
            };
            peerConnection.onnegotiationneeded = async (e) => {
                const offer = await peerConnection.createOffer();
                await peerConnection.setLocalDescription(offer);
                await this._notifyPeers([token], {
                    event: 'offer',
                    payload: { sdp: peerConnection.localDescription },
                });
            };
            peerConnection.ontrack = ({ transceiver, track }) => {
                this._updateDisplayableStreams(track, token);
            };
            const dataChannel = peerConnection.createDataChannel("notifications", { negotiated: true, id: 1 });
            dataChannel.onmessage = (event) => {
                this.handleNotification(token, event.data);
            };
            dataChannel.onopen = async () => {
                await this._notifyPeers([token], {
                    event: 'onOpenDataChannel',
                    type: 'peerToPeer',
                });
                /* FIXME? it appears that the track yielded by the peerConnection's 'ontrack' event is always enabled,
                 * even when it is disabled on the sender-side.
                 */
                await this._notifyPeers([token], {
                    event: 'trackChange',
                    type: 'peerToPeer',
                    payload: {
                        type: 'audio',
                        state: { isTalking: this.currentRtcSession.isTalking, isMuted: this.currentRtcSession.isMuted },
                    },
                });
            };
            this._peerConnections[token] = peerConnection;
            this._dataChannels[token] = dataChannel;
            return peerConnection;
        }

        /**
         * @private
         * @param {RTCPeerConnection} peerConnection
         * @param {String} trackKind
         */
        _getTransceiver(peerConnection, trackKind) {
            const transceivers = peerConnection.getTransceivers();
            return transceivers[TRANSCEIVER_ORDER.indexOf(trackKind)];
        }

        /**
         * @private
         * @param {String} fromToken
         * @param {Object} param1
         * @param {Object} param1.sdp Session Description Protocol
         */
        async _handleRtcTransactionAnswer(fromToken, { sdp }) {
            const peerConnection = this._peerConnections[fromToken];
            if (!peerConnection || peerConnection.connectionState === 'closed' || peerConnection.signalingState === 'stable') {
                console.groupCollapsed('=== ERROR: Handle Answer from undefined|closed|stable === ');
                console.trace(peerConnection);
                console.groupEnd();
                return;
            }
            if (peerConnection.signalingState === 'have-remote-offer') {
                // we already have an offer
                return;
            }
            const rtcSessionDescription = new RTCSessionDescription(sdp);
            await peerConnection.setRemoteDescription(rtcSessionDescription);
        }

        /**
         * @private
         * @param {String} token
         * @param {Object} param1
         * @param {Object} param1.candidate RTCIceCandidateInit
         */
        async _handleRtcTransactionICECandidate(fromToken, { candidate }) {
            const peerConnection = this._peerConnections[fromToken];
            if (!peerConnection || peerConnection.connectionState === 'closed') {
                console.groupCollapsed('=== ERROR: Handle Ice Candidate from undefined|closed ===');
                console.trace(peerConnection);
                console.groupEnd();
                return;
            }
            const rtcIceCandidate = new RTCIceCandidate(candidate);
            try {
                await peerConnection.addIceCandidate(rtcIceCandidate);
            } catch (error) {
                // ignored
                console.groupCollapsed("=== ERROR: ADD ICE CANDIDATE ===");
                console.trace(error);
                console.groupEnd();
            }
        }

        /**
         * @private
         * @param {String} fromToken
         * @param {Object} param1
         * @param {Object} param1.sdp Session Description Protocol
         */
        async _handleRtcTransactionOffer(fromToken, { sdp }) {
            const peerConnection = this._peerConnections[fromToken] || this._createPeerConnection(fromToken);

            if (!peerConnection || peerConnection.connectionState === 'closed') {
                console.groupCollapsed('=== ERROR: handle offer ===');
                console.log('received offer for a non-existent peer connection - token: ' + fromToken);
                console.trace(peerConnection.connectionState);
                console.groupEnd();
                return;
            }
            if (peerConnection.signalingState === 'have-remote-offer') {
                // we already have an offer
                return;
            }
            const rtcSessionDescription = new RTCSessionDescription(sdp);
            await peerConnection.setRemoteDescription(rtcSessionDescription);
            await this._updateRemoteTrack(peerConnection, 'audio');
            await this._updateRemoteTrack(peerConnection, 'video');

            const answer = await peerConnection.createAnswer();
            await peerConnection.setLocalDescription(answer);

            await this._notifyPeers([fromToken], {
                event: 'answer',
                payload: { sdp: peerConnection.localDescription },
            });
            this._recoverConnection(fromToken, { delay: 15000, reason: 'standard answer timeout' });
        }

        /**
         * @private
         * @param {mail.rtc_session} rtcSession
         * @param {Object} param1
         * @param {String} param1.type 'audio' or 'video'
         * @param {Object} param1.state
         */
        _handleTrackChange(rtcSession, { type, state }) {
            const { isMuted, isTalking, isSendingVideo, isDeaf } = state;
            if (type === 'audio') {
                if (!rtcSession.audioStream) {
                    return;
                }
                rtcSession.update({
                    isMuted,
                    isTalking,
                    isDeaf,
                });
            }
            if (type === 'video' && isSendingVideo === false) {
                if (this.env.messaging.focusedRtcSession === rtcSession) {
                    this.env.messaging.toggleFocusedRtcSession();
                }
                rtcSession.removeVideo({ stopTracks: false });
            }
        }

        /**
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
            this.currentRtcSession.update({ isTalking });
            if (!this.currentRtcSession.isMuted) {
                await this._updateLocalAudioTrackEnabledState();
            }
        }

        /**
         * Sets the enabled property of the local audio track based on the
         * current session state. And notifies peers of the new audio state.
         *
         * @private
         */
        async _updateLocalAudioTrackEnabledState() {
            if (!this.audioTrack) {
                return;
            }
            this.audioTrack.enabled = !this.currentRtcSession.isMuted && this.currentRtcSession.isTalking;
            await this._notifyPeers(Object.keys(this._peerConnections), {
                event: 'trackChange',
                type: 'peerToPeer',
                payload: {
                    type: 'audio',
                    state: {
                        isTalking: this.currentRtcSession.isTalking && !this.currentRtcSession.isMuted,
                        isMuted: this.currentRtcSession.isMuted,
                        isDeaf: this.currentRtcSession.isDeaf,
                    },
                },
            });
        }

        /**
         * @private
         * @param {String} type 'user-video' or 'display'
         * @param {boolean} activateVideo true if we want to activate the video
         */
        async _updateLocalVideoTrack(type, activateVideo) {
            if (this.videoTrack) {
                this.videoTrack.stop();
            }
            this.update({
                sendDisplay: false,
                sendUserVideo: false,
                videoTrack: clear(),
            });
            let videoStream;
            if (!activateVideo) {
                if (type === 'display') {
                    this.env.messaging.soundEffects.screenSharing.play();
                }
                return;
            }
            try {
                if (type === 'user-video') {
                    videoStream = await navigator.mediaDevices.getUserMedia({ video: this.videoConfig });
                }
                if (type === 'display') {
                    videoStream = await navigator.mediaDevices.getDisplayMedia({ video: this.videoConfig });
                    this.env.messaging.soundEffects.screenSharing.play();
                }
            } catch (e) {
                this.env.services['notification'].notify({
                    message: _.str.sprintf(
                        this.env._t(`"%s" requires "%s" access`),
                        window.location.host,
                        type === 'user-video' ? 'camera' : 'display',
                    ),
                    type: 'warning',
                });
                return;
            }
            const videoTrack = videoStream ? videoStream.getVideoTracks()[0] : undefined;
            if (videoTrack) {
                videoTrack.addEventListener('ended', async () => {
                    await this.async(() =>
                        this._toggleVideoTrack({ force: false, type })
                    );
                });
            }
            this.update({
                videoTrack,
                sendUserVideo: type === 'user-video' && !!videoTrack,
                sendDisplay: type === 'display' && !!videoTrack,
            });
        }

        /**
         * @private
         * @param {String[]} targetToken
         * @param {Object} param1
         * @param {String} param1.event
         * @param {Object} [param1.payload]
         * @param {String} [param1.type] 'server' or 'peerToPeer'
         */
        async _notifyPeers(targetTokens, { event, payload, type = 'server' }) {
            if (!targetTokens.length || !this.channel || !this.currentRtcSession) {
                return;
            }
            if (event !== 'trackChange') {
                console.log(`SEND NOTIFICATION: - ${event} to: [${targetTokens}] (${type})`);
            }
            const content = JSON.stringify({
                event,
                channelId: this.channel.id,
                payload,
            });

            if (type === 'server') {
                await this.env.services.rpc({
                    route: '/mail/channel_call_notify',
                    params: {
                        sender: this.currentRtcSession.id,
                        targets: targetTokens,
                        content,
                    },
                }, { shadow: true });
            }

            if (type === 'peerToPeer') {
                for (const token of targetTokens) {
                    const dataChannel = this._dataChannels[token];
                    if (!dataChannel || dataChannel.readyState !== 'open') {
                        return;
                    }
                    dataChannel.send(content);
                }
            }
        }

        /**
         * @private
         */
        _onPushToTalkKeyDown() {
            if (!this.channel) {
                return;
            }
            if (!this.env.messaging.userSetting.usePushToTalk) {
                return;
            }
            if (this._pushToTalkTimeoutId) {
                clearTimeout(this._pushToTalkTimeoutId);
            }
            if (!this.currentRtcSession.isTalking && !this.currentRtcSession.isMuted) {
                this.env.messaging.soundEffects.pushToTalk.play({ volume: 0.1 });
            }
            this._setSoundBroadcast(true);
        }

        /**
         * @private
         */
        _onPushToTalkKeyUp() {
            if (!this.channel) {
                return;
            }
            if (!this.currentRtcSession.isTalking) {
                return;
            }
            if (!this.env.messaging.userSetting.usePushToTalk) {
                return;
            }
            if (!this.currentRtcSession.isMuted) {
                this.env.messaging.soundEffects.pushToTalk.play({ volume: 0.1 });
            }
            this._pushToTalkTimeoutId = setTimeout(
                () => {
                    this._setSoundBroadcast(false);
                },
                this.env.messaging.userSetting.voiceActiveDuration || 0,
            );
        }

        /**
         * Attempts a connection recovery by closing and restarting the call
         * from the receiving end.
         *
         * @private
         * @param {Object} constraints MediaStreamTrack constraints
         * @param {Object} [param1]
         * @param {number} [param1.delay] in ms
         * @param {string} [param1.reason]
         */
        _recoverConnection(token, { delay = 0, reason = '' } = {}) {
            if (this._fallBackTimeouts[token]) {
                return;
            }
            this._fallBackTimeouts[token] = setTimeout(async () => {
                delete this._fallBackTimeouts[token];
                const peerConnection = this._peerConnections[token];
                if (!peerConnection || !this.channel) {
                    return;
                }
                if (this._outGoingCallTokens.has(token)) {
                    return;
                }
                if (peerConnection.iceConnectionState === 'connected') {
                    return;
                }
                if (['connected', 'closed'].includes(peerConnection.connectionState)) {
                    return;
                }

                console.log(`RECOVERY: calling back ${token} to salvage the connection ${peerConnection.iceConnectionState}, reason: ${reason}`);
                await this._notifyPeers([token], {
                    event: 'disconnect',
                });
                this._removePeer(token);
                this._callPeer(token);
            }, delay);
        }

        /**
         * Cleans up a peer by closing all its associated content
         *
         * @private
         * @param {String} token
         */
        _removePeer(token) {
            const rtcSession = this.env.models['mail.rtc_session'].findFromIdentifyingData({ id: token });
            if (rtcSession) {
                rtcSession.reset();
            }
            const peerConnection = this._peerConnections[token];
            const dataChannel = this._dataChannels[token];
            dataChannel.close();
            if (peerConnection) {
                this._removeRemoteTracks(peerConnection);
                peerConnection.close();
            }
            delete this._peerConnections[token];
            clearTimeout(this._fallBackTimeouts[token]);
            delete this._fallBackTimeouts[token];

            this._outGoingCallTokens.delete(token);
        }

        /**
         * @private
         * @param {RTCPeerConnection} peerConnection
         */
        _removeRemoteTracks(peerConnection) {
            const RTCRtpSenders = peerConnection.getSenders();
            for (const sender of RTCRtpSenders) {
                try {
                    peerConnection.removeTrack(sender);
                } catch (e) {
                    // ignore error
                }
            }
            for (const transceiver of peerConnection.getTransceivers()) {
                try {
                    transceiver.stop();
                } catch (e) {
                    console.groupCollapsed('=== ERROR: stopping transceiver from remote track ===');
                    console.trace(e);
                    console.groupEnd();
                }
            }
        }

        /**
         * @private
         * @param {Object} streamData
         */
        _removeStream(streamData) {
            if (!streamData || !streamData.stream) {
                return;
            }
            const stream = streamData.stream;
            for (const track of stream.getTracks() || []) {
                track.stop();
            }
        }

        /**
         * @private
         */
        _reset() {
            if (this._audioMonitor) {
                this._audioMonitor.disconnect();
            }
            if (this._peerConnections) {
                const peerTokens = Object.keys(this._peerConnections);
                this._notifyPeers(peerTokens, {
                    event: 'disconnect',
                });
                for (const token of peerTokens) {
                    this._removePeer(token);
                }
            }
            this._microphonePermissionStatus && this._microphonePermissionStatus.removeEventListener('change', this._onMicrophonePermissionStatusChange);
            this.videoTrack && this.videoTrack.stop();
            this.audioTrack && this.audioTrack.stop();

            this._peerConnections = {};
            this._dataChannels = {};
            this._fallBackTimeouts = {};
            this._outGoingCallTokens = new Set();
            this._audioMonitor = undefined;

            this.update({
                connectionStates: clear(),
                currentRtcSession: clear(),
                sendUserVideo: clear(),
                sendDisplay: clear(),
                videoTrack: clear(),
                audioTrack: clear(),
            });
        }

        /**
         * @private
         * @param {Track} [track]
         * @param {String} token the token of video
         */
        _updateDisplayableStreams(track, token) {
            const rtcSession = this.env.models['mail.rtc_session'].findFromIdentifyingData({ id: token });
            if (!rtcSession) {
                return;
            }
            const stream = new MediaStream();
            stream.addTrack(track);

            if (track.kind === 'audio') {
                rtcSession.setAudio({
                    audioStream: stream,
                    isMuted: false,
                    isTalking: false,
                });
            }
            if (track.kind === 'video') {
                rtcSession.removeVideo({ stopTracks: false });
                rtcSession.update({
                    videoStream: stream,
                });
            }
        }

        //----------------------------------------------------------------------
        // Handlers
        //----------------------------------------------------------------------

        /**
         * @private
         * @param {String} state the new state of the connection
         * @param {String} token of the peer whose the connection changed
         */
        async _onConnectionStateChange(state, token) {
            switch (state) {
                case "failed":
                case "closed":
                    this._removePeer(token);
                    break;
                case "disconnected":
                    await this._recoverConnection(token, { delay: 500, reason: 'connection disconnected' });
                    break;
            }
        }

        /**
         * @private
         * @param {String} connectionState the new state of the connection
         * @param {String} token of the peer whose the connection changed
         */
        async _onICEConnectionStateChange(connectionState, token) {
            const rtcSession = this.env.models['mail.rtc_session'].findFromIdentifyingData({ id: token });
            if (!rtcSession) {
                return;
            }
            rtcSession.update({
                connectionState,
            });
            switch (connectionState) {
                case "failed":
                case "closed":
                    this._removePeer(token);
                    break;
                case "disconnected":
                    await this._recoverConnection(token, { delay: 1000, reason: 'ice connection disconnected' });
                    break;
            }
        }

        /**
         * @private
         * @param {keyboardEvent} ev
         */
        _onKeyDown(ev) {
            if (this.env.messaging.userSetting.rtcConfigurationMenu.isRegisteringKey) {
                return;
            }
            if (!this.env.messaging.userSetting.isPushToTalkKey(ev)) {
                return;
            }
            this._onPushToTalkKeyDown();
        }

        /**
         * @private
         * @param {keyboardEvent} ev
         */
        _onKeyUp(ev) {
            if (!this.env.messaging.userSetting.isPushToTalkKey(ev, { ignoreModifiers: true })) {
                return;
            }
            this._onPushToTalkKeyUp();
        }

        /**
         * Updates the muted state and the local audio track
         * based on the permission status.
         *
         * @private
         * @param {event} ev
         */
        async _onMicrophonePermissionStatusChange(ev) {
            const canRequest = ev.target.state !== 'denied';
            this.currentRtcSession.updateAndBroadcast({ isMuted: !canRequest });
            await this.updateAudioTrack(canRequest);
            await this.async(() => this._updateLocalAudioTrackEnabledState());
        }

    }
    Rtc.fields = {
        /**
         * connection state for each peerToken
         * { token: RTCPeerConnection.iceConnectionState<String> }
         * can be:
         * 'new', 'checking' 'connected', 'completed', 'disconnected', 'failed', 'closed'
         */
        connectionStates: attr({
            default: {},
        }),
        /**
         * true if the browser supports webRTC
         */
        isClientRtcCompatible: attr({
            compute: '_computeIsClientRtcCompatible',
            default: true,
        }),
        /**
         * ICE servers used by RTCPeerConnection to retrieve the public IP address (STUN)
         * or to relay packets when necessary (TURN).
         */
        iceServers: attr({
            default: [
                {
                    urls: [
                        'stun:stun1.l.google.com:19302',
                        'stun:stun2.l.google.com:19302',
                    ],
                },
            ],
        }),
        /**
         * String, peerToken of the current session used to identify him during the peer-to-peer transactions.
         */
        currentRtcSession: one2one('mail.rtc_session'),
        /**
         * True if we want to enable the video track of the current partner.
         */
        sendUserVideo: attr({
            default: false,
        }),
        /**
         * True if we want to enable the video track of the current partner.
         */
        sendDisplay: attr({
            default: false,
        }),
        /**
         * The channel that is hosting the current RTC call.
         */
        channel: one2one('mail.thread', {
            inverse: 'mailRtc',
        }),
        /**
         * audio MediaStreamTrack of the current user
         */
        audioTrack: attr(),
        /**
         * video MediaStreamTrack of the current user
         */
        videoTrack: attr(),
        /**
         * MediaTrackConstraints
         */
        videoConfig: attr({
            default: {
                aspectRatio: {
                    ideal: 16 / 9,
                },
                frameRate: {
                    max: 30, // TODO as suggested by AL, there could be a "slide mode" with very low fps.
                },
            },
        }),
    };

    Rtc.modelName = 'mail.rtc';

    return Rtc;
}

registerNewModel('mail.rtc', factory);
