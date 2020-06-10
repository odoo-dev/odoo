odoo.define('mail/static/src/messaging_env.js', function (require) {
'use strict';

const ModelManager = require('mail/static/src/model/model_manager.js');

const { Store } = owl;
const { EventBus } = owl.core;

/**
 * Adds messaging features to the given env.
 *
 * @param {Object} env
 */
async function addMessagingToEnv(env) {
    /**
     * Messaging store
     */
    const store = new Store({
        env,
        state: {},
    });
    /**
     * Environment keys used in messaging.
     */
    Object.assign(env, {
        autofetchPartnerImStatus: true,
        disableAnimation: false,
        isMessagingInitialized() {
            if (!this.messaging) {
                return false;
            }
            return this.messaging.isInitialized;
        },
        loadingBaseDelayDuration: 400,
        messaging: undefined,
        messagingBus: new EventBus(),
        modelManager: new ModelManager(env),
        store,
    });
    Object.defineProperty(env, 'models', {
        get() { return this.modelManager.models; },
    });
    /**
     * Messaging models.
     */
    if (!env.generateModelsImmediately) {
        await new Promise(resolve => {
            /**
             * Called when all JS resources are loaded. This is useful in order
             * to do some processing after other JS files have been parsed, for
             * example new models or patched models that are coming from
             * other modules, because some of those patches might need to be
             * applied before messaging initialization.
             */
            window.addEventListener('load', resolve);
        });
        /**
         * All JS resources are loaded, but not necessarily processed.
         * We assume no messaging-related modules return any Promise,
         * therefore they should be processed *at most* asynchronously at
         * "Promise time".
         */
        await new Promise(resolve => setTimeout(resolve));
    }
    env.modelManager.start();
    /**
     * Create the messaging singleton record.
     */
    env.messaging = env.models['mail.messaging'].create();
}

return { addMessagingToEnv };

});
