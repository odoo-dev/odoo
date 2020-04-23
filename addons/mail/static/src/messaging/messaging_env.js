odoo.define('mail.messaging.messaging_env', function (require) {
'use strict';

const { generateEntities } = require('mail.messaging.entity.core');

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
        state: {
            entities: {},
        },
    });
    /**
     * Environment keys used in messaging.
     */
    Object.assign(env, {
        autofetchPartnerImStatus: true,
        disableAnimation: false,
        entities: undefined,
        isMessagingInitialized() {
            if (!this.messaging) {
                return false;
            }
            return this.messaging.isInitialized;
        },
        messaging: undefined,
        messagingBus: new EventBus(),
        store,
    });
    /**
     * Messaging entities.
     */
    if (!env.generateEntitiesImmediately) {
        await new Promise(resolve => {
            /**
             * Called when all JS resources are loaded. This is useful in order
             * to do some processing after other JS files have been parsed, for
             * example new Entities or patched Entities that are coming from
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
    _addMessagingEntities(env);
}

/**
 * Adds the messaging entities to the given env.
 *
 * @private
 * @param {Object} env
 */
function _addMessagingEntities(env) {
    /**
     * Generate the entities.
     */
    env.entities = generateEntities();
    /**
     * Make environment accessible from Entities. Note that getter is used
     * to prevent cyclic data structure.
     */
    for (const Entity of Object.values(env.entities)) {
        Object.defineProperty(Entity, 'env', {
            get: () => env,
        });
    }
    /**
     * Create the messaging singleton entity.
     */
    env.messaging = env.entities.Messaging.create();
}

return { addMessagingToEnv };

});
