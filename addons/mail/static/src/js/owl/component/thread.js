odoo.define('mail.component.Thread', function (require) {
'use strict';

const Composer = require('mail.component.Composer');
const MessageList = require('mail.component.MessageList');

class Thread extends owl.store.ConnectedComponent {

    /**
     * @param {...any} args
     */
    constructor(...args) {
        super(...args);
        this.id = _.uniqueId('o_thread_');
        this.template = 'mail.component.Thread';
        /**
         * Track when message list has been mounted. Message list should notify
         * by means of `o-message-list-mounted` custom event, so that next
         * `mounted()` or `patched()` call set the scroll position of message
         * list. @see messageListInitialScrollTop prop definitions.
         */
        this._isMessageListJustMounted = false;
    }

    mounted() {
        if (
            !this.storeProps.threadCache ||
            (
                !this.storeProps.threadCache.isLoaded &&
                !this.storeProps.threadCache.isLoading
            )
        ) {
            this._loadThreadCache();
        }
        if (this._isMessageListJustMounted) {
            this._isMessageListJustMounted = false;
            this._handleMessageListScrollOnMount();
        }
        this.trigger('o-rendered');
    }

    patched() {
        if (
            !this.storeProps.threadCache ||
            (
                !this.storeProps.threadCache.isLoaded &&
                !this.storeProps.threadCache.isLoading
            )
        ) {
            this._loadThreadCache();
        }
        if (this._isMessageListJustMounted) {
            this._isMessageListJustMounted = false;
            this._handleMessageListScrollOnMount();
        }
        this.trigger('o-rendered');
    }

    //--------------------------------------------------------------------------
    // Public
    //--------------------------------------------------------------------------

    focus() {
        if (!this.refs.composer) {
            return;
        }
        this.refs.composer.focus();
    }

    focusout() {
        if (!this.refs.composer) {
            return;
        }
        this.refs.composer.focusout();
    }

    /**
     * Get the state of the composer. This is useful to backup thread state on
     * re-mount.
     *
     * @return {Object|undefined}
     */
    getComposerState() {
        if (!this.props.hasComposer) {
            return;
        }
        return this.refs.composer.getState();
    }

    /**
     * @return {integer|undefined}
     */
    getScrollTop() {
        if (
            !this.storeProps.threadCache ||
            !this.storeProps.threadCache.isLoaded
        ) {
            return undefined;
        }
        return this.refs.messageList.getScrollTop();
    }

    //--------------------------------------------------------------------------
    // Private
    //--------------------------------------------------------------------------

    /**
     * Handle initial scroll value for message list subcomponent.
     * We need to this within thread as the scroll position for message list
     * can be affected by the composer component.
     *
     * @private
     */
    async _handleMessageListScrollOnMount() {
        const messageList = this.refs.messageList;
        if (this.props.messageListInitialScrollTop !== undefined) {
            await messageList.setScrollTop(this.props.messageListInitialScrollTop);
        } else if (messageList.hasMessages()) {
            await messageList.scrollToLastMessage();
        }
    }

    /**
     * @private
     */
    _loadThreadCache() {
        this.dispatch('loadThreadCache', this.props.threadLocalId, {
            searchDomain: this.props.domain,
        });
    }

    //--------------------------------------------------------------------------
    // Handlers
    //--------------------------------------------------------------------------

    /**
     * @private
     * @param {CustomEvent} ev
     */
    _onMessageListMounted(ev) {
        this._isMessageListJustMounted = true;
    }
}

Thread.components = {
    Composer,
    MessageList,
};

Thread.defaultProps = {
    composerAttachmentDetailsMode: 'auto',
    domain: [],
    hasComposer: false,
    haveMessagesAuthorRedirect: false,
    haveMessagesMarkAsReadIcon: false,
    haveMessagesReplyIcon: false,
    hasSquashCloseMessages: false,
    showComposerAttachmentsExtensions: true,
    showComposerAttachmentsFilenames: true,
    order: 'asc',
};

/**
 * @param {Object} state
 * @param {Object} ownProps
 * @param {Array} [ownProps.domain=[]]
 * @param {string} ownProps.threadLocalId
 * @return {Object}
 */
Thread.mapStoreToProps = function (state, ownProps) {
    const thread = state.threads[ownProps.threadLocalId];
    const threadCacheLocalId = thread
        ? thread.cacheLocalIds[JSON.stringify(ownProps.domain || [])]
        : undefined;
    const threadCache = threadCacheLocalId
        ? state.threadCaches[threadCacheLocalId]
        : undefined;
    return {
        isMobile: state.isMobile,
        threadCache,
        threadCacheLocalId,
    };
};

Thread.props = {
    areComposerAttachmentsEditable: { // FIXME never used
        type: Boolean,
        optional: true,
    },
    composerAttachmentsDetailsMode: { // ['auto', 'card', 'hover', 'none']
        type: String,
        optional: true,
    },
    composerInitialAttachmentLocalIds: {
        type: Array,
        element: String,
        optional: true,
    },
    composerInitialTextInputHtmlContent: {
        type: String,
        optional: true,
    },
    domain: Array,
    hasComposer: Boolean,
    hasComposerCurrentPartnerAvatar: {
        type: Boolean,
        optional: true,
    },
    hasComposerSendButton: {
        type: Boolean,
        optional: true,
    },
    hasSquashCloseMessages: Boolean,
    haveMessagesAuthorRedirect: Boolean,
    haveMessagesMarkAsReadIcon: Boolean,
    haveMessagesReplyIcon: Boolean,
    /**
     * Set the initial scroll position of message list on mount. Note that
     * this prop is not directly passed to message list as props because
     * it may compute scroll top without composer, and then composer may alter
     * them on mount. To solve this issue, thread handles setting initial scroll
     * positions, so that this is always done after composer has been mounted.
     * (child `mounted()` are called before parent `mounted()`)
     */
    messageListInitialScrollTop: {
        type: Number,
        optional: true
    },
    order: String, // ['asc', 'desc']
    selectedMessageLocalId: {
        type: String,
        optional: true,
    },
    showComposerAttachmentsExtensions: {
        type: Boolean,
        optional: true,
    },
    showComposerAttachmentsFilenames: {
        type: Boolean,
        optional: true,
    },
    threadLocalId: String,
};

return Thread;

});
