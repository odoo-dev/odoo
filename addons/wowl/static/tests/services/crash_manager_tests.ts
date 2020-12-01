import * as QUnit from "qunit";
import { makeTestEnv, OdooEnv } from "../helpers/index";
import { Registry } from "../../src/core/registry";
import { Registries, Service, Type } from "../../src/types";
import { crashManagerService } from "../../src/crash_manager/crash_manager_service";
import { DialogManagerService } from "../../src/services/dialog_manager";
import { Component, tags } from "@odoo/owl";
import { ErrorDialog } from "../../src/crash_manager/error_dialogs";
import { RPCError } from "../../src/services/rpc";
import { Dialog } from "../../src/components/dialog/dialog";

function makeFakeDialogManagerService(
  open: (dialogClass: Type<Component>, props?: object) => void
): Service<DialogManagerService> {
  return {
    name: "dialog_manager",
    deploy(): DialogManagerService {
      return { open };
    },
  };
}

let env: OdooEnv;
let serviceRegistry: Registries["serviceRegistry"];

QUnit.module("CrashManager", {
  async beforeEach() {
    serviceRegistry = new Registry();
    serviceRegistry.add(crashManagerService.name, crashManagerService);
  },
});

QUnit.test("does not handle RPC_ERROR with type='network'", async (assert) => {
  assert.expect(1);
  function open() {
    assert.step("no dialog should open");
  }
  serviceRegistry.add("dialog_manager", makeFakeDialogManagerService(open));
  env = await makeTestEnv({ serviceRegistry });
  env.bus.trigger("RPC_ERROR", {
    type: "network",
  });
  assert.verifySteps([]);
});

QUnit.test("handle RPC_ERROR of type='server' and no associated dialog class", async (assert) => {
  assert.expect(2);
  const error: RPCError = {
    type: "server",
    code: 701,
    message: "Some strange error occured",
    data: {
      debug: "somewhere",
    },
    subType: "strange_error",
  };
  function open(dialogClass: Type<Component>, props?: object) {
    assert.strictEqual(dialogClass, ErrorDialog);
    assert.deepEqual(props, { error });
  }
  serviceRegistry.add("dialog_manager", makeFakeDialogManagerService(open));
  env = await makeTestEnv({ serviceRegistry });
  env.bus.trigger("RPC_ERROR", error);
});

QUnit.test(
  "handle RPC_ERROR of type='server' and associated custom dialog class",
  async (assert) => {
    assert.expect(2);
    class CustomDialog extends Component<{}, OdooEnv> {
      static template = tags.xml`<Dialog title="'Strange Error'"/>`;
      static components = { Dialog };
    }
    const error: RPCError = {
      type: "server",
      code: 701,
      message: "Some strange error occured",
      name: "strange_error",
    };
    function open(dialogClass: Type<Component>, props?: object) {
      assert.strictEqual(dialogClass, CustomDialog);
      assert.deepEqual(props, { error });
    }
    serviceRegistry.add("dialog_manager", makeFakeDialogManagerService(open));
    env = await makeTestEnv({ serviceRegistry });
    odoo.errorDialogRegistry.add("strange_error", CustomDialog);
    env.bus.trigger("RPC_ERROR", error);
  }
);
