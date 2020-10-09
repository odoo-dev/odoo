import * as QUnit from "qunit";
import { Component, tags } from "@odoo/owl";
import { Registry } from "../../src/core/registry";
import { ComponentAction, FunctionAction, Service } from "../../src/types";
import { OdooEnv, makeFakeMenusService, makeFakeUserService, nextTick } from "../helpers/index";
import { ServerData } from "../helpers/mock_server";
import { actionManagerService } from "../../src/services/action_manager/action_manager";
import { WebClient } from "../../src/components/webclient/webclient";
import { CreateComponentParams, createComponent, getService } from "../helpers/utility";

let serverData: ServerData;
let actionsRegistry: Registry<ComponentAction | FunctionAction>;

class ClientAction extends Component<{}, OdooEnv> {
  static template = tags.xml`<div class="test_client_action">ClientAction</div>`;
}

async function createWebClient(params: CreateComponentParams) {
  const config = (params.config = params.config || {});
  config.actions = actionsRegistry;
  const services = (config.services = config.services || new Registry<Service>());
  params.serverData = serverData;
  services.add("user", makeFakeUserService());
  services.add("menus", makeFakeMenusService(params.serverData.menus));
  services.add("action_manager", actionManagerService);
  return createComponent(WebClient, params);
}

QUnit.module("ClientAction", {
  async beforeEach() {
    actionsRegistry = new Registry<ComponentAction | FunctionAction>();
    actionsRegistry.add("clientAction", ClientAction);
    const menus = {
      root: { id: "root", children: [1], name: "root" },
      1: { id: 1, children: [], name: "App0" },
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

QUnit.test("can execute client actions from tag name", async function (assert) {
  assert.expect(3);

  const webClient = await createWebClient({
    config: {},
    mockRPC(...args) {
      assert.step(args[0]);
    },
  });
  const actionManager = getService(webClient, "action_manager");
  actionManager.doAction("wowl.client_action");
  await nextTick();
  assert.containsOnce(
    // LPE fixme: should be inside  ".o_action_manager"
    webClient.el!,
    ".test_client_action"
  );
  assert.verifySteps(["/web/action/load"]);
});
