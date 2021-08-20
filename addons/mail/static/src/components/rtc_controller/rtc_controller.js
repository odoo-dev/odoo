/** @odoo-module **/

import { useModels } from '@mail/component_hooks/use_models/use_models';
import { useRefs } from '@mail/component_hooks/use_refs/use_refs';
import { useShouldUpdateBasedOnProps } from '@mail/component_hooks/use_should_update_based_on_props/use_should_update_based_on_props';

import { RtcOptionList } from '@mail/components/rtc_option_list/rtc_option_list';

const { Component } = owl;

const components = {
    RtcOptionList,
};

export class RtcController extends Component {

    /**
     * @override
     */
    constructor(...args) {
        super(...args);
        useModels();
        useShouldUpdateBasedOnProps();
        this._getRefs = useRefs();
    }

    //--------------------------------------------------------------------------
    // Getters / Setters
    //--------------------------------------------------------------------------

    /**
     * @returns {mail.thread}
     */
    get rtcSession() {
        return this.env.messaging && this.env.messaging.mailRtc.currentRtcSession;
    }

    /**
     * @returns {mail.thread}
     */
    get thread() {
        return this.env.models['mail.thread'].get(this.props.threadLocalId);
    }

    //--------------------------------------------------------------------------
    // Handlers
    //--------------------------------------------------------------------------

    /**
     * @private
     * @param {MouseEvent} ev
     */
    async _onClickCallToggleVideo(ev) {
        await this.thread.toggleCall({
            startWithVideo: true,
        });
    }

    /**
     * @private
     * @param {MouseEvent} ev
     */
    async _onClickCallToggleAudio(ev) {
        await this.thread.toggleCall();
    }

    /**
     * @private
     * @param {MouseEvent} ev
     */
    _onClickCamera(ev) {
        this.env.messaging.mailRtc.toggleUserVideo();
    }

    /**
     * @private
     * @param {MouseEvent} ev
     */
    async _onClickDeafen(ev) {
        await this.rtcSession.toggleDeaf();
    }

    /**
     * @private
     * @param {MouseEvent} ev
     */
    _onClickMicrophone(ev) {
        this.env.messaging.mailRtc.toggleMicrophone();
    }

    /**
     * @private
     * @param {MouseEvent} ev
     */
    _onClickScreen(ev) {
        this.env.messaging.mailRtc.toggleScreenShare();
    }

}

Object.assign(RtcController, {
    components,
    props: {
        small: {
            type: Boolean,
            optional: true,
        },
        threadLocalId: {
            type: String,
        },
    },
    template: 'mail.RtcController',
});
