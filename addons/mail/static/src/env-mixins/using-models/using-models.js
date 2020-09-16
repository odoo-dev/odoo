/** @odoo-module alias=mail.envMixins.usingModels **/

import ModelManager from 'mail.core.ModelManager';
import makeDeferred from 'mail.utils.makeDeferred';

const { Store } = owl;
const { EventBus } = owl.core;

/**
 * @param {web.env} env
 * @param {Object} [options={}]
 * @param {boolean} [options.autofetchPartnerImStatus]
 * @param {Object} [options.browser]
 * @param {boolean} [options.disableAnimation]
 * @param {boolean} [options.isQUnitTest]
 * @param {integer} [options.loadingBaseDelayDuration]
 * @returns {env}
 */
export default function usingModels(env, options = {}) {
    /**
     * Messaging store
     */
    const store = new Store({
        env,
        state: { rev: 0 },
    });
    /**
     * Environment keys used in messaging.
     */
    Object.assign(env, {
        autofetchPartnerImStatus: options.autofetchPartnerImStatus ?? true,
        browser: options.browser ?? env.browser,
        disableAnimation: options.disableAnimation ?? false,
        isMessagingInitialized() {
            if (!this.messaging) {
                return false;
            }
            return this.messaging.$$$isInitialized();
        },
        /**
         * States whether the environment is in QUnit test or not.
         *
         * Useful to prevent some behaviour in QUnit tests, like applying
         * style of attachment that uses url.
         */
        isQUnitTest: options.isQUnitTest ?? false,
        loadingBaseDelayDuration: options.loadingBaseDelayDuration ?? 400,
        messaging: undefined,
        messagingBus: new EventBus(),
        /**
         * Promise which becomes resolved when messaging is created.
         *
         * Useful for discuss widget to know when messaging is created, because this
         * is an essential condition to make it work.
         */
        messagingCreated: makeDeferred(),
        messagingInitialized: makeDeferred(),
        modelManager: new ModelManager(env),
        store,
    });
    /**
     * Components cannot use web.bus, because they cannot use
     * EventDispatcherMixin, and webclient cannot easily access env.
     * Communication between webclient and components by core.bus
     * (usable by webclient) and messagingBus (usable by components), which
     * the messaging service acts as mediator since it can easily use both
     * kinds of buses.
     */
    env.bus.on(
        'hide_home_menu',
        null,
        () => env.services.model.messagingBus.trigger('hide_home_menu'),
    );
    env.bus.on(
        'show_home_menu',
        null,
        () => env.services.model.messagingBus.trigger('show_home_menu'),
    );
    env.bus.on(
        'will_hide_home_menu',
        null,
        () => env.services.model.messagingBus.trigger('will_hide_home_menu'),
    );
    env.bus.on(
        'will_show_home_menu',
        null,
        () => env.services.model.messagingBus.trigger('will_show_home_menu'),
    );
    return env;
}
