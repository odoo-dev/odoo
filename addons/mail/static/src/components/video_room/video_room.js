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
    }

    async willPatch() {
        const peer = new Peer(this.props.currentPeerToken);
        let stream;
        try {
            stream = await navigator.mediaDevices.getUserMedia({
                video: true,
                audio: true,
            });
        } catch (e) {
            console.log(e);
            stream = await navigator.mediaDevices.getUserMedia({
                audio: true,
            });
        } finally {
            peer.on('call', call => {
                call.answer(stream);
                call.on('stream', callerStream => {
                    this._addStream(callerStream, call.peer);
                });
                call.on('error', error => {
                    console.log(error);
                });
            });
            const video = await this._addStream(stream, this.props.currentPeerToken);
            video.muted = true;

            for (const token of this.room.peerTokens) {
                if (token === this.props.currentPeerToken) {
                    continue;
                }
                await this._connectToPeer(peer, token, stream);
            }
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

    async _connectToPeer(peer, token, stream) {
        const options = {
            'constraints': {
                'mandatory': {
                    'OfferToReceiveAudio': true,
                    'OfferToReceiveVideo': true
                }
            }
        };
        const call = await peer.call(token, stream, options);
        console.log(call);
        if (!call) {
            return;
        }
        call.on('stream', async caleeStream => {
            await this._addStream(caleeStream, token);
        });
        call.on('error', error => {
            console.log(error);
        });
        call.on('close', () => {
            // TODO
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
