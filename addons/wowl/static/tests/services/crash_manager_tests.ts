import * as QUnit from "qunit";
import { makeTestEnv, OdooEnv } from "../helpers/index";
import { Registry } from "../../src/core/registry";
import { Service, Type } from "../../src/types";
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
let services: Registry<Service>;

QUnit.module("CrashManager", {
  async beforeEach() {
    services = new Registry();
    services.add(crashManagerService.name, crashManagerService);
  },
});

QUnit.test("does not handle RPC_ERROR with type='network'", async (assert) => {
  assert.expect(1);
  function open() {
    assert.step("no dialog should open");
  }
  services.add("dialog_manager", makeFakeDialogManagerService(open));
  env = await makeTestEnv({ services });
  const error = new RPCError();
  error.type = "network";
  env.bus.trigger("ERROR_DISPATCH", error);
  assert.verifySteps([]);
});

QUnit.test("handle RPC_ERROR of type='server' and no associated dialog class", async (assert) => {
  assert.expect(2);

  const error = new RPCError();
  error.code = 701;
  error.message = "Some strange error occured";
  (error.data = {
    debug: "somewhere",
  }),
    (error.subType = "strange_error");

  function open(dialogClass: Type<Component>, props?: object) {
    assert.strictEqual(dialogClass, ErrorDialog);
    assert.deepEqual(props, {
      name: "RPC_ERROR",
      type: "server",
      code: 701,
      data: {
        debug: "somewhere",
      },
      subType: "strange_error",
      message: "Some strange error occured",
      exceptionName: undefined,
      mute: false,
      traceback: error.stack,
    });
  }
  services.add("dialog_manager", makeFakeDialogManagerService(open));
  env = await makeTestEnv({ services });
  env.bus.trigger("ERROR_DISPATCH", error);
});

QUnit.test(
  "handle RPC_ERROR of type='server' and associated custom dialog class",
  async (assert) => {
    assert.expect(2);
    class CustomDialog extends Component<{}, OdooEnv> {
      static template = tags.xml`<Dialog title="'Strange Error'"/>`;
      static components = { Dialog };
    }

    const error = new RPCError();
    error.code = 701;
    error.message = "Some strange error occured";
    error.alternativeComponent = CustomDialog;

    function open(dialogClass: Type<Component>, props?: object) {
      assert.strictEqual(dialogClass, CustomDialog);
      assert.deepEqual(props, {
        name: "RPC_ERROR",
        type: "server",
        code: 701,
        data: undefined,
        subType: undefined,
        message: "Some strange error occured",
        exceptionName: undefined,
        mute: false,
        traceback: error.stack,
      });
    }
    services.add("dialog_manager", makeFakeDialogManagerService(open));
    env = await makeTestEnv({ services });
    env.registries.errorDialogs.add("strange_error", CustomDialog);
    env.bus.trigger("ERROR_DISPATCH", error);
  }
);
