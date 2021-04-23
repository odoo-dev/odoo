/** @odoo-module **/

import { actionService } from "@web/actions/action_service";
import { dialogService } from "@web/services/dialog_service";
import { mainComponentRegistry } from "@web/webclient/main_component_registry";
import { serviceRegistry } from "@web/webclient/service_registry";
import { hotkeyService } from "@web/hotkeys/hotkey_service";
import { notificationService } from "@web/notifications/notification_service";
import { menuService } from "@web/services/menu_service";
import { uiService } from "@web/services/ui_service";
import { WebClient } from "@web/webclient/webclient";
import { clearRegistryWithCleanup, makeTestEnv } from "../helpers/mock_env";
import { fakeTitleService } from "../helpers/mock_services";
import { getFixture } from "../helpers/utils";

const { Component, tags, mount } = owl;
const { xml } = tags;

let baseConfig;

QUnit.module("Web Client", {
  async beforeEach() {
    serviceRegistry
      .add("action", actionService)
      .add("dialog", dialogService)
      .add("hotkey", hotkeyService)
      .add("ui", uiService)
      .add("notification", notificationService)
      .add("title", fakeTitleService)
      .add("menu", menuService);
    baseConfig = { activateMockServer: true };
  },
});

QUnit.test("can be rendered", async (assert) => {
  assert.expect(1);
  const env = await makeTestEnv(baseConfig);
  const target = getFixture();
  const webClient = await mount(WebClient, { env, target });
  assert.containsOnce(webClient.el, "header > nav.o_main_navbar");
});

QUnit.test("can render a main component", async (assert) => {
  assert.expect(1);
  class MyComponent extends Component {}
  MyComponent.template = xml`<span class="chocolate">MyComponent</span>`;
  clearRegistryWithCleanup(mainComponentRegistry);
  mainComponentRegistry.add("mycomponent", MyComponent);
  const env = await makeTestEnv(baseConfig);
  const target = getFixture();
  const webClient = await mount(WebClient, { env, target });
  assert.containsOnce(webClient.el, ".chocolate");
});
