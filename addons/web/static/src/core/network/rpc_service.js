/** @odoo-module **/

import { browser } from "../browser/browser";
import { serviceRegistry } from "../service_registry";

// -----------------------------------------------------------------------------
// Errors
// -----------------------------------------------------------------------------
export class RPCError extends Error {
    constructor() {
        super(...arguments);
        this.name = "RPC_ERROR";
        this.type = "server";
    }
}

export class ConnectionLostError extends Error {
    constructor() {
        super(...arguments);
        this.name = "CONNECTION_LOST_ERROR";
    }
}

export class ConnectionAbortedError extends Error {
    constructor() {
        super(...arguments);
        this.name = "CONNECTION_ABORTED_ERROR";
    }
}

// -----------------------------------------------------------------------------
// Main RPC method
// -----------------------------------------------------------------------------
function makeErrorFromResponse(reponse) {
    // Odoo returns error like this, in a error field instead of properly
    // using http error codes...
    const { code, data: errorData, message, type: subType } = reponse;
    const { context: data_context, name: data_name } = errorData || {};
    const { exception_class } = data_context || {};
    const exception_class_name = exception_class || data_name;
    const error = new RPCError();
    error.exceptionName = exception_class_name;
    error.subType = subType;
    error.data = errorData;
    error.message = message;
    error.code = code;
    return error;
}

function jsonrpc(env, rpcId, url, params, settings = {}) {
    const bus = env.bus;
    const XHR = browser.XMLHttpRequest;
    const data = {
        id: rpcId,
        jsonrpc: "2.0",
        method: "call",
        params: params,
    };
    const request = new XHR();
    let rejectFn;
    const promise = new Promise((resolve, reject) => {
        rejectFn = reject;
        if (!settings.shadow) {
            bus.trigger("RPC:REQUEST", data.id);
        }
        // handle success
        request.addEventListener("load", () => {
            if (request.status === 502) {
                // If Odoo is behind another server (eg.: nginx)
                bus.trigger("RPC:RESPONSE", data.id);
                reject(new ConnectionLostError());
                return;
            }
            const { error: responseError, result: responseResult } = JSON.parse(request.response);
            bus.trigger("RPC:RESPONSE", data.id);
            if (!responseError) {
                return resolve(responseResult);
            }
            const error = makeErrorFromResponse(responseError);
            reject(error);
        });
        // handle failure
        request.addEventListener("error", () => {
            bus.trigger("RPC:RESPONSE", data.id);
            reject(new ConnectionLostError());
        });
        // configure and send request
        request.open("POST", url);
        request.setRequestHeader("Content-Type", "application/json");
        request.send(JSON.stringify(data));
    });
    promise.abort = function () {
        if (request.abort) {
            request.abort();
        }
        rejectFn(new ConnectionAbortedError());
    };
    return promise;
}

// -----------------------------------------------------------------------------
// RPC service
// -----------------------------------------------------------------------------
export const rpcService = {
    start(env) {
        let rpcId = 0;
        return (route, params = {}, settings) => {
            return jsonrpc(env, rpcId++, route, params, settings);
        };
    },
    specializeForComponent(component, rpc) {
        return async (...args) => {
            if (component.__owl__.status === 5 /* DESTROYED */) {
                throw new Error("A destroyed component should never initiate a RPC");
            }
            const result = await rpc(...args);
            return component.__owl__.status === 5 ? new Promise(() => {}) : result;
        };
    },
};

serviceRegistry.add("rpc", rpcService);
