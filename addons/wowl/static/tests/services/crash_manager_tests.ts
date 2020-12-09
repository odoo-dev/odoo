import { Component, tags } from "@odoo/owl";
import * as QUnit from "qunit";
import { Registry } from "../../src/core/registry";
import { crashManagerService } from "../../src/crash_manager/crash_manager_service";
import { RPCErrorDialog } from "../../src/crash_manager/error_dialogs";
import { DialogManagerService } from "../../src/services/dialog_manager";
import { RPCError } from "../../src/services/rpc";
import { Registries, Service, Type } from "../../src/types";
import { makeTestEnv, OdooEnv } from "../helpers/index";

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
let windowAddEventListener = window.addEventListener;

QUnit.module("CrashManager", {
  async beforeEach() {
    serviceRegistry = new Registry();
    serviceRegistry.add(crashManagerService.name, crashManagerService);
  },
  afterEach() {
    window.addEventListener = windowAddEventListener;
  },
});

QUnit.test("handle RPC_ERROR of type='server' and no associated dialog class", async (assert) => {
  assert.expect(2);
  let errorCb: any;
  window.addEventListener = (type: any, cb: any) => {
    if (type === "unhandledrejection") {
      errorCb = cb;
    }
  };
  const error = new RPCError();
  error.code = 701;
  error.message = "Some strange error occured";
  error.data = { debug: "somewhere" };
  error.subType = "strange_error";

  function open(dialogClass: Type<Component>, props?: object) {
    assert.strictEqual(dialogClass, RPCErrorDialog);
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
      traceback: error.stack,
    });
  }
  serviceRegistry.add("dialog_manager", makeFakeDialogManagerService(open));

  env = await makeTestEnv({ serviceRegistry });
  const errorEvent = new PromiseRejectionEvent("error", { reason: error, promise: null as any });
  errorCb(errorEvent);
});

QUnit.test(
  "handle RPC_ERROR of type='server' and associated custom dialog class",
  async (assert) => {
    assert.expect(2);
    let errorCb: any;
    window.addEventListener = (type: any, cb: any) => {
      if (type === "unhandledrejection") {
        errorCb = cb;
      }
    };

    class CustomDialog extends Component<{}, OdooEnv> {
      static template = tags.xml`<RPCErrorDialog title="'Strange Error'"/>`;
      static components = { RPCErrorDialog };
    }

    const error = new RPCError();
    error.code = 701;
    error.message = "Some strange error occured";
    error.Component = CustomDialog;

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
        traceback: error.stack,
      });
    }
    serviceRegistry.add("dialog_manager", makeFakeDialogManagerService(open));
    env = await makeTestEnv({ serviceRegistry });
    odoo.errorDialogRegistry.add("strange_error", CustomDialog);
    const errorEvent = new PromiseRejectionEvent("error", { reason: error, promise: null as any });
    errorCb(errorEvent);
  }
);
