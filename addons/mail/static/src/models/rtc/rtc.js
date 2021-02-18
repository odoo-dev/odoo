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
            this.update({ peer, peerToken, stream });
        }

        /**
         * @param {Object} refs the refs Object of the videos
         */
        setVideoRefs(refs) {
            this.update({ videoRefs: refs });
        }

        toggleMicrophone() {
            this.update({ sendSound: !this.sendSound });
            if (!this.stream.getAudioTracks()[0]) {
                return;
            }
            this.stream.getAudioTracks()[0].enabled = this.sendSound;
        }

        toggleVideo() {
            this.update({ sendSound: !this.sendSound });
            if (!this.stream.getVideoTracks()[0]) {
                return;
            }
            this.stream.getVideoTracks()[0].enabled = this.state.sendVideo;
        }

        /**
         * adds the stream to the video representing the current partner.
         */
        async updateVideo() {
            await this._addStream(this.stream, this.peerToken, { muted: true });
        }

        //----------------------------------------------------------------------
        // Private
        //----------------------------------------------------------------------

        /**
         * @private
         * @param {Stream} stream
         * @param {String} token the token of video
         * @param {Object} [param2]
         * @param {Boolean} [param2.muted] whether the video should be muted
         */
        async _addStream(stream, token, { muted=false } = {} ) {
            const video = this.videoRefs[`video_${token}`];
            if (!video) {
                return;
            }
            video.srcObject = stream;
            try {
                await video.play();
            } catch (e) {
                // ignore
            }
            video.muted = muted;
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
                videoRefs: clear(),
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
        async _removePeer(token) {
            //this.room.removeUser(token);
            /*
             * FIXME since the disconect event is delayed, short disconnections like a page refresh
             * will stop the stream, we want to keep the video srcObject available in this case.
             * with a better server-side control of connections, this shouldn't be an issue.
             */
            const video = this.videoRefs[`video_${token}`];
            const stream = video.srcObject;
            video.srcObject = undefined;
            video.srcObject = stream;
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
        peerToken: attr({
            default: '',
        }),
        videoRefs: attr(),
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
