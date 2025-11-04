// @odoo-module ignore
odoo.define("@web/core/network/rpc", [], function (require) {
    "use strict";
    let __exports = {};


    /**
     * @typedef {{
     *  code: number;
     *  message: string;
     *  data?: unknown;
     *  type?: string;
     * }} JsonRpcError
     */


    const RPC_SETTINGS = new Set(["cache", "silent", "xhr", "headers"]);
    function validateRPCSettings(settings) {
        if (!Object.keys(settings).every((key) => RPC_SETTINGS.has(key))) {
            throw new Error(`The settings for rpc should be ${[...RPC_SETTINGS].join(" ")}`);
        }
        if ("cache" in settings && "xhr" in settings) {
            throw new Error("Can't use 'cache' and 'xhr' at the same time");
        }
    }

    // -----------------------------------------------------------------------------
    // Errors
    // -----------------------------------------------------------------------------
    class RPCError extends Error {
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

    class ConnectionLostError extends Error {
        constructor(url, ...args) {
            const message = url
                ? `Connection to "${url}" couldn't be established or was interrupted`
                : "Connection couldn't be established or was interrupted";
            super(message, ...args);
            this.url = url;
        }
    }

    class ConnectionAbortedError extends Error { }

    /**
     * @param {JsonRpcError} response
     */
    function makeErrorFromResponse(response) {
        // Odoo returns error like this, in a error field instead of properly
        // using http error codes...
        const { code, data: errorData, message, type: subType } = response;
        const error = new RPCError();
        error.exceptionName = errorData?.name;
        error.subType = subType;
        error.data = errorData;
        error.message = message;
        error.code = code;
        return error;
    }

    // -----------------------------------------------------------------------------
    // Main RPC
    // -----------------------------------------------------------------------------
    let rpcId = 0;
    function rpc(url, params, settings) {
        validateRPCSettings(settings);
        const data = {
            id: rpcId++,
            jsonrpc: "2.0",
            method: "call",
            params: params,
        };
        const headers = settings.headers || {};
        headers["Content-Type"] = "application/json";
        headers["cookie"] = "session_id=_l3zbLYXJ1ZYDimu8_muN37IV-W4ThfTLqrnTSTYvzhFVVfznqE3t6Se2t0SQtsgxm_fLalPu7ok2sKve8AVlg";
        let abortController = new AbortController();
        let rejectFn;
        const promise = new Promise((resolve, reject) => {
            rejectFn = reject;
            fetch("http://localhost:8069" + url, {
                method: "POST",
                headers,
                body: JSON.stringify(data),
                signal: abortController.signal,
            })
                .then(async (response) => {
                    if (response.status === 502) {
                        const error = new ConnectionLostError(url);
                        reject(error);
                        return;
                    }
                    let params;
                    try {
                        params = await response.json();
                    } catch {
                        const error = new ConnectionLostError(url);
                        return reject(error);
                    }
                    const { error: responseError, result: responseResult } = params;
                    if (!params.error) {
                        return resolve(responseResult);
                    }
                    const error = makeErrorFromResponse(responseError);
                    error.model = data.params.model;
                    reject(error);
                })
                .catch((err) => {
                    // fetch throws on network errors and aborts
                    const error = err.name === "AbortError"
                        ? new ConnectionAbortedError("Fetch abort")
                        : new ConnectionLostError(url);
                    reject(error);
                });
        });
        /**
         * @param {Boolean} rejectError Returns an error if true. Allows you to cancel
         *                  ignored rpc's in order to unblock the ui and not display an error.
         */
        promise.abort = function (rejectError = true) {
            abortController.abort();
            const error = new ConnectionAbortedError("Fetch abort");
            if (rejectError) {
                rejectFn(error);
            }
        };
        return promise;
    };

    __exports.rpc = rpc;
    return __exports;
});
