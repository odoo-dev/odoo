import { Menu, MenuData, MenuService, MenuTree } from "../../src/services/menus";
import { UserService } from "../../src/services/user";
import { Odoo, OdooEnv, OdooConfig, Service } from "../../src/types";
import { RPC } from "../../src/services/rpc";
import type { Deferred } from "./utility";

// // -----------------------------------------------------------------------------
// // Mock Services
// // -----------------------------------------------------------------------------

/**
 * Simulate a fake user service.  For convenience, by default, this fake user
 * service will return { uid: 2 } as context, even though it is not a valid
 * context.  If this is significant for a test, then the `fullContext` option
 * should be set to true.
 */
export function makeFakeUserService(fullContext: boolean = false): Service<UserService> {
  return {
    name: "user",
    deploy(env: OdooEnv, config: OdooConfig): UserService {
      const { localization } = config;
      const context = fullContext
        ? { lang: "en_us", tz: "Europe/Brussels", uid: 2, allowed_company_ids: [1] }
        : ({ uid: 2 } as any);
      return {
        dateFormat: localization.dateFormat,
        decimalPoint: localization.decimalPoint,
        direction: localization.direction,
        grouping: localization.grouping,
        multiLang: localization.multiLang,
        thousandsSep: localization.thousandsSep,
        timeFormat: localization.timeFormat,
        context,
        userId: 2,
        userName: "admin",
        isAdmin: true,
        partnerId: 3,
        allowed_companies: [[1, "YourCompany"]],
        current_company: [1, "YourCompany"],
        lang: "en_us",
        tz: "Europe/Brussels",
      };
    },
  };
}

export function makeFakeMenusService(menuData?: MenuData): Service<MenuService> {
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
}

export function makeFakeRPCService(mockRpc?: (...params: Parameters<RPC>) => any): Service<RPC> {
  return {
    name: "rpc",
    deploy() {
      return async (...args: Parameters<RPC>) => {
        return mockRpc ? mockRpc(...args) : undefined;
      };
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

export function createMockXHR(
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

type MockFetchFn = (route: string) => any;

interface MockFetchParams {
  mockFetch?: MockFetchFn;
}

export function createMockedFetch(params: MockFetchParams): typeof fetch {
  const mockFetch: MockFetchFn = (route) => {
    if (route.includes("load_menus")) {
      return {};
    }
    return "";
  };
  const fetch: MockFetchFn = (...args) => {
    let res = params && params.mockFetch ? params.mockFetch(...args) : undefined;
    if (res === undefined || res === null) {
      res = mockFetch(...args);
    }
    return Array.isArray(res) ? res : [res];
  };
  return (input: RequestInfo) => {
    const route = typeof input === "string" ? input : input.url;
    const res = fetch(route);
    const blob = new Blob(
      res.map((r: any) => JSON.stringify(r)),
      { type: "application/json" }
    );
    return Promise.resolve(new Response(blob, { status: 200 }));
  };
}
