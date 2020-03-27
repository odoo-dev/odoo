odoo.define('mail.messaging.service.Messaging', function (require) {
'use strict';

const actions = require('mail.store.actions');
const getters = require('mail.store.getters');
const initializeState = require('mail.store.state');

const AbstractService = require('web.AbstractService');
const { serviceRegistry } = require('web.core');
const env = require('web.env');

const { Store } = owl;

const MessagingService = AbstractService.extend({
    /**
     * Optional functions that are called after creating messaging env.
     * Useful to make changes to store in tests.
     */
    registry: {
        initialEnv: env,
        onMessagingEnvCreated: messagingEnv => {},
    },
    /**
     * @override {web.AbstractService}
     */
    start() {
        this._super(...arguments);

        const {
            initialEnv,
            onMessagingEnvCreated,
        } = this.registry;

        /**
         * Environment of the messaging store (messaging env. without store)
         */
        const env = Object.create(initialEnv);
        Object.assign(env, {
            disableAnimation: false,
            call: (...args) => this.call(...args),
            do_action: (...args) => this.do_action(...args),
            do_notify: (...args) => this.do_notify(...args),
            do_warn: (...args) => this.do_warn(...args),
            rpc: (...args) => this._rpc(...args),
            trigger_up: (...args) => this.trigger_up(...args)
        });

        /**
         * Messaging store
         */
        const store = new Store({
            actions,
            env,
            getters,
            state: initializeState(),
        });

        /**
         * Environment of messaging components (messaging env. with store)
         */
        Object.assign(env, { store });
        onMessagingEnvCreated(env);
        store.dispatch('initMessaging');

        this.env = env;
    },

    //--------------------------------------------------------------------------
    // Public
    //--------------------------------------------------------------------------

    /**
     * @returns {Object}
     */
    getEnv() {
        return this.env;
    },
});

serviceRegistry.add('messaging', MessagingService);

return MessagingService;

});
