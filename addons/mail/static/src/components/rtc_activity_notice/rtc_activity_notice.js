/** @odoo-module **/

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

    //--------------------------------------------------------------------------
    // Handlers
    //--------------------------------------------------------------------------

    _onClick(ev) {
        this.thread.open();
    }

}

Object.assign(RtcActivityNotice, {
    components,
    props: {},
    template: 'mail.RtcActivityNotice',
});
