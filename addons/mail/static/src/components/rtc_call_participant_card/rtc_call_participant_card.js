/** @odoo-module **/

import { useModels } from '@mail/component_hooks/use_models/use_models';
import { useShouldUpdateBasedOnProps } from '@mail/component_hooks/use_should_update_based_on_props/use_should_update_based_on_props';
import { RtcVideo } from '@mail/components/rtc_video/rtc_video';

const { Component } = owl;
const { useRef } = owl.hooks;

const components = {
    RtcVideo,
};

export class RtcCallParticipantCard extends Component {

    /**
     * @override
     */
    constructor(...args) {
        super(...args);
        useModels();
        useShouldUpdateBasedOnProps();
        this._volumeMenuAnchorRef = useRef('volumeMenuAnchor');
    }

    //--------------------------------------------------------------------------
    // Getters / Setters
    //--------------------------------------------------------------------------

    /**
     * @returns {mail.thread|undefined}
     */
    get rtcSession() {
        return this.env.models['mail.rtc_session'].get(this.props.rtcSessionLocalId);
    }

    //--------------------------------------------------------------------------
    // Handlers
    //--------------------------------------------------------------------------

    /**
     * @private
     * @param {Event} ev
     */
    _onChangeVolume(ev) {
        this.rtcSession.setVolume(parseFloat(ev.target.value));
    }

    /**
     * @private
     * @param {Event} ev
     */
    async _onClickVideo(ev) {
        ev.stopPropagation();
        this.env.messaging.toggleFocusedRtcSession(this.rtcSession.id);
    }

    /**
     * This listens to the right click event, and used to redirect the event
     * as a click on the popover.
     *
     * @private
     * @param {Event} ev
     */
    async _onContextMenu(ev) {
        ev.preventDefault();
        this._volumeMenuAnchorRef.el && this._volumeMenuAnchorRef.el.click();
    }
}

Object.assign(RtcCallParticipantCard, {
    components,
    props: {
        /**
         * whether the element should show the content in a minimized way.
         * TODO should probably be a different template to make it simpler?
         */
        isMinimized: {
            type: Boolean,
            optional: true,
        },
        rtcSessionLocalId: {
            type: String,
        },
    },
    template: 'mail.RtcCallParticipantCard',
});
