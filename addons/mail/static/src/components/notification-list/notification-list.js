/** @odoo-module alias=mail.components.NotificationList **/

import useStore from 'mail.componentHooks.useStore';
import usingModels from 'mail.componentMixins.usingModels';

const { Component, QWeb } = owl;

class NotificationList extends usingModels(Component) {

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
        return notifications;
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
            .filter(
                notification => (
                    notification.thread &&
                    this.env.services.action.dispatch('Record/get', notification.localId)
                ),
            )
            .map(notification => notification.thread);
        this.env.services.action.dispatch('Thread/loadPreviews', threads);
    }

    /**
     * @private
     * @param {Object} props
     */
    _useStoreSelector(props) {
        const threads = this._useStoreSelectorThreads(props);
        let threadNeedactionNotifications = [];
        if (props.filter === 'all') {
            // threads with needactions
            threadNeedactionNotifications = this.env.services.action.dispatch('Thread/all',
                    t => (
                        t.$$$model(this) !== 'mail.box' &&
                        t.$$$needactionMessagesAsOriginThread(this).length > 0
                    ),
                )
                .sort(
                    (t1, t2) => {
                        if (
                            t1.$$$needactionMessagesAsOriginThread(this).length > 0 &&
                            t2.$$$needactionMessagesAsOriginThread(this).length === 0
                        ) {
                            return -1;
                        }
                        if (
                            t1.$$$needactionMessagesAsOriginThread(this).length === 0 &&
                            t2.$$$needactionMessagesAsOriginThread(this).length > 0
                        ) {
                            return 1;
                        }
                        if (
                            t1.$$$lastNeedactionMessageAsOriginThread(this) &&
                            t2.$$$lastNeedactionMessageAsOriginThread(this)
                        ) {
                            return (
                                t1.$$$lastNeedactionMessageAsOriginThread(this).$$$date(this).isBefore(
                                    t2.$$$lastNeedactionMessageAsOriginThread(this).$$$date(this),
                                )
                                ? 1
                                : -1
                            );
                        }
                        if (t1.$$$lastNeedactionMessageAsOriginThread(this)) {
                            return -1;
                        }
                        if (t2.$$$lastNeedactionMessageAsOriginThread(this)) {
                            return 1;
                        }
                        return t1.$$$id(this) < t2.$$$id(this) ? -1 : 1;
                    },
                )
                .map(
                    thread => {
                        return {
                            thread,
                            type: 'thread_needaction',
                            uniqueId: thread.localId + '_needaction',
                        };
                    },
                );
        }
        // thread notifications
        const threadNotifications = threads
            .sort(
                (t1, t2) => {
                    if (
                        t1.$$$localMessageUnreadCounter(this) > 0 &&
                        t2.$$$localMessageUnreadCounter(this) === 0
                    ) {
                        return -1;
                    }
                    if (
                        t1.$$$localMessageUnreadCounter(this) === 0 &&
                        t2.$$$localMessageUnreadCounter(this) > 0
                    ) {
                        return 1;
                    }
                    if (
                        t1.$$$lastMessage(this) &&
                        t2.$$$lastMessage(this)
                    ) {
                        return (
                            t1.$$$lastMessage(this).$$$date(this).isBefore(
                                t2.$$$lastMessage(this).$$$date(this),
                            )
                            ? 1
                            : -1
                        );
                    }
                    if (t1.$$$lastMessage(this)) {
                        return -1;
                    }
                    if (t2.$$$lastMessage(this)) {
                        return 1;
                    }
                    return t1.$$$id(this) < t2.$$$id(this) ? -1 : 1;
                },
            )
            .map(
                thread => {
                    return {
                        thread,
                        type: 'thread',
                        uniqueId: thread.localId,
                    };
                },
            );
        let notifications = threadNeedactionNotifications.concat(threadNotifications);
        if (props.filter === 'all') {
            const notificationGroups =
                this.env.services.model.messaging.$$$notificationGroupManager(this).$$$groups(this);
            notifications = Object.values(notificationGroups)
                .sort(
                    (group1, group2) => (
                        group1.$$$date(this).isAfter(
                            group2.$$$date(this),
                        )
                        ? -1
                        : 1
                    ),
                ).map(
                    notificationGroup => {
                        return {
                            notificationGroup,
                            uniqueId: notificationGroup.localId,
                        };
                    }
                ).concat(notifications);
        }
        // native notification request
        if (
            props.filter === 'all' &&
            this.env.services.action.dispatch('Messaging/isNotificationPermissionDefault')
        ) {
            notifications.unshift({
                type: 'odoobotRequest',
                uniqueId: 'odoobotRequest',
            });
        }
        return {
            isDeviceMobile: this.env.services.model.messaging.$$$device(this).$$$isMobile(this),
            notifications,
        };
    }

    /**
     * @private
     * @param {Object} props
     * @throws {Error} in case `props.filter` is not supported
     * @returns {Thread[]}
     */
    _useStoreSelectorThreads(props) {
        if (props.filter === 'mailbox') {
            return this.env.services.action.dispatch('Thread/all',
                    thread => (
                        thread.$$$isPinned(this) &&
                        thread.$$$model(this) === 'mail.box'
                    ),
                )
                .sort(
                    (mailbox1, mailbox2) => {
                        if (mailbox1 === this.env.services.model.messaging.$$$inbox(this)) {
                            return -1;
                        }
                        if (mailbox2 === this.env.services.model.messaging.$$$inbox(this)) {
                            return 1;
                        }
                        if (mailbox1 === this.env.services.model.messaging.$$$starred(this)) {
                            return -1;
                        }
                        if (mailbox2 === this.env.services.model.messaging.$$$starred(this)) {
                            return 1;
                        }
                        const mailbox1Name = mailbox1.$$$displayName(this);
                        const mailbox2Name = mailbox2.$$$displayName(this);
                        mailbox1Name < mailbox2Name ? -1 : 1;
                    },
                );
        } else if (props.filter === 'channel') {
            return this.env.services.action.dispatch('Thread/all',
                    thread => (
                        thread.$$$channelType(this) === 'channel' &&
                        thread.$$$isPinned(this) &&
                        thread.$$$model(this) === 'mail.channel'
                    ),
                )
                .sort(
                    (c1, c2) => (
                        c1.$$$displayName(this) < c2.$$$displayName(this)
                        ? -1
                        : 1
                    ),
                );
        } else if (props.filter === 'chat') {
            return this.env.services.action.dispatch('Thread/all',
                    thread => (
                        thread.$$$isChatChannel(this) &&
                        thread.$$$isPinned(this) &&
                        thread.$$$model(this) === 'mail.channel'
                    ),
                )
                .sort(
                    (c1, c2) => (
                        c1.$$$displayName(this) < c2.$$$displayName(this)
                        ? -1
                        : 1
                    ),
                );
        } else if (props.filter === 'all') {
            // "All" filter is for channels and chats
            return this.env.services.action.dispatch('Thread/all',
                    thread => (
                        thread.$$$isPinned(this) &&
                        thread.$$$model(this) === 'mail.channel'
                    ),
                )
                .sort(
                    (c1, c2) => (
                        c1.$$$displayName(this) < c2.$$$displayName(this)
                        ? -1
                        : 1
                    ),
                );
        } else {
            throw new Error(`Unsupported filter ${props.filter}`);
        }
    }

}

Object.assign(NotificationList, {
    _allowedFilters: ['all', 'mailbox', 'channel', 'chat'],
    defaultProps: {
        filter: 'all',
    },
    props: {
        filter: {
            type: String,
            validate: prop => NotificationList._allowedFilters.includes(prop),
        },
    },
    template: 'mail.NotificationList',
});

QWeb.registerComponent('NotificationList', NotificationList);

export default NotificationList;
