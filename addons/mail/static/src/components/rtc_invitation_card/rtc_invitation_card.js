/** @odoo-module **/

import { useShouldUpdateBasedOnProps } from '@mail/component_hooks/use_should_update_based_on_props/use_should_update_based_on_props';
import { useModels } from '@mail/component_hooks/use_models/use_models';

const { Component } = owl;

export class RtcInvitationCard extends Component {

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
     * @returns {mail.thread}
     */
    get thread() {
        return this.env.models['mail.thread'].get(this.props.threadLocalId);
    }

    //--------------------------------------------------------------------------
    // Handlers
    //--------------------------------------------------------------------------

    async _onClickAccept(ev) {
        this.thread.open();
        await this.thread.toggleCall();
    }

    _onCLickAvatar(ev) {
        this.thread.open();
    }

    _onClickRefuse(ev) {
        this.thread.leaveCall();
    }

}

Object.assign(RtcInvitationCard, {
    props: {
        threadLocalId: String,
    },
    template: 'mail.RtcInvitationCard',
});
