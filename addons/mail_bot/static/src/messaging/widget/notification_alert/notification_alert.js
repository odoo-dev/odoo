odoo.define('mail_bot.messaging.widget.NotificationAlert', function (require) {
"use strict";

var Widget = require('web.Widget');
var widgetRegistry = require('web.widget_registry');

// -----------------------------------------------------------------------------
// Display Notification alert on user preferences form view
// -----------------------------------------------------------------------------
var NotificationAlert = Widget.extend({
   template: 'mail_bot.messaging.widget.NotificationAlert',
   /**
    * @override
    */
   init: function () {
      this._super.apply(this, arguments);
      const env = this.call('messaging', 'getEnv');
      const hasRequest = env.store.state.mailbotHasRequest;
      this.isNotificationBlocked = window.Notification && window.Notification.permission !== "granted" && !hasRequest;
   },
});

widgetRegistry.add('notification_alert', NotificationAlert);

return NotificationAlert;

});
