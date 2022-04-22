/** @odoo-module */

import { buildQuery } from 'web.rpc';

const testEnvServices = Object.assign({
    getCookie() {},
    httpRequest(/* route, params = {}, readMethod = 'json' */) {
        return Promise.resolve('');
    },
    hotkey: { add: () => () => {} }, // fake service
});

/**
 * Creates services for the test environment. object
 *
 * @param {Object} [env={}]
 * @returns {Object}
 */
function makeTestEnvServices(env = {}) {
    return Object.assign(testEnvServices, {
        ajax: {
            rpc() {
              return env.session.rpc(...arguments); // Compatibility Legacy Widgets
            },
            loadLibs() {}
        },
        notification: { notify() { } },
        rpc(params, options) {
            const query = buildQuery(params);
            return env.session.rpc(query.route, query.params, options);
        },
        ui: { activeElement: document }, // fake service
    }, env.services);
}

export {
    makeTestEnvServices,
    testEnvServices,
};
