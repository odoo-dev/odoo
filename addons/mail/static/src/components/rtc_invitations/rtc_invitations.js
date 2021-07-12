/** @odoo-module **/

import { useModels } from '@mail/component_hooks/use_models/use_models';
import { useShouldUpdateBasedOnProps } from '@mail/component_hooks/use_should_update_based_on_props/use_should_update_based_on_props';
import { RtcInvitationCard } from '@mail/components/rtc_invitation_card/rtc_invitation_card';

const { Component } = owl;

const components = {
    RtcInvitationCard,
};

export class RtcInvitations extends Component {

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
     * @returns {mail.thread[]}
     */
    get threads() {
        return this.env.messaging && this.env.messaging.ringingThreads;
    }

}

Object.assign(RtcInvitations, {
    components,
    props: {},
    template: 'mail.RtcInvitations',
});
