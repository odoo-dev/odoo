/** @odoo-module **/

import { useModels } from '@mail/component_hooks/use_models/use_models';
import { UserSettingWindow } from '@mail/components/user_setting_window/user_setting_window';

const { Component } = owl;

const components = {
    UserSettingWindow,
};

export class RtcCallParticipants extends Component {

    /**
     * @override
     */
    constructor(...args) {
        super(...args);
        useModels();
    }

    //--------------------------------------------------------------------------
    // Getters / Setters
    //--------------------------------------------------------------------------

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
     * @param {string} partnerId
     * @param {Event} ev
     */
    async _onLiveClick(partnerId, ev) {
        this.env.messaging.toggleFocusedVideoPartner(partnerId);
    }

}

Object.assign(RtcCallParticipants, {
    components,
    props: {
        threadLocalId: String,
    },
    template: 'mail.RtcCallParticipants',
});
