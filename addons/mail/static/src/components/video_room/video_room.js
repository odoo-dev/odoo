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
        this.state = useState({
            videoWidth: 0,
            videoHeight: 0,
            columnCount: 0,
        });
        this._getRefs = useRefs();
        this.aspectRatio = 16 / 9;
    }

    async willStart() {
        // TODO move this logic to a new component for room, so it starts off as audio-only.
        this.localToken = await this.env.models['mail.chat_room'].get(this.props.roomLocalId).joinRoom();
        await this.env.mailRtc.initSession(this.localToken);

    }

    mounted() {
        this._setVideoLayout();
        this._loadVideos();
    }
    patched() {
        this._setVideoLayout();
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

    _computeOptimalLayout({ containerWidth, containerHeight }) {
        let optimalLayout = {
            area: 0,
            cols: 0,
            width: 0,
            height: 0,
        };

        const videoCount = Object.keys(this.env.mailRtc.activePeers).length;
        for (let columnCount = 1; columnCount <= videoCount; columnCount++) {
            const rowCount = Math.ceil(videoCount / columnCount);
            const videoHeight = containerWidth / (columnCount * this.aspectRatio);
            const videoWidth = containerHeight / rowCount;
            let width;
            let height;
            if (videoHeight > videoWidth) {
                height = Math.floor(containerHeight / rowCount);
                width = Math.floor(height * this.aspectRatio);
            } else {
                width = Math.floor(containerWidth / columnCount);
                height = Math.floor(width / this.aspectRatio);
            }
            const area = height * width;
            if (area <= optimalLayout.area) {
                continue;
            }
            optimalLayout = {
                area,
                width,
                height,
                columnCount
            };
        }
        return optimalLayout;
    }

    _setVideoLayout() {
        const roomRect = this.el.getBoundingClientRect();

        const { width, height, columnCount } = this._computeOptimalLayout({
            containerWidth: roomRect.width,
            containerHeight: roomRect.height,
        });

        this.state.videoWidth = width;
        this.state.videoHeight = height;
        this.state.columnCount = columnCount;

    }
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
