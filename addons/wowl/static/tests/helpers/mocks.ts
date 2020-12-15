import { UserService } from "../../src/services/user";
import { Odoo, OdooEnv, OdooConfig, Service } from "../../src/types";
import { RPC } from "../../src/services/rpc";
import { Deferred, TestConfig } from "./utility";
import { Query, Route, Router, makePushState, routeToUrl } from "../../src/services/router";
import { Cookie, cookieService } from "../../src/services/cookie";
import { titleService } from "../../src/services/title";
import { DowloadFileOptions, Download } from "../../src/services/download";
import { NotificationService } from "../../src/notifications/notification_service";
import { UIService } from "../../src/services/ui/ui";
import { Device, SIZES } from "../../src/services/device";

// // -----------------------------------------------------------------------------
// // Mock Services
// // -----------------------------------------------------------------------------

/**
 * Simulate a fake user service.
 */
export function makeFakeUserService(values?: Partial<UserService>): Service<UserService> {
  const { uid, name, username, is_admin, user_companies, partner_id, db } = odoo.session_info;
  const { user_context } = odoo.session_info;
  return {
    name: "user",
    deploy(env: OdooEnv, config: OdooConfig): UserService {
      const { localization } = config;
      const result = {
        dateFormat: localization.dateFormat,
        decimalPoint: localization.decimalPoint,
        direction: localization.direction,
        grouping: localization.grouping,
        multiLang: localization.multiLang,
        thousandsSep: localization.thousandsSep,
        timeFormat: localization.timeFormat,
        context: user_context as any,
        userId: uid,
        name: name,
        userName: username,
        isAdmin: is_admin,
        partnerId: partner_id,
        allowed_companies: user_companies.allowed_companies,
        current_company: user_companies.current_company,
        lang: user_context.lang,
        tz: "Europe/Brussels",
        db: db,
        showEffect: false,
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

export function makeTestOdoo(config: TestConfig = {}): Odoo {
  return Object.assign({}, odoo, {
    browser: (config.browser || {}) as Odoo["browser"],
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
    serviceRegistry: config.serviceRegistry,
    mainComponentRegistry: config.mainComponentRegistry,
    actionRegistry: config.actionRegistry,
    systrayRegistry: config.systrayRegistry,
    errorDialogRegistry: config.errorDialogRegistry,
    userMenuRegistry: config.userMenuRegistry,
    debugManagerRegistry: config.debugManagerRegistry,
    viewRegistry: config.viewRegistry,
  });
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
  onPushState?: (mode: "push" | "replace", newState: Route["hash"]) => any;
  initialRoute?: Partial<Route>;
  redirect?: (url: string, wait?: boolean) => void;
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

      function doPush(mode: "push" | "replace" = "push", route: Route) {
        const oldUrl = routeToUrl(current);
        const newRoute = getRoute(route);
        const newUrl = routeToUrl(newRoute);
        if (params && params.onPushState && oldUrl !== newUrl) {
          params.onPushState(mode, route.hash);
        }
        current = newRoute;
      }
      return {
        get current(): Route {
          return getCurrent();
        },
        pushState: makePushState(env, getCurrent, doPush.bind(null, "push")),
        replaceState: makePushState(env, getCurrent, doPush.bind(null, "replace")),
        redirect: (params && params.redirect) || (() => {}),
      };
    },
  };
}

export function makeFakeDeviceService(): Service<Device> {
  return {
    name: "device",
    deploy() {
      return {
        isSmall: false,
        isMobileOS: false,
        hasTouch: false,
        size: SIZES.LG,
        SIZES,
      };
    },
  };
}

export const fakeCookieService: typeof cookieService = {
  name: "cookie",
  deploy() {
    const cookie: Cookie = {};
    return {
      get current() {
        return cookie;
      },
      setCookie(key, value, ttl) {
        if (value !== undefined) {
          cookie[key] = value;
        }
      },
      deleteCookie(key) {
        delete cookie[key];
      },
    };
  },
};

export const fakeTitleService: typeof titleService = {
  name: "title",
  deploy() {
    let current = {};
    return {
      get current() {
        return JSON.stringify(current);
      },
      getParts() {
        return current;
      },
      setParts(parts) {
        current = Object.assign({}, current, parts);
      },
    };
  },
};

export function makeFakeDownloadService(callback: CallableFunction): Service<Download> {
  return {
    name: "download",
    deploy(): Download {
      return async function (options: DowloadFileOptions) {
        return await callback(options);
      };
    },
  };
}

export function makeFakeUIService(
  blockCallback: CallableFunction,
  unblockCallback: CallableFunction
): Service<UIService> {
  return {
    name: "ui",
    deploy(): UIService {
      function block(): void {
        blockCallback();
      }
      function unblock(): void {
        unblockCallback();
      }
      return { block, unblock };
    },
  };
}

export function makeFakeNotificationService(
  createMock: CallableFunction,
  closeMock: CallableFunction
): Service<NotificationService> {
  return {
    name: "notifications",
    deploy(): NotificationService {
      function create() {
        return createMock(...arguments);
      }
      function close() {
        return closeMock(...arguments);
      }
      return {
        create,
        close,
      };
    },
  };
}
