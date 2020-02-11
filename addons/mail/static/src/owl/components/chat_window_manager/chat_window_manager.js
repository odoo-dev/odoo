odoo.define('mail.component.ChatWindowManager', function (require) {
'use strict';

const ChatWindow = require('mail.component.ChatWindow');
const HiddenMenu = require('mail.component.ChatWindowHiddenMenu');
const useRefs = require('mail.hooks.useRefs');
const useStore = require('mail.hooks.useStore');

const { Component } = owl;
const { useDispatch } = owl.hooks;

class ChatWindowManager extends Component {

    /**
     * @override
     * @param {...any} args
     */
    constructor(...args) {
        super(...args);
        this.TEXT_DIRECTION = this.env._t.database.parameters.direction;
        this._getRefs = useRefs();
        this.storeDispatch = useDispatch();
        this.storeProps = useStore(state => {
            // TODO SEB transform into storeProps.chatWindowManager...
            const {
                autofocusCounter,
                autofocusChatWindowLocalId,
                chatWindowInitialScrollTops,
                computed,
            } = state.chatWindowManager;
            return {
                autofocusCounter,
                autofocusChatWindowLocalId,
                chatWindowInitialScrollTops,
                computed,
                isMobile: state.isMobile,
            };
        });
        /**
         * Attributes that are used to track last autofocused chat window.
         * This is useful to determine if we must autofocus a chat window on
         * store changes. Tracking only last autofocused chat window is not
         * enough in some cases:
         *   - opening a new chat window from messaging menu opens chat window
         *     and auto-focuses it, but this should only occur once
         *   - opening an existing chat window from messaging menu should
         *     auto-focus this chat window, even if it was the last autofocused
         *     chat window and the user focused it out.
         */
        this._lastAutofocusedCounter = 0;
        this._lastAutofocusedChatWindowLocalId = undefined;
    }

    mounted() {
        this._handleAutofocus();
    }

    patched() {
        this._handleAutofocus();
    }

    //--------------------------------------------------------------------------
    // Getter / Setter
    //--------------------------------------------------------------------------

    /**
     * Determine the direction of chat windows positions.
     *
     * @return {string} either 'rtl' or 'ltr'
     */
    get direction() {
        if (this.TEXT_DIRECTION === 'rtl') {
            return 'ltr';
        } else {
            return 'rtl';
        }
    }

    /**
     * Return list of chat ids ordered by DOM position,
     * i.e. from left to right with this.TEXT_DIRECTION = 'rtl'.
     *
     * @return {Array}
     */
    get orderedVisible() {
        return [...this.storeProps.computed.visible].reverse();
    }

    //--------------------------------------------------------------------------
    // Public
    //--------------------------------------------------------------------------

    /**
     * Determine whether the chat window at given index should have shift right
     * command. Right-most chat window should not have this command.
     *
     * @param {integer} index
     * @return {boolean}
     */
    chatWindowShiftRight(index) {
        return index < this.storeProps.computed.visible.length - 1;
    }

    /**
     * Save the scroll positions of chat windows in the store. This happens
     * when chat window manager has to be re-mounted, but the scroll positions
     * should be recovered.
     */
    saveChatWindowsScrollTops() {
        const chatWindowsWithThreadRefs = Object.entries(this._getRefs())
            .filter(([refId, ref]) => refId.startsWith('chatWindow_'))
            .map(([refId, ref]) => ref);
        for (const chatWindowRef of chatWindowsWithThreadRefs) {
            chatWindowRef.saveScrollTop();
        }
    }

    //--------------------------------------------------------------------------
    // Private
    //--------------------------------------------------------------------------

    /**
     * Cycles to the next possible chat window starting from the
     * `currentChatWindowLocalId`, following the natural order based on the
     * current text direction, and with the possibility to `reverse` based on
     * the given parameter.
     *
     * @private
     * @param {integer} currentChatWindowLocalId
     * @param {Object} [param1={}]
     * @param {boolean} [param1.reverse=false]
     */
    _cycleNextChatWindow(currentChatWindowLocalId, { reverse = false } = {}) {
        const orderedVisible = this.orderedVisible;
        if (orderedVisible.length <= 1) {
            return;
        }

        /**
         * Return index of next visible chat window of a given visible chat
         * window index. The direction of "next" chat window depends on
         * `reverse` option.
         *
         * @param {integer} index
         * @return {integer}
         */
        const _getNextIndex = index => {
            const directionOffset = reverse ? -1 : 1;
            let nextIndex = index + directionOffset;
            if (nextIndex > orderedVisible.length - 1) {
                nextIndex = 0;
            }
            if (nextIndex < 0) {
                nextIndex = orderedVisible.length - 1;
            }
            return nextIndex;
        };

        const currentChatWindowIndex = orderedVisible.findIndex(
            item => item.chatWindowLocalId === currentChatWindowLocalId
        );

        let nextIndex = _getNextIndex(currentChatWindowIndex);
        let nextToFocusChatWindowLocalId = orderedVisible[nextIndex].chatWindowLocalId;
        while (this._getChatWindowRef(nextToFocusChatWindowLocalId).isFolded()) {
            nextIndex = _getNextIndex(nextIndex);
            nextToFocusChatWindowLocalId = orderedVisible[nextIndex].chatWindowLocalId;
        }

        this.storeDispatch('focusChatWindow', orderedVisible[nextIndex].chatWindowLocalId);
    }
    /**
     * Get references of all chat windows. Useful to set auto-focus when
     * necessary.
     *
     * @private
     * @return {mail.component.ChatWindow}
     */
    _getChatWindowRef(chatWindowLocalId) {
        return this._getRefs()[`chatWindow_${chatWindowLocalId}`];
    }

    /**
     * Handle auto-focus of chat windows based on most recent store operation.
     * For instance, when opening a new chat window, it should auto-focus it
     * on mount. There are other scenarios like auto-focusing an existing chat
     * window, which is why auto-focus is dependent of the process flow. We
     * should trust the store with autofocus properties.
     *
     * @private
     */
    _handleAutofocus() {
        let handled = false;
        const dcwm = this.env.store.state.chatWindowManager;
        const lastNotifiedAutofocusCounter = dcwm.notifiedAutofocusCounter;
        if (this.storeProps.isMobile) {
            handled = true; // never autofocus in mobile
        }
        if (
            !handled &&
            this.storeProps.autofocusCounter === lastNotifiedAutofocusCounter
        ) {
            handled = true;
        }
        if (
            !handled &&
            this._lastAutofocusedChatWindowLocalId === this.storeProps.autofocusChatWindowLocalId &&
            this._lastAutofocusedCounter === this.storeProps.autofocusCounter
        ) {
            handled = true;
        }
        if (
            !handled &&
            this._lastAutofocusedChatWindowLocalId === undefined
        ) {
            this._getChatWindowRef(this.storeProps.autofocusChatWindowLocalId).focus();
            handled = true;
        }
        if (
            !handled &&
            this._lastAutofocusedChatWindowLocalId === this.storeProps.autofocusChatWindowLocalId &&
            this._lastAutofocusedCounter !== this.storeProps.autofocusCounter
        ) {
            this._getChatWindowRef(this.storeProps.autofocusChatWindowLocalId).focus();
            handled = true;
        }
        if (
            !handled &&
            this._lastAutofocusedChatWindowLocalId !== this.storeProps.autofocusChatWindowLocalId
        ) {
            this._getChatWindowRef(this.storeProps.autofocusChatWindowLocalId).focus();
            handled = true;
        }
        this._lastAutofocusedChatWindowLocalId = this.storeProps.autofocusChatWindowLocalId;
        this._lastAutofocusedCounter = this.storeProps.autofocusCounter;
        this.storeDispatch('setChatWindowManagerNotifiedAutofocusCounter', this._lastAutofocusedCounter);
    }

    //--------------------------------------------------------------------------
    // Handlers
    //--------------------------------------------------------------------------

    /**
     * Called when a chat window asks to focus the next chat window.
     *
     * @private
     * @param {CustomEvent} ev
     * @param {string} ev.detail.currentChatWindowLocalId
     */
    _onFocusNextChatWindow(ev) {
        this._cycleNextChatWindow(ev.detail.currentChatWindowLocalId);
    }
    /**
     * Called when a chat window asks to focus the previous chat window.
     *
     * @private
     * @param {CustomEvent} ev
     * @param {string} ev.detail.currentChatWindowLocalId
     */
    _onFocusPreviousChatWindow(ev) {
        this._cycleNextChatWindow(ev.detail.currentChatWindowLocalId, { reverse: true });
    }

    /**
     * TODO: almost duplicate code with
     *
     *  - Discuss._onRedirect()
     *
     * @private
     * @param {CustomEvent} ev
     * @param {Object} ev.detail
     * @param {integer} ev.detail.id
     * @param {string} ev.detail.model
     */
    _onRedirect(ev) {
        this.storeDispatch('redirect', {
            id: ev.detail.id,
            model: ev.detail.model,
        });
    }

    /**
     * Called when hidden menu asks to select a chat window, i.e. make it
     * visible.
     *
     * @private
     * @param {CustomEvent} ev
     * @param {Object} ev.detail
     * @param {string} ev.detail.chatWindowLocalId
     */
    _onSelectChatWindow(ev) {
        this.storeDispatch('makeChatWindowVisible', ev.detail.chatWindowLocalId);
    }

    /**
     * Called when the 'new_message' chat window asks to select a chat window.
     * It should replace this 'new_message' chat window.
     *
     * @private
     * @param {CustomEvent} ev
     * @param {Object} ev.detail
     * @param {string} ev.detail.chatWindowLocalId
     * @param {string} ev.detail.threadLocalId
     */
    _onSelectThreadChatWindow(ev) {
        const { chatWindowLocalId, threadLocalId } = ev.detail;
        if (!this.env.store.state.threads[threadLocalId].is_minimized) {
            this.storeDispatch('openThread', threadLocalId, { chatWindowMode: 'last' });
        }
        this.storeDispatch('replaceChatWindow', chatWindowLocalId, threadLocalId);
    }
}

Object.assign(ChatWindowManager, {
    components: { ChatWindow, HiddenMenu },
    template: 'mail.component.ChatWindowManager',
});

return ChatWindowManager;

});
