import * as QUnit from "qunit";
import { Registry } from "../../src/core/registry";
import { actionManagerService } from "../../src/services/action_manager/action_manager";
import { notificationService } from "./../../src/services/notifications";
import { makeTestEnv, nextTick } from "../helpers/index";
import { ComponentAction, FunctionAction, OdooEnv, Service } from "../../src/types";
import { makeMockServer } from "../helpers/mock_server";
import { makeFakeRouterService } from "../helpers/mocks";

let env: OdooEnv;
let services: Registry<Service>;
let actionsRegistry: Registry<ComponentAction | FunctionAction>;

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
    actionsRegistry = new Registry<ComponentAction | FunctionAction>();
    actionsRegistry.add("client_action_by_db_id", () => assert.step("client_action_db_id"));
    actionsRegistry.add("client_action_by_xml_id", () => assert.step("client_action_xml_id"));
    actionsRegistry.add("client_action_by_object", () => assert.step("client_action_object"));
    services = new Registry<Service>();
    makeMockServer({ services }, { models, actions: serverSideActions });

    services.add(actionManagerService.name, actionManagerService);
    services.add(notificationService.name, notificationService);
    services.add("router", makeFakeRouterService());

    env = await makeTestEnv({ actions: actionsRegistry, services });
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
