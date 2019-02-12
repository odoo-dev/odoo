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
            !this.props.threadCache ||
            (
                !this.props.threadCache.isLoaded &&
                !this.props.threadCache.isLoading
            )
        ) {
            this._loadThreadCache();
        }
        this.trigger('o-rendered');
    }

    patched() {
        if (
            !this.props.threadCache ||
            (
                !this.props.threadCache.isLoaded &&
                !this.props.threadCache.isLoading
            )
        ) {
            this._loadThreadCache();
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
     * @return {integer|undefined}
     */
    getScrollTop() {
        if (
            !this.props.threadCache ||
            !this.props.threadCache.isLoaded
        ) {
            return undefined;
        }
        return this.refs.messageList.getScrollTop();
    }

    //--------------------------------------------------------------------------
    // Private
    //--------------------------------------------------------------------------

    /**
     * @private
     */
    _loadThreadCache() {
        this.env.store.dispatch('loadThreadCache', this.props.threadLocalId, {
            searchDomain: this.props.domain,
        });
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
    const threadCacheLocalId = `${ownProps.threadLocalId}_${JSON.stringify(ownProps.domain || [])}`;
    const threadCache = state.threadCaches[threadCacheLocalId];
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
    isMobile: Boolean,
    order: String, // ['asc', 'desc']
    scrollTop: {
        type: Number,
        optional: true,
    },
    selectedMessageLocalId: {
        type: String,
        optional: true,
    },
    threadCacheLocalId: String,
    threadCache: {
        type: Object, // {mail.store.model.ThreadCache}
        optional: true,
    },
    threadLocalId: String,
};

return Thread;

});
