odoo.define('mail_bot.messaging.entity.MessagingInitializer', function (require) {
'use strict';

const { registerInstancePatchEntity } = require('mail.messaging.entityCore');

registerInstancePatchEntity('MessagingInitializer', 'mail_bot.messaging.entity.MessagingInitializer', {
    //--------------------------------------------------------------------------
    // Private
    //--------------------------------------------------------------------------

    /**
     * @private
     */
    _showOdoobotTimeout() {
        setTimeout(() => {
            this.env.session.odoobot_initialized = true;
            this.env.rpc({
                model: 'mail.channel',
                method: 'init_odoobot',
            });
        }, 2 * 60 * 1000);
    },
    /**
     * @override
     */
    async _start() {
        await this.async(() => this._super());

        if ('odoobot_initialized' in this.env.session && !this.env.session.odoobot_initialized) {
            this._showOdoobotTimeout();
        }
    },
});

});
