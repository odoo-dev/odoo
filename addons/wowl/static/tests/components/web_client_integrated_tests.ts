import * as QUnit from "qunit";
import { Component, tags } from "@odoo/owl";
import { Registry } from "../../src/core/registry";
import { ComponentAction, FunctionAction, Service } from "../../src/types";
import { OdooEnv, makeFakeUserService, nextTick } from "../helpers/index";
import { ServerData } from "../helpers/mock_server";
import { actionManagerService } from "../../src/services/action_manager/action_manager";
import { notificationService } from "./../../src/services/notifications";
import { WebClient } from "../../src/components/webclient/webclient";
import { CreateComponentParams, createComponent, getService, mount } from "../helpers/utility";
import { menusService } from "../../src/services/menus";

let serverData: ServerData;
let actionsRegistry: Registry<ComponentAction | FunctionAction>;

class ClientAction extends Component<{}, OdooEnv> {
  static template = tags.xml`<div class="test_client_action">ClientAction</div>`;
}

async function createWebClient(params: CreateComponentParams): ReturnType<typeof mount> {
  const config = (params.config = params.config || {});
  config.actions = actionsRegistry;
  const services = (config.services = config.services || new Registry<Service>());
  params.serverData = serverData;
  services.add("user", makeFakeUserService());
  services.add(notificationService.name, notificationService);
  services.add("menus", menusService);
  services.add("action_manager", actionManagerService);
  return createComponent(WebClient, params);
}

QUnit.module("Basic action rendering", {
  async beforeEach() {
    actionsRegistry = new Registry<ComponentAction | FunctionAction>();
    actionsRegistry.add("clientAction", ClientAction);
    const menus = {
      root: { id: "root", children: [1], name: "root", appID: "root" },
      1: { id: 1, children: [], name: "App0", appID: 1 },
    };
    const serverSideActions: any = {
      "wowl.client_action": {
        tag: "clientAction",
        target: "main",
        type: "ir.actions.client",
      },
    };
    serverData = {
      menus,
      actions: serverSideActions,
    };
  },
});

// was "can execute client actions from tag name"
QUnit.test("can display client actions from tag name", async function (assert) {
  assert.expect(3);
  const webClient = await createWebClient({
    config: {},
    mockRPC(...args) {
      assert.step(args[0]);
    },
  });
  assert.verifySteps(["/wowl/load_menus"]);
  const actionManager = getService(webClient, "action_manager");
  actionManager.doAction("clientAction");
  await nextTick();
  assert.containsOnce(
    // LPE fixme: should be inside  ".o_action_manager"
    webClient.el!,
    ".test_client_action"
  );
});

QUnit.test("can display client actions in Dialog", async function (assert) {
  assert.expect(1);

  const webClient = await createWebClient({
    config: {},
  });
  const actionManager = getService(webClient, "action_manager");
  actionManager.doAction({
    target: "new",
    tag: "clientAction",
    type: "ir.actions.client",
  });
  await nextTick();
  assert.containsOnce(webClient.el!, ".modal .test_client_action");
});

QUnit.test("can display client actions as main, then in Dialog", async function (assert) {
  assert.expect(3);

  const webClient = await createWebClient({
    config: {},
  });
  const actionManager = getService(webClient, "action_manager");
  actionManager.doAction("clientAction");
  await nextTick();
  assert.containsOnce(
    // LPE fixme: should be inside  ".o_action_manager"
    webClient.el!,
    ".test_client_action"
  );
  actionManager.doAction({
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

  const webClient = await createWebClient({
    config: {},
  });
  const actionManager = getService(webClient, "action_manager");
  actionManager.doAction({
    target: "new",
    tag: "clientAction",
    type: "ir.actions.client",
  });
  await nextTick();
  assert.containsOnce(webClient.el!, ".test_client_action");
  assert.containsOnce(webClient.el!, ".modal .test_client_action");
  actionManager.doAction("clientAction");
  await nextTick();
  assert.containsOnce(webClient.el!, ".test_client_action");
  assert.containsNone(webClient.el!, ".modal .test_client_action");
});
