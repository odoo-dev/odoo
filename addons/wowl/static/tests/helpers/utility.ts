import { Component } from "@odoo/owl";
import { getDefaultLocalization } from "../../src/core/localization";
import { Registry } from "../../src/core/registry";
import { makeEnv } from "../../src/env";
import { Odoo, OdooConfig, OdooEnv, Type } from "../../src/types";
import { MockRPC, makeTestOdoo } from "./mocks";
import { ServerData, makeMockServer } from "./mock_server";

declare let odoo: Odoo;

// export { OdooEnv } from "../../src/types";

// -----------------------------------------------------------------------------
// Main Helpers
// -----------------------------------------------------------------------------
interface MountParameters {
  env: OdooEnv;
  target?: HTMLElement;
}

export async function mount<T extends Type<Component>>(
  C: T,
  params: MountParameters
): Promise<InstanceType<T>> {
  ((C as any) as typeof Component).env = params.env;
  const component: Component = new C(null);
  const target = params.target || getFixture();
  await component.mount(target, { position: "first-child" });
  return component as any;
}

type _TestConfig = Partial<
  {
    [K in keyof OdooConfig]: OdooConfig[K] extends Registry<any>
      ? OdooConfig[K]
      : Partial<OdooConfig[K]>;
  }
>;

export interface TestConfig extends _TestConfig {
  browser?: Partial<Odoo["browser"]>;
  serverData?: ServerData;
  mockRPC?: MockRPC;
  activateMockServer?: boolean;
}

function makeTestConfig(config: TestConfig = {}): OdooConfig {
  const localization = config.localization || (getDefaultLocalization() as any);
  const _t = config._t || (((str: string) => str) as any);
  return Object.assign(config, {
    localization,
    _t,
    templates,
    debug: config.debug || "",
    services: config.services || new Registry(),
    Components: config.Components || new Registry(),
    actions: config.actions || new Registry(),
    systray: config.systray || new Registry(),
    errorDialogs: config.errorDialogs || new Registry(),
    userMenu: config.userMenu || new Registry(),
    views: config.views || new Registry(),
  });
}

export async function makeTestEnv(config: TestConfig = {}): Promise<OdooEnv> {
  const testConfig: TestConfig = makeTestConfig(config);
  if (config.serverData || config.mockRPC || config.activateMockServer) {
    testConfig.services!.remove("rpc");
    makeMockServer(testConfig, config.serverData, config.mockRPC);
  }
  odoo = makeTestOdoo(testConfig);
  return await makeEnv(testConfig as OdooConfig);
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
  const ev = new MouseEvent("click", { bubbles: true });
  target.dispatchEvent(ev);
  return nextTick();
}

// -----------------------------------------------------------------------------
// Private (should not be called from any test)
// -----------------------------------------------------------------------------
let templates: string;

export function setTemplates(xml: string) {
  templates = xml;
}

export async function legacyExtraNextTick() {
  return nextTick();
}
