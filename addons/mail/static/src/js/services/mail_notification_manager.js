odoo.define('mail.Manager.Notification', function (require) {
"use strict";

/**
 * Mail Notification Manager
 *
 * This part of the mail manager is responsible for receiving notifications on
 * the longpoll bus, which are data received from the server.
 */
var MailManager = require('mail.Manager');

MailManager.include({

    //--------------------------------------------------------------------------
    // Private
    //--------------------------------------------------------------------------

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
     * On receiving a notification that is specific to a user
     *
     * @private
     * @param {Object} data structure depending on the type
     * @param {integer} data.id
     */
    _handlePartnerNotification: function (data) {
        if (data.type === 'activity_updated') {
            this._handlePartnerActivityUpdateNotification(data);
        }
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
        _.each(notifications, function (notif) {
            var model = notif[0][1];
            if (model === 'res.partner') {
                self._handlePartnerNotification(notif[1]);
            }
        });
    },
});

return MailManager;

});
