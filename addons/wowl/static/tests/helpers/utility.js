/** @odoo-module **/
import { makeEnv } from "../../src/env";
import { Registry } from "../../src/core/registry";
import { actionService } from "../../src/actions/action_service";
import { effectService } from "../../src/effects/effect_service";
import { notificationService } from "../../src/notifications/notification_service";
import { dialogService } from "../../src/services/dialog_service";
import { menuService } from "../../src/services/menu_service";
import { modelService } from "../../src/services/model_service";
import { uiService } from "../../src/services/ui_service";
import { viewService } from "../../src/views/view_service";
import { viewRegistry } from "../../src/views/view_registry";
import {
  fakeTitleService,
  makeFakeDeviceService,
  makeFakeLocalizationService,
  makeFakeRouterService,
  makeFakeUserService,
  makeTestOdoo,
  mocks,
} from "./mocks";
import { makeMockServer } from "./mock_server";

export function getTestServiceRegistry() {
  // build the service registry

  // need activateMockServer or something like that for odoo.browser.fetch !!! something is bad
  const testServiceRegistry = new Registry();
  const fakeUserService = makeFakeUserService();
  const fakeRouterService = makeFakeRouterService();

  testServiceRegistry
    .add(fakeUserService.name, fakeUserService)
    .add(notificationService.name, notificationService)
    .add(dialogService.name, dialogService)
    .add(menuService.name, menuService)
    .add(actionService.name, actionService)
    .add(fakeRouterService.name, fakeRouterService)
    .add(viewService.name, viewService)
    .add(modelService.name, modelService)
    .add(fakeTitleService.name, fakeTitleService)
    .add(uiService.name, uiService)
    .add(effectService.name, effectService);
  return testServiceRegistry;
}

export function getTestViewRegistry() {
  // build a copy of the view registry
  const testViewRegistry = new Registry();
  for (const [key, view] of viewRegistry.getEntries()) {
    testViewRegistry.add(key, view);
  }
  return testViewRegistry;
}

function makeTestConfig(config = {}) {
  const serviceRegistry = config.serviceRegistry || new Registry();
  if (!serviceRegistry.contains("device")) {
    serviceRegistry.add("device", makeFakeDeviceService());
  }
  if (!serviceRegistry.contains("localization")) {
    serviceRegistry.add("localization", makeFakeLocalizationService());
  }
  return Object.assign(config, {
    debug: config.debug || "",
    serviceRegistry,
    mainComponentRegistry: config.mainComponentRegistry || new Registry(),
    actionRegistry: config.actionRegistry || new Registry(),
    systrayRegistry: config.systrayRegistry || new Registry(),
    errorDialogRegistry: config.errorDialogRegistry || new Registry(),
    userMenuRegistry: config.userMenuRegistry || new Registry(),
    debugRegistry: config.debugRegistry || new Registry(),
    viewRegistry: config.viewRegistry || new Registry(),
    favoriteMenuRegistry: config.favoriteMenuRegistry || new Registry(),
  });
}

export async function makeTestEnv(config = {}) {
  const testConfig = makeTestConfig(config);
  if (config.serverData || config.mockRPC || config.activateMockServer) {
    testConfig.serviceRegistry.remove("rpc");
    makeMockServer(testConfig, config.serverData, config.mockRPC);
  }
  // add all missing dependencies if necessary
  for (let service of testConfig.serviceRegistry.getAll()) {
    if (service.dependencies) {
      for (let dep of service.dependencies) {
        if (dep in mocks && !testConfig.serviceRegistry.contains(dep)) {
          testConfig.serviceRegistry.add(dep, mocks[dep]());
        }
      }
    }
  }
  odoo = makeTestOdoo(testConfig);
  const env = await makeEnv(odoo.debug);
  env.qweb.addTemplates(templates);
  return env;
}

export function getFixture() {
  if (QUnit.config.debug) {
    return document.body;
  } else {
    return document.querySelector("#qunit-fixture");
  }
}

export async function nextTick() {
  await new Promise((resolve) => window.requestAnimationFrame(resolve));
  await new Promise((resolve) => setTimeout(resolve));
}

export function makeDeferred() {
  let resolve;
  let prom = new Promise((_r) => {
    resolve = _r;
  });
  prom.resolve = resolve;
  return prom;
}

export function click(el, selector) {
  let target = el;
  if (selector) {
    const els = el.querySelectorAll(selector);
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

let templates;
export function setTemplates(xml) {
  templates = xml;
}

export async function legacyExtraNextTick() {
  return nextTick();
}
