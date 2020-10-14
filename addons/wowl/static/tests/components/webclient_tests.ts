import { Component, tags } from "@odoo/owl";
import * as QUnit from "qunit";
import { WebClient } from "../../src/components/webclient/webclient";
import { Registry } from "../../src/core/registry";
import { actionManagerService } from "./../../src/services/action_manager/action_manager";
import { notificationService } from "./../../src/services/notifications";
import { makeFakeUserService } from "../helpers/index";
import { Service, Type } from "../../src/types";
import { createComponent } from "../helpers/utility";
import { menusService } from "../../src/services/menus";

const { xml } = tags;

let services: Registry<Service>;
QUnit.module("Web Client", {
  async beforeEach() {
    services = new Registry();
    services.add("user", makeFakeUserService());
    services.add(actionManagerService.name, actionManagerService);
    services.add(notificationService.name, notificationService);
    services.add("menus", menusService);
  },
});

QUnit.test("can be rendered", async (assert) => {
  assert.expect(1);
  const webClient = await createComponent(WebClient, { config: { services } });
  assert.containsOnce(webClient.el!, "header > nav.o_main_navbar");
});

QUnit.test("can render a main component", async (assert) => {
  assert.expect(1);
  class MyComponent extends Component {
    static template = xml`<span class="chocolate">MyComponent</span>`;
  }
  const componentRegistry = new Registry<Type<Component>>();
  componentRegistry.add("mycomponent", MyComponent);
  const webClient = await createComponent(WebClient, {
    config: { services, Components: componentRegistry },
  });
  assert.containsOnce(webClient.el!, ".chocolate");
});
