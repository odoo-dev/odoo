import * as QUnit from "qunit";
import { WebClient } from "../../src/components/webclient/webclient";
import { Registry } from "../../src/core/registry";
import { makeFakeUserService, nextTick, OdooEnv } from "../helpers/index";
import { click, makeTestEnv, mount, TestConfig } from "../helpers/utility";
import { notificationService } from "../../src/services/notifications";
import { menusService } from "../../src/services/menus";
import { actionManagerService } from "../../src/services/action_manager/action_manager";
import { Component, tags } from "@odoo/owl";
import { makeFakeRouterService } from "../helpers/mocks";

let baseConfig: TestConfig;

class ClientAction extends Component<{}, OdooEnv> {
  static template = tags.xml`
  <div class="test_client_action">
    ClientAction_<t t-esc="props.params?.description" />
  </div>`;
}

QUnit.module("web client integrated tests", (hooks) => {
  hooks.beforeEach(() => {
    const actionsRegistry = new Registry<any>();
    actionsRegistry.add("clientAction", ClientAction);
    const menus = {
      root: { id: "root", children: [0, 1, 2], name: "root", appID: "root" },
      // id:0 is a hack to not load anything at webClient mount
      0: { id: 0, children: [], name: "UglyHack", appID: 0 },
      1: { id: 1, children: [], name: "App1", appID: 1, actionID: 1 },
      2: { id: 2, children: [], name: "App2", appID: 2, actionID: 2 },
    };
    const serverSideActions: any = {
      "wowl.client_action": {
        id: 99,
        tag: "clientAction",
        target: "main",
        type: "ir.actions.client",
        params: { description: "xmlId" },
      },
      1: {
        id: 1,
        tag: "clientAction",
        target: "main",
        type: "ir.actions.client",
        params: { description: "Id 1" },
      },
      2: {
        id: 2,
        tag: "clientAction",
        target: "main",
        type: "ir.actions.client",
        params: { description: "Id 2" },
      },
    };
    const serverData = {
      menus,
      actions: serverSideActions,
    };
    const services = new Registry<any>();
    services.add("user", makeFakeUserService());
    services.add(notificationService.name, notificationService);
    services.add("menus", menusService);
    services.add("action_manager", actionManagerService);
    services.add("router", makeFakeRouterService());

    const browser = {
      setTimeout: window.setTimeout.bind(window),
      clearTimeout: window.clearTimeout.bind(window),
    };

    baseConfig = { serverData, actions: actionsRegistry, services, browser };
  });

  QUnit.module("Basic rendering");
  // was "can execute client actions from tag name"
  QUnit.test("can display client actions from tag name", async function (assert) {
    assert.expect(3);
    const env = await makeTestEnv({
      ...baseConfig,
      mockRPC(...args) {
        assert.step(args[0]);
      },
    });
    const webClient = await mount(WebClient, { env });
    assert.verifySteps(["/wowl/load_menus"]);
    env.services.action_manager.doAction("clientAction");
    await nextTick();
    assert.containsOnce(
      // LPE fixme: should be inside  ".o_action_manager"
      webClient.el!,
      ".test_client_action"
    );
  });

  QUnit.test("can display client actions in Dialog", async function (assert) {
    assert.expect(1);

    const env = await makeTestEnv(baseConfig);
    const webClient = await mount(WebClient, { env });
    env.services.action_manager.doAction({
      target: "new",
      tag: "clientAction",
      type: "ir.actions.client",
    });
    await nextTick();
    assert.containsOnce(webClient.el!, ".modal .test_client_action");
  });

  QUnit.test("can display client actions as main, then in Dialog", async function (assert) {
    assert.expect(3);

    const env = await makeTestEnv(baseConfig);
    const webClient = await mount(WebClient, { env });

    env.services.action_manager.doAction("clientAction");
    await nextTick();
    assert.containsOnce(
      // LPE fixme: should be inside  ".o_action_manager"
      webClient.el!,
      ".test_client_action"
    );
    env.services.action_manager.doAction({
      target: "new",
      tag: "clientAction",
      type: "ir.actions.client",
    });
    await nextTick();
    assert.containsN(
      // LPE fixme: should be inside  ".o_action_manager"
      webClient.el!,
      ".test_client_action",
      2
    );
    assert.containsOnce(webClient.el!, ".modal .test_client_action");
  });

  QUnit.test("can display client actions in Dialog, then as main destroys Dialog", async function (
    assert
  ) {
    assert.expect(4);

    const env = await makeTestEnv(baseConfig);
    const webClient = await mount(WebClient, { env });
    env.services.action_manager.doAction({
      target: "new",
      tag: "clientAction",
      type: "ir.actions.client",
    });
    await nextTick();
    assert.containsOnce(webClient.el!, ".test_client_action");
    assert.containsOnce(webClient.el!, ".modal .test_client_action");
    env.services.action_manager.doAction("clientAction");
    await nextTick();
    assert.containsOnce(webClient.el!, ".test_client_action");
    assert.containsNone(webClient.el!, ".modal .test_client_action");
  });

  QUnit.module("load router state");

  QUnit.test("action loading", async (assert) => {
    assert.expect(2);

    const env = await makeTestEnv(baseConfig);
    const webClient = await mount(WebClient, { env });
    env.bus.trigger("test:hashchange", {
      action: 1,
    });
    await nextTick();
    await nextTick();
    assert.containsOnce(webClient.el!, ".test_client_action");
    assert.strictEqual(webClient.el!.querySelector(".o_menu_brand")!.textContent, "App1");
  });

  QUnit.test("menu loading", async (assert) => {
    assert.expect(2);

    const env = await makeTestEnv(baseConfig);
    const webClient = await mount(WebClient, { env });
    env.bus.trigger("test:hashchange", {
      menu_id: 2,
    });
    await nextTick();
    await nextTick();
    assert.strictEqual(
      webClient.el!.querySelector(".test_client_action")!.textContent!.trim(),
      "ClientAction_Id 2"
    );
    assert.strictEqual(webClient.el!.querySelector(".o_menu_brand")!.textContent, "App2");
  });

  QUnit.test("action and menu loading", async (assert) => {
    assert.expect(2);

    const env = await makeTestEnv(baseConfig);
    const webClient = await mount(WebClient, { env });
    env.bus.trigger("test:hashchange", {
      action: 1,
      menu_id: 2,
    });
    await nextTick();
    await nextTick();
    assert.strictEqual(
      webClient.el!.querySelector(".test_client_action")!.textContent!.trim(),
      "ClientAction_Id 1"
    );
    assert.strictEqual(webClient.el!.querySelector(".o_menu_brand")!.textContent, "App2");
  });

  QUnit.test("supports action as xmlId", async (assert) => {
    assert.expect(2);

    const env = await makeTestEnv(baseConfig);
    const webClient = await mount(WebClient, { env });
    env.bus.trigger("test:hashchange", {
      action: "wowl.client_action",
    });
    await nextTick();
    await nextTick();
    assert.strictEqual(
      webClient.el!.querySelector(".test_client_action")!.textContent!.trim(),
      "ClientAction_xmlId"
    );
    assert.containsNone(webClient.el!, ".o_menu_brand");
  });

  QUnit.test("supports opening action in dialog", async (assert) => {
    assert.expect(3);

    baseConfig.serverData!.actions!["wowl.client_action"].target = "new";
    const env = await makeTestEnv(baseConfig);
    const webClient = await mount(WebClient, { env });
    env.bus.trigger("test:hashchange", {
      action: "wowl.client_action",
    });
    await nextTick();
    await nextTick();
    assert.containsOnce(webClient.el!, ".test_client_action");
    assert.containsOnce(webClient.el!, ".modal .test_client_action");
    assert.containsNone(webClient.el!, ".o_menu_brand");
  });

  QUnit.module("push state to router");

  QUnit.test("basic action as App", async (assert) => {
    assert.expect(3);

    baseConfig.services!.remove("router");
    baseConfig.services!.add(
      "router",
      makeFakeRouterService({
        onPushState(newState) {
          assert.deepEqual(newState, {
            action: "2",
            menu_id: "2",
          });
        },
      })
    );
    const env = await makeTestEnv(baseConfig);
    const webClient = await mount(WebClient, { env });
    await click(webClient.el!, ".o_navbar_apps_menu button");
    await click(webClient.el!, ".o_navbar_apps_menu .o_dropdown_item:nth-child(3)");
    await nextTick();
    await nextTick();
    assert.strictEqual(
      webClient.el!.querySelector(".test_client_action")!.textContent!.trim(),
      "ClientAction_Id 2"
    );
    assert.strictEqual(webClient.el!.querySelector(".o_menu_brand")!.textContent, "App2");
  });

  QUnit.test("action in target new do not push state", async (assert) => {
    assert.expect(4);

    baseConfig.serverData!.actions![1].target = "new";
    baseConfig.services!.remove("router");
    baseConfig.services!.add(
      "router",
      makeFakeRouterService({
        onPushState(newState) {
          assert.step("pushState");
        },
      })
    );
    const env = await makeTestEnv(baseConfig);
    const webClient = await mount(WebClient, { env });
    env.services.action_manager.doAction(1);
    await nextTick();
    await nextTick();
    assert.verifySteps([]);
    assert.containsOnce(webClient.el!, ".test_client_action");
    assert.containsOnce(webClient.el!, ".modal .test_client_action");
    assert.containsNone(webClient.el!, ".o_menu_brand");
  });
});
