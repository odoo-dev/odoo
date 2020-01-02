odoo.define('mail.component.ThreadPreviewList', function (require) {
'use strict';

const ThreadPreview = require('mail.component.ThreadPreview');
const useStore = require('mail.hooks.useStore');

const { Component } = owl;
const { useDispatch, useGetters } = owl.hooks;

class ThreadPreviewList extends Component {

    /**
     * @override
     * @param {...any} args
     */
    constructor(...args) {
        super(...args);
        this.storeDispatch = useDispatch();
        this.storeGetters = useGetters();
        this.storeProps = useStore((state, props) => {
            let threadLocalIds;
            if (props.filter === 'mailbox') {
                threadLocalIds = this.storeGetters.mailboxList().map(mailbox => mailbox.localId);
            } else if (props.filter === 'channel') {
                threadLocalIds = this.storeGetters.channelList().map(channel => channel.localId);
            } else if (props.filter === 'chat') {
                threadLocalIds = this.storeGetters.chatList().map(chat => chat.localId);
            } else {
                // "All" filter is for channels and chats
                threadLocalIds = this.storeGetters.mailChannelList().map(mailChannel => mailChannel.localId);
            }
            return {
                isMobile: state.isMobile,
                threadLocalIds,
            };
        }, {
            compareDepth: {
                threadLocalIds: 1,
            },
        });
    }

    mounted() {
        this._loadPreviews();
    }

    //--------------------------------------------------------------------------
    // Private
    //--------------------------------------------------------------------------

    /**
     * Load previews of given thread. Basically consists of fetching all missing
     * last messages of each thread.
     *
     * @private
     */
    async _loadPreviews() {
        this.storeDispatch('loadThreadPreviews', this.storeProps.threadLocalIds);
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

ThreadPreviewList.components = { ThreadPreview };

ThreadPreviewList.defaultProps = {
    filter: 'all',
};

ThreadPreviewList.props = {
    filter: {
        type: String, // ['all', 'mailbox', 'channel', 'chat']
    },
};

ThreadPreviewList.template = 'mail.component.ThreadPreviewList';

return ThreadPreviewList;

});
