import { ActionDescription } from "../../src/services/action_manager/action_manager";
import { ModelData, ModelMethod, ModelMethods, Service } from "../../src/types";
import { makeFakeRPCService } from "./index";
import { Registry } from "../../src/core/registry";
import { MockRPC } from "./mocks";
import { MenuData } from "../../src/services/menus";

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
 * BASIC MODEL METHODS
 */
function loadViews(this: ModelData) {
  console.log("loadViews", this);
}

function loadAction(this: ServerData, route: string, routeArgs?: any) {
  const { action_id } = routeArgs || {};
  return (action_id && this.actions && this.actions[action_id]) || {};
}
const defaultRoutes: any = {
  "/web/action/load": loadAction,
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
  servicesRegistry: Registry<Service>,
  serverData?: ServerData,
  mockRPC?: MockRPC
): Registry<Service> {
  const mockedRPCs: MockRPC[] = [];
  const _mockRPC: MockRPC = (...params: Parameters<MockRPC>) => {
    const [route, routeArgs] = params;
    let res;
    if (routeArgs && "model" in routeArgs) {
      const { model, method } = routeArgs;
      const localMethod = getModelMethod(serverData, model, method);
      if (localMethod) {
        res = localMethod.call(serverData, routeArgs.args, routeArgs.kwargs);
      }
      if (method in defaultModelMethods) {
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
  if (mockRPC) {
    mockedRPCs.push(mockRPC.bind(serverData));
  }
  mockedRPCs.push(_mockRPC);
  const rpcService = makeFakeRPCService(mockedRPCs);
  servicesRegistry.add("rpc", rpcService);
  return servicesRegistry;
}
