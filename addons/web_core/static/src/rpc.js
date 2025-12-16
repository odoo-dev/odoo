/**
 * -----------------------------------------------------------------------------
 * RPC
 * -----------------------------------------------------------------------------
 * File description
 * -----------------------------------------------------------------------------
 */

import { EventBus, Plugin } from "@odoo/owl";
import { registry } from "./registry";
import { service } from "./services";

export function rpc(url, params = {}, settings = {}) {
    const rpc = service(RPC);
    return rpc.call(url, params, settings);
}

export class RPC extends Plugin {
    static id = "rpc";
    static {
        registry.get("services").addById(this);
    }

    /** @private */
    _bus = new EventBus();
    /** @private */
    _rpcId = 1;

    call(url, params = {}, settings = {}) {
        // if (settings.cached && rpcCache) {
        //     return rpcCache.read(
        //         params?.method || url, // table
        //         JSON.stringify({ url, params }), // key
        //         () => rpc._rpc(url, params, omit(settings, "cached"))
        //     );
        // }
        const data = {
            id: this._rpcId++,
            jsonrpc: "2.0",
            method: "call",
            params: params,
        };
        const request = settings.xhr || new XMLHttpRequest();
        let rejectFn;
        const executor = (resolve, reject) => {
            rejectFn = reject;
            this._bus.trigger("RPC:REQUEST", { data, url, settings });
            // handle success
            request.addEventListener("load", () => {
                if (request.status === 502) {
                    // If Odoo is behind another server (eg.: nginx)
                    const error = new ConnectionLostError(url);
                    this._bus.trigger("RPC:RESPONSE", { data, settings, error });
                    reject(error);
                    return;
                }
                let params;
                try {
                    params = JSON.parse(request.response);
                } catch {
                    // the response isn't json parsable, which probably means that the rpc request could
                    // not be handled by the server, e.g. PoolError('The Connection Pool Is Full')
                    const error = new ConnectionLostError(url);
                    this._bus.trigger("RPC:RESPONSE", { data, settings, error });
                    return reject(error);
                }
                const { error: responseError, result: responseResult } = params;
                if (!params.error) {
                    this._bus.trigger("RPC:RESPONSE", { data, settings, result: params.result });
                    return resolve(responseResult);
                }
                const error = makeErrorFromResponse(responseError);
                error.id = data.id;
                error.model = data.params.model;
                this._bus.trigger("RPC:RESPONSE", { data, settings, error });
                reject(error);
            });
            // handle failure
            request.addEventListener("error", () => {
                const error = new ConnectionLostError(url);
                this._bus.trigger("RPC:RESPONSE", { data, settings, error });
                reject(error);
            });
            // configure and send request
            request.open("POST", url);
            const headers = settings.headers || {};
            headers["Content-Type"] = "application/json";
            for (const [header, value] of Object.entries(headers)) {
                request.setRequestHeader(header, value);
            }
            request.send(JSON.stringify(data));
        };

        const onDetach = () => {
            if (request.abort) {
                request.abort();
            }
            const error = new ConnectionAbortedError("XmlHttpRequestError abort");
            this._bus.trigger("RPC:RESPONSE", { data, settings, error });
            // if (rejectError) {
            //     rejectFn(error);
            // }
        }
        return new Promise(executor, onDetach);
    }
}

// -----------------------------------------------------------------------------

export class RPCError extends Error {
    constructor() {
        super(...arguments);
        this.name = "RPC_ERROR";
        this.type = "server";
        this.code = null;
        this.data = null;
        this.exceptionName = null;
        this.subType = null;
    }
}

export class ConnectionLostError extends Error {
    constructor(url, ...args) {
        super(`Connection to "${url}" couldn't be established or was interrupted`, ...args);
        this.url = url;
    }
}

export class ConnectionAbortedError extends Error {}

export function makeErrorFromResponse(reponse) {
    // Odoo returns error like this, in a error field instead of properly
    // using http error codes...
    const { code, data: errorData, message, type: subType } = reponse;
    const error = new RPCError();
    error.exceptionName = errorData.name;
    error.subType = subType;
    error.data = errorData;
    error.message = message;
    error.code = code;
    return error;
}
