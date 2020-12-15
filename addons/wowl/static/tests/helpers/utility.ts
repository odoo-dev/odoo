import { Component } from "@odoo/owl";
import { Registry } from "../../src/core/registry";
import { makeEnv } from "../../src/env";
import { Odoo, OdooEnv, Registries, Type } from "../../src/types";
import { makeTestOdoo, MockRPC, mocks } from "./mocks";
import { makeMockServer, ServerData } from "./mock_server";

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

export interface TestConfig extends Partial<Registries> {
  browser?: Partial<Odoo["browser"]>;
  debug?: string;
  serverData?: ServerData;
  mockRPC?: MockRPC;
  activateMockServer?: boolean;
}

function makeTestConfig(config: TestConfig = {}): TestConfig {
  return Object.assign(config, {
    debug: config.debug || "",
    serviceRegistry: config.serviceRegistry || new Registry(),
    mainComponentRegistry: config.mainComponentRegistry || new Registry(),
    actionRegistry: config.actionRegistry || new Registry(),
    systrayRegistry: config.systrayRegistry || new Registry(),
    errorDialogRegistry: config.errorDialogRegistry || new Registry(),
    userMenuRegistry: config.userMenuRegistry || new Registry(),
    debugManagerRegistry: config.debugManagerRegistry || new Registry(),
    viewRegistry: config.viewRegistry || new Registry(),
  });
}

export async function makeTestEnv(config: TestConfig = {}): Promise<OdooEnv> {
  const testConfig: TestConfig = makeTestConfig(config);
  if (config.serverData || config.mockRPC || config.activateMockServer) {
    testConfig.serviceRegistry!.remove("rpc");
    makeMockServer(testConfig, config.serverData, config.mockRPC);
  }
  // add all missing dependencies if necessary
  for (let service of testConfig.serviceRegistry!.getAll()) {
    if (service.dependencies) {
      for (let dep of service.dependencies) {
        if (dep in mocks && !testConfig.serviceRegistry!.contains(dep)) {
          testConfig.serviceRegistry!.add(dep, (mocks as any)[dep]());
        }
      }
    }
  }

  odoo = makeTestOdoo(testConfig);
  const env = await makeEnv(odoo.debug!);
  env.qweb.addTemplates(templates);
  return env;
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
