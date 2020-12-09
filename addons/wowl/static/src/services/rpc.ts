import { Component } from "@odoo/owl";
import OdooError from "../crash_manager/odoo_error";
import { Service, OdooEnv, Odoo } from "../types";
declare const odoo: Odoo;

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

type Params = { [key: string]: any };

export type RPC = (route: string, params?: Params, settings?: RPCSettings) => Promise<any>;
export class RPCError extends OdooError {
  public exceptionName?: string;
  public type: string;
  public code!: number;
  public subType?: string;
  public data?: {
    [key: string]: any;
  };
  constructor() {
    super("RPC_ERROR");
    this.type = "server";
  }
}

// -----------------------------------------------------------------------------
// Handling of lost connection
// -----------------------------------------------------------------------------

let isConnected = true;
let rpcId: number = 0;

function handleLostConnection(env: OdooEnv) {
  if (!isConnected) {
    return;
  }
  isConnected = false;
  const notificationId = env.services.notifications.create(
    "Connection lost. Trying to reconnect...",
    { sticky: true }
  );
  let delay = 2000;
  setTimeout(function checkConnection() {
    jsonrpc(env, "/web/webclient/version_info", {}, rpcId++)
      .then(function () {
        isConnected = true;
        env.services.notifications.close(notificationId);
      })
      .catch(() => {
        // exponential backoff, with some jitter
        delay = delay * 1.5 + 500 * Math.random();
        setTimeout(checkConnection, delay);
      });
  }, delay);
}

function makeErrorFromResponse(reponse: any): RPCError {
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

// -----------------------------------------------------------------------------
// Main RPC method
// -----------------------------------------------------------------------------

interface RPCSettings {
  shadow?: boolean;
}

function jsonrpc(
  env: OdooEnv,
  url: string,
  params: Params,
  rpcId: number,
  settings: RPCSettings = {}
): Promise<any> {
  const bus = env.bus;
  const XHR = odoo.browser.XMLHttpRequest;

  const data = {
    id: rpcId,
    jsonrpc: "2.0",
    method: "call",
    params: params,
  };

  return new Promise((resolve, reject) => {
    const request = new XHR();
    if (!settings.shadow) {
      bus.trigger("RPC:REQUEST", data.id);
    }

    // handle success
    request.addEventListener("load", () => {
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
      handleLostConnection(env);
      bus.trigger("RPC:RESPONSE", data.id);
      // We do not throw an error as it is handled in the handleLostConnection
      // If we wanted to throw an error anyway but not display it with the crash manager,
      // a "mute" argument had been proposed on the OdooError object. It is not implemented currently.
    });

    // configure and send request
    request.open("POST", url);
    request.setRequestHeader("Content-Type", "application/json");
    request.send(JSON.stringify(data));
  });
}

// -----------------------------------------------------------------------------
// RPC service
// -----------------------------------------------------------------------------

export const rpcService: Service<RPC> = {
  name: "rpc",
  dependencies: ["notifications"],
  deploy(env: OdooEnv): RPC {
    return async function (
      this: Component | null,
      route: string,
      params: Params = {},
      settings?
    ): Promise<any> {
      if (this instanceof Component) {
        if (this.__owl__.isDestroyed) {
          throw new Error("A destroyed component should never initiate a RPC");
        }
        const result = await jsonrpc(env, route, params, rpcId++, settings);
        if (this instanceof Component && this.__owl__.isDestroyed) {
          return new Promise(() => {});
        }
        return result;
      }
      return jsonrpc(env, route, params, rpcId++, settings);
    };
  },
};
