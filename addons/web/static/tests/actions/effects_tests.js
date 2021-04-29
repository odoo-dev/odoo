/** @odoo-module **/

import { click, legacyExtraNextTick, nextTick } from "../helpers/utils";
import { getLegacy } from "web.test_legacy";
import { serviceRegistry } from "@web/webclient/service_registry";
import { mainComponentRegistry } from "@web/webclient/main_component_registry";
import { createWebClient, doAction, getActionManagerTestConfig } from "./helpers";
import { NotificationContainer } from "@web/notifications/notification_container";
import { EffectContainer } from "@web/effects/effect_container";
import { makeFakeUserService } from "../helpers/mock_services";
import { clearRegistryWithCleanup } from "../helpers/mock_env";

let testConfig;
// legacy stuff
let testUtils;

QUnit.module("ActionManager", (hooks) => {
  hooks.before(() => {
    const legacy = getLegacy();
    testUtils = legacy.testUtils;
  });
  hooks.beforeEach(() => {
    testConfig = getActionManagerTestConfig();
  });

  QUnit.module("Effects");

  QUnit.test("rainbowman integrated to webClient", async function (assert) {
    assert.expect(10);
    serviceRegistry.add("user", makeFakeUserService({ showEffect: true }), {
      force: true,
    });
    clearRegistryWithCleanup(mainComponentRegistry);
    mainComponentRegistry.add("EffectContainer", EffectContainer);
    const webClient = await createWebClient({ testConfig });
    await doAction(webClient, 1);
    assert.containsOnce(webClient.el, ".o_kanban_view");
    assert.containsNone(webClient.el, ".o_reward");
    webClient.env.services.effect.create("", { fadeout: "no" });
    await nextTick();
    await legacyExtraNextTick();
    assert.containsOnce(webClient.el, ".o_reward");
    assert.containsOnce(webClient.el, ".o_kanban_view");
    await testUtils.dom.click(webClient.el.querySelector(".o_kanban_record"));
    await legacyExtraNextTick();
    assert.containsNone(webClient.el, ".o_reward");
    assert.containsOnce(webClient.el, ".o_kanban_view");
    webClient.env.services.effect.create("", { fadeout: "no" });
    await nextTick();
    await legacyExtraNextTick();
    assert.containsOnce(webClient.el, ".o_reward");
    assert.containsOnce(webClient.el, ".o_kanban_view");
    // Do not force rainbow man to destroy on doAction
    // we let it die either after its animation or on user click
    await doAction(webClient, 3);
    assert.containsOnce(webClient.el, ".o_reward");
    assert.containsOnce(webClient.el, ".o_list_view");
  });

  QUnit.test("show effect notification instead of rainbow man", async function (assert) {
    assert.expect(6);
    clearRegistryWithCleanup(mainComponentRegistry);
    mainComponentRegistry.add("NotificationContainer", NotificationContainer);

    const webClient = await createWebClient({ testConfig });
    await doAction(webClient, 1);
    assert.containsOnce(webClient.el, ".o_kanban_view");
    assert.containsNone(webClient.el, ".o_reward");
    assert.containsNone(webClient.el, ".o_notification");
    webClient.env.services.effect.create("", { fadeout: "no" });
    await nextTick();
    await legacyExtraNextTick();
    assert.containsOnce(webClient.el, ".o_kanban_view");
    assert.containsNone(webClient.el, ".o_reward");
    assert.containsOnce(webClient.el, ".o_notification");
  });

  QUnit.test("on close with effect from server", async function (assert) {
    assert.expect(1);
    serviceRegistry.add("user", makeFakeUserService({ showEffect: true }), {
      force: true,
    });
    const mockRPC = async (route, args) => {
      if (route === "/web/dataset/call_button") {
        return Promise.resolve({
          type: "ir.actions.act_window_close",
          effect: {
            type: "rainbow_man",
            message: "button called",
          },
        });
      }
    };
    clearRegistryWithCleanup(mainComponentRegistry);
    mainComponentRegistry.add("EffectContainer", EffectContainer);
    const webClient = await createWebClient({ testConfig, mockRPC });
    await doAction(webClient, 6);
    await click(webClient.el.querySelector('button[name="object"]'));
    assert.containsOnce(webClient, ".o_reward");
  });

  QUnit.test("on close with effect in xml", async function (assert) {
    assert.expect(2);
    testConfig.serverData.views["partner,false,form"] = `
    <form>
      <header>
        <button string="Call method" name="object" type="object"
         effect="{'type': 'rainbow_man', 'message': 'rainBowInXML'}"
        />
      </header>
      <field name="display_name"/>
    </form>`;
    serviceRegistry.add("user", makeFakeUserService({ showEffect: true }), {
      force: true,
    });
    const mockRPC = async (route, args) => {
      if (route === "/web/dataset/call_button") {
        return Promise.resolve(false);
      }
    };
    clearRegistryWithCleanup(mainComponentRegistry);
    mainComponentRegistry.add("EffectContainer", EffectContainer);

    const webClient = await createWebClient({ testConfig, mockRPC });
    await doAction(webClient, 6);
    await click(webClient.el.querySelector('button[name="object"]'));
    await legacyExtraNextTick();
    assert.containsOnce(webClient.el, ".o_reward");
    assert.strictEqual(
      webClient.el.querySelector(".o_reward .o_reward_msg_content").textContent,
      "rainBowInXML"
    );
  });
});
