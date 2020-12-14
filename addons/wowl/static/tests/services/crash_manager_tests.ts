import { Component, tags } from "@odoo/owl";
import * as QUnit from "qunit";
import { Registry } from "../../src/core/registry";
import { crashManagerService } from "../../src/crash_manager/crash_manager_service";
import { notificationService } from "../../src/notifications/notification_service";
import { RPCErrorDialog } from "../../src/crash_manager/error_dialogs";
import { dialogManagerService, DialogManagerService } from "../../src/services/dialog_manager";
import { makeFakeRPCService, makeFakeNotificationService } from "../helpers/mocks";
import { ConnectionLostError, RPCError, RPC } from "../../src/services/rpc";
import { nextTick } from "../helpers/utility";
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

let serviceRegistry: Registries["serviceRegistry"];
let windowAddEventListener = window.addEventListener;

QUnit.module("CrashManager", {
  async beforeEach() {
    serviceRegistry = new Registry();
    serviceRegistry.add(crashManagerService.name, crashManagerService);
    serviceRegistry.add(dialogManagerService.name, dialogManagerService);
    serviceRegistry.add(notificationService.name, notificationService);
    serviceRegistry.add("rpc", makeFakeRPCService());
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
  serviceRegistry.add("dialog_manager", makeFakeDialogManagerService(open), true);

  await makeTestEnv({ serviceRegistry });
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
    serviceRegistry.add("dialog_manager", makeFakeDialogManagerService(open), true);
    await makeTestEnv({ serviceRegistry });
    odoo.errorDialogRegistry.add("strange_error", CustomDialog);
    const errorEvent = new PromiseRejectionEvent("error", { reason: error, promise: null as any });
    errorCb(errorEvent);
  }
);

QUnit.test("handle CONNECTION_LOST_ERROR", async (assert) => {
  let errorCb: any;
  window.addEventListener = (type: any, cb: any) => {
    if (type === "unhandledrejection") {
      errorCb = cb;
    }
  };

  const mockBrowser: any = {
    setTimeout: (callback: Function, delay: number) => {
      assert.step(`set timeout (${delay === 2000 ? delay : ">2000"})`);
      callback();
    },
  };

  const mockCreate = (message: string) => {
    assert.step(`create (${message})`);
    return 1234;
  };
  const mockClose = (id: number) => assert.step(`close (${id})`);
  serviceRegistry.add("notifications", makeFakeNotificationService(mockCreate, mockClose), true);

  const values = [false, true]; // simulate the 'back online status' after 2 'version_info' calls
  const mockRPC: RPC = async (route) => {
    if (route === "/web/webclient/version_info") {
      assert.step("version_info");
      const online = values.shift();
      if (online) {
        return Promise.resolve(true);
      } else {
        return Promise.reject();
      }
    }
  };
  await makeTestEnv({ serviceRegistry, mockRPC, browser: mockBrowser });

  const error = new ConnectionLostError();
  const errorEvent = new PromiseRejectionEvent("error", { reason: error, promise: null as any });
  errorCb(errorEvent);

  await nextTick(); // wait for mocked RPCs

  assert.verifySteps([
    "create (Connection lost. Trying to reconnect...)",
    "set timeout (2000)",
    "version_info",
    "set timeout (>2000)",
    "version_info",
    "close (1234)",
    "create (Connection restored. You are back online.)",
  ]);
});
