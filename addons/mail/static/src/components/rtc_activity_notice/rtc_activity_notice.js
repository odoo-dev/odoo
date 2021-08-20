/** @odoo-module **/

import { useShouldUpdateBasedOnProps } from '@mail/component_hooks/use_should_update_based_on_props/use_should_update_based_on_props';

import { useModels } from '@mail/component_hooks/use_models/use_models';
import { RtcController } from '@mail/components/rtc_controller/rtc_controller';
import { RtcInvitations } from '@mail/components/rtc_invitations/rtc_invitations';

const { Component } = owl;

const components = {
    RtcController,
    RtcInvitations,
};

export class RtcActivityNotice extends Component {

    /**
     * @override
     */
    constructor(...args) {
        super(...args);
        useModels();
        useShouldUpdateBasedOnProps();
    }

    //--------------------------------------------------------------------------
    // Getters / Setters
    //--------------------------------------------------------------------------

    /**
     * @returns {mail.thread|undefined}
     */
    get thread() {
        return this.env.messaging && this.env.messaging.mailRtc.channel;
    }

    //--------------------------------------------------------------------------
    // Handlers
    //--------------------------------------------------------------------------

    /**
     * @private
     * @param {MouseEvent} ev
     */
    _onClick(ev) {
        this.thread.open();
    }

}

Object.assign(RtcActivityNotice, {
    components,
    props: {},
    template: 'mail.RtcActivityNotice',
});
