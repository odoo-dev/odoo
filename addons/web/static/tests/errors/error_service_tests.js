/** @odoo-module **/

import { browser } from "@web/core/browser";
import { serviceRegistry }  from "@web/webclient/service_registry";
import { RPCErrorDialog } from "@web/errors/error_dialogs";
import { errorHandlerRegistry } from "@web/errors/error_handler_registry";
import { errorService } from "@web/errors/error_service";
import OdooError from "@web/errors/odoo_error";
import { notificationService } from "@web/notifications/notification_service";
import { dialogService } from "@web/services/dialog_service";
import { ConnectionLostError, RPCError } from "@web/services/rpc_service";
import { errorDialogRegistry } from "@web/errors/error_dialog_registry";
import { registerCleanup } from "../helpers/cleanup";
import { makeTestEnv } from "../helpers/mock_env";
import { makeFakeLocalizationService, makeFakeNotificationService, makeFakeRPCService } from "../helpers/mock_services";
import { nextTick, patchWithCleanup } from "../helpers/utils";

const { Component, tags } = owl;

function makeFakeDialogService(open) {
  return {
    name: "dialog",
    start() {
      return { open };
    },
  };
}

let errorCb; // unused ?
let unhandledRejectionCb;

QUnit.module("Error Service", {
  async beforeEach() {
    serviceRegistry.add("error", errorService);
    serviceRegistry.add("dialog", dialogService);
    serviceRegistry.add("notification", notificationService);
    serviceRegistry.add("rpc", makeFakeRPCService());
    serviceRegistry.add("localization", makeFakeLocalizationService());
    const windowAddEventListener = window.addEventListener;
    window.addEventListener = (type, cb) => {
      if (type === "unhandledrejection") {
        unhandledRejectionCb = cb;
      }
      if (type === "error") {
        errorCb = cb;
      }
    };
    registerCleanup(() => {
      window.addEventListener = windowAddEventListener;
    });
  },
});

QUnit.test("handle RPC_ERROR of type='server' and no associated dialog class", async (assert) => {
  assert.expect(2);
  const error = new RPCError();
  error.code = 701;
  error.message = "Some strange error occured";
  error.data = { debug: "somewhere" };
  error.subType = "strange_error";
  function open(dialogClass, props) {
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
  serviceRegistry.add("dialog", makeFakeDialogService(open), { force: true });
  await makeTestEnv();
  const errorEvent = new PromiseRejectionEvent("error", { reason: error, promise: null });
  unhandledRejectionCb(errorEvent);
});

QUnit.test(
  "handle RPC_ERROR of type='server' and associated custom dialog class",
  async (assert) => {
    assert.expect(2);
    class CustomDialog extends Component {}
    CustomDialog.template = tags.xml`<RPCErrorDialog title="'Strange Error'"/>`;
    CustomDialog.components = { RPCErrorDialog };
    const error = new RPCError();
    error.code = 701;
    error.message = "Some strange error occured";
    error.Component = CustomDialog;
    function open(dialogClass, props) {
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
    serviceRegistry.add("dialog", makeFakeDialogService(open), { force: true });
    await makeTestEnv();
    errorDialogRegistry.add("strange_error", CustomDialog);
    const errorEvent = new PromiseRejectionEvent("error", { reason: error, promise: null });
    unhandledRejectionCb(errorEvent);
  }
);

QUnit.test("handle CONNECTION_LOST_ERROR", async (assert) => {
  patchWithCleanup(browser, {
    setTimeout: (callback, delay) => {
      assert.step(`set timeout (${delay === 2000 ? delay : ">2000"})`);
      callback();
    },
  });
  const mockCreate = (message) => {
    assert.step(`create (${message})`);
    return 1234;
  };
  const mockClose = (id) => assert.step(`close (${id})`);
  serviceRegistry.add("notification", makeFakeNotificationService(mockCreate, mockClose), {
    force: true,
  });
  const values = [false, true]; // simulate the 'back online status' after 2 'version_info' calls
  const mockRPC = async (route) => {
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
  await makeTestEnv({ mockRPC });
  const error = new ConnectionLostError();
  const errorEvent = new PromiseRejectionEvent("error", { reason: error, promise: null });
  unhandledRejectionCb(errorEvent);
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

QUnit.test("will let handlers from the registry handle errors first", async (assert) => {
  errorHandlerRegistry.add("__test_handler__", (env) => (err) => {
    assert.strictEqual(err, error);
    assert.strictEqual(env.someValue, 14);
    assert.step("in handler");
  });
  const testEnv = await makeTestEnv();
  testEnv.someValue = 14;
  const error = new OdooError("boom");
  const errorEvent = new PromiseRejectionEvent("error", { reason: error, promise: null });
  unhandledRejectionCb(errorEvent);
  assert.verifySteps(["in handler"]);
});
