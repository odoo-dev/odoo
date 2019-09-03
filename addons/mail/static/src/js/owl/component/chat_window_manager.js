odoo.define('mail.component.ChatWindowManager', function (require) {
"use strict";

const ChatWindow = require('mail.component.ChatWindow');
const HiddenMenu = require('mail.component.ChatWindowHiddenMenu');

class ChatWindowManager extends owl.store.ConnectedComponent {

    /**
     * @param {...any} args
     */
    constructor(...args) {
        super(...args);
        this.DEBUG = true;
        // owl
        this.components = {
            ChatWindow,
            HiddenMenu,
        };
        this.template = 'mail.component.ChatWindowManager';
        // others
        this.TEXT_DIRECTION = this.env._t.database.parameters.direction;
        this._lastAutofocusedCounter = 0;
        this._lastAutofocusedChatWindowLocalId = undefined;
        if (this.DEBUG) {
            window.chat_window_manager = this;
        }
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
     * Return initial chat window states
     * @return {Object}
     */
    get initialStates() {
        return this.env.store.state.chatWindowManager.storedChatWindowStates;
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
     * @param {integer} index
     * @return {boolean}
     */
    chatWindowShiftRight(index) {
        return index < this.storeProps.computed.visible.length - 1;
    }

    saveChatWindowsState(){
        for(const chatWindowLocalId in this.refs){
            this.refs[chatWindowLocalId].saveState();
        }
    }

    //--------------------------------------------------------------------------
    // Private
    //--------------------------------------------------------------------------

    /**
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
            this.refs[this.storeProps.autofocusChatWindowLocalId].focus();
            handled = true;
        }
        if (
            !handled &&
            this._lastAutofocusedChatWindowLocalId === this.storeProps.autofocusChatWindowLocalId &&
            this._lastAutofocusedCounter !== this.storeProps.autofocusCounter
        ) {
            this.refs[this.storeProps.autofocusChatWindowLocalId].focus();
            handled = true;
        }
        if (
            !handled &&
            this._lastAutofocusedChatWindowLocalId !== this.storeProps.autofocusChatWindowLocalId
        ) {
            this.refs[this.storeProps.autofocusChatWindowLocalId].focus();
            handled = true;
        }
        this._lastAutofocusedChatWindowLocalId = this.storeProps.autofocusChatWindowLocalId;
        this._lastAutofocusedCounter = this.storeProps.autofocusCounter;
        this.dispatch('updateChatWindowManager', {
            notifiedAutofocusCounter: this._lastAutofocusedCounter,
        });
    }

    //--------------------------------------------------------------------------
    // Handlers
    //--------------------------------------------------------------------------

    /**
     * @private
     * @param {CustomEvent} ev
     * @param {string} ev.detail.currentChatWindowLocalId
     */
    _onFocusNextChatWindow(ev) {
        const orderedVisible = this.orderedVisible;
        if (orderedVisible.length === 1) {
            return;
        }

        const _getNextVisibleChatWindowIndex = index => {
            let nextIndex = index + 1;
            if (nextIndex > orderedVisible.length - 1) {
                nextIndex = 0;
            }
            return nextIndex;
        };

        const _getNextOpenVisibleChatWindowIndex = currentChatWindowIndex => {
            let nextIndex = _getNextVisibleChatWindowIndex(currentChatWindowIndex);
            let nextToFocusChatWindowLocalId = orderedVisible[nextIndex].chatWindowLocalId;

            while (this.refs[nextToFocusChatWindowLocalId].isFolded()) {
                nextIndex = _getNextVisibleChatWindowIndex(nextIndex);
                nextToFocusChatWindowLocalId = orderedVisible[nextIndex].chatWindowLocalId;
            }
            return nextIndex;
        };

        const currentChatWindowIndex = orderedVisible.findIndex(item =>
            item.chatWindowLocalId === ev.detail.currentChatWindowLocalId);
        const nextIndex = _getNextOpenVisibleChatWindowIndex(currentChatWindowIndex);
        this.dispatch('focusChatWindow', orderedVisible[nextIndex].chatWindowLocalId);
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
        this.dispatch('redirect', {
            ev,
            id: ev.detail.id,
            model: ev.detail.model,
        });
    }

    /**
     * @private
     * @param {CustomEvent} ev
     * @param {Object} ev.detail
     * @param {string} ev.detail.chatWindowLocalId
     */
    _onSelectChatWindow(ev) {
        this.dispatch('makeChatWindowVisible', ev.detail.chatWindowLocalId);
    }

    /**
     * @private
     * @param {CustomEvent} ev
     * @param {Object} ev.detail
     * @param {string} ev.detail.chatWindowLocalId
     * @param {string} ev.detail.threadLocalId
     */
    _onSelectThreadChatWindow(ev) {
        const { chatWindowLocalId, threadLocalId } = ev.detail;
        if (!this.env.store.state.threads[threadLocalId].is_minimized) {
            this.dispatch('openThread', threadLocalId, { chatWindowMode: 'last' });
        }
        this.dispatch('replaceChatWindow', chatWindowLocalId, threadLocalId);
    }
}

/**
 * @param {Object} state
 * @return {Object}
 */
ChatWindowManager.mapStoreToProps = function (state) {
    const {
        autofocusCounter,
        autofocusChatWindowLocalId,
        computed,
    } = state.chatWindowManager;
    return {
        autofocusCounter,
        autofocusChatWindowLocalId,
        computed,
        isMobile: state.isMobile,
    };
};

return ChatWindowManager;

});
