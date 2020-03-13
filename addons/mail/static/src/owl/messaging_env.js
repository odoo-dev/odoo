odoo.define('mail.messaging.env', function (require) {
'use strict';

const actions = require('mail.store.actions');
const getters = require('mail.store.getters');
const initializeState = require('mail.store.state');

const { Store } = owl;

const envs = {};

/**
 * Clears the messaging env for the given name.
 *
 * @param {string} name
 * @returns {Object}
 */
function clearMessagingEnv(name) {
    delete envs[name];
}
/**
 * Returns the messaging env for the given name. It is created if it doesn't
 * exist yet.
 *
 * By default the "main" env is returned. Another name should be given only when
 * multiple env have to coexist, which is typically the case for tests.
 *
 * @param {string} [name="main"] name of the env to return
 * @param {Object} [initialEnv={}] initial env data if it has to be created
 * @returns {Object}
 */
function getMessagingEnv(name, initialEnv = {}) {
    if (!envs[name]) {
        const env = Object.create(initialEnv);
        const store = new Store({
            actions,
            env: env,
            getters,
            state: initializeState(),
        });
        Object.assign(env, {
            envName: name,
            getStyleString,
            hasComposerAttachments: true,
            hasComposerEmojis: true,
            hasFontAwesome: true,
            isMessagePartnerDisplayNamePreferred: false,
            store,
        });
        envs[name] = env;
    }
    return envs[name];
}

/**
 * Returns inline style string from the given styles object.
 *
 * @param {Object} styles: each element is a CSS property and its value
 * @returns {string}
 */
function getStyleString(styles) {
    return Object.keys(styles).reduce((res, property) => {
        return res + _.str.sprintf("%s: %s;",
            property,
            owl.utils.escape(styles[property])
        );
    }, '');
}

return { clearMessagingEnv, getMessagingEnv };

});
