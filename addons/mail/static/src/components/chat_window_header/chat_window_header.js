/** @odoo-module **/

import { useModels } from '@mail/component_hooks/use_models/use_models';
import { useShouldUpdateBasedOnProps } from '@mail/component_hooks/use_should_update_based_on_props/use_should_update_based_on_props';
import {
    isEventHandled,
    markEventHandled,
} from '@mail/utils/utils';
import { ThreadIcon } from '@mail/components/thread_icon/thread_icon';

const { Component } = owl;

const components = { ThreadIcon };

export class ChatWindowHeader extends Component {

    /**
     * @override
     */
    constructor(...args) {
        super(...args);
        useShouldUpdateBasedOnProps();
        useModels();
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
