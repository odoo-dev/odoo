odoo.define('web.test_utils_action_manager', function (require) {
"use strict";

const testUtilsAsync = require('web.test_utils_async');

function doAction(action, options) {
    const env = owl.Component.env;
    env.bus.trigger('do-action', {action, options});
    return testUtilsAsync.nextTick();
}

function loadState(webClient, state) {
    webClient._getWindowHash = () => {
        const hash = Object.keys(state).map(k => `${k}=${state[k]}`).join('&');
        return `#${hash}`;
    };
    webClient._onHashchange();
    return testUtilsAsync.nextTick();
}

return {
    doAction: doAction,
    loadState: loadState,
};

});
