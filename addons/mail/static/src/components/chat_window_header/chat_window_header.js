/** @odoo-module **/

import useShouldUpdateBasedOnProps from '@mail/component_hooks/use_should_update_based_on_props/use_should_update_based_on_props';
import useStore from '@mail/component_hooks/use_store/use_store';
import {
    isEventHandled,
    markEventHandled,
} from '@mail/utils/utils';
import ThreadIcon from '@mail/components/thread_icon/thread_icon';

const { Component } = owl;

const components = { ThreadIcon };

class ChatWindowHeader extends Component {

    /**
     * @override
     */
    constructor(...args) {
        super(...args);
        useShouldUpdateBasedOnProps();
        useStore(props => {
            const chatWindow = this.env.models['mail.chat_window'].get(props.chatWindowLocalId);
            const thread = chatWindow && chatWindow.thread;
            const mailRtc = this.env.mailRtc;
            const messaging = this.env.messaging;
            return {
                activeCallThreadLocalId: messaging.activeCallThreadLocalId,
                chatWindow,
                chatWindowHasShiftNext: chatWindow && chatWindow.hasShiftNext,
                chatWindowHasShiftPrev: chatWindow && chatWindow.hasShiftPrev,
                chatWindowIsMemberListOpened: chatWindow && chatWindow.isMemberListOpened,
                chatWindowName: chatWindow && chatWindow.name,
                isDeaf: mailRtc && mailRtc.isDeaf,
                isDeviceMobile: messaging.device.isMobile,
                sendDisplay: mailRtc && mailRtc.sendDisplay,
                sendSound: mailRtc && mailRtc.sendSound,
                sendUserVideo: mailRtc && mailRtc.sendUserVideo,
                thread,
                threadIsMemberListMakingSense: thread && thread.isMemberListMakingSense,
                threadLocalMessageUnreadCounter: thread && thread.localMessageUnreadCounter,
                threadMassMailing: thread && thread.mass_mailing,
                threadModel: thread && thread.model,
            };
        });
    }

    //--------------------------------------------------------------------------
    // Public
    //--------------------------------------------------------------------------

    /**
     * @returns {mail.chat_window}
     */
    get chatWindow() {
        return this.env.models['mail.chat_window'].get(this.props.chatWindowLocalId);
    }

    /**
     * @returns {string}
     */
    get shiftNextText() {
        if (this.env.messaging.locale.textDirection === 'rtl') {
            return this.env._t("Shift left");
        }
        return this.env._t("Shift right");
    }

    /**
     * @returns {string}
     */
    get shiftPrevText() {
        if (this.env.messaging.locale.textDirection === 'rtl') {
            return this.env._t("Shift right");
        }
        return this.env._t("Shift left");
    }

    //--------------------------------------------------------------------------
    // Handlers
    //--------------------------------------------------------------------------

    /**
     * @private
     * @param {MouseEvent} ev
     */
    _onClick(ev) {
        if (
            isEventHandled(ev, 'ChatWindowHeader.ClickShiftNext') ||
            isEventHandled(ev, 'ChatWindowHeader.ClickShiftPrev') ||
            isEventHandled(ev, 'ChatWindow.onClickHideMemberList') ||
            isEventHandled(ev, 'ChatWindow.onClickShowMemberList')
        ) {
            return;
        }
        const chatWindow = this.chatWindow;
        this.trigger('o-clicked', { chatWindow });
    }

    /**
     * @private
     * @param {MouseEvent} ev
     */
    _onClickClose(ev) {
        ev.stopPropagation();
        if (!this.chatWindow) {
            return;
        }
        this.chatWindow.close();
    }

    _onClickDeafen(ev) {
        ev.stopPropagation();
        this.env.mailRtc.toggleDeaf();
    }

    _onClickMicrophone(ev) {
        ev.stopPropagation();
        this.env.mailRtc.toggleMicrophone();
    }

    _onClickCamera(ev) {
        ev.stopPropagation();
        this.env.mailRtc.toggleUserVideo();
    }

    _onClickScreen(ev) {
        ev.stopPropagation();
        this.env.mailRtc.toggleScreenShare();
    }

    async _onClickPhone(ev) {
        ev.stopPropagation();
        await this.env.messaging.toggleCall({ threadLocalId: this.chatWindow.thread.localId });
    }

    /**
     * @private
     * @param {MouseEvent} ev
     */
    _onClickExpand(ev) {
        ev.stopPropagation();
        this.chatWindow.expand();
    }

    /**
     * Indirection necessary because of lack of ev in template: https://github.com/odoo/owl/issues/572
     *
     * @private
     * @param {MouseEvent} ev
     */
    _onClickHideMemberList(ev) {
        this.chatWindow.onClickHideMemberList(ev);
    }

    /**
     * @private
     * @param {MouseEvent} ev
     */
    _onClickShiftPrev(ev) {
        markEventHandled(ev, 'ChatWindowHeader.ClickShiftPrev');
        this.chatWindow.shiftPrev();
    }

    /**
     * @private
     * @param {MouseEvent} ev
     */
    _onClickShiftNext(ev) {
        markEventHandled(ev, 'ChatWindowHeader.ClickShiftNext');
        this.chatWindow.shiftNext();
    }

    /**
     * Indirection necessary because of lack of ev in template: https://github.com/odoo/owl/issues/572
     *
     * @private
     * @param {MouseEvent} ev
     */
    _onClickShowMemberList(ev) {
        this.chatWindow.onClickShowMemberList(ev);
    }
}

Object.assign(ChatWindowHeader, {
    components,
    defaultProps: {
        hasCloseAsBackButton: false,
        isExpandable: false,
    },
    props: {
        chatWindowLocalId: String,
        hasCloseAsBackButton: Boolean,
        isExpandable: Boolean,
    },
    template: 'mail.ChatWindowHeader',
});

export default ChatWindowHeader;
