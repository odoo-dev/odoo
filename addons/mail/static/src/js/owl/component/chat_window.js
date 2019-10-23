odoo.define('mail.component.ChatWindow', function (require) {
'use strict';

const AutocompleteInput = require('mail.component.AutocompleteInput');
const Header = require('mail.component.ChatWindowHeader');
const Thread = require('mail.component.Thread');

const { Component, useState } = owl;
const { useDispatch, useGetters, useRef, useStore } = owl.hooks;

class ChatWindow extends Component {

    /**
     * @override
     * @param {...any} args
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
    // Getter / Setter
    //--------------------------------------------------------------------------

    /**
     * Get the content of placeholder for the autocomplete input of
     * 'new_message' chat window.
     *
     * @return {string}
     */
    get newMessageFormInputPlaceholder() {
        return this.env._t("Search user...");
    }

    //--------------------------------------------------------------------------
    // Public
    //--------------------------------------------------------------------------

    /**
     * Focus this chat window.
     */
    focus() {
        this.state.isFocused = true;
        if (!this.storeProps.thread) {
            this._inputRef.comp.focus();
        } else {
            this._threadRef.comp.focus();
        }
    }

    /**
     * Get the state of the chat window. Chat windows that have no thread do
     * not have any state, hence it returns `undefined`.
     *
     * @return {Object|undefined} with format:
     *  {
     *      composerAttachmentLocalIds: {Array},
     *      composerTextInputHtmlContent: {String},
     *      scrollTop: {integer}
     *  }
     */
    getState() {
        if (!this._threadRef.comp) {
            return;
        }
        const {
            attachmentLocalIds: composerAttachmentLocalIds,
            textInputHtmlContent: composerTextInputHtmlContent
        } = this._threadRef.comp.getComposerState();
        return {
            composerAttachmentLocalIds,
            composerTextInputHtmlContent,
            scrollTop: this._threadRef.comp.getScrollTop()
        };
    }

    /**
     * Determine whether this chat window is folded or not.
     *
     * @return {boolean}
     */
    isFolded() {
        if (this.storeProps.thread) {
            return this.storeProps.thread.state === 'folded';
        }
        return this.state.isFolded;
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

    /**
     * Focus out the chat window.
     *
     * @private
     */
    _focusout() {
        this.state.isFocused = false;
        if (!this.storeProps.thread) {
            this._inputRef.comp.focusout();
        } else {
            this._threadRef.comp.focusout();
        }
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
                type: 'chat'
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
        if (this.storeProps.isMobile) {
            return;
        }
        if (!this.storeProps.thread) {
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
        this.state.isFocused = true;
    }

    /**
     * Prevent auto-focus of fuzzy search in the home menu.
     * Useful in order to allow copy/paste content inside chat window with
     * CTRL-C & CTRL-V when on the home menu.
     *
     * @private
     * @param {KeyboardEvent} ev
     */
    _onKeydown(ev) {
        ev.stopPropagation();
        if (ev.key === 'Tab') {
            ev.preventDefault();
            this.trigger('o-focus-next-chat-window', {
                currentChatWindowLocalId: this.props.chatWindowLocalId,
            });
        }
    }

}

ChatWindow.components = { AutocompleteInput, Header, Thread };

ChatWindow.defaultProps = {
    dockDirection: 'rtl',
    dockOffset: 0,
    hasCloseAsBackButton: false,
    hasShiftLeft: false,
    hasShiftRight: false,
    isDocked: false,
    isExpandable: false,
    isFullscreen: false,
};

ChatWindow.props = {
    chatWindowLocalId: String,
    composerInitialAttachmentLocalIds: {
        type: Array,
        element: String,
        optional: true,
    },
    composerInitialTextInputHtmlContent: {
        type: String,
        optional: true,
    },
    dockDirection: {
        type: String,
        optional: true,
    },
    dockOffset: {
        type: Number,
        optional: true,
    },
    hasCloseAsBackButton: {
        type: Boolean,
        optional: true,
    },
    hasShiftLeft: {
        type: Boolean,
        optional: true,
    },
    hasShiftRight: {
        type: Boolean,
        optional: true,
    },
    isDocked: {
        type: Boolean,
        optional: true,
    },
    isExpandable: {
        type: Boolean,
        optional: true,
    },
    isFullscreen: {
        type: Boolean,
        optional: true,
    },
    threadInitialScrollTop: {
        type: Number,
        optional: true,
    },
};

ChatWindow.template = 'mail.component.ChatWindow';

return ChatWindow;

});
