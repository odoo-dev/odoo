import { UserService } from "../../src/services/user";
import { Odoo, OdooEnv, OdooConfig, Service } from "../../src/types";
import { RPC } from "../../src/services/rpc";
import type { Deferred } from "./utility";
import { Query, Route, Router, makePushState } from "../../src/services/router";

// // -----------------------------------------------------------------------------
// // Mock Services
// // -----------------------------------------------------------------------------

/**
 * Simulate a fake user service.  For convenience, by default, this fake user
 * service will return { uid: 2 } as context, even though it is not a valid
 * context.  If this is significant for a test, then the `fullContext` option
 * should be set to true.
 */
export function makeFakeUserService(
  values?: Partial<UserService>,
  fullContext: boolean = false
): Service<UserService> {
  const odoo = makeTestOdoo();
  const { uid, name, username, is_admin, user_companies, partner_id } = odoo.session_info;
  const { user_context } = odoo.session_info;
  return {
    name: "user",
    deploy(env: OdooEnv, config: OdooConfig): UserService {
      const { localization } = config;
      const context = fullContext ? user_context : ({ uid: 2 } as any);
      const result = {
        dateFormat: localization.dateFormat,
        decimalPoint: localization.decimalPoint,
        direction: localization.direction,
        grouping: localization.grouping,
        multiLang: localization.multiLang,
        thousandsSep: localization.thousandsSep,
        timeFormat: localization.timeFormat,
        context,
        userId: uid,
        name: name,
        userName: username,
        isAdmin: is_admin,
        partnerId: partner_id,
        allowed_companies: user_companies.allowed_companies,
        current_company: user_companies.current_company,
        lang: user_context.lang,
        tz: "Europe/Brussels",
      };
      Object.assign(result, values);
      return result;
    },
  };
}

/*export function makeFakeMenusService(menuData?: MenuData): Service<MenuService> {
  const _menuData = menuData || {
    root: { id: "root", children: [1], name: "root" },
    1: { id: 1, children: [], name: "App0" },
  };
  return {
    name: "menus",
    deploy() {
      const menusService = {
        getMenu(menuId: keyof MenuData) {
          return _menuData![menuId];
        },
        getApps() {
          return this.getMenu("root").children.map((mid) => this.getMenu(mid));
        },
        getAll() {
          return Object.values(_menuData);
        },
        getMenuAsTree(menuId: keyof MenuData) {
          const menu = this.getMenu(menuId) as MenuTree;
          if (!menu.childrenTree) {
            menu.childrenTree = menu.children.map((mid: Menu["id"]) => this.getMenuAsTree(mid));
          }
          return menu;
        },
      };
      return menusService;
    },
  };
}*/

function buildMockRPC(mockRPC?: MockRPC) {
  return async (...args: Parameters<RPC>) => {
    if (mockRPC) {
      return mockRPC(...args);
    }
  };
}

export type MockRPC = (...params: Parameters<RPC>) => any;
export function makeFakeRPCService(mockRPC?: MockRPC): Service<RPC> {
  return {
    name: "rpc",
    deploy() {
      return buildMockRPC(mockRPC);
    },
  };
}

export function makeTestOdoo(): Odoo {
  return {
    session_info: {
      cache_hashes: {
        load_menus: "161803",
        translations: "314159",
      },
      user_context: {
        lang: "en",
        uid: 7,
        tz: "taht",
      },
      qweb: "owl",
      uid: 7,
      name: "Mitchell",
      username: "The wise",
      is_admin: true,
      partner_id: 7,
      user_companies: {
        allowed_companies: [[1, "Hermit"]],
        current_company: [1, "Hermit"],
      },
      db: "test",
      server_version: "1.0",
      server_version_info: ["1.0"],
    },
  };
}

export function makeMockXHR(
  response?: any,
  sendCb?: (data: any) => void,
  def?: Deferred<any>
): typeof XMLHttpRequest {
  let MockXHR: typeof XMLHttpRequest = function () {
    return {
      _loadListener: null,
      url: "",
      addEventListener(type: string, listener: any) {
        if (type === "load") {
          this._loadListener = listener;
        }
      },
      open(method: string, url: string) {
        this.url = url;
      },
      setRequestHeader() {},
      async send(data: string) {
        if (sendCb) {
          sendCb.call(this, JSON.parse(data));
        }
        if (def) {
          await def;
        }
        (this._loadListener as any)();
      },
      response: JSON.stringify(response || ""),
    };
  } as any;
  return MockXHR;
}

//   // -----------------------------------------------------------------------------
//   // Low level API mocking
//   // -----------------------------------------------------------------------------

export function makeMockFetch(mockRPC: MockRPC): typeof fetch {
  const _rpc = buildMockRPC(mockRPC);
  return async (input: RequestInfo) => {
    let route = typeof input === "string" ? input : input.url;
    let params;
    if (route.includes("load_menus")) {
      const routeArray = route.split("/");
      params = {
        hash: routeArray.pop(),
      };
      route = routeArray.join("/");
    }
    let res;
    let status;
    try {
      res = await _rpc(route, params);
      status = 200;
    } catch (e) {
      status = 500;
    }
    const blob = new Blob([JSON.stringify(res || {})], { type: "application/json" });
    return new Response(blob, { status });
  };
}

interface FakeRouterParams {
  onPushState?: (...args: any[]) => any;
  initialRoute?: Partial<Route>;
}

function stripUndefinedQueryKey(query: Query): Query {
  const keyValArray = Array.from(Object.entries(query)).filter(([k, v]) => v !== undefined);
  // transform to Object.fromEntries in es > 2019
  const newObj: Query = {};
  keyValArray.forEach(([k, v]) => {
    newObj[k] = v;
  });
  return newObj;
}
function getRoute(route: Route): Route {
  route.hash = stripUndefinedQueryKey(route.hash);
  route.search = stripUndefinedQueryKey(route.search);
  return route;
}

export function makeFakeRouterService(params?: FakeRouterParams): Service<Router> {
  let _current: Route = {
    pathname: "test.wowl",
    search: {},
    hash: {},
  };
  if (params && params.initialRoute) {
    Object.assign(_current, params.initialRoute);
  }
  let current = getRoute(_current);
  return {
    name: "router",
    deploy(env: OdooEnv) {
      function loadState(hash: Route["hash"]) {
        current.hash = hash;
        env.bus.trigger("ROUTE_CHANGE");
      }
      env.bus.on("test:hashchange", null, loadState);

      function getCurrent() {
        return current;
      }

      function doPush(route: Route) {
        if (params && params.onPushState) {
          params.onPushState(route.hash);
        }
        current = getRoute(route);
      }
      return {
        get current(): Route {
          return getCurrent();
        },
        pushState: makePushState(env, getCurrent, doPush),
      };
    },
  };
}
