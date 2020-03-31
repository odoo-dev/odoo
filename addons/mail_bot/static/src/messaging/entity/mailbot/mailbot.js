odoo.define('mail_bot.messaging.entity.Mailbot', function (require) {
'use strict';

const { registerNewEntity } = require('mail.messaging.entity.core');

function MailbotFactory({ Entity }) {

    class Mailbot extends Entity {

        //----------------------------------------------------------------------
        // Public
        //----------------------------------------------------------------------

        /**
         * @returns {boolean}
         */
        hasRequest() {
            return this.constructor._hasRequest();
        }

        //----------------------------------------------------------------------
        // Private
        //----------------------------------------------------------------------

        /**
         * @private
         * @static
         * @returns {boolean}
         */
        static _hasRequest() {
            return window.Notification
                ? window.Notification.permission === 'default'
                : false;
        }

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
        }

        /**
         * @private
         * @param {Object} data
         */
        _update(data) {

            if ('odoobot_initialized' in this.env.session && !this.env.session.odoobot_initialized) {
                this._showOdoobotTimeout();
            }

            /**
             * FIXME: Messaging menu counter is dependent on mailbot has a
             * request, but initially messaging menu is not aware of mailbot
             * instance, so counter does not take it into account right when
             * messaging is initialized.
             */
            this.env.entities.MessagingMenu.instance.update();
        }

    }

    Object.assign(Mailbot, { isSingleton: true });

    return Mailbot;
}

registerNewEntity('Mailbot', MailbotFactory, ['Entity']);

});
