/** @odoo-module **/

import { click, legacyExtraNextTick } from "../helpers/utils";
import { makeFakeRouterService } from "../helpers/mock_services";
import { getLegacy } from "web.test_legacy";
import { actionRegistry } from "@web/actions/action_registry";
import { createWebClient, doAction, getActionManagerTestConfig } from "./helpers";
import { NotificationContainer } from "@web/notifications/notification_container";
import { mainComponentRegistry } from "@web/webclient/main_component_registry";
import { registerCleanup } from "../helpers/cleanup";
import { clearRegistryWithCleanup } from "../helpers/mock_env";
import { serviceRegistry } from "@web/webclient/service_registry";

const { Component, tags } = owl;

let testConfig;
// legacy stuff
let AbstractAction;
let core;
let testUtils;

QUnit.module("ActionManager", (hooks) => {
  hooks.before(() => {
    const legacy = getLegacy();
    AbstractAction = legacy.AbstractAction;
    core = legacy.core;
    testUtils = legacy.testUtils;
  });
  hooks.beforeEach(() => {
    testConfig = getActionManagerTestConfig();
  });

  QUnit.module("Client Actions");

  QUnit.test("can display client actions in Dialog", async function (assert) {
    assert.expect(2);
    const webClient = await createWebClient({ testConfig });
    await doAction(webClient, {
      name: "Dialog Test",
      target: "new",
      tag: "__test__client__action__",
      type: "ir.actions.client",
    });
    assert.containsOnce(webClient, ".modal .test_client_action");
    assert.strictEqual(webClient.el.querySelector(".modal-title").textContent, "Dialog Test");
  });

  QUnit.test("can display client actions as main, then in Dialog", async function (assert) {
    assert.expect(3);
    const webClient = await createWebClient({ testConfig });
    await doAction(webClient, "__test__client__action__");
    assert.containsOnce(webClient, ".o_action_manager .test_client_action");
    await doAction(webClient, {
      target: "new",
      tag: "__test__client__action__",
      type: "ir.actions.client",
    });
    assert.containsOnce(webClient, ".o_action_manager .test_client_action");
    assert.containsOnce(webClient, ".modal .test_client_action");
  });

  QUnit.test(
    "can display client actions in Dialog, then as main destroys Dialog",
    async function (assert) {
      assert.expect(4);
      const webClient = await createWebClient({ testConfig });
      await doAction(webClient, {
        target: "new",
        tag: "__test__client__action__",
        type: "ir.actions.client",
      });
      assert.containsOnce(webClient, ".test_client_action");
      assert.containsOnce(webClient, ".modal .test_client_action");
      await doAction(webClient, "__test__client__action__");
      assert.containsOnce(webClient, ".test_client_action");
      assert.containsNone(webClient, ".modal .test_client_action");
    }
  );

  QUnit.test("can execute client actions from tag name (legacy)", async function (assert) {
    // remove this test as soon as legacy Widgets are no longer supported
    assert.expect(4);
    const ClientAction = AbstractAction.extend({
      start: function () {
        this.$el.text("Hello World");
        this.$el.addClass("o_client_action_test");
      },
    });
    const mockRPC = async function (route, args) {
      assert.step((args && args.method) || route);
    };
    core.action_registry.add("HelloWorldTestLeg", ClientAction);
    registerCleanup(() => delete core.action_registry.map.HelloWorldTestLeg);
    const webClient = await createWebClient({ testConfig, mockRPC });
    await doAction(webClient, "HelloWorldTestLeg");
    assert.containsNone(
      document.body,
      ".o_control_panel",
      "shouldn't have rendered a control panel"
    );
    assert.strictEqual(
      $(webClient.el).find(".o_client_action_test").text(),
      "Hello World",
      "should have correctly rendered the client action"
    );
    assert.verifySteps(["/web/webclient/load_menus"]);
  });

  QUnit.test("can execute client actions from tag name", async function (assert) {
    assert.expect(4);
    class ClientAction extends Component {}
    ClientAction.template = tags.xml`<div class="o_client_action_test">Hello World</div>`;
    actionRegistry.add("HelloWorldTest", ClientAction);

    const mockRPC = async function (route, args) {
      assert.step((args && args.method) || route);
    };
    const webClient = await createWebClient({ testConfig, mockRPC });
    await doAction(webClient, "HelloWorldTest");
    assert.containsNone(
      document.body,
      ".o_control_panel",
      "shouldn't have rendered a control panel"
    );
    assert.strictEqual(
      $(webClient.el).find(".o_client_action_test").text(),
      "Hello World",
      "should have correctly rendered the client action"
    );
    assert.verifySteps(["/web/webclient/load_menus"]);
  });

  QUnit.test("client action with control panel (legacy)", async function (assert) {
    assert.expect(4);
    // LPE Fixme: at this time we don't really know the API that wowl ClientActions implement
    const ClientAction = AbstractAction.extend({
      hasControlPanel: true,
      start() {
        this.$(".o_content").text("Hello World");
        this.$el.addClass("o_client_action_test");
        this.controlPanelProps.title = "Hello";
        return this._super.apply(this, arguments);
      },
    });
    core.action_registry.add("HelloWorldTest", ClientAction);
    registerCleanup(() => delete core.action_registry.map.HelloWorldTest);
    const webClient = await createWebClient({ testConfig });
    await doAction(webClient, "HelloWorldTest");
    assert.strictEqual(
      $(".o_control_panel:visible").length,
      1,
      "should have rendered a control panel"
    );
    assert.containsN(
      webClient.el,
      ".o_control_panel .breadcrumb-item",
      1,
      "there should be one controller in the breadcrumbs"
    );
    assert.strictEqual(
      $(".o_control_panel .breadcrumb-item").text(),
      "Hello",
      "breadcrumbs should still display the title of the controller"
    );
    assert.strictEqual(
      $(webClient.el).find(".o_client_action_test .o_content").text(),
      "Hello World",
      "should have correctly rendered the client action"
    );
  });

  QUnit.test("state is pushed for client action (legacy)", async function (assert) {
    assert.expect(6);
    const ClientAction = AbstractAction.extend({
      getTitle: function () {
        return "a title";
      },
      getState: function () {
        return { foo: "baz" };
      },
    });
    serviceRegistry.add(
      "router",
      makeFakeRouterService({
        onPushState() {
          assert.step("push_state");
        },
      }),
      { force: true }
    );

    core.action_registry.add("HelloWorldTest", ClientAction);
    registerCleanup(() => delete core.action_registry.map.HelloWorldTest);
    const webClient = await createWebClient({ testConfig });
    let currentTitle = webClient.env.services.title.current;
    assert.strictEqual(currentTitle, '{"zopenerp":"Odoo"}');
    let currentHash = webClient.env.services.router.current.hash;
    assert.deepEqual(currentHash, {});
    await doAction(webClient, "HelloWorldTest");
    currentTitle = webClient.env.services.title.current;
    assert.strictEqual(currentTitle, '{"zopenerp":"Odoo","action":"a title"}');
    currentHash = webClient.env.services.router.current.hash;
    assert.deepEqual(currentHash, {
      action: "HelloWorldTest",
      foo: "baz",
    });
    assert.verifySteps(["push_state"]);
  });

  QUnit.test("action can use a custom control panel (legacy)", async function (assert) {
    assert.expect(1);
    class CustomControlPanel extends Component {}
    CustomControlPanel.template = tags.xml`
        <div class="custom-control-panel">My custom control panel</div>
      `;
    const ClientAction = AbstractAction.extend({
      hasControlPanel: true,
      config: {
        ControlPanel: CustomControlPanel,
      },
    });
    core.action_registry.add("HelloWorldTest", ClientAction);
    registerCleanup(() => delete core.action_registry.map.HelloWorldTest);
    const webClient = await createWebClient({ testConfig });
    await doAction(webClient, "HelloWorldTest");
    assert.containsOnce(
      webClient.el,
      ".custom-control-panel",
      "should have a custom control panel"
    );
  });

  QUnit.test("breadcrumb is updated on title change (legacy)", async function (assert) {
    assert.expect(2);
    const ClientAction = AbstractAction.extend({
      hasControlPanel: true,
      events: {
        click: function () {
          this.updateControlPanel({ title: "new title" });
        },
      },
      start: async function () {
        this.$(".o_content").text("Hello World");
        this.$el.addClass("o_client_action_test");
        this.controlPanelProps.title = "initial title";
        await this._super.apply(this, arguments);
      },
    });
    core.action_registry.add("HelloWorldTest", ClientAction);
    registerCleanup(() => delete core.action_registry.map.HelloWorldTest);
    const webClient = await createWebClient({ testConfig });
    await doAction(webClient, "HelloWorldTest");
    assert.strictEqual(
      $("ol.breadcrumb").text(),
      "initial title",
      "should have initial title as breadcrumb content"
    );
    await testUtils.dom.click($(webClient.el).find(".o_client_action_test"));
    await legacyExtraNextTick();
    assert.strictEqual(
      $("ol.breadcrumb").text(),
      "new title",
      "should have updated title as breadcrumb content"
    );
  });

  QUnit.test("client actions can have breadcrumbs (legacy)", async function (assert) {
    assert.expect(4);
    const ClientAction = AbstractAction.extend({
      hasControlPanel: true,
      init(parent, action) {
        action.display_name = "Goldeneye";
        this._super.apply(this, arguments);
      },
      start() {
        this.$el.addClass("o_client_action_test");
        return this._super.apply(this, arguments);
      },
    });
    const ClientAction2 = AbstractAction.extend({
      hasControlPanel: true,
      init(parent, action) {
        action.display_name = "No time for sweetness";
        this._super.apply(this, arguments);
      },
      start() {
        this.$el.addClass("o_client_action_test_2");
        return this._super.apply(this, arguments);
      },
    });
    core.action_registry.add("ClientAction", ClientAction);
    core.action_registry.add("ClientAction2", ClientAction2);
    const webClient = await createWebClient({ testConfig });
    await doAction(webClient, "ClientAction");
    assert.containsOnce(webClient.el, ".breadcrumb-item");
    assert.strictEqual(
      webClient.el.querySelector(".breadcrumb-item.active").textContent,
      "Goldeneye"
    );
    await doAction(webClient, "ClientAction2", { clearBreadcrumbs: false });
    assert.containsN(webClient.el, ".breadcrumb-item", 2);
    assert.strictEqual(
      webClient.el.querySelector(".breadcrumb-item.active").textContent,
      "No time for sweetness"
    );
    delete core.action_registry.map.ClientAction;
    delete core.action_registry.map.ClientAction2;
  });

  QUnit.test("ClientAction receives breadcrumbs and exports title (wowl)", async (assert) => {
    assert.expect(4);
    class ClientAction extends Component {
      setup() {
        this.breadcrumbTitle = "myOwlAction";
        const breadCrumbs = this.props.breadcrumbs;
        assert.strictEqual(breadCrumbs.length, 1);
        assert.strictEqual(breadCrumbs[0].name, "Favorite Ponies");
      }
      mounted() {
        this.trigger("controller-title-updated", this.breadcrumbTitle);
      }
      onClick() {
        this.breadcrumbTitle = "newOwlTitle";
        this.trigger("controller-title-updated", this.breadcrumbTitle);
      }
    }
    ClientAction.template = tags.xml`<div class="my_owl_action" t-on-click="onClick">owl client action</div>`;
    actionRegistry.add("OwlClientAction", ClientAction);
    const webClient = await createWebClient({ testConfig });
    await doAction(webClient, 8);
    await doAction(webClient, "OwlClientAction");
    assert.containsOnce(webClient.el, ".my_owl_action");
    await click(webClient.el, ".my_owl_action");
    await doAction(webClient, 3);
    assert.strictEqual(
      webClient.el.querySelector(".breadcrumb").textContent,
      "Favorite PoniesnewOwlTitlePartners"
    );
  });

  QUnit.test("test display_notification client action", async function (assert) {
    assert.expect(6);
    clearRegistryWithCleanup(mainComponentRegistry);
    mainComponentRegistry.add("NotificationContainer", NotificationContainer);
    const webClient = await createWebClient({ testConfig });
    await doAction(webClient, 1);
    assert.containsOnce(webClient, ".o_kanban_view");
    await doAction(webClient, {
      type: "ir.actions.client",
      tag: "display_notification",
      params: {
        title: "title",
        message: "message",
        sticky: true,
      },
    });
    const notificationSelector = ".o_notification_manager .o_notification";
    assert.containsOnce(document.body, notificationSelector, "a notification should be present");
    const notificationElement = document.body.querySelector(notificationSelector);
    assert.strictEqual(
      notificationElement.querySelector(".o_notification_title").textContent,
      "title",
      "the notification should have the correct title"
    );
    assert.strictEqual(
      notificationElement.querySelector(".o_notification_content").textContent,
      "message",
      "the notification should have the correct message"
    );
    assert.containsOnce(webClient, ".o_kanban_view");
    await testUtils.dom.click(notificationElement.querySelector(".o_notification_close"));
    assert.containsNone(document.body, notificationSelector, "the notification should be destroy ");
  });

  QUnit.test("test next action on display_notification client action", async function (assert) {
    clearRegistryWithCleanup(mainComponentRegistry);
    mainComponentRegistry.add("NotificationContainer", NotificationContainer);
    const webClient = await createWebClient({ testConfig });
    const options = {
      onClose: function (infos) {
        assert.step("onClose");
      },
    };
    await doAction(
      webClient,
      {
        type: "ir.actions.client",
        tag: "display_notification",
        params: {
          title: "title",
          message: "message",
          sticky: true,
          next: {
            type: "ir.actions.act_window_close",
          },
        },
      },
      options
    );
    const notificationSelector = ".o_notification_manager .o_notification";
    assert.containsOnce(document.body, notificationSelector, "a notification should be present");
    const notificationElement = document.body.querySelector(notificationSelector);
    assert.verifySteps(["onClose"]);
  });
});
