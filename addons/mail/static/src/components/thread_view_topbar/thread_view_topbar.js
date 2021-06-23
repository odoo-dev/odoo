/** @odoo-module **/

import useShouldUpdateBasedOnProps from '@mail/component_hooks/use_should_update_based_on_props/use_should_update_based_on_props';
import useStore from '@mail/component_hooks/use_store/use_store';
import PartnerSelector from '@mail/components/partner_selector/partner_selector';
import RtcController from '@mail/components/rtc_controller/rtc_controller';
import ThreadIcon from '@mail/components/thread_icon/thread_icon';

const { Component } = owl;

const { useRef } = owl.hooks;

const components = { PartnerSelector, RtcController, ThreadIcon };

export class ThreadViewTopbar extends Component {

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
                threadIsMemberListMakingSense: thread && thread.isMemberListMakingSense,
                threadModel: thread && thread.model,
                threadView,
                threadViewHasMemberList: threadView && threadView.hasMemberList,
                threadViewIsEditingThreadName: threadView && threadView.isEditingThreadName,
                threadViewIsMemberListOpened: threadView && threadView.isMemberListOpened,
                threadViewIsMouseOverThreadName: threadView && threadView.isMouseOverThreadName,
                threadViewMessagesLength: threadView && threadView.messages.length,
                threadViewPendingThreadName: threadView && threadView.pendingThreadName,
            };
        });
        /**
         * Reference to the thread name input (rename feature).
         * Useful to know when a click is done outside of it.
         */
        this._threadNameInputRef = useRef('threadNameInput');
        this._onClickCaptureGlobal = this._onClickCaptureGlobal.bind(this);
    }

    mounted() {
        document.addEventListener('click', this._onClickCaptureGlobal, true);
    }

    willUnmount() {
        document.removeEventListener('click', this._onClickCaptureGlobal, true);
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

    //--------------------------------------------------------------------------
    // Handlers
    //--------------------------------------------------------------------------

    /**
     * Must be done as capture to avoid stop propagation.
     *
     * @private
     * @param {MouseEvent} ev
     */
    _onClickCaptureGlobal(ev) {
        if (this._threadNameInputRef.el && this._threadNameInputRef.el.contains(ev.target)) {
            return;
        }
        this.threadView.onClickOutsideThreadNameInput(ev);
    }

    /**
     * @private
     * @param {Event} ev
     */
    _onInputThreadNameInput(ev) {
        this.threadView.onInputThreadNameInput(ev);
    }

    /**
     * @private
     * @param {Event} ev
     */
    _onKeyDownThreadNameInput(ev) {
        this.threadView.onKeyDownThreadNameInput(ev);
    }

}

Object.assign(ThreadViewTopbar, {
    components,
    props: {
        threadViewLocalId: String,
    },
    template: 'mail.ThreadViewTopbar',
});
