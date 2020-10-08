import { Component } from "@odoo/owl";
import { Service, OdooEnv } from "../types";

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

type Params = { [key: string]: any };

export type RPC = (route: string, params?: Params) => Promise<any>;

interface RPCServerError {
  type: "server";
  message: string;
  code: number;
  data_message: string;
  data_debug: string;
}

interface RPCNetworkError {
  type: "network";
}

type RPCError = RPCServerError | RPCNetworkError;

// -----------------------------------------------------------------------------
// Main RPC method
// -----------------------------------------------------------------------------
function jsonrpc(env: OdooEnv, url: string, params: Params): Promise<any> {
  const bus = env.bus;
  const XHR = env.browser.XMLHttpRequest;

  const data = {
    id: Math.floor(Math.random() * 1000 * 1000 * 1000),
    jsonrpc: "2.0",
    method: "call",
    params: params,
  };

  return new Promise((resolve, reject) => {
    const request = new XHR();

    // handle success
    request.addEventListener("load", (data) => {
      const response = JSON.parse(request.response);
      if ("error" in response) {
        // Odoo returns error like this, in a error field instead of properly
        // using http error codes...
        const error: RPCError = {
          type: "server",
          message: response.error.message,
          code: response.error.code,
          data_debug: response.error.data.debug,
          data_message: response.error.data.message,
        };
        bus.trigger("RPC_ERROR", error);
        reject(error);
      }
      resolve(response.result);
    });

    // handle failure
    request.addEventListener("error", () => {
      const error: RPCError = {
        type: "network",
      };
      bus.trigger("RPC_ERROR", error);
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
  deploy(env: OdooEnv): RPC {
    return async function (
      this: Component | null,
      route: string,
      params: Params = {}
    ): Promise<any> {
      if (this instanceof Component) {
        if (this.__owl__.isDestroyed) {
          throw new Error("A destroyed component should never initiate a RPC");
        }
        const result = await jsonrpc(env, route, params);
        if (this instanceof Component && this.__owl__.isDestroyed) {
          return new Promise(() => {});
        }
        return result;
      }
      return jsonrpc(env, route, params);
    };
  },
};
