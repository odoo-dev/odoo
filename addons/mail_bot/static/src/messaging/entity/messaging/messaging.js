odoo.define('mail_bot.messaging.entity.Messaging', function (require) {
'use strict';

const { registerInstancePatchEntity } = require('mail.messaging.entityCore');

registerInstancePatchEntity('Messaging', 'mail_bot.messaging.entity.Messaging', {
    //----------------------------------------------------------------------
    // Public
    //----------------------------------------------------------------------

    /**
     * @returns {boolean}
     */
    isNotificationPermissionDefault() {
        const windowNotification = this.env.window.Notification;
        return windowNotification
            ? windowNotification.permission === 'default'
            : false;
    },
});

});
