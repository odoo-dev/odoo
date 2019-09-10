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
        this.components = { Composer, MessageList };
        this.id = _.uniqueId('o_thread_');
        this.template = 'mail.component.Thread';
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

        if(this._messageListJustMounted)
        {
            this._handleInitialScroll();
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
        if(this._messageListJustMounted)
        {
            this._handleInitialScroll();
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

    /**
     * @param {integer} value
     */
    async setScrollTop(value) {
        await this.refs.messageList.setScrollTop(value);
    }

    //--------------------------------------------------------------------------
    // Private
    //--------------------------------------------------------------------------

    /**
     * Handle initial scroll value for message list subcomponent.
     * We need to this within thread as the scroll position for message list
     * can be affected by the composer component.
     * @private
     */
    async _handleInitialScroll(){
        if (this.refs.messageList) {
            if (this.props.initialScrollTop !== undefined) {
                await this.setScrollTop(this.props.initialScrollTop);
            } else if (
                this.props.isMessageListScrollToEndOnMount &&
                this.refs.messageList.messages.length > 0
            ) {
                await this._scrollToLastMessage();
            }
        }
        this._messageListJustMounted = false;
    }

    /**
     * @private
     */
    _loadThreadCache() {
        this.dispatch('loadThreadCache', this.props.threadLocalId, {
            searchDomain: this.props.domain,
        });
    }

    /**
     * @private
     */
    async _scrollToLastMessage() {
        await this.refs.messageList.scrollToLastMessage();
    }

    //--------------------------------------------------------------------------
    // Handlers
    //--------------------------------------------------------------------------

    /**
     * @private
     * @param {CustomEvent} ev
     */
    _onMessageListMounted(ev) {
        this._messageListJustMounted = true;
    }
}

Thread.defaultProps = {
    domain: [],
    hasComposer: false,
    haveMessagesAuthorRedirect: false,
    haveMessagesMarkAsReadIcon: false,
    haveMessagesReplyIcon: false,
    hasSquashCloseMessages: false,
    isMessageListScrollToEndOnMount: true,
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
    areComposerAttachmentsEditable: {
        type: Boolean,
        optional: true,
    },
    composerAttachmentLayout: {
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
    haveComposerAttachmentsLabelForCardLayout: {
        type: Boolean,
        optional: true,
    },
    haveMessagesAuthorRedirect: Boolean,
    haveMessagesMarkAsReadIcon: Boolean,
    haveMessagesReplyIcon: Boolean,
    initialScrollTop: {
        type: Number,
        optional: true
    },
    isMessageListScrollToEndOnMount: {
        type: Boolean,
        optional: true,
    },
    order: String, // ['asc', 'desc']
    selectedMessageLocalId: {
        type: String,
        optional: true,
    },
    threadLocalId: String,
};

return Thread;

});
