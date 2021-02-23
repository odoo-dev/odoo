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
                activePeers: mailRtc.activePeers,
                roomPeerTokens: chatRoom.peerTokens,
            };
            this.localToken = '';
        });
        this._getRefs = useRefs();
    }

    async willStart() {
        this.localToken = await this.env.models['mail.chat_room'].get(this.props.roomLocalId).joinRoom();
        await this.env.mailRtc.initSession(this.localToken);
    }

    mounted() {
        this._loadVideos();
    }
    patched() {
        this._loadVideos();
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

    /**
     * @returns {Array[]}
     * TODO check remove
     */
    get activePeers() {
        return this.env.mailRtc.activePeers ? Object.values(this.env.mailRtc.activePeers) : undefined;
    }

    //--------------------------------------------------------------------------
    // Private
    //--------------------------------------------------------------------------

    /**
     * Since it is not possible to directly put a mediaStreamObject as the src or src-object of the template,
     * the video src is manually inserted into the DOM.
     */
    _loadVideos() {
        const refs = this._getRefs();
        if (!this.env.mailRtc.activePeers) {
            return;
        }
        for (const token in this.env.mailRtc.activePeers) {
            const video = refs[`video_${token}`];
            if (!video) {
                continue;
            }
            video.srcObject = this.env.mailRtc.activePeers[token].stream;
        }
    }

    //--------------------------------------------------------------------------
    // Handlers
    //--------------------------------------------------------------------------

    async _onVideoLoadedMetaData(token, ev) {
        await ev.target.play();
        if (token === this.localToken) {
            ev.target.muted = true;
        }
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
