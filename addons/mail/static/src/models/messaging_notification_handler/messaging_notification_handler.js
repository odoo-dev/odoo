odoo.define('mail/static/src/models/messaging_notification_handler/messaging_notification_handler.js', function (require) {
'use strict';

const { registerNewModel } = require('mail/static/src/model/model_core.js');
const { one2one } = require('mail/static/src/model/model_field.js');

const PREVIEW_MSG_MAX_SIZE = 350; // optimal for native English speakers

function factory(dependencies) {

    class MessagingNotificationHandler extends dependencies['mail.model'] {

        /**
         * @override
         */
        delete() {
            this.env.call('bus_service', 'off', 'notification');
            this.env.call('bus_service', 'stopPolling');
            super.delete();
        }

        //----------------------------------------------------------------------
        // Public
        //----------------------------------------------------------------------

        /**
         * Fetch messaging data initially to populate the store specifically for
         * the current users. This includes pinned channels for instance.
         */
        start() {
            this.env.call('bus_service', 'onNotification', null, notifs => this._handleNotifications(notifs));
            this.env.call('bus_service', 'startPolling');
        }

        //----------------------------------------------------------------------
        // Private
        //----------------------------------------------------------------------

        /**
         * @private
         * @param {Object[]} notifications
         * @returns {Object[]}
         */
        _filterNotificationsOnUnsubscribe(notifications) {
            const unsubscribedNotif = notifications.find(notif =>
                notif[1].info === 'unsubscribe');
            if (unsubscribedNotif) {
                notifications = notifications.filter(notif =>
                    notif[0][1] !== 'mail.channel' ||
                    notif[0][2] !== unsubscribedNotif[1].id
                );
            }
            return notifications;
        }

        /**
         * @private
         * @param {Object[]} notifications
         * @param {Array} notifications[i][0] meta-data of the notification.
         * @param {string} notifications[i][0][0] name of database this
         *   notification comes from.
         * @param {string} notifications[i][0][1] type of notification.
         * @param {integer} notifications[i][0][2] usually id of related type
         *   of notification. For instance, with `mail.channel`, this is the id
         *   of the channel.
         * @param {Object} notifications[i][1] payload of the notification
         */
        async _handleNotifications(notifications) {
            const filteredNotifications = this._filterNotificationsOnUnsubscribe(notifications);
            const proms = filteredNotifications.map(notification => {
                const [[, model, id], data] = notification;
                switch (model) {
                    case 'ir.needaction':
                        return this._handleNotificationNeedaction(data);
                    case 'mail.channel':
                        return this._handleNotificationChannel(Object.assign({
                            channelId: id,
                        }, data));
                    case 'res.partner':
                        return this._handleNotificationPartner(Object.assign({}, data));
                    default:
                        console.warn(`[messaging store] Unhandled notification "${model}"`);
                        return;
                }
            });
            await this.async(() => Promise.all(proms));
        }

        /**
         * @private
         * @param {Object} data
         * @param {integer} data.channelId
         * @param {string} [data.info]
         * @param {boolean} [data.is_typing]
         * @param {integer} [data.last_message_id]
         * @param {integer} [data.partner_id]
         */
        async _handleNotificationChannel(data) {
            const {
                channelId,
                id,
                info,
                is_typing,
                last_message_id,
                partner_id,
            } = data;
            switch (info) {
                case 'channel_fetched':
                    return this._handleNotificationChannelFetched({
                        id,
                        channelId,
                        last_message_id,
                        partner_id,
                    });
                case 'channel_seen':
                    return this._handleNotificationChannelSeen({
                        id,
                        channelId,
                        last_message_id,
                        partner_id,
                    });
                case 'typing_status':
                    return this._handleNotificationChannelTypingStatus({
                        channelId,
                        is_typing,
                        partner_id,
                    });
                default:
                    return this._handleNotificationChannelMessage(data);
            }
        }

        /**
         * @private
         * @param {Object} param0
         * @param {integer} param0.channelId
         * @param {integer} param0.id
         * @param {integer} param0.last_message_id
         * @param {integer} param0.partner_id
         */
        async _handleNotificationChannelFetched({
            id,
            channelId,
            last_message_id,
            partner_id,
        }) {
            const channel = this.env.models['mail.thread'].find(thread =>
                thread.id === channelId && thread.model === 'mail.channel'
            );
            if (!channel) {
                // for example seen from another browser, the current one has no
                // knowledge of the channel
                return;
            }
            channel.update({
                partnerSeenInfos: [['insert',
                    {
                        lastFetchedMessage: [['insert', {id: last_message_id}]],
                        id,
                        partner: [['insert', {id: partner_id}]],
                    }
                ]],
                messageSeenIndicators: [['insert',
                    {
                        id: this.env.models['mail.message_seen_indicator'].computeId(last_message_id, channel.id),
                        message: [['insert', {id: last_message_id}]],
                    }
                ]],
            });
            // FIXME force the computing of message values (cf task-2261221)
            this.env.models['mail.message_seen_indicator'].recomputeFetchedValues(channel);
        }

        /**
         * @private
         * @param {Object} param0
         * @param {integer} param0.channelId
         * @param {...Object} param0.data
         * @param {Array} [param0.data.author_id]
         * @param {integer} param0.data.author_id[0]
         * @param {integer[]} param0.data.channel_ids
         */
        async _handleNotificationChannelMessage(param0) {
            const channelId = param0.channelId;
            const data = Object.assign({}, param0);
            delete data.channelId;
            const {
                author_id: [authorPartnerId] = [],
                channel_ids,
            } = data;
            if (channel_ids.length === 1) {
                await this.async(() => this.env.models['mail.thread'].joinChannel(channel_ids[0]));
            }
            let message = this.env.models['mail.message'].find(message =>
                message.id === data.id
            );
            if (message) {
                const oldMessageModerationStatus = message.moderation_status;
                const oldMessageWasModeratedByCurrentPartner = message.isModeratedByCurrentPartner;
                message.update(this.env.models['mail.message'].convertData(data));
                if (
                    oldMessageModerationStatus === 'pending_moderation' &&
                    message.moderation_status !== 'pending_moderation' &&
                    oldMessageWasModeratedByCurrentPartner
                ) {
                    const moderation = this.env.messaging.moderation;
                    moderation.update({ counter: moderation.counter - 1 });
                }
                return;
            }
            message = this.env.models['mail.message'].create(
                this.env.models['mail.message'].convertData(data)
            );
            for (const thread of message.allThreads) {
                if (thread.model === 'mail.channel') {
                    const mainThreadCache = thread.mainCache;
                    mainThreadCache.update({ messages: [['link', message]] });
                }
            }
            const currentPartner = this.env.messaging.currentPartner;
            if (authorPartnerId === currentPartner.id) {
                return;
            }
            const channel = this.env.models['mail.thread'].find(thread =>
                thread.id === channelId &&
                thread.model === 'mail.channel'
            );
            const isOdooFocused = this.env.call('bus_service', 'isOdooFocused');
            if (!isOdooFocused) {
                this._notifyNewChannelMessageWhileOutOfFocus({ channel, message });
            }
            if (channel.model === 'mail.channel') {
                channel.markAsFetched();
            }
            channel.update({ message_unread_counter: channel.message_unread_counter + 1 });
            // manually force recompute of counter
            this.messaging.messagingMenu.update();
        }

        /**
         * Called when a channel has been seen, and the server responses with the
         * last message seen. Useful in order to track last message seen.
         *
         * @private
         * @param {Object} param0
         * @param {integer} param0.channelId
         * @param {integer} param0.id
         * @param {integer} param0.last_message_id
         * @param {integer} param0.partner_id
         */
        async _handleNotificationChannelSeen({
            channelId,
            id,
            last_message_id,
            partner_id,
        }) {
            const channel = this.env.models['mail.thread'].find(thread =>
                thread.id === channelId && thread.model === 'mail.channel'
            );
            if (!channel) {
                // for example seen from another browser, the current one has no
                // knowledge of the channel
                return;
            }
            const lastMessage = this.env.models['mail.message'].insert({id: last_message_id});
            const updateData = {
                partnerSeenInfos: [['insert',
                    {
                        id,
                        lastFetchedMessage: [['link', lastMessage]],
                        lastSeenMessage: [['link', lastMessage]],
                        partner: [['insert', {id: partner_id}]],
                    }],
                ],
                messageSeenIndicators: [['insert',
                    {
                        id: this.env.models['mail.message_seen_indicator'].computeId(last_message_id, channel.id),
                        message: [['link', lastMessage]],
                    }
                ]],
            };
            if (this.env.messaging.currentPartner.id === partner_id) {
                Object.assign(updateData, {
                    message_unread_counter: 0,
                    seen_message_id: last_message_id,
                });
            }
            channel.update(updateData);
            // FIXME force the computing of thread values (cf task-2261221)
            this.env.models['mail.thread'].computeLastCurrentPartnerMessageSeenByEveryone(channel);
            // FIXME force the computing of message values (cf task-2261221)
            this.env.models['mail.message_seen_indicator'].recomputeSeenValues(channel);
            // manually force recompute of counter
            this.messaging.messagingMenu.update();
        }

        /**
         * @private
         * @param {Object} param0
         * @param {integer} param0.channelId
         * @param {boolean} param0.is_typing
         * @param {integer} param0.partner_id
         */
        _handleNotificationChannelTypingStatus({
            channelId,
            is_typing,
            partner_id,
        }) {
            const channel = this.env.models['mail.thread'].insert({
                id: channelId,
                model: 'mail.channel',
            });
            const partner = this.env.models['mail.partner'].insert({ id: partner_id });
            if (partner === this.env.messaging.currentPartner) {
                // Ignore management of current partner is typing notification.
                return;
            }
            if (is_typing) {
                if (channel.typingMembers.includes(partner)) {
                    channel.refreshOtherMemberTypingMember(partner);
                } else {
                    channel.registerOtherMemberTypingMember(partner);
                }
            } else {
                if (!channel.typingMembers.includes(partner)) {
                    // Ignore no longer typing notifications of members that
                    // are not registered as typing something.
                    return;
                }
                channel.unregisterOtherMemberTypingMember(partner);
            }
        }

        /**
         * @private
         * @param {Object} data
         */
        _handleNotificationNeedaction(data) {
            const message = this.env.models['mail.message'].insert(
                this.env.models['mail.message'].convertData(data)
            );
            const inboxMailbox = this.env.messaging.inbox;
            inboxMailbox.update({ counter: inboxMailbox.counter + 1 });
            for (const thread of message.allThreads) {
                if (
                    thread.channel_type === 'channel' &&
                    message.allThreads.includes(inboxMailbox)
                ) {
                    thread.update({ message_needaction_counter: thread.message_needaction_counter + 1 });
                }
                const mainThreadCache = thread.mainCache;
                mainThreadCache.update({ messages: [['link', message]] });
            }
            // manually force recompute of counter
            this.messaging.messagingMenu.update();
        }

        /**
         * @private
         * @param {Object} data
         * @param {string} [data.info]
         * @param {string} [data.type]
         */
        async _handleNotificationPartner(data) {
            const {
                info,
                type,
            } = data;
            if (type === 'activity_updated') {
                /**
                 * data.activity_created
                 * data.activity_deleted
                 */
                console.warn('activity_updated not handled', data);
                return; // disabled
            } else if (type === 'author') {
                return this._handleNotificationPartnerAuthor(data);
            } else if (type === 'deletion') {
                return this._handleNotificationPartnerDeletion(data);
            } else if (type === 'message_notification_update') {
                return this._handleNotificationPartnerMessageNotificationUpdate(data.elements);
            } else if (type === 'mark_as_read') {
                return this._handleNotificationPartnerMarkAsRead(data);
            } else if (type === 'moderator') {
                return this._handleNotificationPartnerModerator(data);
            } else if (type === 'toggle_star') {
                return this._handleNotificationPartnerToggleStar(data);
            } else if (info === 'transient_message') {
                return this._handleNotificationPartnerTransientMessage(data);
            } else if (info === 'unsubscribe') {
                return this._handleNotificationPartnerUnsubscribe(data.id);
            } else if (type === 'user_connection') {
                return this._handleNotificationPartnerUserConnection(data);
            } else {
                return this._handleNotificationPartnerChannel(data);
            }
        }

        /**
         * @private
         * @param {Object} data
         * @param {Object} data.message
         */
        _handleNotificationPartnerAuthor(data) {
            this.env.models['mail.message'].insert(
                this.env.models['mail.message'].convertData(data.message)
            );
        }

        /**
         * @private
         * @param {Object} data
         * @param {string} data.channel_type
         * @param {integer} data.id
         * @param {string} [data.info]
         * @param {boolean} data.is_minimized
         * @param {string} data.name
         * @param {string} data.state
         * @param {string} data.uuid
         */
        _handleNotificationPartnerChannel(data) {
            const convertedData = this.env.models['mail.thread'].convertData(data);

            let channel = this.env.models['mail.thread'].find(thread =>
                thread.id === convertedData.id &&
                thread.model === 'mail.channel'
            );
            const wasCurrentPartnerMember = (
                channel &&
                channel.members.includes(this.env.messaging.currentPartner)
            );

            channel = this.env.models['mail.thread'].insert(Object.assign(
                { isPinned: true },
                convertedData,
            ));

            if (
                channel.channel_type === 'channel' &&
                data.info !== 'creation' &&
                !wasCurrentPartnerMember
            ) {
                this.env.do_notify(
                    this.env._t("Invitation"),
                    _.str.sprintf(
                        this.env._t("You have been invited to: %s"),
                        channel.name
                    )
                );
            }
            // a new thread with unread messages could have been added
            // manually force recompute of counter
            this.messaging.messagingMenu.update();
        }

        /**
         * @private
         * @param {Object} param0
         * @param {integer[]} param0.messag_ids
         */
        _handleNotificationPartnerDeletion({ message_ids }) {
            const moderationMailbox = this.env.messaging.moderation;
            for (const id of message_ids) {
                const message = this.env.models['mail.message'].find(message => message.id === id);
                if (
                    message &&
                    message.moderation_status === 'pending_moderation' &&
                    message.originThread.isModeratedByCurrentPartner
                ) {
                    moderationMailbox.update({ counter: moderationMailbox.counter - 1 });
                }
                message.delete();
            }
            // deleting message might have deleted notifications, force recompute
            this.messaging.notificationGroupManager.computeGroups();
            // manually force recompute of counter (after computing the groups)
            this.messaging.messagingMenu.update();
        }

        /**
         * @private
         * @param {Object} data
         */
        _handleNotificationPartnerMessageNotificationUpdate(data) {
            for (const messageData of data) {
                const message = this.env.models['mail.message'].insert(
                    this.env.models['mail.message'].convertData(messageData)
                );
                // implicit: failures are sent by the server as notification
                // only if the current partner is author of the message
                if (!message.author && this.messaging.currentPartner) {
                    message.update({ author: [['link', this.messaging.currentPartner]] });
                }
            }
            this.messaging.notificationGroupManager.computeGroups();
            // manually force recompute of counter (after computing the groups)
            this.messaging.messagingMenu.update();
        }

        /**
         * @private
         * @param {Object} param0
         * @param {integer[]} [param0.channel_ids
         * @param {integer[]} [param0.message_ids=[]]
         */
        _handleNotificationPartnerMarkAsRead({ channel_ids, message_ids = [] }) {
            const inboxMailbox = this.env.messaging.inbox;
            const historyMailbox = this.env.messaging.history;
            const mainHistoryThreadCache = historyMailbox.mainCache;

            // 1. move messages from inbox to history
            for (const cache of inboxMailbox.caches) {
                const messages = message_ids
                    .map(id => this.env.models['mail.message'].find(message => message.id === id))
                    .filter(message => !!message);
                cache.update({ messages: [['unlink', messages]] });
                // TODO FIXME cannot update other caches of history since the
                // messages in them depend on the search domain
                mainHistoryThreadCache.update({ messages: [['link', messages]] });
            }

            // 2. remove "needaction" from channels
            let channels;
            if (channel_ids) {
                channels = channel_ids
                    .map(id => this.env.models['mail.thread'].find(thread =>
                        thread.id === id &&
                        thread.model === 'mail.channel'
                    ))
                    .filter(thread => !!thread);
            } else {
                // flux specific: channel_ids unset means "mark all as read"
                channels = this.env.models['mail.thread'].all(thread =>
                    thread.model === 'mail.channel'
                );
            }
            for (const channel of channels) {
                channel.update({ message_needaction_counter: 0 });
            }
            inboxMailbox.update({ counter: inboxMailbox.counter - message_ids.length });

            // manually force recompute of counter
            this.messaging.messagingMenu.update();
        }

        /**
         * @private
         * @param {Object} param0
         * @param {Object} param0.message
         */
        _handleNotificationPartnerModerator({ message: data }) {
            this.env.models['mail.message'].insert(
                this.env.models['mail.message'].convertData(data)
            );
            const moderationMailbox = this.env.messaging.moderation;
            if (moderationMailbox) {
                moderationMailbox.update({ counter: moderationMailbox.counter + 1 });
            }
            // manually force recompute of counter
            this.messaging.messagingMenu.update();
        }

        /**
         * @private
         * @param {Object} param0
         * @param {integer[]} param0.message_ids
         * @param {boolean} param0.starred
         */
        _handleNotificationPartnerToggleStar({ message_ids = [], starred }) {
            const starredMailbox = this.env.messaging.starred;
            for (const messageId of message_ids) {
                const message = this.env.models['mail.message'].find(message =>
                    message.id === messageId
                );
                if (!message) {
                    continue;
                }
                if (starred) {
                    message.update({ threadCaches: [['link', starredMailbox.mainCache]] });
                    starredMailbox.update({ counter: starredMailbox.counter + 1 });
                } else {
                    for (const cache of starredMailbox.caches) {
                        cache.update({ messages: [['unlink', message]] });
                    }
                    starredMailbox.update({ counter: starredMailbox.counter - 1 });
                }
            }
        }

        /**
         * On receiving a transient message, i.e. a message which does not come
         * from a member of the channel. Usually a log message, such as one
         * generated from a command with ('/').
         *
         * @private
         * @param {Object} data
         */
        _handleNotificationPartnerTransientMessage(data) {
            const convertedData = this.env.models['mail.message'].convertData(data);
            const messageIds = this.env.models['mail.message'].all().map(message => message.id);
            const partnerRoot = this.env.messaging.partnerRoot;
            this.env.models['mail.message'].create(Object.assign(convertedData, {
                author: [['link', partnerRoot]],
                id: (messageIds ? Math.max(...messageIds) : 0) + 0.01,
                isTransient: true,
            }));
        }

        /**
         * @private
         * @param {integer} channelId
         */
        _handleNotificationPartnerUnsubscribe(channelId) {
            const channel = this.env.models['mail.thread'].find(thread =>
                thread.id === channelId &&
                thread.model === 'mail.channel'
            );
            if (!channel) {
                return;
            }
            let message;
            if (channel.correspondent) {
                const correspondent = channel.correspondent;
                message = _.str.sprintf(
                    this.env._t("You unpinned your conversation with <b>%s</b>."),
                    correspondent.name
                );
            } else {
                message = _.str.sprintf(
                    this.env._t("You unsubscribed from <b>%s</b>."),
                    channel.name
                );
            }
            this.env.do_notify(this.env._t("Unsubscribed"), message);
            channel.update({ isPinned: false });
        }

        /**
         * @private
         * @param {Object} param0
         * @param {string} param0.message
         * @param {integer} param0.partner_id
         * @param {string} param0.title
         */
        _handleNotificationPartnerUserConnection({ message, partner_id, title }) {
            this.env.call('bus_service', 'sendNotification', title, message);
            this.env.models['mail.thread'].createChannel({
                autoselect: true,
                partnerId: partner_id,
                type: 'chat',
            });
        }

        /**
         * @private
         * @param {Object} param0
         * @param {mail.thread} param0.channel
         * @param {mail.message} param0.message
         */
        _notifyNewChannelMessageWhileOutOfFocus({ channel, message }) {
            const author = message.author;
            const messaging = this.env.messaging;
            let notificationTitle;
            if (!author) {
                notificationTitle = this.env._t("New message");
            } else {
                const authorName = author.nameOrDisplayName;
                if (channel.channel_type === 'channel') {
                    // hack: notification template does not support OWL components,
                    // so we simply use their template to make HTML as if it comes
                    // from component
                    const channelIcon = this.env.qweb.renderToString('mail.ThreadIcon', {
                        env: this.env,
                        thread: channel,
                    });
                    const channelName = _.escape(channel.displayName);
                    const channelNameWithIcon = channelIcon + channelName;
                    notificationTitle = _.str.sprintf(
                        this.env._t("%s from %s"),
                        _.escape(authorName),
                        channelNameWithIcon
                    );
                } else {
                    notificationTitle = _.escape(authorName);
                }
            }
            const notificationContent = message.prettyBody.substr(0, PREVIEW_MSG_MAX_SIZE);
            this.env.call('bus_service', 'sendNotification', notificationTitle, notificationContent);
            messaging.update({ outOfFocusUnreadMessageCounter: messaging.outOfFocusUnreadMessageCounter + 1 });
            const titlePattern = messaging.outOfFocusUnreadMessageCounter === 1
                ? this.env._t("%d Message")
                : this.env._t("%d Messages");
            this.env.trigger_up('set_title_part', {
                part: '_chat',
                title: _.str.sprintf(titlePattern, messaging.outOfFocusUnreadMessageCounter),
            });
        }

    }

    MessagingNotificationHandler.fields = {
        messaging: one2one('mail.messaging', {
            inverse: 'notificationHandler',
        }),
    };

    MessagingNotificationHandler.modelName = 'mail.messaging_notification_handler';

    return MessagingNotificationHandler;
}

registerNewModel('mail.messaging_notification_handler', factory);

});
