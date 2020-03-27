odoo.define('mail.messaging.component.ChatWindow', function (require) {
'use strict';

const components = {
    AutocompleteInput: require('mail.messaging.component.AutocompleteInput'),
    ChatWindowHeader: require('mail.messaging.component.ChatWindowHeader'),
    ThreadViewer: require('mail.messaging.component.ThreadViewer'),
};
const useStore = require('mail.messaging.component_hook.useStore');

const { Component, useState } = owl;
const { useDispatch, useGetters, useRef } = owl.hooks;

class ChatWindow extends Component {

    /**
     * @override
     */
    constructor(...args) {
        super(...args);
        this.state = useState({
            /**
             * Determine whether the chat window is focused or not. Useful for
             * visual clue.
             */
            isFocused: false,
            /**
             * Only used for 'new_message': determine whether the chat window
             * if folded or not. Chat window with a thread rely on fold state
             * of the thread.
             */
            isFolded: false,
        });
        this.storeDispatch = useDispatch();
        this.storeGetters = useGetters();
        this.storeProps = useStore((state, props) => {
            return {
                isMobile: state.isMobile,
                thread: state.threads[props.chatWindowLocalId],
            };
        });
        /**
         * Reference of the autocomplete input (new_message chat window only).
         * Useful when focusing this chat window, which consists of focusing
         * this input.
         */
        this._inputRef = useRef('input');
        /**
         * Reference of thread in the chat window (chat window with thread
         * only). Useful when focusing this chat window, which consists of
         * focusing this thread. Will likely focus the composer of thread, if
         * it has one!
         */
        this._threadRef = useRef('thread');

        // the following are passed as props to children
        this._onAutocompleteSelect = this._onAutocompleteSelect.bind(this);
        this._onAutocompleteSource = this._onAutocompleteSource.bind(this);
    }

    mounted() {
        if (this.props.isDocked) {
            this._applyDockOffset();
        }
    }

    patched() {
        if (this.props.isDocked) {
            this._applyDockOffset();
        }
    }

    //--------------------------------------------------------------------------
    // Public
    //--------------------------------------------------------------------------

    /**
     * Get the content of placeholder for the autocomplete input of
     * 'new_message' chat window.
     *
     * @returns {string}
     */
    get newMessageFormInputPlaceholder() {
        return this.env._t("Search user...");
    }
    /**
     * Focus this chat window.
     */
    focus() {
        this.state.isFocused = true;
        if (!this.thread) {
            this._inputRef.comp.focus();
        } else {
            this._threadRef.comp.focus();
        }
    }

    /**
     * Determine whether this chat window is folded or not.
     *
     * @returns {boolean}
     */
    isFolded() {
        if (this.thread) {
            return this.thread.state === 'folded';
        }
        return this.state.isFolded;
    }

    /**
     * Save the scroll positions of the chat window in the store.
     * This is useful in order to remount chat windows and keep previous
     * scroll positions. This is necessary because when toggling on/off
     * home menu, the chat windows have to be remade from scratch.
     */
    saveScrollTop() {
        if (this.props.chatWindowLocalId === 'new_message') {
            return;
        }
        this.storeDispatch('saveChatWindowScrollTop',
            this.props.chatWindowLocalId,
            this._threadRef.comp.getScrollTop()
        );
    }

    /**
     * @returns {mail.messaging.entity.Thread|undefined}
     */
    get thread() {
        return this.storeProps.thread;
    }

    //--------------------------------------------------------------------------
    // Private
    //--------------------------------------------------------------------------

    /**
     * Apply visual position of the chat window.
     *
     * @private
     */
    _applyDockOffset() {
        const offsetFrom = this.props.dockDirection === 'rtl' ? 'right' : 'left';
        const oppositeFrom = offsetFrom === 'right' ? 'left' : 'right';
        this.el.style[offsetFrom] = this.props.dockOffset + 'px';
        this.el.style[oppositeFrom] = 'auto';
    }

    //--------------------------------------------------------------------------
    // Handlers
    //--------------------------------------------------------------------------

    /**
     * Called when selecting an item in the autocomplete input of the
     * 'new_message' chat window.
     *
     * @private
     * @param {Event} ev
     * @param {Object} ui
     * @param {Object} ui.item
     * @param {integer} ui.item.id
     */
    _onAutocompleteSelect(ev, ui) {
        const partnerId = ui.item.id;
        const partnerLocalId = `res.partner_${partnerId}`;
        const chat = this.storeGetters.chatFromPartner(partnerLocalId);
        if (chat) {
            this.trigger('o-select-thread', {
                chatWindowLocalId: this.props.chatWindowLocalId,
                threadLocalId: chat.localId,
            });
        } else {
            this.storeDispatch('closeChatWindow', this.props.chatWindowLocalId);
            this.storeDispatch('createChannel', {
                autoselect: true,
                partnerId,
                type: 'chat',
            });
        }
    }

    /**
     * Called when typing in the autocomplete input of the 'new_message' chat
     * window.
     *
     * @private
     * @param {Object} req
     * @param {string} req.term
     * @param {function} res
     */
    _onAutocompleteSource(req, res) {
        return this.storeDispatch('searchPartners', {
            callback: (partners) => {
                const suggestions = partners.map(partner => {
                    return {
                        id: partner.id,
                        value: this.storeGetters.partnerName(partner.localId),
                        label: this.storeGetters.partnerName(partner.localId),
                    };
                });
                res(_.sortBy(suggestions, 'label'));
            },
            keyword: _.escape(req.term),
            limit: 10,
        });
    }

    /**
     * Handle focus of the chat window based on position of click. The click on
     * chat window that folds it should NOT set focus on this chat window.
     *
     * @private
     * @param {MouseEvent} ev
     */
    _onClick(ev) {
        ev.stopPropagation();
        if (this.state.isFocused && !this.isFolded()) {
            return;
        }
        if (this.isFolded()) {
            this.state.isFocused = true; // focus chat window but not input
        } else {
            this.focus();
        }
    }

    /**
     * Called when clicking on header of chat window. Usually folds the chat
     * window.
     *
     * @private
     * @param {CustomEvent} ev
     */
    _onClickedHeader(ev) {
        ev.stopPropagation();
        if (this.storeProps.isMobile) {
            return;
        }
        if (!this.thread) {
            this.state.isFolded = !this.state.isFolded;
        } else {
            this.storeDispatch('toggleFoldThread', this.props.chatWindowLocalId);
        }
    }

    /**
     * Called when an element in the thread becomes focused.
     *
     * @private
     * @param {FocusEvent} ev
     */
    _onFocusinThread(ev) {
        ev.stopPropagation();
        this.state.isFocused = true;
    }

    /**
     * Focus out the chat window.
     *
     * @private
     */
    _onFocusout() {
        this.state.isFocused = false;
        if (!this.thread) {
            this._inputRef.comp.focusout();
        } else {
            this._threadRef.comp.focusout();
        }
    }

    /**
     * @private
     * @param {KeyboardEvent} ev
     */
    _onKeydown(ev) {
        /**
         * Prevent auto-focus of fuzzy search in the home menu.
         * Useful in order to allow copy/paste content inside chat window with
         * CTRL-C & CTRL-V when on the home menu.
         */
        ev.stopPropagation();
        switch (ev.key) {
            case 'Tab':
                ev.preventDefault();
                if (ev.shiftKey) {
                    this.trigger('o-focus-previous-chat-window', {
                        currentChatWindowLocalId: this.props.chatWindowLocalId,
                    });
                } else {
                    this.trigger('o-focus-next-chat-window', {
                        currentChatWindowLocalId: this.props.chatWindowLocalId,
                    });
                }
                break;
            case 'Escape':
                ev.preventDefault();
                this.storeDispatch('closeChatWindow', this.props.chatWindowLocalId);
                break;
        }
    }

}

Object.assign(ChatWindow, {
    components,
    defaultProps: {
        dockDirection: 'rtl',
        dockOffset: 0,
        hasCloseAsBackButton: false,
        hasShiftLeft: false,
        hasShiftRight: false,
        isDocked: false,
        isExpandable: false,
        isFullscreen: false,
    },
    props: {
        chatWindowLocalId: String,
        dockDirection: String,
        dockOffset: Number,
        hasCloseAsBackButton: Boolean,
        hasShiftLeft: Boolean,
        hasShiftRight: Boolean,
        isDocked: Boolean,
        isExpandable: Boolean,
        isFullscreen: Boolean,
        threadInitialScrollTop: {
            type: Number,
            optional: true,
        },
    },
    template: 'mail.messaging.component.ChatWindow',
});

return ChatWindow;

});
