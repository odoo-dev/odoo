odoo.define('mail_bot.messaging.entity.Messaging', function (require) {
'use strict';

const { registerClassPatchEntity } = require('mail.messaging.entity.core');

registerClassPatchEntity('Messaging', 'mail_bot.messaging.entity.Messaging', {
    //----------------------------------------------------------------------
    // Public
    //----------------------------------------------------------------------

    /**
     * @returns {boolean}
     */
    isNotificationPermissionDefault() {
        return this.env.windowNotification
            ? this.env.windowNotification.permission === 'default'
            : false;
    },
});

});
