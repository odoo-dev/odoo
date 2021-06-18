/** @odoo-module **/

import useStore from '@mail/component_hooks/use_store/use_store';
import UserSettingWindow from '@mail/components/user_setting_window/user_setting_window';

const { Component } = owl;

const components = {
    UserSettingWindow
};

class RtcCallParticipants extends Component {

    /**
     * @override
     */
    constructor(...args) {
        super(...args);
        useStore(props => {
            const mailRtc = this.env.mailRtc;
            const messaging = this.env.messaging;
            const thread = this.env.models['mail.thread'].get(props.threadLocalId);
            return {
                activeAudioStreams: mailRtc && mailRtc.activeAudioStreams,
                activeCallThreadLocalId: messaging.activeCallThreadLocalId,
                activeVideoStreams: mailRtc && mailRtc.activeVideoStreams,
                connectionStates: mailRtc && mailRtc.connectionStates,
                focusedVideoPartner: messaging.focusedVideoPartner,
                isUserSettingWindowOpen: messaging.userSetting.isOpen,
                partnerIds: thread.callParticipants,
                peerToken: messaging.currentPartner.peerToken,
                sendSound: mailRtc && mailRtc.sendSound,
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

export default RtcCallParticipants;
