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
     * Return list of chat ids ordered by DOM position,
     * i.e. from left to right with this.TEXT_DIRECTION = 'rtl'.
     *
     * @return {Array}
     */
    get orderedVisible() {
        return [...this.props.computed.visible].reverse();
    }

    //--------------------------------------------------------------------------
    // Public
    //--------------------------------------------------------------------------

    /**
     * @param {integer} index
     * @return {boolean}
     */
    chatWindowShiftRight(index) {
        return index < this.props.computed.visible.length - 1;
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
        if (
            !handled &&
            this.props.autofocusCounter === lastNotifiedAutofocusCounter
        ) {
            handled = true;
        }
        if (
            !handled &&
            this._lastAutofocusedChatWindowLocalId === this.props.autofocusChatWindowLocalId &&
            this._lastAutofocusedCounter === this.props.autofocusCounter
        ) {
            handled = true;
        }
        if (
            !handled &&
            this._lastAutofocusedChatWindowLocalId === undefined
        ) {
            this.refs[this.props.autofocusChatWindowLocalId].focus();
            handled = true;
        }
        if (
            !handled &&
            this._lastAutofocusedChatWindowLocalId === this.props.autofocusChatWindowLocalId &&
            this._lastAutofocusedCounter !== this.props.autofocusCounter
        ) {
            this.refs[this.props.autofocusChatWindowLocalId].focus();
            handled = true;
        }
        if (
            !handled &&
            this._lastAutofocusedChatWindowLocalId !== this.props.autofocusChatWindowLocalId
        ) {
            this.refs[this.props.autofocusChatWindowLocalId].focus();
            handled = true;
        }
        this._lastAutofocusedChatWindowLocalId = this.props.autofocusChatWindowLocalId;
        this._lastAutofocusedCounter = this.props.autofocusCounter;
        this.env.store.commit('updateChatWindowManager', {
            notifiedAutofocusCounter: this._lastAutofocusedCounter,
        });
    }

    //--------------------------------------------------------------------------
    // Handlers
    //--------------------------------------------------------------------------

    /**
     * @private
     * @param {CustomEvent} ev
     * @param {Object} ev.detail
     * @param {string} ev.detail.chatWindowLocalId
     */
    _onCloseChatWindow(ev) {
        this.env.store.commit('closeChatWindow', ev.detail.chatWindowLocalId);
    }

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
        this.env.store.commit('focusChatWindow', orderedVisible[nextIndex].chatWindowLocalId);
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
    async _onRedirect(ev) {
        const { id, model } = ev.detail;
        if (model === 'mail.channel') {
            ev.stopPropagation();
            const threadLocalId = `${model}_${id}`;
            const channel = this.env.store.state.threads[threadLocalId];
            if (!channel) {
                this.env.store.dispatch('joinChannel', id, {
                    autoselect: true,
                });
                return;
            }
            this.env.store.commit('openThread', threadLocalId);
            return;
        }
        if (model === 'res.partner') {
            if (id === this.env.session.partner_id) {
                this.env.do_action({
                    type: 'ir.actions.act_window',
                    res_model: 'res.partner',
                    views: [[false, 'form']],
                    res_id: id,
                });
                return;
            }
            const partnerLocalId = `res.partner_${id}`;
            let partner = this.env.store.state.partners[partnerLocalId];
            if (!partner) {
                this.env.store.commit('insertPartner', { id });
                partner = this.env.store.state.partners[partnerLocalId];
            }
            if (partner.userId === undefined) {
                // rpc to check that
                await this.env.store.dispatch('checkPartnerIsUser', partnerLocalId);
            }
            if (partner.userId === null) {
                // partner is not a user, open document instead
                this.env.do_action({
                    type: 'ir.actions.act_window',
                    res_model: 'res.partner',
                    views: [[false, 'form']],
                    res_id: partner.id,
                });
                return;
            }
            ev.stopPropagation();
            const chat = this.env.store.getters.chatFromPartner(`res.partner_${id}`);
            if (!chat) {
                this.env.store.dispatch('createChannel', {
                    autoselect: true,
                    partnerId: id,
                    type: 'chat',
                });
                return;
            }
            this.env.store.commit('openThread', chat.localId);
        }
    }

    /**
     * @private
     * @param {CustomEvent} ev
     * @param {Object} ev.detail
     * @param {string} ev.detail.chatWindowLocalId
     */
    _onSelectChatWindow(ev) {
        this.env.store.commit('makeChatWindowVisible', ev.detail.chatWindowLocalId);
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
            this.env.store.commit('openThread', threadLocalId, { chatWindowMode: 'last' });
        }
        this.env.store.commit('replaceChatWindow', chatWindowLocalId, threadLocalId);
    }

    /**
     * @private
     * @param {CustomEvent} ev
     * @param {Object} ev.detail
     * @param {string} ev.detail.chatWindowLocalId
     */
    _onShiftLeftChatWindow(ev) {
        this.env.store.commit('shiftLeftChatWindow', ev.detail.chatWindowLocalId);
    }

    /**
     * @private
     * @param {CustomEvent} ev
     * @param {Object} ev.detail
     * @param {string} ev.detail.chatWindowLocalId
     */
    _onShiftRightChatWindow(ev) {
        this.env.store.commit('shiftRightChatWindow', ev.detail.chatWindowLocalId);
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

ChatWindowManager.props = {
    autofocusCounter: Number,
    autofocusChatWindowLocalId: String,
    computed: {
        type: Object,
        shape: {
            availableVisibleSlots: Number,
            hidden: {
                type: Object,
                shape: {
                    chatWindowLocalIds: {
                        type: Array,
                        element: String,
                    },
                    isVisible: Boolean,
                    offset: Number,
                },
            },
            visible: {
                type: Array,
                element: {
                    type: Object,
                    shape: {
                        chatWindowLocalIds: String,
                        offset: Number,
                    },
                },
            },
        },
    },
    isMobile: Boolean,
};

return ChatWindowManager;

});
