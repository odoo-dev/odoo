/** @odoo-module */

import { getCurrent } from "@odoo/hoot";

let mockJsonrpc = null;

/**
 * @param {import("@web/core/network/rpc").jsonrpc} jsonrpc
 */
export function mockRpc(jsonrpc) {
    const { suite } = getCurrent();
    if (!suite) {
        throw new Error(`Cannot call \`mockRpc\` outside of a test or a suite`);
    }
    mockJsonrpc = jsonrpc;
}

/**
 * @param {import("@web/core/network/rpc").jsonrpc} jsonrpc
 */
export function mockRpcFactory() {
    return {
        jsonrpc: (...args) => mockJsonrpc(...args),
    };
}
