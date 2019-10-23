odoo.define('mail.component.Thread', function (require) {
'use strict';

const Composer = require('mail.component.Composer');
const MessageList = require('mail.component.MessageList');

const { Component } = owl;
const { useDispatch, useRef, useStore } = owl.hooks;

class Thread extends Component {

    /**
     * @param {...any} args
     */
    constructor(...args) {
        super(...args);
        /**
         * Unique id of this thread component instance.
         * Useful to provide a unique id to composer instance, which is useful
         * to manage relations between composers and attachments.
         * AKU TODO: maybe composer itself can compute it???
         */
        this.id = _.uniqueId('o_thread_');
        this.storeDispatch = useDispatch();
        this.storeProps = useStore((state, props) => {
            const thread = state.threads[props.threadLocalId];
            const threadCacheLocalId = thread
                ? thread.cacheLocalIds[JSON.stringify(props.domain || [])]
                : undefined;
            const threadCache = threadCacheLocalId
                ? state.threadCaches[threadCacheLocalId]
                : undefined;
            return {
                isMobile: state.isMobile,
                threadCache,
                threadCacheLocalId,
            };
        });
        /**
         * Reference of the composer. Useful to set focus on composer when
         * thread has the focus.
         */
        this._composerRef = useRef('composer');
        /**
         * Reference of the message list. Useful to determine scroll positions.
         */
        this._messageListRef = useRef('messageList');
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
     * Get the state of the composer. This is useful to backup thread state on
     * re-mount.
     *
     * @return {Object|undefined}
     */
    getComposerState() {
        if (!this.props.hasComposer) {
            return;
        }
        return this._composerRef.comp.getState();
    }

    /**
     * Get the scroll position in the message list.
     *
     * @return {integer|undefined}
     */
    getScrollTop() {
        if (
            !this.storeProps.threadCache ||
            !this.storeProps.threadCache.isLoaded
        ) {
            return undefined;
        }
        return this._messageListRef.comp.getScrollTop();
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
        const messageList = this._messageListRef.comp;
        if (this.props.messageListInitialScrollTop !== undefined) {
            await messageList.setScrollTop(this.props.messageListInitialScrollTop);
        } else if (messageList.hasMessages()) {
            await messageList.scrollToLastMessage();
        }
    }

    /**
     * Load the thread cache, i.e. the thread at given domain for the messages.
     *
     * @private
     */
    _loadThreadCache() {
        this.storeDispatch('loadThreadCache', this.props.threadLocalId, {
            searchDomain: this.props.domain,
        });
    }

    //--------------------------------------------------------------------------
    // Handlers
    //--------------------------------------------------------------------------

    /**
     * Called when message list notifies it just has been mounted.
     *
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
    domain: [],
    hasComposer: false,
    haveMessagesAuthorRedirect: false,
    haveMessagesMarkAsReadIcon: false,
    haveMessagesReplyIcon: false,
    hasSquashCloseMessages: false,
    order: 'asc',
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
    threadLocalId: String,
};

Thread.template = 'mail.component.Thread';

return Thread;

});
