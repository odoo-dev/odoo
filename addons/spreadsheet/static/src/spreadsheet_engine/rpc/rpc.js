import { sendStdStreamRequest } from "./rpc_std_stream";

// Mostly copy-paste from web rpc.js


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
export async function rpc(url, params, settings) {
    validateRPCSettings(settings);
    const kwargs = params.kwargs || {};
    const context = kwargs.context || {};
    delete kwargs.context;
    const body = {
        message_type: "rpc",
        params,
    }
    // if (args.length > 1) { // ids, or nothing
    //     throw new Error("RPC with positional arguments is not supported by /json/2.");
    // }

    let abortController = new AbortController();
    let rejectFn;
    const parts = url.split("/");
    const model = parts[parts.length - 2];
    const method = parts[parts.length - 1];
    body.model = model;
    body.method = method;
    const promise = new Promise((resolve, reject) => {
        rejectFn = reject;
        sendStdStreamRequest(body)
            .then(async (response) => {
                return resolve(response.result);
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