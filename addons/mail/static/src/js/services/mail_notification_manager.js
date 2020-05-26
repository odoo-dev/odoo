odoo.define('mail.Manager.Notification', function (require) {
"use strict";

/**
 * Mail Notification Manager
 *
 * This part of the mail manager is responsible for receiving notifications on
 * the longpoll bus, which are data received from the server.
 */
var MailManager = require('mail.Manager');

const config = require('web.config');
var core = require('web.core');
var session = require('web.session');

var _t = core._t;

MailManager.include({

    //--------------------------------------------------------------------------
    // Private
    //--------------------------------------------------------------------------

    /**
     * Remove channel notifications if there is an unsubscribe notification
     * on this channel.
     *
     * @private
     * @param {Object[]} notifications
     * @returns {Object[]} notifications filtered of channel notifications
     *   matching unsubscribe notifs
     */
    _filterNotificationsOnUnsubscribe: function (notifications) {
        var unsubscribedNotif = _.find(notifications, function (notif) {
            return notif[1].info === 'unsubscribe';
        });
        if (unsubscribedNotif) {
            notifications = _.reject(notifications, function (notif) {
                return notif[0][1] === 'mail.channel' &&
                        notif[0][2] === unsubscribedNotif[1].id;
            });
        }
        return notifications;
    },
    /**
     * Called when receiving a notification on a channel (all members of a
     * channel receive this notification)
     *
     * @private
     * @param {Object} params
     * @param {integer} [params.channelID]
     * @param {Object} params.data
     * @param {string} [params.data.info] if set, specify the type of data on
     *   this channel notification
     */
    _handleChannelNotification: function (params) {
        if (params.data && params.data.info === 'typing_status') {
            // typing notification is no longer supported by mail manager
            return;
        } else if (params.data && params.data.info === 'channel_fetched' || params.data.info === 'channel_seen') {
            /*
               Disable old support (this whole method should be deleted at the end)
               Needed to that way as still receiving channel_fetched and channel_seen notifications.
             */
            return;
        } else {
            this._handleChannelMessageNotification(params.data);
        }
    },
    /**
     * Called when a new or updated message is received on a channel
     *
     * @private
     * @param {Object} messageData
     * @param {integer[]} messageData.channel_ids channel IDs of this message
     */
    _handleChannelMessageNotification: function (messageData) {
        var self = this;
        var def;
        let notify = true;
        if (messageData.channel_ids.length === 1) {
            const channel = this.getChannel(messageData.channel_ids[0]);
            // Message from mailing channel should not make a notification in Odoo for users
            // with notification "Handled by Email", but web client should receive the message.
            // Channel has been marked as read server-side in this case, so it should not display
            // a notification by incrementing the unread counter.
            notify = channel && (!channel.isMassMailing() || session.notification_type !== 'email');
            def = this.joinChannel(messageData.channel_ids[0], { autoswitch: false });
        } else {
            def = Promise.resolve();
        }
        def.then(function () {
            // don't increment unread if channel wasn't in cache yet as
            // its unread counter has just been fetched
            return self.addMessage(messageData, {
                showNotification: true,
                incrementUnread: notify,
            });
        });
    },
     /**
     * On message becoming a need action (pinned to inbox)
     *
     * @private
     * @param {Object} messageData
     * @param {integer[]} messageData.channel_ids
     */
    _handleNeedactionNotification: function (messageData) {
        var self = this;
        var inbox = this.getMailbox('inbox');
        this.addMessage(messageData, {
            incrementUnread: true,
            showNotification: true,
        }).then(function (message) {
            inbox.incrementMailboxCounter();
            _.each(message.getThreadIDs(), function (threadID) {
                var channel = self.getChannel(threadID);
                if (channel) {
                    channel.incrementNeedactionCounter();
                }
            });
            self._mailBus.trigger('update_needaction', inbox.getMailboxCounter());
        });
    },
    /**
     * Called when an activity record has been updated on the server
     *
     * @private
     * @param {Object} data key, value to decide activity created or deleted
     */
    _handlePartnerActivityUpdateNotification: function (data) {
        this._mailBus.trigger('activity_updated', data);
    },
    /**
     * Called to open the channel in detach mode (minimized) even if no new message:
     *
     * @private
     * @param {Object} channelData
     * @param {integer} channelData.id
     * @param {string} [channelData.info]
     * @param {boolean} channelData.is_minimized
     * @param {string} channelData.state
     */
    _handlePartnerChannelMinimizeNotification: function (channelData) {
        var self = this;
        this._addChannel(channelData).then(function (channelID){
            self.getChannel(channelID).detach()
        });
    },
    /**
     * On receiving a notification that is specific to a user
     *
     * @private
     * @param {Object} data structure depending on the type
     * @param {integer} data.id
     */
    _handlePartnerNotification: function (data) {
        if (data.type === 'activity_updated') {
            this._handlePartnerActivityUpdateNotification(data);
        } else if (data.type === 'user_connection') {
            this._handlePartnerUserConnectionNotification(data);
        } else if (data.type === 'simple_notification') {
            var title = _.escape(data.title), message = _.escape(data.message);
            data.warning ? this.do_warn(title, message, data.sticky) : this.do_notify(title, message, data.sticky);
        } else if (data.info === 'channel_minimize') {
            this._handlePartnerChannelMinimizeNotification(data);
        }
    },
     /**
     * Shows a popup to notify a user connection
     *
     * @private
     * @param {Object} data
     * @param {Object[]} data.partner_id id of the connected partner
     * @param {string} data.title title to display on notification
     * @param {Array} data.messages message to display on notification
     */
    _handlePartnerUserConnectionNotification: function (data) {
        var self = this;
        var partnerID = data.partner_id;
        this.call('bus_service', 'sendNotification', data.title, data.message, function ( ){
            self.call('mail_service', 'openDMChatWindowFromBlankThreadWindow', partnerID);
        });
    },
    /**
     * @override
     * @private
     */
    _listenOnBuses: function () {
        this._super.apply(this, arguments);
        this.call('bus_service', 'onNotification', this, this._onNotification);
    },

    //--------------------------------------------------------------------------
    // Handlers
    //--------------------------------------------------------------------------

    /**
     * Notification handlers
     * Sometimes, the web client receives unsubscribe notification and an extra
     * notification on that channel.  This is then followed by an attempt to
     * rejoin the channel that we just left.  The next few lines remove the
     * extra notification to prevent that situation to occur.
     *
     * @private
     * @param {Array} notifs
     */
    _onNotification: function (notifs) {
        var self = this;
        let notifications = JSON.parse(JSON.stringify(notifs));
        notifications = this._filterNotificationsOnUnsubscribe(notifications);
        _.each(notifications, function (notif) {
            var model = notif[0][1];
            if (model === 'ir.needaction') {
                self._handleNeedactionNotification(notif[1]);
            } else if (model === 'mail.channel') {
                // new message in a channel
                self._handleChannelNotification({
                    channelID: notif[0][2],
                    data: notif[1],
                });
            } else if (model === 'res.partner') {
                self._handlePartnerNotification(notif[1]);
            }
        });
    },
});

return MailManager;

});
