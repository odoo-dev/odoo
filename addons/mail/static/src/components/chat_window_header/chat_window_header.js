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
                chatWindowName: chatWindow && chatWindow.name,
                isDeviceMobile: messaging.device.isMobile,
                isDeaf: mailRtc.isDeaf,
                sendDisplay: mailRtc.sendDisplay,
                sendSound: mailRtc.sendSound,
                sendUserVideo: mailRtc.sendUserVideo,
                thread,
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
        if (isEventHandled(ev, 'ChatWindowHeader.ClickShiftNext')) {
            return;
        }
        if (isEventHandled(ev, 'ChatWindowHeader.ClickShiftPrev')) {
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
        const ringChannelTypes = new Set(['chat']);
        const ringMembers = ringChannelTypes.has(this.chatWindow.thread.channel_type);
        await this.env.messaging.toggleCall({ threadLocalId: this.chatWindow.thread.localId, ringMembers });
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
