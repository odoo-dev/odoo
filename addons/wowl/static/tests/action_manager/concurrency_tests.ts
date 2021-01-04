import * as QUnit from "qunit";
import $ from "jquery";
import { Registry } from "../../src/core/registry";
import { nextTick, OdooEnv } from "../helpers/index";
import { legacyExtraNextTick, TestConfig } from "../helpers/utility";
import { Component, tags } from "@odoo/owl";

import { RPC } from "../../src/services/rpc";
import { getLegacy } from "../helpers/legacy";
import { actionRegistry } from "../../src/action_manager/action_registry";
import { viewRegistry } from "../../src/views/view_registry";
import { createWebClient, doAction, getActionManagerTestConfig } from "./helpers";

let testConfig: TestConfig;
// legacy stuff
let cpHelpers: any;
let testUtils: any;

QUnit.module("ActionManager", (hooks) => {
  hooks.before(() => {
    const legacy = getLegacy() as any;
    testUtils = legacy.testUtils;
    cpHelpers = testUtils.controlPanel;
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

  QUnit.module("Concurrency management");

  QUnit.test("drop previous actions if possible", async function (assert) {
    assert.expect(7);

    const def = testUtils.makeTestPromise();
    const mockRPC: RPC = async function (route, args) {
      assert.step(route);
      if (route === "/web/action/load") {
        await def;
      }
    };
    const webClient = await createWebClient({ testConfig, mockRPC });

    doAction(webClient, 4);
    doAction(webClient, 8);

    def.resolve();
    await testUtils.nextTick();
    await legacyExtraNextTick();

    // action 4 loads a kanban view first, 6 loads a list view. We want a list
    assert.containsOnce(webClient, ".o_list_view");

    assert.verifySteps([
      "/wowl/load_menus",
      "/web/action/load", // load action 4
      "/web/action/load", // load action 6
      "/web/dataset/call_kw/pony/load_views", // load views for action 6
      "/web/dataset/search_read", // search read for list view action 6
    ]);

    webClient.destroy();
  });

  QUnit.test("handle switching view and switching back on slow network", async function (assert) {
    assert.expect(9);

    let def = testUtils.makeTestPromise();
    const defs = [Promise.resolve(), def, Promise.resolve()];

    const mockRPC: RPC = async function (route, args) {
      assert.step(route);
      if (route === "/web/dataset/search_read") {
        await defs.shift();
      }
    };
    const webClient = await createWebClient({ testConfig, mockRPC });
    await doAction(webClient, 4);

    // kanban view is loaded, switch to list view
    await cpHelpers.switchView(webClient.el!, "list");
    await legacyExtraNextTick();

    // here, list view is not ready yet, because def is not resolved
    // switch back to kanban view
    await cpHelpers.switchView(webClient.el!, "kanban");
    await legacyExtraNextTick();

    // here, we want the kanban view to reload itself, regardless of list view
    assert.verifySteps([
      "/wowl/load_menus",
      "/web/action/load", // initial load action
      "/web/dataset/call_kw/partner/load_views", // load views
      "/web/dataset/search_read", // search_read for kanban view
      "/web/dataset/search_read", // search_read for list view (not resolved yet)
      "/web/dataset/search_read", // search_read for kanban view reload (not resolved yet)
    ]);

    // we resolve def => list view is now ready (but we want to ignore it)
    def.resolve();
    await testUtils.nextTick();
    assert.containsOnce(webClient, ".o_kanban_view", "there should be a kanban view in dom");
    assert.containsNone(webClient, ".o_list_view", "there should not be a list view in dom");

    webClient.destroy();
  });

  QUnit.test("when an server action takes too much time...", async function (assert) {
    assert.expect(1);

    const def = testUtils.makeTestPromise();

    const mockRPC: RPC = async function (route, args) {
      if (route === "/web/action/run") {
        await def;
        return 1;
      }
    };
    const webClient = await createWebClient({ testConfig, mockRPC });
    doAction(webClient, 2);
    doAction(webClient, 4);

    def.resolve();
    await testUtils.nextTick();
    await legacyExtraNextTick();

    assert.strictEqual(
      $(webClient.el!).find(".o_control_panel .breadcrumb-item.active").text(),
      "Partners Action 4",
      "action 4 should be loaded"
    );

    webClient.destroy();
  });

  QUnit.test("clicking quickly on breadcrumbs...", async function (assert) {
    assert.expect(1);

    let def: any;

    const mockRPC: RPC = async function (route, args) {
      if (args && args.method === "read") {
        await def;
      }
    };
    const webClient = await createWebClient({ testConfig, mockRPC });

    // create a situation with 3 breadcrumbs: kanban/form/list
    await doAction(webClient, 4);
    await testUtils.dom.click($(webClient.el!).find(".o_kanban_record:first"));
    await legacyExtraNextTick();
    await doAction(webClient, 8);
    await legacyExtraNextTick();

    // now, the next read operations will be promise (this is the read
    // operation for the form view reload)
    def = testUtils.makeTestPromise();

    // click on the breadcrumbs for the form view, then on the kanban view
    // before the form view is fully reloaded
    await testUtils.dom.click($(webClient.el!).find(".o_control_panel .breadcrumb-item:eq(1)"));
    await legacyExtraNextTick();
    await testUtils.dom.click($(webClient.el!).find(".o_control_panel .breadcrumb-item:eq(0)"));
    await legacyExtraNextTick();

    // resolve the form view read
    def.resolve();
    await testUtils.nextTick();
    await legacyExtraNextTick();

    assert.strictEqual(
      $(webClient.el!).find(".o_control_panel .breadcrumb-item.active").text(),
      "Partners Action 4",
      "action 4 should be loaded and visible"
    );

    webClient.destroy();
  });

  QUnit.test(
    "execute a new action while loading a lazy-loaded controller",
    async function (assert) {
      assert.expect(16);

      let def: any;
      const mockRPC: RPC = async function (route, args) {
        assert.step((args && args.method) || route);
        if (route === "/web/dataset/search_read" && args && args.model === "partner") {
          await def;
        }
      };
      const webClient = await createWebClient({ testConfig, mockRPC });

      webClient.env.bus.trigger("test:hashchange", {
        action: 4,
        id: 2,
        view_type: "form",
      });
      await testUtils.nextTick();
      await legacyExtraNextTick();

      assert.containsOnce(
        webClient.el!,
        ".o_form_view",
        "should display the form view of action 4"
      );

      // click to go back to Kanban (this request is blocked)
      def = testUtils.makeTestPromise();
      await testUtils.nextTick();
      await legacyExtraNextTick();
      await testUtils.dom.click($(webClient.el!).find(".o_control_panel .breadcrumb a"));
      await legacyExtraNextTick();

      assert.containsOnce(
        webClient.el!,
        ".o_form_view",
        "should still display the form view of action 4"
      );

      // execute another action meanwhile (don't block this request)
      await doAction(webClient, 8, { clearBreadcrumbs: true });

      assert.containsOnce(webClient, ".o_list_view", "should display action 8");
      assert.containsNone(webClient, ".o_form_view", "should no longer display the form view");

      assert.verifySteps([
        "/wowl/load_menus",
        "/web/action/load", // load state action 4
        "load_views", // load state action 4
        "read", // read the opened record (action 4)
        "/web/dataset/search_read", // blocked search read when coming back to Kanban (action 4)
        "/web/action/load", // action 8
        "load_views", // action 8
        "/web/dataset/search_read", // search read action 8
      ]);

      // unblock the switch to Kanban in action 4
      def.resolve();
      await testUtils.nextTick();
      await legacyExtraNextTick();

      assert.containsOnce(webClient, ".o_list_view", "should still display action 8");
      assert.containsNone(
        webClient.el!,
        ".o_kanban_view",
        "should not display the kanban view of action 4"
      );

      assert.verifySteps([]);

      webClient.destroy();
    }
  );

  QUnit.test("execute a new action while handling a call_button", async function (assert) {
    assert.expect(17);

    const def = testUtils.makeTestPromise();
    const mockRPC: RPC = async function (route, args) {
      assert.step((args && args.method) || route);
      if (route === "/web/dataset/call_button") {
        await def;
        return testConfig.serverData!.actions![1];
      }
    };
    const webClient = await createWebClient({ testConfig, mockRPC });

    // execute action 3 and open a record in form view
    await doAction(webClient, 3);
    await testUtils.dom.click($(webClient.el!).find(".o_list_view .o_data_row:first"));
    await legacyExtraNextTick();

    assert.containsOnce(webClient, ".o_form_view", "should display the form view of action 3");

    // click on 'Call method' button (this request is blocked)
    await testUtils.dom.click($(webClient.el!).find(".o_form_view button:contains(Call method)"));

    assert.containsOnce(
      webClient.el!,
      ".o_form_view",
      "should still display the form view of action 3"
    );

    // execute another action
    await doAction(webClient, 8, { clearBreadcrumbs: true });

    assert.containsOnce(webClient, ".o_list_view", "should display the list view of action 8");
    assert.containsNone(webClient, ".o_form_view", "should no longer display the form view");

    assert.verifySteps([
      "/wowl/load_menus",
      "/web/action/load", // action 3
      "load_views", // action 3
      "/web/dataset/search_read", // list for action 3
      "read", // form for action 3
      "object", // click on 'Call method' button (this request is blocked)
      "/web/action/load", // action 8
      "load_views", // action 8
      "/web/dataset/search_read", // list for action 8
    ]);

    // unblock the call_button request
    def.resolve();
    await testUtils.nextTick();
    await legacyExtraNextTick();
    assert.containsOnce(
      webClient.el!,
      ".o_list_view",
      "should still display the list view of action 8"
    );
    assert.containsNone(webClient, ".o_kanban_view", "should not display action 1");

    assert.verifySteps([]);

    webClient.destroy();
  });

  QUnit.test("execute a new action while switching to another controller", async function (assert) {
    assert.expect(16);

    // This test's bottom line is that a doAction always has priority
    // over a switch controller (clicking on a record row to go to form view).
    // In general, the last actionManager's operation has priority because we want
    // to allow the user to make mistakes, or to rapidly reconsider her next action.
    // Here we assert that the actionManager's RPC are in order, but a 'read' operation
    // is expected, with the current implementation, to take place when switching to the form view.
    // Ultimately the form view's 'read' is superfluous, but can happen at any point of the flow,
    // except at the very end, which should always be the final action's list's 'search_read'.

    let def: any;
    const mockRPC: RPC = async function (route, args) {
      assert.step((args && args.method) || route);
      if (args && args.method === "read") {
        await def;
      }
    };
    const webClient = await createWebClient({ testConfig, mockRPC });

    await doAction(webClient, 3);

    assert.containsOnce(webClient, ".o_list_view", "should display the list view of action 3");

    // switch to the form view (this request is blocked)
    def = testUtils.makeTestPromise();
    testUtils.dom.click($(webClient.el!).find(".o_list_view .o_data_row:first"));
    await testUtils.nextTick();
    await legacyExtraNextTick();

    assert.containsOnce(
      webClient.el!,
      ".o_list_view",
      "should still display the list view of action 3"
    );

    // execute another action meanwhile (don't block this request)
    await doAction(webClient, 4, { clearBreadcrumbs: true });

    assert.containsOnce(
      webClient.el!,
      ".o_kanban_view",
      "should display the kanban view of action 8"
    );
    assert.containsNone(webClient, ".o_list_view", "should no longer display the list view");

    assert.verifySteps([
      "/wowl/load_menus",
      "/web/action/load", // action 3
      "load_views", // action 3
      "/web/dataset/search_read", // search read of list view of action 3
      "read", // read of form view of action 3 (this request is blocked)
      "/web/action/load", // action 4
      "load_views", // action 4
      "/web/dataset/search_read", // search read action 4
    ]);

    // unblock the switch to the form view in action 3
    def.resolve();
    await testUtils.nextTick();
    await legacyExtraNextTick();

    assert.containsOnce(
      webClient.el!,
      ".o_kanban_view",
      "should still display the kanban view of action 8"
    );
    assert.containsNone(
      webClient.el!,
      ".o_form_view",
      "should not display the form view of action 3"
    );

    assert.verifySteps([]);

    webClient.destroy();
  });

  QUnit.test("execute a new action while loading views", async function (assert) {
    assert.expect(11);

    const def = testUtils.makeTestPromise();
    const mockRPC: RPC = async function (route, args) {
      assert.step((args && args.method) || route);
      if (args && args.method === "load_views") {
        await def;
      }
    };
    const webClient = await createWebClient({ testConfig, mockRPC });

    // execute a first action (its 'load_views' RPC is blocked)
    doAction(webClient, 3);
    await testUtils.nextTick();
    await legacyExtraNextTick();

    assert.containsNone(
      webClient.el!,
      ".o_list_view",
      "should not display the list view of action 3"
    );

    // execute another action meanwhile (and unlock the RPC)
    doAction(webClient, 4);
    def.resolve();
    await testUtils.nextTick();
    await legacyExtraNextTick();

    assert.containsOnce(
      webClient.el!,
      ".o_kanban_view",
      "should display the kanban view of action 4"
    );
    assert.containsNone(
      webClient.el!,
      ".o_list_view",
      "should not display the list view of action 3"
    );
    assert.containsOnce(
      webClient.el!,
      ".o_control_panel .breadcrumb-item",
      "there should be one controller in the breadcrumbs"
    );

    assert.verifySteps([
      "/wowl/load_menus",
      "/web/action/load", // action 3
      "load_views", // action 3
      "/web/action/load", // action 4
      "load_views", // action 4
      "/web/dataset/search_read", // search read action 4
    ]);

    webClient.destroy();
  });

  QUnit.test("execute a new action while loading data of default view", async function (assert) {
    assert.expect(12);

    const def = testUtils.makeTestPromise();
    const mockRPC: RPC = async function (route, args) {
      assert.step((args && args.method) || route);
      if (route === "/web/dataset/search_read") {
        await def;
      }
    };
    const webClient = await createWebClient({ testConfig, mockRPC });

    // execute a first action (its 'search_read' RPC is blocked)
    doAction(webClient, 3);
    await testUtils.nextTick();
    await legacyExtraNextTick();

    assert.containsNone(
      webClient.el!,
      ".o_list_view",
      "should not display the list view of action 3"
    );

    // execute another action meanwhile (and unlock the RPC)
    doAction(webClient, 4);
    def.resolve();
    await testUtils.nextTick();
    await legacyExtraNextTick();
    assert.containsOnce(
      webClient.el!,
      ".o_kanban_view",
      "should display the kanban view of action 4"
    );
    assert.containsNone(
      webClient.el!,
      ".o_list_view",
      "should not display the list view of action 3"
    );
    assert.containsOnce(
      webClient.el!,
      ".o_control_panel .breadcrumb-item",
      "there should be one controller in the breadcrumbs"
    );

    assert.verifySteps([
      "/wowl/load_menus",
      "/web/action/load", // action 3
      "load_views", // action 3
      "/web/dataset/search_read", // search read action 3
      "/web/action/load", // action 4
      "load_views", // action 4
      "/web/dataset/search_read", // search read action 4
    ]);

    webClient.destroy();
  });

  QUnit.test("open a record while reloading the list view", async function (assert) {
    assert.expect(12);

    let def: any;
    const mockRPC: RPC = async function (route, args) {
      if (route === "/web/dataset/search_read") {
        await def;
      }
    };
    const webClient = await createWebClient({ testConfig, mockRPC });

    await doAction(webClient, 3);

    assert.containsOnce(webClient, ".o_list_view");
    assert.containsN(webClient, ".o_list_view .o_data_row", 5);
    assert.containsOnce(webClient, ".o_control_panel .o_list_buttons");

    // reload (the search_read RPC will be blocked)
    def = testUtils.makeTestPromise();
    await cpHelpers.switchView(webClient.el!, "list");
    await legacyExtraNextTick();

    assert.containsN(webClient, ".o_list_view .o_data_row", 5);
    assert.containsOnce(webClient, ".o_control_panel .o_list_buttons");

    // open a record in form view
    await testUtils.dom.click($(webClient.el!).find(".o_list_view .o_data_row:first"));
    await legacyExtraNextTick();

    assert.containsOnce(webClient, ".o_form_view");
    assert.containsNone(webClient, ".o_control_panel .o_list_buttons");
    assert.containsOnce(webClient, ".o_control_panel .o_form_buttons_view");

    // unblock the search_read RPC
    def.resolve();
    await testUtils.nextTick();
    await legacyExtraNextTick();

    assert.containsOnce(webClient, ".o_form_view");
    assert.containsNone(webClient, ".o_list_view");
    assert.containsNone(webClient, ".o_control_panel .o_list_buttons");
    assert.containsOnce(webClient, ".o_control_panel .o_form_buttons_view");

    webClient.destroy();
  });

  QUnit.test("properly drop client actions after new action is initiated", async function (assert) {
    assert.expect(3);

    const slowWillStartDef = testUtils.makeTestPromise();

    const actionsRegistry = new Registry<any>();
    class ClientAction extends Component<{}, OdooEnv> {
      static template = tags.xml`<div class="client_action">ClientAction</div>`;
      willStart() {
        return slowWillStartDef;
      }
    }
    actionsRegistry.add("slowAction", ClientAction);
    testConfig.actionRegistry = actionsRegistry;

    const webClient = await createWebClient({ testConfig });
    doAction(webClient, "slowAction");
    await nextTick();
    await legacyExtraNextTick();
    assert.containsNone(webClient, ".client_action", "client action isn't ready yet");

    doAction(webClient, 4);
    await nextTick();
    await legacyExtraNextTick();
    assert.containsOnce(webClient, ".o_kanban_view", "should have loaded a kanban view");

    slowWillStartDef.resolve();
    await testUtils.nextTick();
    await legacyExtraNextTick();
    assert.containsOnce(webClient, ".o_kanban_view", "should still display the kanban view");

    webClient.destroy();
  });

  QUnit.test("switching when doing an action -- load_views slow", async function (assert) {
    assert.expect(13);

    let def: any;
    const mockRPC: RPC = async (route, args) => {
      assert.step((args && args.method) || route);
      if (args && args.method === "load_views") {
        return Promise.resolve(def);
      }
    };
    const webClient = await createWebClient({ testConfig, mockRPC });

    await doAction(webClient, 3);
    assert.containsOnce(webClient, ".o_list_view");

    def = testUtils.makeTestPromise();
    doAction(webClient, 4, { clearBreadcrumbs: true });
    await nextTick();
    await legacyExtraNextTick();
    assert.containsOnce(webClient, ".o_list_view", "should still contain the list view");

    await cpHelpers.switchView(webClient, "kanban");
    def.resolve();
    await testUtils.nextTick();
    await legacyExtraNextTick();

    assert.containsOnce(webClient, ".o_kanban_view");
    assert.strictEqual(
      webClient.el!.querySelector(".o_control_panel .breadcrumb-item")!.textContent,
      "Partners"
    );
    assert.containsNone(webClient, ".o_list_view");

    assert.verifySteps([
      "/wowl/load_menus",
      "/web/action/load", // action 3
      "load_views", // action 3
      "/web/dataset/search_read", // action 3 list fetch
      "/web/action/load", // action 4
      "load_views", // action 4 Hanging
      "/web/dataset/search_read", // action 3 kanban fetch
    ]);

    webClient.destroy();
  });

  QUnit.test("switching when doing an action -- search_read slow", async function (assert) {
    assert.expect(13);

    const def = testUtils.makeTestPromise();
    const defs = [null, def, null];
    const mockRPC: RPC = async (route, args) => {
      assert.step((args && args.method) || route);
      if (route === "/web/dataset/search_read") {
        await Promise.resolve(defs.shift());
      }
    };
    const webClient = await createWebClient({ testConfig, mockRPC });

    await doAction(webClient, 3);
    assert.containsOnce(webClient, ".o_list_view");

    doAction(webClient, 4, { clearBreadcrumbs: true });
    await testUtils.nextTick();
    await legacyExtraNextTick();

    await cpHelpers.switchView(webClient, "kanban");
    def.resolve();
    await testUtils.nextTick();
    await legacyExtraNextTick();

    assert.containsOnce(webClient, ".o_kanban_view");
    assert.strictEqual(
      webClient.el!.querySelector(".o_control_panel .breadcrumb-item")!.textContent,
      "Partners"
    );
    assert.containsNone(webClient, ".o_list_view");

    assert.verifySteps([
      "/wowl/load_menus",
      "/web/action/load", // action 3
      "load_views", // action 3
      "/web/dataset/search_read", // action 3 list fetch
      "/web/action/load", // action 4
      "load_views", // action 4
      "/web/dataset/search_read", // action 4 kanban fetch Hanging
      "/web/dataset/search_read", // action 3 kanban fetch
    ]);

    webClient.destroy();
  });
});
