odoo.define('mail_bot.messaging.entity.MessagingInitializer', function (require) {
'use strict';

const { registerClassPatchEntity } = require('mail.messaging.entity.core');

registerClassPatchEntity('MessagingInitializer', 'mail_bot.messaging.entity.MessagingInitializer', {

    //--------------------------------------------------------------------------
    // Private
    //--------------------------------------------------------------------------

    /**
     * @override
     */
    _createSingletons() {
        this._super();
        this.env.entities.Mailbot.create();
    },
});

});
