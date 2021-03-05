odoo.define('mail/static/src/models/rtc/rtc.js', function (require) {
'use strict';

const { registerNewModel } = require('mail/static/src/model/model_core.js');
const { attr } = require('mail/static/src/model/model_field.js');
const { clear } = require('mail/static/src/model/model_field_command.js');

const iceServers = [
    { urls: [
        'stun:stun.l.google.com:19302',
        'stun:stun1.l.google.com:19302',
        'stun:stun2.l.google.com:19302',
        'stun:stun.services.mozilla.com'
    ]},
];

function factory(dependencies) {

    class Rtc extends dependencies['mail.model'] {

        /**
         * @override
         */
        _created() {
            const res = super._created(...arguments);
            this.env.services.bus_service.onNotification(null, notifs => this._onNotification(notifs));
            return res;
        }

        /**
         * @override
         */
        async _willDelete() {
            await this._disconnect();
            return super._willDelete(...arguments);
        }

        //----------------------------------------------------------------------
        // Public
        //----------------------------------------------------------------------

        async disconnectSession() {
            await this._disconnect();
        }

        /**
         * @param {String} peerToken the token of the current user.
         */
        async initSession(peerToken) {
            this.env.services.bus_service.addChannel('mail.rtc.partner:' + peerToken);
            const stream = await this._getStream();
            const room = this.env.models['mail.chat_room'].get(this.env.messaging.chatRoomLocalId);
            this.update({
                peerToken,
                stream,
                activePeers: Object.assign({ [peerToken]: { token: peerToken, stream }}, this.activePeers),
            });

            for (const token of room.peerTokens) {
                if (token === peerToken) {
                    continue;
                }
                await this._callPeer(token);
            }
        }

        toggleMicrophone() {
            this.update({ sendSound: !this.sendSound });
            if (!this.stream.getAudioTracks()[0]) {
                return;
            }
            this.stream.getAudioTracks()[0].enabled = this.sendSound;
        }

        toggleVideo() {
            this.update({ sendVideo: !this.sendVideo });
            if (!this.stream.getVideoTracks()[0]) {
                return;
            }
            this.stream.getVideoTracks()[0].enabled = this.sendVideo;
        }

        //----------------------------------------------------------------------
        // Private
        //----------------------------------------------------------------------

        /**
         * @private
         * @param {Object} param0
         * @param {Stream} param0.targetToken
         * @param {String} param0.event 'offer' | 'answer' | 'ice-candidate'
         * @param {Object} [param0.payload]
         * @param {String} [fromToken] the token of origin
         */
        async _notifyPeer({ targetToken, event, payload, fromToken=this.peerToken }) {
            if (!targetToken) {
                return;
            }
            await this.env.services.rpc({
                route: '/longpolling/send',
                params: {
                    channel: 'mail.rtc.partner:' + targetToken,
                    message: JSON.stringify({
                        event,
                        fromToken,
                        payload,
                    }),
                },
            }, { shadow: true });
        }

        /**
         * @private
         * @param {Object} param0
         * @param {String} param0.event 'offer' | 'answer' | 'ice-candidate'
         * @param {String} param0.fromToken the token of origin
         * @param {Object} param0.payload
         */
        async _handleNotification({ event, fromToken, payload }) {
            switch(event) {
                case "offer":
                    await this._handleIncomingOffer(fromToken, payload);
                    break;
                case "answer":
                    await this._handleAnswer(fromToken, payload);
                    break;
                case "ice-candidate":
                    await this._handleICECandidateNotification(fromToken, payload);
                    break;
            }
        }

        /**
         * @private
         * @param {String} fromToken
         * @param {Object} param0
         * @param {Object} param0.sdp Session Description Protocol
         */
        async _handleIncomingOffer(fromToken, { sdp }) {
            const peerConnection = await this._createPeerConnection(fromToken);
            const rtcSessionDescription = new RTCSessionDescription(sdp);
            await peerConnection.setRemoteDescription(rtcSessionDescription);
            peerConnection.addStream(this.stream);
            const answer = await peerConnection.createAnswer();
            await peerConnection.setLocalDescription(answer);

            const peerConnections = Object.assign({ [fromToken]: peerConnection }, this.peerConnections);
            this.update({ peerConnections });

            await this._notifyPeer({
                targetToken: fromToken,
                event: 'answer',
                payload: { sdp: peerConnection.localDescription },
            });

        }

        /**
         * @private
         * @param {String} fromToken
         * @param {Object} param0
         * @param {Object} param0.sdp Session Description Protocol
         */
        async _handleAnswer(fromToken, { sdp }) {
            const rtcSessionDescription = new RTCSessionDescription(sdp);
            await this.peerConnections[fromToken].setRemoteDescription(rtcSessionDescription);
        }

        /**
         * @private
         * @param {String} token
         * @param {Object} param0
         * @param {Object} param0.candidate RTCIceCandidateInit
         */
        async _handleICECandidateNotification(fromToken, { candidate }) {
            const rtcIceCandidate = new RTCIceCandidate(candidate);
            await this.peerConnections[fromToken].addIceCandidate(rtcIceCandidate);
        }

        /**
         * @private
         * @param {String} token
         */
        async _callPeer(token) {
            const peerConnection = await this._createPeerConnection(token);
            peerConnection.addStream(this.stream);
            const peerConnections = Object.assign({ [token]: peerConnection }, this.peerConnections);
            this.update({ peerConnections });
        }

        /**
         * Creates and setup a RTCPeerConnection
         *
         * @private
         * @param {String} token
         */
        async _createPeerConnection(token) {
            const peerConnection = new RTCPeerConnection({ iceServers });
            peerConnection.onicecanddate = async (event) => {
                if (!event.candidate) {
                    return;
                }
                await this._notifyPeer({
                    targetToken: token,
                    event: 'ice-candidate',
                    payload: { candidate: event.candidate },
                });
            };
            peerConnection.oniceconnectionstatechange = (event) => {
                this._onConnectionStateChange(peerConnection.iceConnectionState, token);
            };
            peerConnection.onnegotiationneeded = async () => {
                const offer = await peerConnection.createOffer({
                    'offerToReceiveAudio': true,
                    'offerToReceiveVideo': true,
                });
                await peerConnection.setLocalDescription(offer);
                await this._notifyPeer({
                    targetToken: token,
                    event: 'offer',
                    payload: { sdp: peerConnection.localDescription },
                });
            };
            peerConnection.addEventListener('track', (event) => {
                this._addStream(event.streams[0], token);
            });
            return peerConnection;
        }

        /**
         * @private
         * @param {Stream} stream
         * @param {String} token the token of video
         */
        async _addStream(stream, token) {
            this.update({ 
                activePeers: Object.assign({ [token]: { token, stream } }, this.activePeers),
            });
        }

        /**
         * cleans up the fields of the singleton, stops the tracks of the stream and destroys the peer connection.
         *
         * @private
         */
        async _disconnect() {
            if (this.stream) {
                this.stream.getTracks().forEach((track) => {
                    track.stop();
                });
            }

            if (this.peerConnections) {
                for (const peerConnection of Object.values(this.peerConnections)) {
                    peerConnection.close();
                }
            }

            await this.env.messaging.leaveRoom();
            this.env.services.bus_service.deleteChannel('mail.rtc.partner:' + this.peerToken);
            this.update({
                stream: clear(),
                peerToken: clear(),
                activePeers: clear(),
                peerConnections: clear(),
            });
        }

        /**
         * gets the input of the audio/video devices (webcam, microphone).
         * TODO for audio-only sessions, the audio stream can be fed to the srcObject of an <audio> element.
         *
         * @private
         * @param {Object} param0
         * @param {Boolean} [param0.video]
         * @param {Boolean} [param0.audio]
         * @returns {Stream} output from the media devices.
         */
        async _getStream({ video=true, audio=true } = {}) {
            try {
                return await navigator.mediaDevices.getUserMedia({
                    video,
                    audio,
                });
            } catch (e) {
                // fallback on Audio-only (happens if the device doesn't have a camera or doesn't allow its utilization.
                return await navigator.mediaDevices.getUserMedia({
                    audio,
                });
            }
        }

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
                case "disconnected":
                    this._removePeer(token);
            }
        }

        /**
         * cleans up a peer and its video
         *
         * @private
         * @param {String} token
         */
        _removePeer(token) {
            //this.room.removeUser(token);
            const peerConnection = this.peerConnections[token];
            if (peerConnection) {
                peerConnection.close();
            }

            const newActivePeers = Object.assign({}, this.activePeers);
            delete newActivePeers[token];

            const newPeerConnections = Object.assign({}, this.peerConnections);
            delete newPeerConnections[token];

            this.update({
                activePeers: newActivePeers,
                peerConnections: newPeerConnections,
             });
        }

        //----------------------------------------------------------------------
        // Handlers
        //----------------------------------------------------------------------

        /**
         *
         * @private
         * @param {Array} notifications
         */
        _onNotification(notifications) {
            for (const notification of notifications) {
                if(!notification[0].includes('mail.rtc.partner:')) {
                    return;
                }
                this._handleNotification(JSON.parse(notification[1]));
            }
        }
    }
    Rtc.fields = {
        /*
         * Object that contains the peer connections per peer token
         * { token: RTCPeerConnectionObject }
         *
         */
        peerConnections: attr(),
        /*
         * Object that contains the peer streams per peer token
         * { token: { token, stream }}
         *
         */
        activePeers: attr(),
        peerToken: attr({
            default: '',
        }),
        stream: attr(),
        sendVideo: attr({
            default: true,
        }),
        sendSound: attr({
            default: true,
        }),
    };

    Rtc.modelName = 'mail.rtc';

    return Rtc;
}

registerNewModel('mail.rtc', factory);

});
