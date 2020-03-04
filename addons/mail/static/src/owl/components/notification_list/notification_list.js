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
        const threads = this._useStoreThreads(state, props);
        const notifications = threads.map(thread => {
            return {
                threadLocalId: thread.localId,
                type: 'thread',
                uniqueId: thread.localId,
            };
        });
        return {
            isMobile: state.isMobile,
            notifications,
        };
    }
    /**
     * @private
     * @param {Object} state
     * @param {Object} props
     * @returns {Object[]} threads
     */
    _useStoreThreads(state, props) {
        if (props.filter === 'mailbox') {
            return this.storeGetters.mailboxList();
        } else if (props.filter === 'channel') {
            return this.storeGetters.channelList();
        } else if (props.filter === 'chat') {
            return this.storeGetters.chatList();
        } else if (props.filter === 'all') {
            // "All" filter is for channels and chats
            return this.storeGetters.mailChannelList();
        } else {
            throw new Error(`Unsupported filter ${props.filter}`);
        }
    }
}

Object.assign(NotificationList, {
    _allowedFilters: ['all', 'mailbox', 'channel', 'chat'],
    components: { ThreadPreview },
    defaultProps: {
        filter: 'all',
    },
    props: {
        filter: {
            type: String,
            validate: prop => NotificationList._allowedFilters.includes(prop),
        },
    },
    template: 'mail.component.NotificationList',
});

return NotificationList;

});
