/** @odoo-module **/
import { legacyExtraNextTick } from "../helpers/utility";
import { getLegacy } from "wowl.test_legacy";
import { actionRegistry } from "../../src/action_manager/action_registry";
import { viewRegistry } from "../../src/views/view_registry";
import { createWebClient, doAction, getActionManagerTestConfig } from "./helpers";
let testConfig;
// legacy stuff
let testUtils;
QUnit.module("ActionManager", (hooks) => {
  hooks.before(() => {
    const legacy = getLegacy();
    testUtils = legacy.testUtils;
  });
  // Remove this as soon as we drop the legacy support.
  // This is necessary as some tests add actions/views in the legacy registries,
  // which are in turned wrapped and added into the real wowl registries. We
  // add those actions/views in the test registries, and remove them from the
  // real ones (directly, as we don't need them in the test).
  const owner = Symbol("owner");
  hooks.beforeEach(() => {
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
  hooks.afterEach(() => {
    actionRegistry.off("UPDATE", owner);
    viewRegistry.off("UPDATE", owner);
  });
  hooks.beforeEach(() => {
    testConfig = getActionManagerTestConfig();
  });
  QUnit.module("Legacy tests (to eventually drop)");
  QUnit.test("display warning as notification", async function (assert) {
    // this test can be removed as soon as the legacy layer is dropped
    assert.expect(5);
    const { AbstractView, legacyViewRegistry } = getLegacy();
    let self;
    const TestCustoController = AbstractView.prototype.config.Controller.extend({
      init() {
        this._super(...arguments);
        self = this;
      },
    });
    const TestCustoView = AbstractView.extend({
      viewType: "test_view",
    });
    TestCustoView.prototype.config.Controller = TestCustoController;
    legacyViewRegistry.add("test_view", TestCustoView);
    testConfig.serverData.views["partner,false,test_view"] = `<div class="o_test_view"/>`;
    testConfig.serverData.actions[777] = {
      id: 1,
      name: "Partners Action 1",
      res_model: "partner",
      type: "ir.actions.act_window",
      views: [[false, "test_view"]],
    };
    const webClient = await createWebClient({ testConfig });
    await doAction(webClient, 777);
    assert.containsOnce(webClient, ".o_test_view");
    self.trigger_up("warning", {
      title: "Warning!!!",
      message: "This is a warning...",
    });
    await testUtils.nextTick();
    await legacyExtraNextTick();
    assert.containsOnce(webClient, ".o_test_view");
    assert.containsOnce(document.body, ".o_notification.bg-warning");
    assert.strictEqual($(".o_notification_title").text(), "Warning!!!");
    assert.strictEqual($(".o_notification_content").text(), "This is a warning...");
    webClient.destroy();
    delete legacyViewRegistry.map.test_view;
  });
  QUnit.test("display warning as modal", async function (assert) {
    // this test can be removed as soon as the legacy layer is dropped
    assert.expect(5);
    const { AbstractView, legacyViewRegistry } = getLegacy();
    let self;
    const TestCustoController = AbstractView.prototype.config.Controller.extend({
      init() {
        this._super(...arguments);
        self = this;
      },
    });
    const TestCustoView = AbstractView.extend({
      viewType: "test_view",
    });
    TestCustoView.prototype.config.Controller = TestCustoController;
    legacyViewRegistry.add("test_view", TestCustoView);
    testConfig.serverData.views["partner,false,test_view"] = `<div class="o_test_view"/>`;
    testConfig.serverData.actions[777] = {
      id: 1,
      name: "Partners Action 1",
      res_model: "partner",
      type: "ir.actions.act_window",
      views: [[false, "test_view"]],
    };
    const webClient = await createWebClient({ testConfig });
    await doAction(webClient, 777);
    assert.containsOnce(webClient, ".o_test_view");
    self.trigger_up("warning", {
      title: "Warning!!!",
      message: "This is a warning...",
      type: "dialog",
    });
    await testUtils.nextTick();
    await legacyExtraNextTick();
    assert.containsOnce(webClient, ".o_test_view");
    assert.containsOnce(document.body, ".modal");
    assert.strictEqual($(".modal-title").text(), "Warning!!!");
    assert.strictEqual($(".modal-body").text(), "This is a warning...");
    webClient.destroy();
    delete legacyViewRegistry.map.test_view;
  });
});
