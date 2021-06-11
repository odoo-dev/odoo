/** @odoo-module **/

import { registerNewModel } from '@mail/model/model_core';
import { attr } from '@mail/model/model_field';
import { clear } from '@mail/model/model_field_command';

import { monitorAudioThresholds } from '@mail/utils/media_monitoring/media_monitoring';

/**
 * The order in which transceivers are added, relevant for RTCPeerConnection.getTransceivers which returns
 * transceivers in insertion order as per webRTC specifications.
 */
const TRANSCEIVER_ORDER = ['audio', 'video'];

/**
 * backend
 * TODO FEATURE OPTIONS
 * peer-to-peer volume[server],
 * --- channel_last_seen_partner_ids ---
 * mute [store on mail.partner instead of rtc.activeAudioStreams]
 * deaf [store on mail.partners]
 * isLive [store on mail.partners instead of checking rtc.activeVideoStreams]
 * TODO FEATURE add volume slider for each remote user (save on server, hot client-side update, debounced rpc)
 * TODO FEATURE send mute/deaf updates to server (routes) updating mail.partner.setting, (indexed on partner_id?)
 * TODO FEATURE live indicator server knowledge
 *
 * TODO FEATURE (low priority?) notify users that channel voice is not/empty
 * TODO remove offline members
 *
 * frontend
 * TODO FIX Prevent multi-tab in the same thread.
 * TODO IMP messaging.activeCallThreadLocalId to relational (eg: rtcRingingPartner)
 * TODO IMP create models instead of nested objects for rtc.js fields (activeVideoStreams, activeAudioStreams).
 * TODO IMP when focusing, requesting all non-focused peers to set their track.enabled = false. send with SDP payload
 * that we want disabled track.
 *
 */

function factory(dependencies) {

    class Rtc extends dependencies['mail.model'] {

        /**
         * @override
         */
        _created() {
            const res = super._created(...arguments);
            window.addEventListener('beforeunload', () => {
                this._disconnect();
            });
            this._onKeyDown = this._onKeyDown.bind(this);
            this._onKeyUp = this._onKeyUp.bind(this);
            this.pushToTalkTimeout;
            window.addEventListener('keydown', this._onKeyDown);
            window.addEventListener('keyup', this._onKeyUp);
            return res;
        }

        /**
         * @override
         */
        _willDelete() {
            window.removeEventListener('keydown', this._onKeyDown);
            window.removeEventListener('keyup', this._onKeyUp);
            return super._willDelete(...arguments);
        }

        //----------------------------------------------------------------------
        // Public
        //----------------------------------------------------------------------

        disconnectSession() {
            this._disconnect();
        }

        /**
         * removes and disconnect all the peers that are not current members of the call.
         *
         * @param {mail.partner[]} currentMembers the new list of members of this session
         * @param {Object} param1
         * @param {String} [param1.sessionToken]
         */
        async filterCallees(currentMembers, { sessionToken }) {
            if (sessionToken !== this.sessionToken) {
                return;
            }
            const currentMembersTokens = new Set(currentMembers.map(partner => partner.peerToken));
            for (const token of Object.keys(this._peerConnections)) {
                if (!currentMembersTokens.has(token)) {
                    this._removePeer(token);
                }
            }
        }

        /**
         * @param {Object} sender id of the partner that sent the notification
         * @param {String} content JSON
         */
        async handleNotification(sender, content) {
            const { event, sessionToken, payload } = JSON.parse(content);
            if (event !== 'trackChange') {
                console.log(`RECEIVED - ${event} from: ${sender}`);
            }
            if (!this.hasActiveSession) {
                // notifications from a previous session can linger on the bus
                return;
            }
            if (!this.isClientRtcCompatible) {
                return; // TODO maybe notify sender that it's not possible due to lack of compatibility?
            }
            if (!this._peerConnections[sender] && (!sessionToken || sessionToken !== this.sessionToken)) {
                return;
            }
            switch(event) {
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
                    this._handleTrackChange(sender, payload);
                    break;
            }
        }

        /**
         * @param {Object} param0
         * @param {mail.partner[]} [param0.callees] the list of partners to call
         * @param {String} param0.sessionToken a token for auto accepting connections of the same sessionToken,
         *                 transaction will only be accepted if they come with a matching sessionToken
         * @param {function} [param0.onSessionEnd] callback
         * @param {Array<Object>} [param0.iceServers]
         * @param {Object|boolean} [param0.audio] audio MediaStreamConstraints.audio
         * @returns {boolean} true if the session is successfully initialized
         */
        async initSession({ callees, sessionToken, onSessionEnd, iceServers, audio=true }) {
            this._disconnect();
            if (!this.isClientRtcCompatible) {
                return false;
            }
            this.onSessionEnd = onSessionEnd; // set after calling this._disconnect() so the callback of the last init is called.
            const peerToken = this.env.messaging.currentPartner.peerToken;

            this.update({
                peerToken,
                iceServers: iceServers || this.iceServers,
                sessionToken,
                hasActiveSession: true,
            });

            await this._updateAudioTrack(audio);

            if (!callees) {
                return true;
            }
            for (const partner of callees) {
                if (partner.peerToken === peerToken) {
                    continue;
                }
                console.log('calling: ' + partner.name);
                await this._callPeer(partner.peerToken);
            }
            return true;
        }

        /**
         * @param {String} token mail.partner.peerToken
         * @returns {boolean}
         */
        isPartnerMute(token) {
            if (this.peerToken === token) {
                return !this.sendSound;
            }
            const audioStream = this.activeAudioStreams[token];
            if (audioStream) {
                return audioStream.isMute;
            }
            return true;
        }

        /**
         * @param {String} token mail.partner.peerToken
         * @returns {boolean}
         */
        isPartnerTalking(token) {
            if (this.isPartnerMute(token)) {
                return false;
            }
            if (this.peerToken === token) {
                return this.isTalking;
            }
            const audioStream = this.activeAudioStreams[token];
            if (audioStream) {
                return audioStream.isTalking;
            }
            return false;
        }

        /**
         * mutes and demutes incoming audio
         */
        toggleDeaf() {
            this.update({ isDeaf: !this.isDeaf });
            for (const audioStream of Object.values(this.activeAudioStreams)) {
                if (!audioStream.audio) {
                    continue;
                }
                audioStream.audio.muted = this.isDeaf;
            }
        }

        /**
         * mutes and unmutes the microphone
         */
        async toggleMicrophone() {
            this.update({ sendSound: !this.sendSound });
            await this._updateLocalAudioTrackState();
        }

        /**
         * toggles user video (eg: webcam) broadcasting to peers.
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
         * @param {mediaStreamTrack} [audioTrack]
         */
        async updateVoiceActivation(audioTrack=this.audioTrack) {
            this._audioMonitor?.disconnect();
            if (this.env.messaging.userSetting.usePushToTalk || !this.hasActiveSession || !audioTrack) {
                this.update({ isTalking: !this.env.messaging.userSetting.pushToTalkKey });
                return;
            }
            try {
                this._audioMonitor = await monitorAudioThresholds(audioTrack, {
                    onStateChange: async (state) => {
                        this._setSoundBroadcast(state);
                    },
                    minimumActiveCycles: 10,
                    baseLevel: this.env.messaging.userSetting.voiceActivationThreshold,
                });
                /**
                 * since we are changing the enabled property of the track, we need to clone it so the control track
                 * stays enabled.
                 */
            } catch (e) {
                // the browser is probably missing audioContext, in that case, voice activation is not enabled.
            }
        }

        //----------------------------------------------------------------------
        // Private
        //----------------------------------------------------------------------

        /**
         * @private
         * @param {Object} trackOptions
         */
        async _toggleVideoBroadcast(trackOptions) {
            if (!this.hasActiveSession) {
                return;
            }

            await this._toggleVideoTrack(trackOptions);
            for (const peerConnection of Object.values(this._peerConnections)) {
                await this._updateRemoteTrack(peerConnection, 'video', { remove: !this.videoTrack });
            }

            if (this.sendUserVideo || this.sendDisplay) {
                // the peer already gets notified through RTC transaction.
                return;
            }
            if (this.env.messaging.focusedVideoPartner && this.env.messaging.focusedVideoPartner.peerToken === this.peerToken) {
                this.env.messaging.toggleFocusedVideoPartner();
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
                const sendUserVideo = force ?? !this.sendUserVideo;
                await this._updateVideoTrack(type, sendUserVideo);
            }
            if (type === 'display') {
                const sendDisplay = force ?? !this.sendDisplay;
                await this._updateVideoTrack(type, sendDisplay);
            }
            if (!this.videoTrack) {
                const newActiveVideoStreams = Object.assign({}, this.activeVideoStreams);
                delete newActiveVideoStreams[this.peerToken];
                this.update({
                    activeVideoStreams: newActiveVideoStreams,
                });
            } else {
                this._updateDisplayableStreams(this.videoTrack, this.peerToken);
            }
        }

        /**
         * @private
         * @param {RTCPeerConnection} peerConnection
         * @param {String} trackKind
         * @param {Object} [param3]
         * @param {boolean} [param3.useTransceiver]
         * @param {Boolean} [param3.remove]
         */
        async _updateRemoteTrack(peerConnection, trackKind, { useTransceiver, remove } = {}) {
            const track = trackKind === 'audio' ? this.audioTrack : this.videoTrack;
            let transceiver;
            if (useTransceiver) {
                transceiver = peerConnection.addTransceiver(trackKind);
                transceiver.direction = 'recvonly';
            } else {
                transceiver = this._getTransceiver(peerConnection, trackKind);
            }

            if (remove) {
                transceiver.sender.replaceTrack(null);
                transceiver.direction = 'recvonly';
            }
            if (track) {
                try {
                    transceiver.sender.replaceTrack(track);
                    transceiver.direction = 'sendrecv';
                } catch (e) {
                    // ignored, the track is probably already on the peerConnection.
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
                await this._updateRemoteTrack(peerConnection, trackKind, { useTransceiver: true });
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
                console.log('ICE ERROR - coState: ' + peerConnection.connectionState + ' - iceState: ' + peerConnection.iceConnectionState);
                console.log(error);
                await this._recoverConnection(token, { delay: 15000, reason: 'ice candidate error' });
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
                /* FIXME? it appears that the track yielded by the peerConnection's 'ontrack' event is always enabled,
                 * even when it is disabled on the sender-side.
                 */
                await this._notifyPeers([token], {
                    event: 'trackChange',
                    type: 'peerToPeer',
                    payload: {
                        type: 'audio',
                        state: { isTalking: this.isTalking, isMute: !this.sendSound },
                    },
                });
            };
            this._peerConnections[token] = peerConnection;
            this._dataChannels[token] = dataChannel;
            return peerConnection;
        }

        /**
         * cleans up the fields, stops the tracks of the stream and closes the peer connection.
         *
         * @private
         */
        _disconnect() {
            this._reset();

            const onSessionEnd = this.onSessionEnd;
            this.onSessionEnd = undefined;
            if (onSessionEnd) {
                onSessionEnd();
            }
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
                console.log('received answer for a non-existent peer connection - token: ' + fromToken);
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
                console.log('received ice candidate for a non-existent peer connection - token: ' + fromToken);
                return;
            }
            const rtcIceCandidate = new RTCIceCandidate(candidate);
            try {
                await peerConnection.addIceCandidate(rtcIceCandidate);
            } catch (error) {
                // ignored
                console.log("=== ADD ICE CANDIDATE ERROR ===");
                console.log(error);
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
                console.log('received offer for a non-existent peer connection - token: ' + fromToken);
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
         * @param {String} fromToken
         * @param {Object} param1
         * @param {String} param1.type Session Description Protocol
         * @param {Object} param1.state
         */
        async _handleTrackChange(fromToken, { type, state }) {
            const { isMute, isTalking, isSendingVideo } = state;
            if (type === 'audio') {
                const newActiveAudioStreams = Object.assign({}, this.activeAudioStreams);
                if (!newActiveAudioStreams[fromToken]) {
                    return;
                }
                newActiveAudioStreams[fromToken].isMute = isMute;
                newActiveAudioStreams[fromToken].isTalking = isTalking;
                this.update({
                    activeAudioStreams: newActiveAudioStreams,
                });
            }
            if (type === 'video' && isSendingVideo === false) {
                const newActiveVideoStreams = Object.assign({}, this.activeVideoStreams);
                delete newActiveVideoStreams[fromToken];
                if (this.env.messaging.focusedVideoPartner && this.env.messaging.focusedVideoPartner.peerToken === fromToken) {
                    this.env.messaging.toggleFocusedVideoPartner();
                }
                this.update({
                    activeVideoStreams: newActiveVideoStreams,
                });
            }
        }

        /**
         * @param {boolean} isTalking
         */
        async _setSoundBroadcast(isTalking) {
            this.update({ isTalking: isTalking });
            if (this.sendSound) {
                await this._updateLocalAudioTrackState();
            }
        }

        /**
         * @private
         * @param {String} fromToken
         * @param {Object|Boolean} audio MediaStreamConstraints.audio
         */
        async _updateAudioTrack(audio) {
            this.audioTrack?.stop?.();
            this.update({ audioTrack: clear() });
            if (audio) {
                let audioStream;
                try {
                    audioStream = await navigator.mediaDevices.getUserMedia({ audio });
                } catch (e) {
                    return;
                }
                const audioTrack = audioStream.getAudioTracks()[0];
                await this.updateVoiceActivation(audioTrack);
                audioTrack.enabled = this.sendSound && this.isTalking;
                this.update({ audioTrack });
                for (const [token, peerConnection] of Object.entries(this._peerConnections)) {
                    await this._updateRemoteTrack(peerConnection, 'audio');
                }
            }
        }

        /**
         * @private
         */
        async _updateLocalAudioTrackState() {
            if (!this.audioTrack) {
                return;
            }
            this.audioTrack.enabled = this.sendSound && this.isTalking;
            await this._notifyPeers(Object.keys(this._peerConnections), {
                event: 'trackChange',
                type: 'peerToPeer',
                payload: {
                    type: 'audio',
                    state: {
                        isTalking: this.isTalking && this.sendSound,
                        isMute: !this.sendSound
                    },
                },
            });
        }

        /**
         * @private
         * @param {String} type 'user-video' or 'display'
         * @param {Object|boolean} constraints MediaTrackConstraints
         */
        async _updateVideoTrack(type, constraints) {
            this.videoTrack?.stop?.();
            this.update({
                sendDisplay: false,
                sendUserVideo: false,
                videoTrack: clear(),
            });
            let videoStream;
            if (!constraints) {
                return;
            }
            try {
                if (type === 'user-video') {
                    videoStream = await navigator.mediaDevices.getUserMedia({ video: { aspectRatio: { ideal: 16/9 } } });
                }
                if (type === 'display') {
                    videoStream = await navigator.mediaDevices.getDisplayMedia({ video: { aspectRatio: { ideal: 16/9 } } });
                }
            } catch (e) {
                // TODO maybe notify the user? It could happen if the user doesn't have a userMedia (eg: webcam)
                return;
            }
            const videoTrack = videoStream?.getVideoTracks()[0];
            videoTrack.addEventListener('ended', async () => {
                this._toggleVideoTrack({ force: false, type });
            });
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
        async _notifyPeers(targetTokens, { event, payload, type='server' }) {
            if (!targetTokens?.length) {
                return;
            }
            if (event !== 'trackChange') {
                console.log(`SEND - ${event} to: [${targetTokens}] (${type})`);
            }
            const content = JSON.stringify({
                event,
                sessionToken: this.sessionToken,
                payload,
            })

            if (type === 'server') {
                await this.env.services.rpc({
                    route: '/mail/notify_peers',
                    params: {
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
         * Attempts a connection recovery by updating the tracks, which will start a new transaction:
         * negotiationneeded -> offer -> answer -> ...
         *
         * @private
         * @param {Object} constraints MediaStreamTrack constraints
         * @param {Object} [param1]
         * @param {number} [param1.delay] in ms
         * @param {string} [param1.reason]
         */
        _recoverConnection(token, { delay=0, reason='' } = {}) {
            if (this._fallBackTimeouts[token]) {
                return;
            }
            this._fallBackTimeouts[token] = setTimeout(async () => {
                delete this._fallBackTimeouts[token];
                const peerConnection = this._peerConnections[token];
                if (!peerConnection) {
                    return;
                }
                if (this._outGoingCallTokens.has(token)) {
                    return;
                }
                if (peerConnection.iceConnectionState == 'connected') {
                    return;
                }
                if (['connected', 'closed'].includes(peerConnection.connectionState)) {
                    return;
                }
                // hard reset: recreating a RTCPeerConnection
                console.log(`RECOVERY: calling back ${token} to salvage the connection ${peerConnection.iceConnectionState}, reason: ${reason}`);
                await this._notifyPeers([token], {
                    event: 'disconnect',
                });
                this._removePeer(token);
                await this._callPeer(token, { name: token });
            }, delay);
        }

        /**
         * cleans up a peer and its video
         *
         * @private
         * @param {String} token
         */
        _removePeer(token) {
            if (token === this.peerToken) {
                return;
            }
            const timeoutId = this._fallBackTimeouts[token];
            const peerConnection = this._peerConnections[token];
            const dataChannel = this._dataChannels[token];
            clearTimeout(timeoutId);
            dataChannel.close();
            if (peerConnection) {
                this._removeRemoteTracks(peerConnection);
                peerConnection.close();
            }
            this._removeStreams(token);

            delete this._peerConnections[token];
            delete this._fallBackTimeouts[token];

            this._outGoingCallTokens.delete(token);
        }

        /**
         * @private
         * @param {String} token
         */
        _removeStreams(token) {
            const audio = this.activeAudioStreams[token]?.audio;
            if (audio) {
                audio.srcObject = undefined;
            }
            for (const track of this.activeAudioStreams[token]?.stream?.getTracks?.() || []) {
                track.stop();
            }
            for (const track of this.activeVideoStreams[token]?.stream?.getTracks?.() || []) {
                track.stop();
            }
            const newActiveVideoStreams = Object.assign({}, this.activeVideoStreams);
            const newActiveAudioStreams = Object.assign({}, this.activeAudioStreams);
            delete newActiveVideoStreams[token];
            delete newActiveAudioStreams[token];
            this.update({
                activeVideoStreams: newActiveVideoStreams,
                activeAudioStreams: newActiveAudioStreams,
            });
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
                transceiver.stop();
            }
        }

        /**
         * @private
         */
        _reset() {
            this._audioMonitor?.disconnect();
            if (this._peerConnections) {
                const peerTokens = Object.keys(this._peerConnections);
                this._notifyPeers(peerTokens, {
                    event: 'disconnect',
                });
                for (const token of peerTokens) {
                    this._removePeer(token);
                }
            }
            this.videoTrack?.stop();
            this.audioTrack?.stop();

            /*
             * technical fields that are not exposed
             * Especially important for peerConnections, as garbage connection of peerConnections is important for
             * peerConnection.close().
             * TODO refactor with underscore prefix
            **/
            this._peerConnections = {}; // { token: peerConnection<RTCPeerConnection> }
            this._dataChannels = {}; // { token: dataChannel<RTCDataChannel> }
            this._fallBackTimeouts = {}; // { token: timeoutId<Number> }
            this._outGoingCallTokens = new Set(); // set of peerTokens
            this._audioMonitor = undefined;

            this.update({
                activeAudioStreams: clear(),
                activeVideoStreams: clear(),
                connectionStates: clear(),
                hasActiveSession: clear(),
                isTalking: clear(),
                sessionToken: clear(),
                peerToken: clear(),
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
        async _updateDisplayableStreams(track, token) {
            const stream = new MediaStream();
            stream.addTrack(track);

            if (track.kind === 'audio') {
                for (const track of this.activeAudioStreams[token]?.stream?.getTracks?.() || []) {
                    track.stop();
                }
                // creating an Audio to play the audioTrack directly from the JS.
                const audio = this.activeAudioStreams[token]?.audio || new Audio();
                audio.srcObject = stream;
                audio.play();
                audio.muted = this.isDeaf;
                this.update({
                    activeAudioStreams: Object.assign({}, this.activeAudioStreams, {
                        [token]: { token, stream, audio, isMute: false, isTalking: false },
                    }),
                });
            }

            if (track.kind === 'video') {
                for (const track of this.activeVideoStreams[token]?.stream?.getTracks?.() || []) {
                    track.stop();
                }
                this.update({
                    activeVideoStreams: Object.assign({}, this.activeVideoStreams, {
                        [token]: { token, stream },
                    }),
                });
            }
        }

        //----------------------------------------------------------------------
        // Handlers
        //----------------------------------------------------------------------

        /**
         *
         * @private
         * @param {String} state the new state of the connection
         * @param {String} token of the peer whose the connection changed
         */
        async _onConnectionStateChange(state, token) {
            switch(state) {
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
         *
         * @private
         * @param {String} state the new state of the connection
         * @param {String} token of the peer whose the connection changed
         */
        async _onICEConnectionStateChange(state, token) {
            const connectionStates = Object.assign(this.connectionStates, { [token]: state });
            this.update({ connectionStates });
            switch(state) {
                case "failed":
                case "closed":
                    this._removePeer(token);
                    break;
                case "disconnected":
                    await this._recoverConnection(token, { delay: 1000, reason: 'ice connection disconnected' });
                    break;
            }
        }

        _onKeyDown(ev) {
            if (!this.env.messaging.userSetting.usePushToTalk) {
                return;
            }
            if (ev.key !== this.env.messaging.userSetting.pushToTalkKey) {
                return;
            }
            if (this.pushToTalkTimeout) {
                clearTimeout(this.pushToTalkTimeout);
            }
            this._setSoundBroadcast(true);
        }

        _onKeyUp(ev) {
            if (!this.env.messaging.userSetting.usePushToTalk) {
                return;
            }
            if (ev.key !== this.env.messaging.userSetting.pushToTalkKey) {
                return;
            }
            this.pushToTalkTimeout = setTimeout(
                () => {
                    this._setSoundBroadcast(false);
                },
                this.env.messaging.userSetting.voiceActiveDuration || 0,
            );
        }

    }
    Rtc.fields = {
        /*
         * Objects that contains the peer streams per peer token, these streams are what the user
         * can directly display by adding them to <audio> or <video> elements.
         * { token: { token: String , stream: MediaStream }}
         */
        activeAudioStreams: attr({
            default: {},
        }),
        activeVideoStreams: attr({
            default: {},
        }),
        /*
         * connection state for each peerToken
         * { token: RTCPeerConnection.iceConnectionState<String> }
         * can be:
         * 'new', 'checking' 'connected', 'completed', 'disconnected', 'failed', 'closed'
         */
        connectionStates: attr({
            default: {},
        }),
        hasActiveSession: attr({
            default: false,
        }),
        /*
         * true if the browser supports webRTC
         */
        isClientRtcCompatible: attr({
            compute: '_computeIsClientRtcCompatible',
            default: true,
        }),
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
        /*
         * true if incoming sound is disabled
         */
        isDeaf: attr({
            default: false,
        }),
        /*
         * true if the user is currently broadcasting sound (push-to-talk and voice activation)
         */
        isTalking: attr({
            default: true,
        }),
        /*
         * String, peerToken of the current partner used to identify him during the peer-to-peer transactions.
         */
        peerToken: attr({
            default: '',
        }),
        /*
         * Any, used to identify this session.
         */
        sessionToken: attr(),
        /*
         * True if we want to enable the sound track of the current partner.
         */
        sendSound: attr({
            default: true,
        }),
        /*
         * True if we want to enable the video track of the current partner.
         */
        sendUserVideo: attr({
            default: false,
        }),
        /*
         * True if we want to enable the video track of the current partner.
         */
        sendDisplay: attr({
            default: false,
        }),
        /*
         * MediaStream and MediaStreamTrack of the current user
         */
        videoTrack: attr(),
        audioTrack: attr(),
    };

    Rtc.modelName = 'mail.rtc';

    return Rtc;
}

registerNewModel('mail.rtc', factory);
