/** @odoo-module **/

import useRefs from '@mail/component_hooks/use_refs/use_refs';
import useStore from '@mail/component_hooks/use_store/use_store';
import RtcCallParticipants from '@mail/components/rtc_call_participants/rtc_call_participants';
import RtcController from '@mail/components/rtc_controller/rtc_controller';

const { Component, useState } = owl;
const { useRef } = owl.hooks;

const components = {
    RtcCallParticipants,
    RtcController,
};

// TODO a nice-to-have would be a resize handle under the videos, it would allow responsive this._setVideoLayout();

class VideoRoom extends Component {

    /**
     * @override
     */
    constructor(...args) {
        super(...args);
        useStore(props => {
            const thread = this.env.models['mail.thread'].get(this.env.messaging.activeCallThreadLocalId);
            const mailRtc = this.env.mailRtc;
            const device = this.env.messaging.device;
            return {
                activeVideoStreams: mailRtc.activeVideoStreams,
                focusedVideoPartner: this.env.messaging.focusedVideoPartner,
                thread: thread ? thread.__state : undefined,
                globalWindowInnerWidth: device.globalWindowInnerWidth,
                globalWindowInnerHeight: device.globalWindowInnerHeight,
            };
        });
        this.state = useState({
            isFullScreen: false,
            videoWidth: 0,
            videoHeight: 0,
            columnCount: 0,
        });
        this._getRefs = useRefs();
        this.videoContainerRef = useRef('videoContainer');
        this.aspectRatio = 16 / 9;
        this._onFullScreenChange = this._onFullScreenChange.bind(this);
    }

    mounted() {
        window.addEventListener('fullscreenchange', this._onFullScreenChange);
        this._setVideoLayout();
        this._loadVideos();
    }
    patched() {
        this._setVideoLayout();
        this._loadVideos();
    }

    willUnmount() {
        window.removeEventListener('fullscreenchange', this._onFullScreenChange);
        this._toggleFullScreen(false);
    }

    //--------------------------------------------------------------------------
    // Getters / Setters
    //--------------------------------------------------------------------------

    /**
     * @returns {mail.thread}
     */
    get thread() {
        return this.env.models['mail.thread'].get(this.env.messaging.activeCallThreadLocalId);
    }

    /**
     * @returns {Array[]}
     */
    get activeVideoStreams() {
        return this.env.mailRtc.activeVideoStreams ? Object.values(this.env.mailRtc.activeVideoStreams) : undefined;
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

        const videoCount = this.env.messaging.focusedVideoPartner ? 1 : Object.keys(this.env.mailRtc.activeVideoStreams || {}).length;
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
        if (!this.el) {
            return;
        }
        const roomRect = this.videoContainerRef.el.getBoundingClientRect();

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
        if (!this.env.mailRtc.activeVideoStreams) {
            return;
        }
        for (const token in this.env.mailRtc.activeVideoStreams) {
            const video = refs[`video_${token}`];
            if (!video) {
                continue;
            }
            video.srcObject = this.env.mailRtc.activeVideoStreams[token].stream;
        }
    }

    /**
     * will trigger a 'fullscreenchange' event
     * TODO could add a rtc_controller component in full-screen mode.
     *
     * @private
     * @param {boolean} force
     */
    async _toggleFullScreen(force) {
        const el = document.body;
        const fullScreenElement = document.webkitFullscreenElement || document.fullscreenElement;
        if (force !== undefined ? force : !fullScreenElement) {
            try {
                if (el.requestFullscreen) {
                    await el.requestFullscreen();
                } else if (el.mozRequestFullScreen) {
                    await el.mozRequestFullScreen();
                } else if (el.webkitRequestFullscreen) {
                    await el.webkitRequestFullscreen();
                }
                this.state.isFullScreen = true;
            } catch (e) {
                // ignored
            } finally {
                return;
            }
        }
        if (fullScreenElement) {
            if (document.exitFullscreen) {
                await document.exitFullscreen();
            } else if (document.mozCancelFullScreen) {
                await document.mozCancelFullScreen();
            } else if (document.webkitCancelFullScreen) {
                await document.webkitCancelFullScreen();
            }
            this.state.isFullScreen = false;
        }
    }

    //--------------------------------------------------------------------------
    // Handlers
    //--------------------------------------------------------------------------

    /**
     * @private
     * @param {Event} ev
     */
    async _onVideoLoadedMetaData(ev) {
        await ev.target.play();
    }
    /**
     * @private
     * @param {string} partnerId
     * @param {Event} ev
     */
    async _onClickVideo(partnerId, ev) {
        this.env.messaging.toggleFocusedVideoPartner(partnerId);
    }
    /**
     * @private
     * @param {Event} ev
     */
    async _onClickFullScreen(ev) {
        await this._toggleFullScreen();
    }

    /**
     * @private
     */
    _onFullScreenChange() {
        const fullScreenElement = document.webkitFullscreenElement || document.fullscreenElement;
        if (fullScreenElement) {
            this.state.isFullScreen = true;
            return;
        }
        this.state.isFullScreen = false;
    }
}

Object.assign(VideoRoom, {
    components,
    props: {
        activeCallThreadLocalId: {
            type: String,
            optional: true,
        },
    },
    template: 'mail.VideoRoom',
});

export default VideoRoom;
