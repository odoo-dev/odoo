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
    let sessionId = null;
    let apiKey = null;
    // async function authenticate() {
    //     // This is so 2024
    //     const response = await fetch('http://localhost:8069/web/session/authenticate', {
    //         method: 'POST',
    //         headers: {
    //             'Content-Type': 'application/json',
    //         },
    //         body: JSON.stringify({
    //             params: {
    //                 db: 'odoo-db',
    //                 login: 'admin',
    //                 password: apiKey,
    //             }
    //         }),
    //     })
    //     const data = await response.json();
    //     console.log("authenticate response", data);
    //     sessionId = data.result.session_id;
    // }
    // -----------------------------------------------------------------------------
    // Main RPC
    // -----------------------------------------------------------------------------
    let rpcId = 0;
    async function rpc(url, params, settings) {
        validateRPCSettings(settings);
        const kwargs = params.kwargs || {};
        const context = kwargs.context || {};
        delete kwargs.context;
        const body = {
            ids: params.args[0] ?? [],
            context: context,
            ...kwargs,
        }
        // if (args.length > 1) { // ids, or nothing
        //     throw new Error("RPC with positional arguments is not supported by /json/2.");
        // }
        const headers = settings.headers || {};
        const [model, method] = url.split("/").slice(-2);
        headers["Content-Type"] = "application/json; charset=utf-8";
        headers["Authorization"] = "Bearer " + apiKey;
        headers["Host"] = "localhost:8069";
        // headers["X-Odoo-Database"] = ...
        console.log(model, method, body)
        console.log("headers", headers);
        let abortController = new AbortController();
        let rejectFn;
        const promise = new Promise((resolve, reject) => {
            rejectFn = reject;
            fetch(`http://localhost:8069/json/2/${model}/${method}`, {
                method: "POST",
                headers,
                body: JSON.stringify(body),
                signal: abortController.signal,
            })
                .then(async (response) => {
                    const result = await response.json();
                    return resolve(result);
                })
                .catch((err) => {
                    // fetch throws on network errors and aborts
                    const error = err.name === "AbortError"
                        ? new ConnectionAbortedError("Fetch abort")
                        : new ConnectionLostError(url);
                    console.log("fetch error", err);
                    console.log(err);
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
    __exports.setApiKey = (key) => {
        apiKey = key;
    };
    return __exports;
});
