import * as QUnit from "qunit";
import { makeFakeUserService, nextTick } from "../helpers/index";
import { click, legacyExtraNextTick, TestConfig } from "../helpers/utility";
import { RPC } from "../../src/services/rpc";
import { getLegacy } from "../helpers/legacy";
import { actionRegistry } from "../../src/action_manager/action_registry";
import { viewRegistry } from "../../src/views/view_registry";
import { createWebClient, doAction, getActionManagerTestConfig } from "./helpers";

let testConfig: TestConfig;
// legacy stuff
let testUtils: any;

QUnit.module("ActionManager", (hooks) => {
  hooks.before(() => {
    const legacy = getLegacy() as any;
    testUtils = legacy.testUtils;
  });

  // Remove this as soon as we drop the legacy support.
  // This is necessary as some tests add actions/views in the legacy registries,
  // which are in turned wrapped and added into the real wowl registries. We
  // add those actions/views in the test registries, and remove them from the
  // real ones (directly, as we don't need them in the test).
  const owner = Symbol("owner");
  hooks.before(() => {
    actionRegistry.on("UPDATE", owner, (payload) => {
      if (payload.operation === "add" && testConfig.actionRegistry) {
        testConfig.actionRegistry.add(payload.key, payload.value);
        actionRegistry.remove(payload.key);
      }
    });
    viewRegistry.on("UPDATE", owner, (payload) => {
      if (payload.operation === "add" && testConfig.viewRegistry) {
        testConfig.viewRegistry.add(payload.key, payload.value);
        viewRegistry.remove(payload.key);
      }
    });
  });
  hooks.after(() => {
    actionRegistry.off("UPDATE", owner);
    viewRegistry.off("UPDATE", owner);
  });

  hooks.beforeEach(() => {
    testConfig = getActionManagerTestConfig();
  });

  QUnit.module("Effects");

  QUnit.test("rainbowman integrated to webClient", async function (assert) {
    assert.expect(10);

    testConfig.serviceRegistry!.add("user", makeFakeUserService({ showEffect: true }), true);
    const webClient = await createWebClient({ testConfig });
    await doAction(webClient, 1);
    assert.containsOnce(webClient.el!, ".o_kanban_view");
    assert.containsNone(webClient.el!, ".o_reward");
    webClient.env.services.effects.create("", { fadeout: "no" });
    await nextTick();
    await legacyExtraNextTick();

    assert.containsOnce(webClient.el!, ".o_reward");
    assert.containsOnce(webClient.el!, ".o_kanban_view");
    await testUtils.dom.click(webClient.el!.querySelector(".o_kanban_record"));
    await legacyExtraNextTick();
    assert.containsNone(webClient.el!, ".o_reward");
    assert.containsOnce(webClient.el!, ".o_kanban_view");

    webClient.env.services.effects.create("", { fadeout: "no" });
    await nextTick();
    await legacyExtraNextTick();
    assert.containsOnce(webClient.el!, ".o_reward");
    assert.containsOnce(webClient.el!, ".o_kanban_view");

    // Do not force rainbow man to destroy on doAction
    // we let it die either after its animation or on user click
    await doAction(webClient, 3);
    assert.containsOnce(webClient.el!, ".o_reward");
    assert.containsOnce(webClient.el!, ".o_list_view");

    webClient.destroy();
  });

  QUnit.test("show effect notification instead of rainbow man", async function (assert) {
    assert.expect(6);

    const webClient = await createWebClient({ testConfig });
    await doAction(webClient, 1);
    assert.containsOnce(webClient.el!, ".o_kanban_view");
    assert.containsNone(webClient.el!, ".o_reward");
    assert.containsNone(webClient.el!, ".o_notification");
    webClient.env.services.effects.create("", { fadeout: "no" });
    await nextTick();
    await legacyExtraNextTick();
    assert.containsOnce(webClient.el!, ".o_kanban_view");
    assert.containsNone(webClient.el!, ".o_reward");
    assert.containsOnce(webClient.el!, ".o_notification");
    webClient.destroy();
  });

  QUnit.test("on close with effect from server", async function (assert) {
    assert.expect(1);

    testConfig.serviceRegistry!.add("user", makeFakeUserService({ showEffect: true }), true);

    const mockRPC: RPC = async (route, args) => {
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

    const webClient = await createWebClient({ testConfig, mockRPC });
    await doAction(webClient, 6);
    await click(<HTMLElement>webClient.el!.querySelector('button[name="object"]'));
    assert.containsOnce(webClient, ".o_reward");

    webClient.destroy();
  });

  QUnit.test("on close with effect in xml", async function (assert) {
    assert.expect(2);

    testConfig.serverData!.views!["partner,false,form"] = `
    <form>
      <header>
        <button string="Call method" name="object" type="object"
         effect="{'type': 'rainbow_man', 'message': 'rainBowInXML'}"
        />
      </header>
      <field name="display_name"/>
    </form>`;

    testConfig.serviceRegistry!.add("user", makeFakeUserService({ showEffect: true }), true);
    const mockRPC: RPC = async (route, args) => {
      if (route === "/web/dataset/call_button") {
        return Promise.resolve(false);
      }
    };

    const webClient = await createWebClient({ testConfig, mockRPC });
    await doAction(webClient, 6);
    await click(<HTMLElement>webClient.el!.querySelector('button[name="object"]'));
    await legacyExtraNextTick();
    assert.containsOnce(webClient.el!, ".o_reward");
    assert.strictEqual(
      webClient.el!.querySelector(".o_reward .o_reward_msg_content")!.textContent,
      "rainBowInXML"
    );

    webClient.destroy();
  });
});
