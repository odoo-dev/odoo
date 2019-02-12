odoo.define('mail.component.ChatWindow', function (require) {
"use strict";

const AutocompleteInput = require('mail.component.AutocompleteInput');
const Header = require('mail.component.ChatWindowHeader');
const Thread = require('mail.component.Thread');

class ChatWindow extends owl.store.ConnectedComponent {

    /**
     * @param {...any} args
     */
    constructor(...args) {
        super(...args);
        this.components = { AutocompleteInput, Header, Thread };
        this.id = _.uniqueId('o_chatWindow_');
        this.state = {
            focused: false,
            folded: false, // used for 'new_message' chat window
        };
        this.template = 'mail.component.ChatWindow';

        this._globalCaptureFocusEventListener = ev => this._onFocusCaptureGlobal(ev);
        this._globalMousedownEventListener = ev => this._onMousedownGlobal(ev);
        // bind since passed as props
        this._onAutocompleteSelect = this._onAutocompleteSelect.bind(this);
        this._onAutocompleteSource = this._onAutocompleteSource.bind(this);
    }

    mounted() {
        if (this.props.isDocked) {
            this._applyDockOffset();
        }
        document.addEventListener('focus', this._globalCaptureFocusEventListener, true);
        document.addEventListener('mousedown', this._globalMousedownEventListener, false);
    }

    patched() {
        if (this.props.isDocked) {
            this._applyDockOffset();
        }
    }

    willUnmount() {
        document.removeEventListener('focus', this._globalCaptureFocusEventListener, true);
        document.removeEventListener('mousedown', this._globalMousedownEventListener);
    }

    //--------------------------------------------------------------------------
    // Getter / Setter
    //--------------------------------------------------------------------------

    /**
     * @return {string}
     */
    get newMessageFormInputPlaceholder() {
        return this.env._t("Search user...");
    }

    //--------------------------------------------------------------------------
    // Public
    //--------------------------------------------------------------------------

    focus() {
        this.state.focused = true;
        if (!this.props.thread) {
            this.refs.input.focus();
        } else {
            this.refs.thread.focus();
        }
    }

    /**
     * @return {boolean}
     */
    isFolded() {
        if (this.props.thread) {
            return this.props.thread.state === 'folded';
        }
        return this.state.folded;
    }

    //--------------------------------------------------------------------------
    // Private
    //--------------------------------------------------------------------------

    /**
     * @private
     */
    _applyDockOffset() {
        const offsetFrom = this.props.dockDirection === 'rtl' ? 'right' : 'left';
        const oppositeFrom = offsetFrom === 'right' ? 'left' : 'right';
        this.el.style[offsetFrom] = this.props.dockOffset + 'px';
        this.el.style[oppositeFrom] = 'auto';
    }

    /**
     * @private
     */
    _close() {
        this.trigger('o-close', {
            chatWindowLocalId: this.props.chatWindowLocalId,
        });
    }

    /**
     * @private
     */
    _focusout() {
        this.state.focused = false;
        if (!this.props.thread) {
            this.refs.input.focusout();
        } else {
            this.refs.thread.focusout();
        }
    }

    //--------------------------------------------------------------------------
    // Handlers
    //--------------------------------------------------------------------------

    /**
     * @private
     * @param {Event} ev
     * @param {Object} ui
     * @param {Object} ui.item
     * @param {integer} ui.item.id
     */
    _onAutocompleteSelect(ev, ui) {
        const partnerId = ui.item.id;
        const partnerLocalId = `res.partner_${partnerId}`;
        const chat = this.env.store.getters.chatFromPartner(partnerLocalId);
        if (chat) {
            this.trigger('o-select-thread', {
                chatWindowLocalId: this.props.chatWindowLocalId,
                threadLocalId: chat.localId,
            });
        } else {
            this._close();
            this.env.store.dispatch('createChannel', {
                autoselect: true,
                partnerId,
                type: 'chat'
            });
        }
    }

    /**
     * @private
     * @param {Object} req
     * @param {string} req.term
     * @param {function} res
     */
    _onAutocompleteSource(req, res) {
        return this.env.store.dispatch('searchPartners', {
            callback: (partners) => {
                const suggestions = partners.map(partner => {
                    return {
                        id: partner.id,
                        value: this.env.store.getters.partnerName(partner.localId),
                        label: this.env.store.getters.partnerName(partner.localId),
                    };
                });
                res(_.sortBy(suggestions, 'label'));
            },
            keyword: _.escape(req.term),
            limit: 10,
        });
    }

    /**
     * @private
     * @param {MouseEvent} ev
     */
    _onClick(ev) {
        if (this.state.focused && !this.isFolded()) {
            return;
        }
        if (this.isFolded()) {
            this.state.focused = true; // focus chat window but not input
        } else {
            this.focus();
        }
    }

    /**
     * @private
     * @param {CustomEvent} ev
     */
    _onClickedHeader(ev) {
        if (this.props.isMobile) {
            return;
        }
        if (!this.props.thread) {
            this.state.folded = !this.state.folded;
        } else {
            this.env.store.commit('toggleFoldThread', this.props.chatWindowLocalId);
        }
    }

    /**
     * @private
     * @param {CustomEvent} ev
     */
    _onCloseHeader(ev) {
        this._close();
    }

    /**
     * @private
     * @param {FocusEvent} ev
     */
    _onFocusCaptureGlobal(ev) {
        if (ev.target === this.el) {
            return;
        }
        if (ev.target.closest(`[data-id="${this.id}"]`)) {
            return;
        }
        this._focusout();
    }

    /**
     * @private
     * @param {FocusEvent} ev
     */
    _onFocusinThread(ev) {
        this.state.focused = true;
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

    /**
     * @private
     * @param {MouseEvent} ev
     */
    _onMousedownGlobal(ev) {
        if (!this.props.isDocked) {
            return;
        }
        if (ev.target === this.el) {
            return;
        }
        if (ev.target.closest(`[data-id="${this.id}"]`)) {
            return;
        }
        this._focusout();
    }
}

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

/**
 * @param {Object} state
 * @param {Object} ownProps
 * @param {string} ownProps.chatWindowLocalId
 * @return {Object}
 */
ChatWindow.mapStoreToProps = function (state, ownProps) {
    return {
        isMobile: state.isMobile,
        thread: state.threads[ownProps.chatWindowLocalId],
    };
};

ChatWindow.props = {
    chatWindowLocalId: String,
    dockDirection: String,
    dockOffset: Number,
    hasCloseAsBackButton: Boolean,
    hasShiftLeft: Boolean,
    hasShiftRight: Boolean,
    isDocked: Boolean,
    isExpandable: Boolean,
    isFullscreen: Boolean,
    isMobile: Boolean,
    thread: {
        type: Object, // {mail.store.model.Thread}
        optional: true,
    },
};

return ChatWindow;

});
