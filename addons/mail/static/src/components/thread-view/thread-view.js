/** @odoo-module alias=mail.components.ThreadView **/

import useUpdate from 'mail.componentHooks.useUpdate';
import usingModels from 'mail.componentMixins.usingModels';

const { Component, QWeb } = owl;
const { useRef } = owl.hooks;

class ThreadView extends usingModels(Component) {

    /**
     * @param {...any} args
     */
    constructor(...args) {
        super(...args);
        useUpdate({ func: () => this._update() });
        /**
         * Reference of the composer. Useful to set focus on composer when
         * thread has the focus.
         */
        this._composerRef = useRef('composer');
        /**
         * Reference of the message list. Useful to determine scroll positions.
         */
        this._messageListRef = useRef('messageList');
    }

    //--------------------------------------------------------------------------
    // Public
    //--------------------------------------------------------------------------

    /**
     * Focus the thread. If it has a composer, focus it.
     */
    focus() {
        if (!this._composerRef.comp) {
            return;
        }
        this._composerRef.comp.focus();
    }

    /**
     * Focusout the thread.
     */
    focusout() {
        if (!this._composerRef.comp) {
            return;
        }
        this._composerRef.comp.focusout();
    }

    /**
     * Get the scroll height in the message list.
     *
     * @returns {integer|undefined}
     */
    getScrollHeight() {
        if (!this._messageListRef.comp) {
            return undefined;
        }
        return this._messageListRef.comp.getScrollHeight();
    }

    /**
     * Get the scroll position in the message list.
     *
     * @returns {integer|undefined}
     */
    getScrollTop() {
        if (!this._messageListRef.comp) {
            return undefined;
        }
        return this._messageListRef.comp.getScrollTop();
    }

    /**
     * @param {MouseEvent} ev
     */
    onScroll(ev) {
        if (!this._messageListRef.comp) {
            return;
        }
        this._messageListRef.comp.onScroll(ev);
    }

    //--------------------------------------------------------------------------
    // Private
    //--------------------------------------------------------------------------

    /**
     * Called when thread component is mounted or patched.
     *
     * @private
     */
    _update() {
        this.trigger('o-rendered');
    }

    //--------------------------------------------------------------------------
    // Handlers
    //--------------------------------------------------------------------------

    /**
     * @private
     */
    _onClickRetryLoadMessages() {
        if (!this.threadView) {
            return;
        }
        if (!this.threadView.$$$threadCache(this)) {
            return;
        }
        this.env.services.action.dispatch('Record/update',
            this.threadView.$$$threadCache(this),
            { $$$hasLoadingFailed: false },
        );
    }

}

Object.assign(ThreadView, {
    defaultProps: {
        composerAttachmentsDetailsMode: 'auto',
        hasComposer: false,
        hasMessageCheckbox: false,
        hasSquashCloseMessages: false,
        haveMessagesMarkAsReadIcon: false,
        haveMessagesReplyIcon: false,
        isDoFocus: false,
        order: 'asc',
        showComposerAttachmentsExtensions: true,
        showComposerAttachmentsFilenames: true,
    },
    props: {
        composerAttachmentsDetailsMode: {
            type: String,
            validate: prop => ['auto', 'card', 'hover', 'none'].includes(prop),
        },
        hasComposer: Boolean,
        hasComposerCurrentPartnerAvatar: {
            type: Boolean,
            optional: true,
        },
        hasComposerSendButton: {
            type: Boolean,
            optional: true,
        },
        /**
         * If set, determines whether the composer should display status of
         * members typing on related thread. When this prop is not provided,
         * it defaults to composer component default value.
         */
        hasComposerThreadTyping: {
            type: Boolean,
            optional: true,
        },
        hasMessageCheckbox: Boolean,
        hasScrollAdjust: {
            type: Boolean,
            optional: true,
        },
        hasSquashCloseMessages: Boolean,
        haveMessagesMarkAsReadIcon: Boolean,
        haveMessagesReplyIcon: Boolean,
        /**
         * Determines whether this should become focused.
         */
        isDoFocus: Boolean,
        order: {
            type: String,
            validate: prop => ['asc', 'desc'].includes(prop),
        },
        selectedMessage: {
            type: Object,
            optional: true,
            validate(p) {
                if (p.constructor.modelName !== 'Message') {
                    return false;
                }
                return true;
            },
        },
        showComposerAttachmentsExtensions: Boolean,
        showComposerAttachmentsFilenames: Boolean,
        threadView: {
            type: Object,
            validate(p) {
                if (p.constructor.modelName !== 'ThreadView') {
                    return false;
                }
                return true;
            },
        },
    },
    template: 'mail.ThreadView',
});

QWeb.registerComponent('ThreadView', ThreadView);

export default ThreadView;
