odoo.define('mail.component.NotificationList', function (require) {
'use strict';

const ThreadPreview = require('mail.component.ThreadPreview');
const useStore = require('mail.hooks.useStore');

const { Component } = owl;
const { useDispatch, useGetters } = owl.hooks;

class NotificationList extends Component {

    /**
     * @override
     * @param {...any} args
     */
    constructor(...args) {
        super(...args);
        this.storeDispatch = useDispatch();
        this.storeGetters = useGetters();
        this.storeProps = useStore((...args) => this._useStore(...args), {
            compareDepth: {
                // list + notification object created in useStore
                notifications: 2,
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
        this.storeDispatch('loadThreadPreviews',
            this.storeProps.notifications
                .filter(notification => notification.threadLocalId)
                .map(notification => notification.threadLocalId)
        );
    }

    /**
     * @private
     */
    _useStore(state, props) {
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
        const notifications = threadLocalIds.map(threadLocalId => {
            return {
                threadLocalId,
                type: 'thread',
                uniqueId: threadLocalId,
            };
        });
        return {
            isMobile: state.isMobile,
            notifications,
        };
    }
}

Object.assign(NotificationList, {
    components: { ThreadPreview },
    defaultProps: {
        filter: 'all',
    },
    props: {
        filter: {
            type: String,
            validate: prop => ['all', 'mailbox', 'channel', 'chat'].includes(prop),
        },
    },
    template: 'mail.component.NotificationList',
});

return NotificationList;

});
