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
            const mailRtc = this.env.mailRtc;
            return {
                chatRoom: chatRoom ? chatRoom.__state : undefined,
                partnerRoot: this.env.messaging.partnerRoot,
                sendSound: mailRtc.sendSound,
                sendVideo: mailRtc.sendVideo,
            };
        });
        this._getRefs = useRefs();
        this.peerToken = '';
    }

    async willStart() {
        this.peerToken = await this.env.models['mail.chat_room'].get(this.props.roomLocalId).joinRoom();
        await this.env.mailRtc.initSession(this.peerToken);
    }

    async mounted() {
        const refs = this._getRefs();
        await this.env.mailRtc.setVideoRefs(refs);
        await this.env.mailRtc.updateVideo();
        for (const token of this.room.peerTokens) {
            if (token === this.peerToken) {
                continue;
            }
            setTimeout(async () => {
                await this.env.mailRtc.connectToPeer(token);
            }, 1000);
        }
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
    // Handlers
    //--------------------------------------------------------------------------

    async _onVideoLoadedMetaData(ev) {
        await ev.target.play();
    }

    _onClickMicrophone(ev) {
        this.env.mailRtc.toggleMicrophone();
    }

    _onClickCamera(ev) {
        this.env.mailRtc.toggleVideo();
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
