odoo.define('mail_bot.messaging.entity.MessagingMenu', function (require) {
'use strict';

const { registerInstancePatchEntity } = require('mail.messaging.entityCore');

registerInstancePatchEntity('MessagingMenu', 'mail_bot.messaging.entity.MessagingMenu', {

    //----------------------------------------------------------------------
    // Private
    //----------------------------------------------------------------------

    /**
     * @override
     */
    _updateCounter() {
        let res = this._super();
        if (this.env.messaging.isNotificationPermissionDefault()) {
            res += 1;
        }
        return res;
    },
});

});
