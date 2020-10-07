import { Component, tags } from "@odoo/owl";
import * as QUnit from "qunit";
import { WebClient } from "../../src/components/webclient/webclient";
import { Registries } from "../../src/registries";
import { Registry } from "../../src/core/registry";
import { actionManagerService } from "./../../src/services/action_manager/action_manager";
import {
  getFixture,
  makeFakeUserService,
  makeFakeMenusService,
  makeFakeRPCService,
  makeTestEnv,
  mount,
  OdooEnv,
} from "../helpers";
import { Service } from "../../src/services";

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
    env = await makeTestEnv({ services });
  },
});

QUnit.test("can be rendered", async (assert) => {
  assert.expect(1);
  await mount(WebClient, { env, target });
  assert.strictEqual(target.innerText, "Hello WebClient");
});

QUnit.test("can render a main component", async (assert) => {
  assert.expect(1);
  class MyComponent extends Component {
    static template = xml`<span class="chocolate">MyComponent</span>`;
  }

  const componentRegistry: Registries["Components"] = new Registry();
  componentRegistry.add("mycomponent", MyComponent);

  env = await makeTestEnv({ Components: componentRegistry, services });
  await mount(WebClient, { env, target });
  assert.ok(target.querySelector(".chocolate"));
});
