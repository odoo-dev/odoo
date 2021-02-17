odoo.define('mail/static/src/components/video_room/video_room.js', function (require) {
'use strict';


const useStore = require('mail/static/src/component_hooks/use_store/use_store.js');

const { Component, useState } = owl;

class VideoRoom extends Component {

    /**
     * @override
     */
    constructor(...args) {
        super(...args);
        useStore(props => {
            const chatRoom = this.env.models['mail.chat_room'].get(props.roomLocalId);
            return {
                chatRoom: chatRoom ? chatRoom.__state : undefined,
                partnerRoot: this.env.messaging.partnerRoot,
            };
        });
        this.state = useState({
            sendVideo: true,
            sendSound: true,
        });
        this.stream = undefined;
    }

    async mounted() {
        const peer = new Peer(this.props.currentPeerToken);
        try {
            this.stream = await navigator.mediaDevices.getUserMedia({
                video: true,
                audio: true,
            });
        } catch (e) {
            this.stream = await navigator.mediaDevices.getUserMedia({
                audio: true,
            });
        }

        peer.on('call', call => {
            call.answer(this.stream);
            call.on('stream', callerStream => {
                this._addStream(callerStream, call.peer);
            });
            call.on('error', error => {
                console.log(error);
            });
            call.peerConnection.oniceconnectionstatechange = () => {
                if (call.peerConnection.iceConnectionState === 'disconnected') {
                    this.room.removeUser(call.peer);
                }
            }
        });
        peer.on('error', error => {
            console.log('PEER-ERROR:::::');
            console.log(error);
        });
        const video = await this._addStream(this.stream, this.props.currentPeerToken);
        video.muted = true;

        for (const token of this.room.peerTokens) {
            if (token === this.props.currentPeerToken) {
                continue;
            }
            this._connectToPeer(peer, token, this.stream);
        }
    }

    /**
     * @returns {mail.chat_room}
     */
    get room() {
        return this.env.models['mail.chat_room'].get(this.props.roomLocalId);
    }

    //--------------------------------------------------------------------------
    // Private
    //--------------------------------------------------------------------------

    _connectToPeer(peer, token, stream) {
        const constraints = {
            'mandatory': {
                'OfferToReceiveAudio': true,
                'OfferToReceiveVideo': true,
            },
        };
        const options = {
            constraints,
            'offerToReceiveAudio': true,
            'offerToReceiveVideo': true,
        }
        const call = peer.call(token, stream, options);
        if (!call) {
            return;
        }
        call.peerConnection.oniceconnectionstatechange = () => {
            if (call.peerConnection.iceConnectionState === 'disconnected') {
                this.room.removeUser(token);
            }
        }
        call.on('stream', async caleeStream => {
            await this._addStream(caleeStream, token);
        });
        call.on('error', error => {
            console.log('ERROR:::::');
            console.log(error);
        });
        call.on('close', () => {
            room.removeUser(token);
        });
    }
    /**
     * @private
     */
    async _addStream(stream, token) {
        const video = this.__owl__.refs[`video_${token}`];
        video.srcObject = stream;
        try {
            await video.play();
        } catch (e) {
            // ignore
        }
        return video;
    }
    /**
     * To be overwritten in tests.
     *
     * @private
     */
    async _loadAssets() {
        asset = await ajax.loadAsset('mail.peer_js_assets');
        await ajax.loadLibs(asset);
    }

    // HANDLERS

    async _onVideoLoadedMetaData(ev) {
        await ev.target.play();
    }

    _onClickMicrophone(ev) {
        this.state.sendSound = !this.state.sendSound;
        this.stream.getAudioTracks()[0].enabled = this.state.sendSound;
    }

    _onClickCamera(ev) {
        this.state.sendVideo = !this.state.sendVideo;
        this.stream.getVideoTracks()[0].enabled = this.state.sendVideo;
    }
}

Object.assign(VideoRoom, {
    props: {
        roomLocalId: String,
        currentPeerToken: String,
    },
    template: 'mail.VideoRoom',
});

return VideoRoom;

});
