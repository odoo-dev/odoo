odoo.define('mail.service.Messaging', function (require) {
'use strict';

const AbstractService = require('web.AbstractService');
const { serviceRegistry } = require('web.core');
const env = require('web.env');

const { clearMessagingEnv, getMessagingEnv } = require('mail.messaging.env');

const MessagingService = AbstractService.extend({
    /**
     * Optional functions that are called after creating messaging env.
     * Useful to make changes to store in tests.
     */
    registry: {
        envName: 'main',
        initialEnv: env,
        onMessagingEnvCreated: messagingEnv => {},
    },
    /**
     * @override {web.AbstractService}
     */
    start() {
        this._super(...arguments);

        const {
            envName,
            initialEnv,
            onMessagingEnvCreated,
        } = this.registry;

        this.messagingEnv = getMessagingEnv(envName, initialEnv);

        Object.assign(this.messagingEnv, {
            disableAnimation: false,
            call: (...args) => this.call(...args),
            do_action: (...args) => this.do_action(...args),
            do_notify: (...args) => this.do_notify(...args),
            do_warn: (...args) => this.do_warn(...args),
            rpc: (...args) => this._rpc(...args),
            trigger_up: (...args) => this.trigger_up(...args)
        });

        this.messagingEnv.store.dispatch('initMessaging');
        onMessagingEnvCreated(this.messagingEnv);
    },
    /**
     * @override
     */
    destroy() {
        clearMessagingEnv(this.messagingEnv.envName);
        this._super();
    },

    //--------------------------------------------------------------------------
    // Public
    //--------------------------------------------------------------------------

    /**
     * @return {Object}
     */
    getMessagingEnv() {
        return this.messagingEnv;
    },
});

serviceRegistry.add('messaging', MessagingService);

return MessagingService;

});
