import * as QUnit from "qunit";
import { Registry } from "../../src/core/registry";
import { actionManagerService } from "../../src/services/action_manager/action_manager";
import { makeFakeRPCService, makeTestEnv, nextTick } from "../helpers";
import { ComponentAction, FunctionAction, OdooEnv, Service } from "../../src/types";
import { RPC } from "../../src/services/rpc";

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

QUnit.module("Action Manager Service", {
  async beforeEach(assert) {
    actionsRegistry = new Registry<ComponentAction | FunctionAction>();
    actionsRegistry.add("client_action_by_db_id", () => assert.step("client_action_db_id"));
    actionsRegistry.add("client_action_by_xml_id", () => assert.step("client_action_xml_id"));
    actionsRegistry.add("client_action_by_object", () => assert.step("client_action_object"));
    services = new Registry<Service>();
    services.add(
      "rpc",
      makeFakeRPCService((route: Parameters<RPC>[0], args: Parameters<RPC>[1]) => {
        if (route === "/web/action/load") {
          const id = args && args.action_id;
          return serverSideActions[id];
        }
      })
    );
    services.add("action_manager", actionManagerService);
    env = await makeTestEnv({ actions: actionsRegistry, services });
  },
});

QUnit.test("action_manager service loads actions", async (assert) => {
  assert.expect(4);

  env.services.action_manager.doAction(1);
  await nextTick();
  assert.verifySteps(["client_action_db_id"]);
  env.services.action_manager.doAction("wowl.some_action");
  await nextTick();
  assert.verifySteps(["client_action_xml_id"]);
  // TODO
  /*  env.services.action_manager.doAction({
    tag: 'client_action_by_object',
    type: 'ir.actions.client',
  });
  await nextTick();
  assert.verifySteps([
    'client_action_object',
  ]);*/
});
