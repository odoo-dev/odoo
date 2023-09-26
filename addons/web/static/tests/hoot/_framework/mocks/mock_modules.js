/** @odoo-module */

import { mockRpcFactory } from "./mock_rpc";

const mockedModules = {
    // Web client loaders
    "web.legacySetup": () => {},
    "@web/main": () => {},
    "@web/start": () => {},
    "@web_enterprise/main": () => {},
    // Other mocks
    "@web/core/network/rpc": mockRpcFactory,
};

const odooDefine = odoo.define;
for (const name in mockedModules) {
    odooDefine(name, [], mockedModules[name]);
}

odoo.define = function define(name, ...args) {
    if (name in mockedModules) {
        return;
    }
    return odooDefine(name, ...args);
};
