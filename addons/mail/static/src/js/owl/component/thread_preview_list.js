odoo.define('mail.component.ThreadPreviewList', function (require) {
'use strict';

const ThreadPreview = require('mail.component.ThreadPreview');

class ThreadPreviewList extends owl.store.ConnectedComponent {

    /**
     * @param {...any} args
     */
    constructor(...args) {
        super(...args);
        this.components = { ThreadPreview };
        this.template = 'mail.component.ThreadPreviewList';
    }

    mounted() {
        this._loadPreviews();
    }

    //--------------------------------------------------------------------------
    // Public
    //--------------------------------------------------------------------------

    /**
     * @param {string} threadLocalId
     * @return {boolean}
     */
    isPreviewPartiallyVisible(threadLocalId) {
        return this.refs[threadLocalId].isPartiallyVisible();
    }

    /**
     * @param {string} threadLocalId
     */
    scrollToPreview(threadLocalId) {
        this.refs[threadLocalId].scrollIntoView();
    }

    //--------------------------------------------------------------------------
    // Private
    //--------------------------------------------------------------------------

    /**
     * @private
     */
    async _loadPreviews() {
        this.env.store.dispatch('loadThreadPreviews', this.props.threadLocalIds);
    }

    //--------------------------------------------------------------------------
    // Handlers
    //--------------------------------------------------------------------------

    /**
     * @private
     * @param {CustomEvent} ev
     * @param {Object} ev.detail
     * @param {string} ev.detail.threadLocalId
     */
    _onClickedPreview(ev) {
        this.trigger('o-select-thread', {
            threadLocalId: ev.detail.threadLocalId,
        });
    }
}

ThreadPreviewList.defaultProps = {
    filter: 'all',
};

/**
 * @param {Object} state
 * @param {Object} ownProps
 * @param {string} ownProps.filter
 * @param {Object} getters
 * @return {Object}
 */
ThreadPreviewList.mapStoreToProps = function (state, ownProps, getters) {
    let threadLocalIds;
    if (ownProps.filter === 'mailbox') {
        threadLocalIds = getters.mailboxList().map(mailbox => mailbox.localId);
    } else if (ownProps.filter === 'channel') {
        threadLocalIds = getters.channelList().map(channel => channel.localId);
    } else if (ownProps.filter === 'chat') {
        threadLocalIds = getters.chatList().map(chat => chat.localId);
    } else {
        // "All" filter is for channels and chats
        threadLocalIds = getters.mailChannelList().map(mailChannel => mailChannel.localId);
    }
    return {
        isMobile: state.isMobile,
        threadLocalIds,
    };
};

ThreadPreviewList.props = {
    filter: String, // ['all', 'mailbox', 'channel', 'chat']
    isMobile: Boolean,
    targetThreadLocalId: {
        type: String,
        optional: true,
    },
    threadLocalIds: {
        type: Array,
        element: String,
    },
};

return ThreadPreviewList;

});
