/** @odoo-module **/

import { effectService } from "@web/effects/effect_service";
import { makePreProcessQuery, makePushState, routeToUrl } from "@web/services/router_service";
import { SIZES } from "@web/services/ui_service";
import { rpcService } from "@web/services/rpc_service";
import { localization } from "@web/localization/localization_settings";
import { translatedTerms } from "@web/localization/translation";
import { computeAllowedCompanyIds, makeSetCompanies } from "@web/services/user_service";
import { patchWithCleanup } from "./utils";

const { Component } = owl;

// -----------------------------------------------------------------------------
// Mock Services
// -----------------------------------------------------------------------------

export const defaultLocalization = {
  dateFormat: "MM/dd/yyyy",
  timeFormat: "HH:mm:ss",
  dateTimeFormat: "MM/dd/yyyy HH:mm:ss",
  decimalPoint: ".",
  direction: "ltr",
  grouping: [3, 0],
  multiLang: false,
  thousandsSep: ",",
  weekStart: 7,
};

export function makeFakeLocalizationService(config) {
  patchWithCleanup(localization, defaultLocalization);

  return {
    name: "localization",
    start: async (env) => {
      const _t = (str) => translatedTerms[str] || str;
      env._t = _t;
      env.qweb.translateFn = _t;
    },
  };
}

/**
 * Simulate a fake user service.
 */
export function makeFakeUserService(values) {
  const sessionInfo = {};
  Object.assign(sessionInfo, odoo.session_info, values && values.session_info);
  const { uid, name, username, is_admin, user_companies, partner_id, user_context } = sessionInfo;
  return {
    name: "user",
    start(env) {
      let allowedCompanies = computeAllowedCompanyIds();
      const setCompanies = makeSetCompanies(() => allowedCompanies);
      const context = {
        ...user_context,
        get allowed_company_ids() {
          return allowedCompanies;
        },
      };
      const result = {
        context,
        userId: uid,
        name: name,
        userName: username,
        isAdmin: is_admin,
        partnerId: partner_id,
        allowed_companies: user_companies.allowed_companies,
        get current_company() {
          return user_companies.allowed_companies[allowedCompanies[0]];
        },
        lang: user_context.lang,
        tz: "Europe/Brussels",
        get db() {
          const res = {
            name: sessionInfo.db,
          };
          if ("dbuuid" in sessionInfo) {
            res.uuid = sessionInfo.dbuuid;
          }
          return res;
        },
        showEffect: false,
        setCompanies(mode, companyId) {
          allowedCompanies = setCompanies(mode, companyId);
        },
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
    start() {
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

function buildMockRPC(mockRPC) {
  return async function (...args) {
    if (this instanceof Component && this.__owl__.status === 5) {
      return new Promise(() => {});
    }
    if (mockRPC) {
      return mockRPC(...args);
    }
  };
}

export function makeFakeRPCService(mockRPC) {
  return {
    name: "rpc",
    start() {
      return buildMockRPC(mockRPC);
    },
    specializeForComponent: rpcService.specializeForComponent,
  };
}

export function makeMockXHR(response, sendCb, def) {
  let MockXHR = function () {
    return {
      _loadListener: null,
      url: "",
      addEventListener(type, listener) {
        if (type === "load") {
          this._loadListener = listener;
        }
      },
      open(method, url) {
        this.url = url;
      },
      setRequestHeader() {},
      async send(data) {
        if (sendCb) {
          sendCb.call(this, JSON.parse(data));
        }
        if (def) {
          await def;
        }
        this._loadListener();
      },
      response: JSON.stringify(response || ""),
    };
  };
  return MockXHR;
}

// -----------------------------------------------------------------------------
// Low level API mocking
// -----------------------------------------------------------------------------

export function makeMockFetch(mockRPC) {
  const _rpc = buildMockRPC(mockRPC);
  return async (input) => {
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

function stripUndefinedQueryKey(query) {
  const keyValArray = Array.from(Object.entries(query)).filter(([k, v]) => v !== undefined);
  // transform to Object.fromEntries in es > 2019
  const newObj = {};
  keyValArray.forEach(([k, v]) => {
    newObj[k] = v;
  });
  return newObj;
}

function getRoute(route) {
  route.hash = stripUndefinedQueryKey(route.hash);
  route.search = stripUndefinedQueryKey(route.search);
  return route;
}

export function makeFakeRouterService(params) {
  let _current = {
    pathname: "test.wowl",
    search: {},
    hash: {},
  };
  if (params && params.initialRoute) {
    Object.assign(_current, params.initialRoute);
  }
  let current = getRoute(_current);
  return {
    start(env) {
      function loadState(hash) {
        current.hash = hash;
        env.bus.trigger("ROUTE_CHANGE");
      }
      env.bus.on("test:hashchange", null, loadState);
      function getCurrent() {
        return current;
      }
      function doPush(mode = "push", route) {
        const oldUrl = routeToUrl(current);
        const newRoute = getRoute(route);
        const newUrl = routeToUrl(newRoute);
        if (params && params.onPushState && oldUrl !== newUrl) {
          params.onPushState(mode, route.hash);
        }
        current = newRoute;
      }
      const preProcessQuery = makePreProcessQuery(getCurrent);
      return {
        get current() {
          return getCurrent();
        },
        pushState: makePushState(getCurrent, doPush.bind(null, "push"), preProcessQuery),
        replaceState: makePushState(getCurrent, doPush.bind(null, "replace"), preProcessQuery),
        redirect: (params && params.redirect) || (() => {}),
      };
    },
  };
}

export function makeFakeUIService(values) {
  const defaults = {
    bus: new owl.core.EventBus(),
    activateElement: () => {},
    deactivateElement: () => {},
    activeElement: document,
    getVisibleElements: () => ([]),
    block: () => {},
    unblock: () => {},
    isSmall: false,
    size: SIZES.LG,
    SIZES,
  };
  return {
    start(env) {
      const res = Object.assign(defaults, values);
      Object.defineProperty(env, "isSmall", {
        get() {
          return res.isSmall;
        },
      });
      return res;
    },
  };
}

export const fakeCookieService = {
  start() {
    const cookie = {};
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

export const fakeTitleService = {
  start() {
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

export function makeFakeDownloadService(callback) {
  return {
    start() {
      return async function (options) {
        if (callback) {
          return await callback(options);
        }
      };
    },
  };
}

export function makeFakeNotificationService(createMock, closeMock) {
  return {
    start() {
      function create() {
        if (createMock) {
          return createMock(...arguments);
        }
      }
      function close() {
        if (closeMock) {
          return closeMock(...arguments);
        }
      }
      return {
        create,
        close,
      };
    },
  };
}

export const mocks = {
  cookie: () => fakeCookieService,
  download: makeFakeDownloadService,
  effect: () => effectService, // BOI The real service ? Is this what we want ?
  localization: makeFakeLocalizationService,
  ui: makeFakeUIService,
  notifications: makeFakeNotificationService,
  router: makeFakeRouterService,
  rpc: makeFakeRPCService,
  title: () => fakeTitleService,
  user: makeFakeUserService,
};
