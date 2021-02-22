odoo.define('mail/static/src/models/rtc/rtc.js', function (require) {
'use strict';

const { registerNewModel } = require('mail/static/src/model/model_core.js');
const { attr } = require('mail/static/src/model/model_field.js');
const { clear } = require('mail/static/src/model/model_field_command.js');

function factory(dependencies) {

    class Rtc extends dependencies['mail.model'] {

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

        /**
         * @param {String} callToken the peerToken of the called peer
         */
        async connectToPeer(callToken) {
            const options = {
                constraints: {
                    mandatory: { // legacy chrome syntax
                        'OfferToReceiveAudio': true,
                        'OfferToReceiveVideo': true,
                    },
                    'offerToReceiveAudio': true,
                    'offerToReceiveVideo': true,
                },
            };
            const mediaConnection = await this.peer.call(callToken, this.stream, options);
            if (!mediaConnection) {
                return;
            }
            mediaConnection.on('stream', async callStream => {
                await this._addStream(callStream, callToken);
                mediaConnection.peerConnection.onconnectionstatechange = () => {
                    this._onConnectionStateChange(mediaConnection.peerConnection.connectionState, callToken);
                };
            });
            mediaConnection.on('error', error => {
                console.log('ERROR:::::');
                console.log(error);
            });
            mediaConnection.on('close', () => {
                this._removePeer(callToken);
            });
        }

        async disconnectSession() {
            await this._disconnect();
        }

        /**
         * @param {String} peerToken the token of the current partner.
         */
        async initSession(peerToken) {
            if (this.peer) {
                return;
            }
            const peer = new Peer(peerToken);
            const stream = await this._getStream();
            this._setupPeer(peer);
            const room = this.env.models['mail.chat_room'].get(this.env.messaging.chatRoomLocalId);

            for (const token of room.peerTokens) {
                if (token === peerToken) {
                    continue;
                }
                setTimeout(async () => {
                    // FIXME
                    await this.connectToPeer(token);
                }, 1000);
            }
            this.update({
                peer,
                peerToken,
                stream,
                activePeers: Object.assign({ [peerToken]: { token: peerToken, stream }}, this.activePeers),
            });
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
         * @param {Stream} stream
         * @param {String} token the token of video
         */
        async _addStream(stream, token) {
            this.update({ activePeers: Object.assign({ [token]: { token, stream }}, this.activePeers) });
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
            if (this.peer) {
                await this.peer.destroy();
            }
            await this.env.messaging.leaveRoom();
            this.update({
                stream: clear(),
                peer: clear(),
                peerToken: clear(),
                activePeers: clear(),
            })
        }

        /**
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
         * process the media connection of new calls
         *
         * @private
         * @param {Object} mediaConnection
         */
         _processCall(mediaConnection) {
            mediaConnection.answer(this.stream);
            mediaConnection.on('stream', callerStream => {
                const callToken = mediaConnection.peer;
                this._addStream(callerStream, callToken);
                mediaConnection.peerConnection.onconnectionstatechange = () => {
                    this._onConnectionStateChange(mediaConnection.peerConnection.connectionState, callToken);
                };
            });
            mediaConnection.on('error', error => {
                console.log(error);
            });
        }

        /**
         * cleans up a peer and its video
         *
         * @private
         * @param {String} token
         */
        _removePeer(token) {
            //this.room.removeUser(token);
            const newActivePeers = Object.assign({}, this.activePeers);
            delete newActivePeers[token];
            this.update({ activePeers: newActivePeers });
        }

        /**
         * @private
         * @param {Object} peer the peerObject of the current partner.
         */
        _setupPeer(peer) {
            peer.on('call', mediaConnection => {
                this._processCall(mediaConnection);
            });
            peer.on('error', error => {
                console.log('PEER-ERROR:::::');
                console.log(error);
            });
        }
    }

    Rtc.fields = {
        peer: attr(),
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
