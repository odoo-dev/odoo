odoo.define('web.env', function (require) {
    'use strict';

    const env = require('web.common_env');
    const dataManager = require('web.data_manager');
    const { blockUI, unblockUI } = require('web.framework');

    Object.assign(env, {
        dataManager,
    });
    Object.assign(env.services, {
        blockUI,
        unblockUI,
    });

    return env;
});
