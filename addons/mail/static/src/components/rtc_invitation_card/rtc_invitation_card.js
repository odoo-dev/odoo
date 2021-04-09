/** @odoo-module **/

import useStore from '@mail/component_hooks/use_store/use_store';

const { Component } = owl;

class RtcInvitationCard extends Component {

    /**
     * @override
     */
    constructor(...args) {
        super(...args);
        useStore(props => {
            const thread = this.env.models['mail.thread'].get(props.threadLocalId);
            return {
                thread,
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
        return this.env.models['mail.thread'].get(this.props.threadLocalId);
    }

    //--------------------------------------------------------------------------
    // Handlers
    //--------------------------------------------------------------------------

    async _onClickAccept(ev) {
        this.thread.open();
        await this.env.messaging.toggleCall({ threadLocalId: this.thread.localId });
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

export default RtcInvitationCard;
