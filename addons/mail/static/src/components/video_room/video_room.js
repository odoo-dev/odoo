odoo.define('mail/static/src/components/video_room/video_room.js', function (require) {
'use strict';


const useStore = require('mail/static/src/component_hooks/use_store/use_store.js');
const useRefs = require('mail/static/src/component_hooks/use_refs/use_refs.js');

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
            peerToken: '',
        });
        this._getRefs = useRefs();
        this.stream = undefined;
        this.peer = undefined;
        this.options = {
            constraints: {
                mandatory: { // legacy chrome syntax
                    'OfferToReceiveAudio': true,
                    'OfferToReceiveVideo': true,
                },
                'offerToReceiveAudio': true,
                'offerToReceiveVideo': true,
            },
        };
    }

    async mounted() {
        this.state.peerToken = await this.env.models['mail.chat_room'].get(this.props.roomLocalId).joinRoom();
        this.peer = new Peer(this.state.peerToken);
        await this._getStream();
        this.peer.on('call', call => {
            call.answer(this.stream);
            call.on('stream', callerStream => {
                const callToken = call.peer;
                this._addStream(callerStream, callToken);
                call.peerConnection.onconnectionstatechange = () => {
                    this._onConnectionStateChange(call.peerConnection.connectionState, callToken);
                };
            });
            call.on('error', error => {
                console.log(error);
            });

        });
        this.peer.on('error', error => {
            console.log('PEER-ERROR:::::');
            console.log(error);
        });
        const video = await this._addStream(this.stream, this.state.peerToken);
        video.muted = true;

        for (const token of this.room.peerTokens) {
            if (token === this.state.peerToken) {
                continue;
            }
            setTimeout(async () => {
                // FIXME
                await this._connectToPeer(this.peer, token, this.stream);
            }, 1000);
        }
    }

    async willUnmount() {
        await this.peer.disconnect();
        await this.env.models['mail.chat_room'].get(this.props.roomLocalId).leaveRoom();
    }

    //--------------------------------------------------------------------------
    // Getters / Setters
    //--------------------------------------------------------------------------

    /**
     * @returns {mail.chat_room}
     */
    get room() {
        return this.env.models['mail.chat_room'].get(this.props.roomLocalId);
    }

    //--------------------------------------------------------------------------
    // Private
    //--------------------------------------------------------------------------

    async _getStream() {
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
    }
    async _removePeer(token) {
        //this.room.removeUser(token);
        const refs = this._getRefs();
        const video = refs[`video_${token}`];
        /*
         * FIXME since the disconect event is delayed, short disconnections like a page refresh
         * will stop the stream, we want to keep the video srcObject available in this case.
         * with a better server-side control of connections, this shouldn't be an issue.
         */
        const stream = video.srcObject;
        video.srcObject = undefined;
        video.srcObject = stream;
    }
    async _connectToPeer(peer, token, stream) {
        console.log(this.options);
        const call = await peer.call(token, stream, this.options);
        if (!call) {
            return;
        }
        call.on('stream', async caleeStream => {
            await this._addStream(caleeStream, token);
            call.peerConnection.onconnectionstatechange = () => {
                this._onConnectionStateChange(call.peerConnection.connectionState, token);
            };
        });
        call.on('error', error => {
            console.log('ERROR:::::');
            console.log(error);
        });
        call.on('close', () => {
            this._removePeer(token);
        });
    }
    /**
     * @private
     */
    async _addStream(stream, token) {
        const refs = this._getRefs();
        const video = refs[`video_${token}`];
        video.srcObject = stream;
        try {
            console.log(video.srcObject);
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

    //--------------------------------------------------------------------------
    // Handlers
    //--------------------------------------------------------------------------

    async _onConnectionStateChange(state, token) {
        switch(state) {
            case "failed":
            case "closed":
            case "disconnected":
                this._removePeer(token);
        }
    }

    async _onVideoLoadedMetaData(ev) {
        await ev.target.play();
    }

    _onClickMicrophone(ev) {
        this.state.sendSound = !this.state.sendSound;
        if (!this.stream.getAudioTracks()[0]) {
            return;
        }
        this.stream.getAudioTracks()[0].enabled = this.state.sendSound;
    }

    _onClickCamera(ev) {
        this.state.sendVideo = !this.state.sendVideo;
        if (!this.stream.getVideoTracks()[0]) {
            return;
        }
        this.stream.getVideoTracks()[0].enabled = this.state.sendVideo;
    }
}

Object.assign(VideoRoom, {
    props: {
        roomLocalId: String,
    },
    template: 'mail.VideoRoom',
});

return VideoRoom;

});
