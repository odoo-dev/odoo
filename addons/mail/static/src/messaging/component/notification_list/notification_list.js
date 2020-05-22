odoo.define('mail.messaging.component.NotificationList', function (require) {
'use strict';

const components = {
    NotificationGroup: require('mail.messaging.component.NotificationGroup'),
    ThreadPreview: require('mail.messaging.component.ThreadPreview'),
};
const useStore = require('mail.messaging.component_hook.useStore');

const { Component } = owl;

class NotificationList extends Component {

    /**
     * @override
     */
    constructor(...args) {
        super(...args);
        this.storeProps = useStore((...args) => this._useStoreSelector(...args), {
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
    // Public
    //--------------------------------------------------------------------------

    /**
     * @returns {Object[]}
     */
    get notifications() {
        const { notifications } = this.storeProps;
        return notifications.map(notification =>
            notification.type === 'thread'
                ? Object.assign({}, notification, {
                    thread: this.env.entities.Thread.get(notification.uniqueId),
                })
                : notification
        );
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
        const threads = this.notifications
            .filter(notification => notification.thread)
            .map(notification => this.env.entities.Thread.get(notification.thread));
        this.env.entities.Thread.loadPreviews(threads);
    }

    /**
     * @private
     * @param {Object} props
     */
    _useStoreSelector(props) {
        const threads = this._useStoreSelectorThreads(props);
        let notifications = threads
            .sort((t1, t2) => {
                if (t1.message_unread_counter > 0 && t2.message_unread_counter === 0) {
                    return -1;
                }
                if (t1.message_unread_counter === 0 && t2.message_unread_counter > 0) {
                    return 1;
                }
                if (t1.lastMessage && t2.lastMessage) {
                    return t1.lastMessage.date.isBefore(t2.lastMessage.date) ? 1 : -1;
                }
                if (t1.lastMessage) {
                    return -1;
                }
                if (t2.lastMessage) {
                    return 1;
                }
                return t1.id < t2.id ? -1 : 1;
            })
            .map(thread => {
                return {
                    type: 'thread',
                    uniqueId: thread.localId,
                };
            });
        if (props.filter === 'all') {
            const notificationGroups = this.env.messaging.notificationGroupManager.groups;
            notifications = Object.values(notificationGroups)
                .sort((group1, group2) =>
                    group1.date.isAfter(group2.date) ? -1 : 1
                ).map(notificationGroup => {
                    return {
                        notificationGroup,
                        uniqueId: notificationGroup.localId,
                    };
                }).concat(notifications);
        }
        return {
            isDeviceMobile: this.env.messaging.device.isMobile,
            notifications,
        };
    }

    /**
     * @private
     * @param {Object} props
     * @throws {Error} in case `props.filter` is not supported
     * @returns {mail.messaging.entity.Thread[]}
     */
    _useStoreSelectorThreads(props) {
        if (props.filter === 'mailbox') {
            return this.env.entities.Thread
                .all(thread => thread.isPinned && thread.model === 'mail.box')
                .sort((mailbox1, mailbox2) => {
                    if (mailbox1.id === 'inbox') {
                        return -1;
                    }
                    if (mailbox2.id === 'inbox') {
                        return 1;
                    }
                    if (mailbox1.id === 'starred') {
                        return -1;
                    }
                    if (mailbox2.id === 'starred') {
                        return 1;
                    }
                    const mailbox1Name = mailbox1.displayName;
                    const mailbox2Name = mailbox2.displayName;
                    mailbox1Name < mailbox2Name ? -1 : 1;
                });
        } else if (props.filter === 'channel') {
            return this.env.entities.Thread
                .all(thread =>
                    thread.channel_type === 'channel' &&
                    thread.isPinned &&
                    thread.model === 'mail.channel'
                )
                .sort((c1, c2) => c1.displayName < c2.displayName ? -1 : 1);
        } else if (props.filter === 'chat') {
            return this.env.entities.Thread
                .all(thread =>
                    thread.channel_type === 'chat' &&
                    thread.isPinned &&
                    thread.model === 'mail.channel'
                )
                .sort((c1, c2) => c1.displayName < c2.displayName ? -1 : 1);
        } else if (props.filter === 'all') {
            // "All" filter is for channels and chats
            return this.env.entities.Thread
                .all(thread => thread.isPinned && thread.model === 'mail.channel')
                .sort((c1, c2) => c1.displayName < c2.displayName ? -1 : 1);
        } else {
            throw new Error(`Unsupported filter ${props.filter}`);
        }
    }

}

Object.assign(NotificationList, {
    _allowedFilters: ['all', 'mailbox', 'channel', 'chat'],
    components,
    defaultProps: {
        filter: 'all',
    },
    props: {
        filter: {
            type: String,
            validate: prop => NotificationList._allowedFilters.includes(prop),
        },
    },
    template: 'mail.messaging.component.NotificationList',
});

return NotificationList;

});
