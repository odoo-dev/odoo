/** @odoo-module alias=mail.main **/

import usingModels from 'mail.envMixins.usingModels';
import ChatWindowService from 'mail.services.ChatWindow';
import DialogService from 'mail.services.Dialog';
import MessagingService from 'mail.services.Messaging';
import ModelService from 'mail.services.Model';

import env from 'web.commonEnv';
import { serviceRegistry } from 'web.core';

usingModels(env);

async function init() {
    await setup();
    await start();
}

async function setup() {
    // Register services
    serviceRegistry.add('chatWindow', ChatWindowService);
    serviceRegistry.add('dialog', DialogService);
    serviceRegistry.add('messaging', MessagingService);
    serviceRegistry.add('model', ModelService);

    // Wait for all JS loaded and model-relevant files to being parsed
    // (Useful to ensure global registering of models is done)
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
    /**
     * Some models require session data, like locale text direction (depends on
     * fully loaded translation).
     */
    await env.session.is_bound;
}

/**
 * Prepare for setup of models and messaging singleton record.
 * Could be delayed if needs to parse some other JS files before-hand,
 * hence not setup synchronously.
 */
async function start() {
    env.services.action.dispatch(
        'init/start',
    );
    env.services.model.messaging = env.services.action.dispatch(
        'Messaging/create',
    );
    env.services.model.messagingCreated.resolve();
    await env.services.action.dispatch(
        'Messaging/start',
        env.services.model.messaging,
    );
    env.services.model.messagingInitialized.resolve();
}

init();
