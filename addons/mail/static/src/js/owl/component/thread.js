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
        if(this._isMessageListJustMounted)
        {
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
        if (this.props.messageListInitialScrollTop !== undefined) {
            await this.refs.messageList.setScrollTop(this.props.messageListInitialScrollTop);
        } else if (this.refs.messageList.hasMessages()) {
            await this.refs.messageList.scrollToLastMessage();
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

Thread.defaultProps = {
    domain: [],
    hasComposer: false,
    haveMessagesAuthorRedirect: false,
    haveMessagesMarkAsReadIcon: false,
    haveMessagesReplyIcon: false,
    hasSquashCloseMessages: false,
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
    messageListInitialScrollTop: {
        type: Number,
        optional: true
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
