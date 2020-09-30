import { Component } from "@odoo/owl";
import { makeEnv, OdooBrowser, OdooEnv } from "../src/env";
import { Registries } from "../src/registries";
import { Registry } from "../src/core/registry";
import { Type } from "../src/types";
import { userService } from "../src/services/user";

export { OdooEnv } from "../src/env";

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
  await component.mount(params.target);
  return component as any;
}

interface TestEnvParam {
  services?: Registries["services"];
  Components?: Registries["Components"];
  browser?: Partial<OdooEnv["browser"]>;
}

export async function makeTestEnv(params: TestEnvParam = {}): Promise<OdooEnv> {
  let registries: Registries = {
    services: params.services || new Registry(),
    Components: params.Components || new Registry(),
  };
  const browser = (params.browser || {}) as OdooBrowser;
  const env = await makeEnv(templates, registries, browser);

  return env;
}

export function getFixture(): HTMLElement {
  return document.querySelector("#qunit-fixture") as HTMLElement;
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
      throw new Error(`Found ${els.length} elements to click on, instead of 1 (selector: ${selector})`);
    }
    target = els[0];
  }
  const ev = new MouseEvent('click');
  target.dispatchEvent(ev);
  return nextTick();
}

// -----------------------------------------------------------------------------
// Mock Services
// -----------------------------------------------------------------------------
export function makeFakeUserService(): typeof userService {
  return {
    name: "user",
    deploy() {
      const context = { lang: "en_us", tz: "Europe/Brussels", uid: 2, allowed_company_ids: [1] };
      return {
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

// -----------------------------------------------------------------------------
// Private (should not be called from any test)
// -----------------------------------------------------------------------------
let templates: string;

export function setTemplates(xml: string) {
  templates = xml;
}
