odoo.define('mail_bot.messaging.entity.MessagingMenu', function (require) {
'use strict';

const { registerClassPatchEntity } = require('mail.messaging.entity.core');

/**
 * FIXME: using constructor so that patch is applied on class
 * instead of instance. This is necessary in order for patches
 * not affecting observable and incrementing rev number each
 * time a patched method is called.
 */
registerClassPatchEntity('MessagingMenu', 'mail_bot.messaging.entity.MessagingMenu', {

    //----------------------------------------------------------------------
    // Private
    //----------------------------------------------------------------------

    /**
     * @override
     */
    _updateCounter() {
        const mailbot = this.env.entities.Mailbot.instance;
        let res = this._super();
        if (mailbot && mailbot.hasRequest()) {
            res += 1;
        }
        return res;
    },
});

});
