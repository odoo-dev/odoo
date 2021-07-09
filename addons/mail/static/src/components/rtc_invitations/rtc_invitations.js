/** @odoo-module **/

import useStore from '@mail/component_hooks/use_store/use_store';
import RtcInvitationCard from '@mail/components/rtc_invitation_card/rtc_invitation_card';

const { Component } = owl;

const components = {
    RtcInvitationCard
};

class RtcInvitations extends Component {

    /**
     * @override
     */
    constructor(...args) {
        super(...args);
        useStore(props => {
            const threads = this.env.messaging && this.env.messaging.allThreads.filter(thread => !!thread.rtcRingingPartner);
            return {
                threads: threads ? threads.map(thread => thread.__state) : [],
            };
        });
    }

    //--------------------------------------------------------------------------
    // Getters / Setters
    //--------------------------------------------------------------------------

    /**
     * @returns {mail.thread[]}
     */
    get threads() {
        return this.env.messaging ? this.env.messaging.allThreads.filter(thread => !!thread.rtcRingingPartner) : [];
    }
}

Object.assign(RtcInvitations, {
    components,
    props: {},
    template: 'mail.RtcInvitations',
});

export default RtcInvitations;
