import { ActionDescription } from "../../src/services/action_manager/action_manager";
import { ModelData, ModelMethod, ModelMethods, Service } from "../../src/types";
import { MockRPC, makeFakeRPCService, makeMockFetch } from "./mocks";
import { MenuData } from "../../src/services/menus";
import { TestConfig } from "./utility";
import { Registry } from "../../src/core/registry";

// Aims:
// - Mock service model high level
// - propose mock model.call lower level
// - propose mock RPC low level

// Can be passed data
// returns at least model service

export interface ServerData {
  models?: {
    [modelName: string]: ModelData;
  };
  actions?: {
    [key: string]: ActionDescription;
  };
  views?: {
    [key: string]: string;
  };
  menus?: MenuData;
}

/*
 * DEFAULT ROUTES AND METHODS
 */
function loadViews(this: ServerData) {
  console.log("loadViews", this);
}
function loadMenus(this: ServerData) {
  return this.menus;
}
function loadAction(this: ServerData, route: string, routeArgs?: any) {
  const { action_id } = routeArgs || {};
  return (action_id && this.actions && this.actions[action_id]) || {};
}
const defaultRoutes: any = {
  "/web/action/load": loadAction,
  "/wowl/load_menus": loadMenus,
};
const defaultModelMethods: ModelMethods = {
  load_views: loadViews,
};
function getModelMethod(
  serverData: ServerData | undefined,
  modelName: string,
  methodName: string
): ModelMethod | undefined {
  return (
    serverData &&
    serverData.models &&
    serverData.models[modelName] &&
    serverData.models[modelName].methods &&
    serverData.models[modelName].methods![methodName]
  );
}
export function makeMockServer(
  config: TestConfig,
  serverData?: ServerData,
  mockRPC?: MockRPC
): void {
  serverData = serverData || {};
  const _mockRPC: MockRPC = (...params: Parameters<MockRPC>) => {
    const [route, routeArgs] = params;
    let res;
    if (mockRPC) {
      res = mockRPC.apply(serverData, params);
    }
    if (res === undefined && routeArgs && "model" in routeArgs) {
      const { model, method } = routeArgs;
      const localMethod = getModelMethod(serverData, model, method);
      if (localMethod) {
        res = localMethod.call(serverData, routeArgs.args, routeArgs.kwargs);
      }
      if (res === undefined && method in defaultModelMethods) {
        res = defaultModelMethods[routeArgs.method].call(
          serverData,
          routeArgs.args,
          routeArgs.kwargs
        );
      }
    }
    if (res === undefined && route in defaultRoutes) {
      res = defaultRoutes[route].call(serverData, route, routeArgs);
    }
    return res;
  };
  const rpcService = makeFakeRPCService(_mockRPC);
  config.browser = config.browser || {};
  config.browser.fetch = makeMockFetch(_mockRPC);
  config.services = config.services || new Registry<Service>();
  config.services.add("rpc", rpcService);
}
