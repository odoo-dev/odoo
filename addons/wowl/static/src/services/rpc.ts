import { Component } from "@odoo/owl";
import { Service, OdooEnv } from "../types";

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

type Params = { [key: string]: any };

export type RPC = (route: string, params?: Params, settings?: RPCSettings) => Promise<any>;

export interface RPCServerError {
  type: "server";

  code: number;
  message: string;

  name?: string;
  subType?: string;

  data?: {
    [key: string]: any;
  };
}

interface RPCNetworkError {
  type: "network";
}

export type RPCError = RPCServerError | RPCNetworkError;

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
  const XHR = env.browser.XMLHttpRequest;

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

      // Odoo returns error like this, in a error field instead of properly
      // using http error codes...
      const { code, data: errorData, message, type: subType } = responseError;
      const { context: data_context, name: data_name } = errorData || {};
      const { exception_class } = data_context || {};
      const name = exception_class || data_name;

      const error: RPCServerError = {
        type: "server",
        code,
        message,
        data: errorData,
        name,
        subType,
      };

      bus.trigger("RPC_ERROR", error);
      reject(error);
    });

    // handle failure
    request.addEventListener("error", () => {
      handleLostConnection(env);
      const error: RPCError = {
        type: "network",
      };
      bus.trigger("RPC_ERROR", error);
      bus.trigger("RPC:RESPONSE", data.id);
      reject(error);
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
