odoo.define('mail_bot.MailBotService', function (require) {
"use strict";

const AbstractService = require('web.AbstractService');
const core = require('web.core');
const session = require('web.session');

const MailBotService = AbstractService.extend({
    dependencies: ['messaging'],

    /**
     * @override
     */
    start() {
        this.messagingEnv = this.call('messaging', 'getMessagingEnv');
        /**
         * Checks whether the OdooBot Notification Request has to be shown.
         *
         * @param {Object} param0
         * @param {Object} param0.state
         */
        this.messagingEnv.store.actions.checkOdoobotRequest = ({ state }) => {
            state.mailbotHasRequest = window.Notification
                ? window.Notification.permission === "default"
                : false;
        };
        /**
         * Removes the OdooBot Notification Request.
         *
         * @param {Object} param0
         * @param {Object} param0.state
         */
        this.messagingEnv.store.actions.removeOdoobotRequest = ({ state }) => {
            state.mailbotHasRequest = false;
        };
        /**
         * TODO FIXME this should be part of messaging service/store but it is
         * currently not possible to patch it before it is initialized.
         * See task-2202898.
         */
        this.messagingEnv.store.dispatch('checkOdoobotRequest');
        if ('odoobot_initialized' in session && !session.odoobot_initialized) {
            this._showOdoobotTimeout();
        }
    },

    //--------------------------------------------------------------------------
    // Private
    //--------------------------------------------------------------------------

    /**
     * @private
     */
    _showOdoobotTimeout() {
        setTimeout(() => {
            session.odoobot_initialized = true;
            this._rpc({
                model: 'mail.channel',
                method: 'init_odoobot',
            });
        }, 2 * 60 * 1000);
    },
});

core.serviceRegistry.add('mailbot_service', MailBotService);
return MailBotService;

});
