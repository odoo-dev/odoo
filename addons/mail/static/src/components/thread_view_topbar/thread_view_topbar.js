/** @odoo-module **/

import useShouldUpdateBasedOnProps from '@mail/component_hooks/use_should_update_based_on_props/use_should_update_based_on_props';
import useStore from '@mail/component_hooks/use_store/use_store';
import PartnerSelector from '@mail/components/partner_selector/partner_selector';
import RtcController from '@mail/components/rtc_controller/rtc_controller';
import ThreadIcon from '@mail/components/thread_icon/thread_icon';

const { Component } = owl;

const components = { PartnerSelector, RtcController, ThreadIcon };

class ThreadViewTopbar extends Component {

    /**
     * @override
     */
    setup() {
        useShouldUpdateBasedOnProps();
        useStore(props => {
            const discuss = this.env.messaging && this.env.messaging.discuss;
            const threadView = this.env.models['mail.thread_view'].get(props.threadViewLocalId);
            const thread = threadView && threadView.thread;
            return {
                discussActiveMobileNavbarTabId: discuss && discuss.activeMobileNavbarTabId,
                inbox: this.env.messaging.inbox,
                starred: this.env.messaging.starred,
                thread,
                threadDescription: thread && thread.description,
                threadDisplayName: thread && thread.displayName,
                threadInvitePartnerList: thread && thread.invitePartnerList,
                threadModel: thread && thread.model,
                threadView,
                threadViewMessagesLength: threadView && threadView.messages.length,
            };
        });
    }

    //--------------------------------------------------------------------------
    // Public
    //--------------------------------------------------------------------------

    /**
     * @returns {mail.thread_view}
     */
    get threadView() {
        return this.env.models['mail.thread_view'].get(this.props.threadViewLocalId);
    }

    /**
     * @private
     */
    _onClickMobileNewChannelButton() {
        this.discuss.update({ isAddingChannel: true });
    }

    /**
     * @private
     */
    _onClickMobileNewMessageButton() {
        this.discuss.update({ isAddingChat: true });
    }

    /**
     * @private
     */
    _onClickUnstarAll() {
        this.env.models['mail.message'].unstarAll();
    }

    //--------------------------------------------------------------------------
    // Handlers
    //--------------------------------------------------------------------------

    /**
     * @private
     */
    _onClickMarkAllAsRead() {
        this.env.models['mail.message'].markAllAsRead();
    }

}

Object.assign(ThreadViewTopbar, {
    components,
    props: {
        threadViewLocalId: String,
    },
    template: 'mail.ThreadViewTopbar',
});

export default ThreadViewTopbar;
