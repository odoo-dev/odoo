import { Component, tags } from "@odoo/owl";
import * as QUnit from "qunit";
import { WebClient } from "../../src/components/webclient/webclient";
import { Registry } from "../../src/core/registry";
import { actionManagerService } from "./../../src/services/action_manager/action_manager";
import { notificationService } from "./../../src/services/notifications";
import {
  getFixture,
  makeFakeUserService,
  makeFakeMenusService,
  makeFakeRPCService,
  makeTestEnv,
  mount,
  OdooEnv,
} from "../helpers/index";
import { Service, Type } from "../../src/types";

const { xml } = tags;

let target: HTMLElement;
let env: OdooEnv;
let services: Registry<Service>;

QUnit.module("Web Client", {
  async beforeEach() {
    target = getFixture();
    services = new Registry();
    services.add("user", makeFakeUserService());
    services.add("menus", makeFakeMenusService());
    services.add("rpc", makeFakeRPCService());
    services.add(actionManagerService.name, actionManagerService);
    services.add(notificationService.name, notificationService);
    env = await makeTestEnv({ services });
  },
});

QUnit.test("can be rendered", async (assert) => {
  assert.expect(1);
  await mount(WebClient, { env, target });
  assert.containsOnce(target, "header > nav.o_main_navbar");
});

QUnit.test("can render a main component", async (assert) => {
  assert.expect(1);
  class MyComponent extends Component {
    static template = xml`<span class="chocolate">MyComponent</span>`;
  }

  const componentRegistry = new Registry<Type<Component>>();
  componentRegistry.add("mycomponent", MyComponent);

  env = await makeTestEnv({ Components: componentRegistry, services });
  await mount(WebClient, { env, target });
  assert.ok(target.querySelector(".chocolate"));
});
