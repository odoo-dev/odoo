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
        let counter = this._super();
        if (!this.messaging) {
            // compute after delete
            return counter;
        }
        if (this.messaging.isNotificationPermissionDefault()) {
            counter += 1;
        }
        return counter;
    },
});

});
