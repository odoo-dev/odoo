import { Component, tags } from "@odoo/owl";
import * as QUnit from "qunit";
import { WebClient } from "../../src/webclient/webclient";
import { Registry } from "../../src/core/registry";
import { actionManagerService } from "../../src/action_manager/action_manager";
import { notificationService } from "../../src/notifications/notification_service";
import { makeFakeUserService } from "../helpers/index";
import { Service, Type } from "../../src/types";
import { mount, makeTestEnv, TestConfig } from "../helpers/utility";
import { menusService } from "../../src/services/menus";
import { makeFakeRouterService, fakeTitleService } from "../helpers/mocks";

const { xml } = tags;

let baseConfig: TestConfig;

QUnit.module("Web Client", {
  async beforeEach() {
    const services = new Registry<Service<any>>();
    services
      .add("user", makeFakeUserService())
      .add(actionManagerService.name, actionManagerService)
      .add(notificationService.name, notificationService)
      .add(fakeTitleService.name, fakeTitleService)
      .add("menus", menusService)
      .add("router", makeFakeRouterService());
    baseConfig = { services, activateMockServer: true };
  },
});

QUnit.test("can be rendered", async (assert) => {
  assert.expect(1);
  const env = await makeTestEnv(baseConfig);
  const webClient = await mount(WebClient, { env });
  assert.containsOnce(webClient.el!, "header > nav.o_main_navbar");
});

QUnit.test("can render a main component", async (assert) => {
  assert.expect(1);
  class MyComponent extends Component {
    static template = xml`<span class="chocolate">MyComponent</span>`;
  }
  const componentRegistry = new Registry<Type<Component>>();
  componentRegistry.add("mycomponent", MyComponent);
  const env = await makeTestEnv({ ...baseConfig, Components: componentRegistry });
  const webClient = await mount(WebClient, { env });
  assert.containsOnce(webClient.el!, ".chocolate");
});
