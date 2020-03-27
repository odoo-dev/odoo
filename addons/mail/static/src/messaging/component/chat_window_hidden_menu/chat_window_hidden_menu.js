odoo.define('mail.messaging.component.ChatWindowHiddenMenu', function (require) {
'use strict';

const components = {
    ChatWindowHeader: require('mail.messaging.component.ChatWindowHeader'),
};
const useStore = require('mail.messaging.component_hook.useStore');

const { Component, useState } = owl;
const { useRef } = owl.hooks;

class ChatWindowHiddenMenu extends Component {

    /**
     * @override
     */
    constructor(...args) {
        super(...args);
        this.state = useState({ isOpen: false });
        this.storeProps = useStore((state, props) => {
            return {
                threads: props.chatWindowLocalIds
                    .filter(chatWindowLocalId => chatWindowLocalId !== 'new_message')
                    .map(chatWindowLocalId => state.threads[chatWindowLocalId]),
            };
        }, {
            compareDepth: {
                threads: 1,
            },
        });
        this._onClickCaptureGlobal = this._onClickCaptureGlobal.bind(this);
        /**
         * Reference of the dropup list. Useful to auto-set max height based on
         * browser screen height.
         */
        this._listRef = useRef('list');
    }

    mounted() {
        this._apply();
        document.addEventListener('click', this._onClickCaptureGlobal, true);
    }

    patched() {
        this._apply();
    }

    willUnmount() {
        document.removeEventListener('click', this._onClickCaptureGlobal, true);
    }

    //--------------------------------------------------------------------------
    // Public
    //--------------------------------------------------------------------------

    /**
     * @returns {integer}
     */
    get unreadCounter() {
        return this.storeProps.threads.reduce((count, thread) => {
            count += thread.message_unread_counter > 0 ? 1 : 0;
            return count;
        }, 0);
    }

    //--------------------------------------------------------------------------
    // Private
    //--------------------------------------------------------------------------

    /**
     * @private
     */
    _apply() {
        this._applyListHeight();
        this._applyOffset();
    }

    /**
     * @private
     */
    _applyListHeight() {
        this._listRef.el.style['max-height'] = `${this.props.GLOBAL_HEIGHT / 2}px`;
    }

    /**
     * @private
     */
    _applyOffset() {
        const offsetFrom = this.props.direction === 'rtl' ? 'right' : 'left';
        const oppositeFrom = offsetFrom === 'right' ? 'left' : 'right';
        this.el.style[offsetFrom] = `${this.props.offset}px`;
        this.el.style[oppositeFrom] = 'auto';
    }

    //--------------------------------------------------------------------------
    // Handlers
    //--------------------------------------------------------------------------

    /**
     * Closes the menu when clicking outside.
     * Must be done as capture to avoid stop propagation.
     *
     * @private
     * @param {MouseEvent} ev
     */
    _onClickCaptureGlobal(ev) {
        if (this.el.contains(ev.target)) {
            return;
        }
        this.state.isOpen = false;
    }

    /**
     * @private
     * @param {MouseEvent} ev
     */
    _onClickToggle(ev) {
        ev.stopPropagation();
        this.state.isOpen = !this.state.isOpen;
    }

    /**
     * @private
     * @param {CustomEvent} ev
     * @param {Object} ev.detail
     * @param {string} ev.detail.chatWindowLocalId
     */
    _onCloseChatWindow(ev) {
        ev.stopPropagation();
        this.trigger('o-close-chat-window', {
            chatWindowLocalId: ev.detail.chatWindowLocalId,
        });
    }

    /**
     * @private
     * @param {CustomEvent} ev
     * @param {Object} ev.detail
     * @param {string} ev.detail.chatWindowLocalId
     */
    _onClickedChatWindow(ev) {
        this.trigger('o-select-chat-window', {
            chatWindowLocalId: ev.detail.chatWindowLocalId,
        });
        this.state.isOpen = false;
    }

}

Object.assign(ChatWindowHiddenMenu, {
    components,
    defaultProps: {
        direction: 'rtl',
    },
    props: {
        chatWindowLocalIds: {
            type: Array,
            element: String,
        },
        direction: {
            // TODO FIXME add validation
            type: String,
        },
        offset: Number,
    },
    template: 'mail.messaging.component.ChatWindowHiddenMenu',
});

return ChatWindowHiddenMenu;

});
