/** @odoo-module **/

import useRefs from '@mail/component_hooks/use_refs/use_refs';
import useStore from '@mail/component_hooks/use_store/use_store';
import RtcController from '@mail/components/rtc_controller/rtc_controller';
import RtcInvitations from '@mail/components/rtc_invitations/rtc_invitations';

const { Component } = owl;
const { useState } = owl.hooks;

const components = {
    RtcController,
    RtcInvitations
};

class RtcActivityNotice extends Component {

    /**
     * @override
     */
    constructor(...args) {
        super(...args);
        useStore(props => {
            const messaging = this.env.messaging;
            return {
                activeCallThreadLocalId: messaging.activeCallThreadLocalId,
            };
        });
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

export default RtcActivityNotice;
