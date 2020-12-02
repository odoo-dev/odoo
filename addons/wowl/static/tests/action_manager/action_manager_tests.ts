import * as QUnit from "qunit";
import { Registry } from "../../src/core/registry";
import { actionManagerService } from "../../src/action_manager/action_manager";
import { makeTestEnv, nextTick } from "../helpers/index";
import { ComponentAction, FunctionAction, OdooEnv, Service, Registries } from "../../src/types";
import { fakeTitleService, makeFakeRouterService, makeFakeUserService } from "../helpers/mocks";
import { notificationService } from "../../src/notifications/notification_service";

let env: OdooEnv;
let serviceRegistry: Registries["serviceRegistry"];
let actionRegistry: Registries["actionRegistry"];

const serverSideActions: any = {
  1: {
    tag: "client_action_by_db_id",
    target: "main",
    type: "ir.actions.client",
  },
  "wowl.some_action": {
    tag: "client_action_by_xml_id",
    target: "main",
    type: "ir.actions.client",
  },
};

const models: any = {
  partner: {
    fields: { id: { type: "char", string: "id" } },
    records: [],
  },
};

QUnit.module("Action Manager Service", {
  async beforeEach(assert) {
    actionRegistry = new Registry<ComponentAction | FunctionAction>();
    actionRegistry.add("client_action_by_db_id", () => assert.step("client_action_db_id"));
    actionRegistry.add("client_action_by_xml_id", () => assert.step("client_action_xml_id"));
    actionRegistry.add("client_action_by_object", () => assert.step("client_action_object"));
    serviceRegistry = new Registry<Service>();

    serviceRegistry.add(actionManagerService.name, actionManagerService);
    serviceRegistry.add(notificationService.name, notificationService);
    serviceRegistry.add("router", makeFakeRouterService());
    serviceRegistry.add("user", makeFakeUserService());
    serviceRegistry.add("title", fakeTitleService);

    env = await makeTestEnv({
      actionRegistry,
      serverData: { models, actions: serverSideActions },
      serviceRegistry,
    });
  },
});

QUnit.test("action_manager service loads actions", async (assert) => {
  assert.expect(6);

  env.services.action_manager.doAction(1);
  await nextTick();
  assert.verifySteps(["client_action_db_id"]);
  env.services.action_manager.doAction("wowl.some_action");
  await nextTick();
  assert.verifySteps(["client_action_xml_id"]);
  env.services.action_manager.doAction({
    tag: "client_action_by_object",
    target: "current",
    type: "ir.actions.client",
  });
  await nextTick();
  assert.verifySteps(["client_action_object"]);
});
