import { Component } from "@odoo/owl";
import { getDefaultLocalization } from "../src/core/localization";
import { Registry } from "../src/core/registry";
import { makeEnv } from "../src/env";
import { Menu, MenuData, menusService, MenuTree } from "../src/services/menus";
import { rpcService } from "../src/services/rpc";
import { UserService, userService } from "../src/services/user";
import { Odoo, OdooConfig, OdooEnv, Type, UserCompany } from "../src/types";

export { OdooEnv } from "../src/types";

// -----------------------------------------------------------------------------
// Main Helpers
// -----------------------------------------------------------------------------
interface MountParameters {
  env: OdooEnv;
  target: HTMLElement;
}

export async function mount<T extends Type<Component>>(
  C: T,
  params: MountParameters
): Promise<InstanceType<T>> {
  ((C as any) as typeof Component).env = params.env;
  const component: Component = new C(null);
  await component.mount(params.target, { position: "first-child" });
  return component as any;
}

type TestConfig = Partial<
  {
    [K in keyof OdooConfig]: OdooConfig[K] extends Registry<any>
      ? OdooConfig[K]
      : Partial<OdooConfig[K]>;
  }
>;

export function makeTestConfig(config: TestConfig = {}): OdooConfig {
  const browser = (config.browser || {}) as OdooConfig["browser"];
  const localization = config.localization || (getDefaultLocalization() as any);
  const odoo: Odoo = makeTestOdoo();
  const _t = config._t || (((str: string) => str) as any);
  return {
    browser,
    localization,
    _t,
    templates,
    services: config.services || new Registry(),
    Components: config.Components || new Registry(),
    actions: config.actions || new Registry(),
    views: new Registry(),
    odoo,
  };
}

export async function makeTestEnv(config: TestConfig = {}): Promise<OdooEnv> {
  return await makeEnv(makeTestConfig(config));
}

export function getFixture(): HTMLElement {
  if (QUnit.config.debug) {
    return document.body;
  } else {
    return document.querySelector("#qunit-fixture") as HTMLElement;
  }
}

export async function nextTick(): Promise<void> {
  await new Promise((resolve) => window.requestAnimationFrame(resolve));
  await new Promise((resolve) => setTimeout(resolve));
}

// -----------------------------------------------------------------------------
// Utility stuff
// -----------------------------------------------------------------------------

export interface Deferred<T> extends Promise<T> {
  resolve: (value?: T) => void;
}

export function makeDeferred<T>(): Deferred<T> {
  let resolve;
  let prom = new Promise((_r) => {
    resolve = _r;
  }) as Deferred<T>;
  prom.resolve = resolve as any;
  return prom;
}

export function click(el: HTMLElement, selector?: string) {
  let target = el;
  if (selector) {
    const els = el.querySelectorAll<HTMLElement>(selector);
    if (els.length === 0) {
      throw new Error(`Found no element to click on (selector: ${selector})`);
    }
    if (els.length > 1) {
      throw new Error(
        `Found ${els.length} elements to click on, instead of 1 (selector: ${selector})`
      );
    }
    target = els[0];
  }
  const ev = new MouseEvent("click");
  target.dispatchEvent(ev);
  return nextTick();
}

// -----------------------------------------------------------------------------
// Mock Services
// -----------------------------------------------------------------------------

/**
 * Simulate a fake user service.  For convenience, by default, this fake user
 * service will return { uid: 2 } as context, even though it is not a valid
 * context.  If this is significant for a test, then the `fullContext` option
 * should be set to true.
 */
export function makeFakeUserService(fullContext: boolean = false): typeof userService {
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
        allowed_companies: [[1, "YourCompany"]] as UserCompany[],
        current_company: [1, "YourCompany"] as UserCompany,
        lang: "en_us",
        tz: "Europe/Brussels",
      };
    },
  };
}
export function makeFakeMenusService(menuData?: MenuData): typeof menusService {
  const _menuData: MenuData = menuData || {
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
export function makeFakeRPCService(): typeof rpcService {
  return {
    name: "rpc",
    deploy() {
      return () => {
        return Promise.resolve();
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

// -----------------------------------------------------------------------------
// Low level API mocking
// -----------------------------------------------------------------------------

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

// -----------------------------------------------------------------------------
// Private (should not be called from any test)
// -----------------------------------------------------------------------------
let templates: string;

export function setTemplates(xml: string) {
  templates = xml;
}
