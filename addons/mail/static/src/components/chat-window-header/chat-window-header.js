/** @odoo-module alias=mail.components.ChatWindowHeader **/

import usingModels from 'mail.componentMixins.usingModels';
import isEventHandled from 'mail.utils.isEventHandled';
import markEventHandled from 'mail.utils.markEventHandled';

const { Component, QWeb } = owl;

class ChatWindowHeader extends usingModels(Component) {

    /**
     * @returns {string}
     */
    get shiftNextText() {
        if (this.env.services.model.messaging.locale(this).textDirection(this) === 'rtl') {
            return this.env._t("Shift left");
        }
        return this.env._t("Shift right");
    }

    /**
     * @returns {string}
     */
    get shiftPrevText() {
        if (this.env.services.model.messaging.locale(this).textDirection(this) === 'rtl') {
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
        this.env.services.action.dispatch(
            'ChatWindow/close',
            this.chatWindow,
        );
    }

    /**
     * @private
     * @param {MouseEvent} ev
     */
    _onClickExpand(ev) {
        ev.stopPropagation();
        this.env.services.action.dispatch(
            'ChatWindow/expand',
            this.chatWindow,
        );
    }

    /**
     * @private
     * @param {MouseEvent} ev
     */
    _onClickShiftNext(ev) {
        markEventHandled(ev, 'ChatWindowHeader.ClickShiftNext');
        this.chatWindow.shiftNext();
        this.env.services.action.dispatch(
            'ChatWindow/shiftNext',
            this.chatWindow,
        );
    }

    /**
     * @private
     * @param {MouseEvent} ev
     */
    _onClickShiftPrev(ev) {
        ev.stopPropagation();
        this.env.services.action.dispatch(
            'ChatWindow/shiftPrev',
            this.chatWindow,
        );
    }

}

Object.assign(ChatWindowHeader, {
    defaultProps: {
        hasCloseAsBackButton: false,
        isExpandable: false,
    },
    props: {
        chatWindow: {
            type: Object,
            validate(p) {
                if (p.constructor.modelName !== 'ChatWindow') {
                    return false;
                }
                return true;
            },
        },
        hasCloseAsBackButton: Boolean,
        isExpandable: Boolean,
    },
    template: 'mail.ChatWindowHeader',
});

QWeb.registerComponent('ChatWindowHeader', ChatWindowHeader);

export default ChatWindowHeader;
