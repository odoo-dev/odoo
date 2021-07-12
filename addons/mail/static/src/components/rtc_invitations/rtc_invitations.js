/** @odoo-module **/

import { useModels } from '@mail/component_hooks/use_models/use_models';
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
    }

    //--------------------------------------------------------------------------
    // Getters / Setters
    //--------------------------------------------------------------------------

    /**
     * @returns {mail.thread[]}
     */
    get threads() {
        return this.env.messaging ? this.env.models['mail.thread'].all(thread => !!thread.rtcRingingPartner) : [];
    }
}

Object.assign(RtcInvitations, {
    components,
    props: {},
    template: 'mail.RtcInvitations',
});
