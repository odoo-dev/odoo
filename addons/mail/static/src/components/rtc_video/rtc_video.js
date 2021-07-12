/** @odoo-module **/

import { useModels } from '@mail/component_hooks/use_models/use_models';
import { useShouldUpdateBasedOnProps } from '@mail/component_hooks/use_should_update_based_on_props/use_should_update_based_on_props';
import { useUpdate } from '@mail/component_hooks/use_update/use_update';

const { Component } = owl;
const { useRef } = owl.hooks;

export class RtcVideo extends Component {
    /**
     * @override
     */
    constructor(...args) {
        super(...args);
        useModels();
        useShouldUpdateBasedOnProps();
        useUpdate({ func: () => this._update() });
        this._videoRef = useRef("video");
    }

    //--------------------------------------------------------------------------
    // Getters / Setters
    //--------------------------------------------------------------------------

    /**
     * @returns {mail.thread|undefined}
     */
    get rtcSession() {
        return this.env.models["mail.rtc_session"].get(
            this.props.rtcSessionLocalId
        );
    }

    //--------------------------------------------------------------------------
    // Private
    //--------------------------------------------------------------------------

    _update() {
        this._loadVideo();
    }

    /**
     * Since it is not possible to directly put a mediaStreamObject as the src
     * or src-object of the template, the video src is manually inserted into
     * the DOM.
     *
     */
    _loadVideo() {
        if (!this._videoRef) {
            return;
        }
        if (!this.rtcSession || !this.rtcSession.videoStream) {
            this._videoRef.el.srcObject = undefined;
            return;
        }
        this._videoRef.el.srcObject = this.rtcSession.videoStream;
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
}

Object.assign(RtcVideo, {
    props: {
        rtcSessionLocalId: {
            type: String,
        },
    },
    template: 'mail.RtcVideo',
});
