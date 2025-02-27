import { before } from "@odoo/hoot";
import { patchWithCleanup } from "@web/../tests/web_test_helpers";

const upgradeCallbacks = {};

export function upgrade(container, env) {
    for (const callback of Object.values(upgradeCallbacks)) {
        callback(container, env);
    }
}

/**
 * @param {Array} callbacks
 */
export function setupUpgradeFunctions(callbacks) {
    before(() => {
        const newCallbacks = {};
        for (let i = 0; i < callbacks.length; i++) {
            newCallbacks[i] = callbacks[i];
        }
        patchWithCleanup(upgradeCallbacks, newCallbacks);
    });
}
