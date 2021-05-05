/** @odoo-module **/

import { browser } from "@web/core/browser";
import { RPCErrorDialog } from "@web/errors/error_dialogs";
import { errorDialogRegistry } from "@web/errors/error_dialog_registry";
import { errorHandlerRegistry } from "@web/errors/error_handler_registry";
import { errorService } from "@web/errors/error_service";
import { ConnectionLostError, RPCError } from "@web/errors/odoo_error";
import { notificationService } from "@web/notifications/notification_service";
import { dialogService } from "@web/services/dialog_service";
import { serviceRegistry } from "@web/webclient/service_registry";
import { makeTestEnv } from "../helpers/mock_env";
import {
  makeFakeLocalizationService,
  makeFakeNotificationService,
  makeFakeRPCService,
} from "../helpers/mock_services";
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

let unhandledRejectionCb;

QUnit.module("Error Service", {
  async beforeEach() {
    serviceRegistry.add("error", errorService);
    serviceRegistry.add("dialog", dialogService);
    serviceRegistry.add("notification", notificationService);
    serviceRegistry.add("rpc", makeFakeRPCService());
    serviceRegistry.add("localization", makeFakeLocalizationService());
    unhandledRejectionCb = () => {
      throw new Error(`No "unhandledrejection" event listener has been bound to window.`);
    };
    patchWithCleanup(window, {
      addEventListener(type, cb) {
        if (type === "unhandledrejection") {
          unhandledRejectionCb = cb;
        }
      },
    });
  },
});

QUnit.test("handle RPC_ERROR of type='server' and no associated dialog class", async (assert) => {
  assert.expect(2);
  const error = new RPCError("Some strange error occured");
  error.code = 701;
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
    const error = new RPCError("Some strange error occured");
    error.code = 701;
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
      assert.step(`set timeout (${delay > 2000 ? ">2000" : delay})`);
      callback();
      return 1;
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

QUnit.test("default handler", async (assert) => {
  assert.expect(2);
  patchWithCleanup(browser, {
    alert: (message) => assert.step(`alert ${message}`),
  });
  await makeTestEnv();
  const error = new Error("boom");
  const errorEvent = new PromiseRejectionEvent("error", { reason: error, promise: null });
  unhandledRejectionCb(errorEvent);
  assert.verifySteps(["alert boom"]);
});

QUnit.test("will let handlers from the registry handle errors first", async (assert) => {
  assert.expect(4);
  errorHandlerRegistry.add("__test_handler__", (env) => (err) => {
    assert.strictEqual(String(err), "Error: boom");
    assert.strictEqual(env.someValue, 14);
    assert.step("in handler");
    return true;
  });
  const testEnv = await makeTestEnv();
  testEnv.someValue = 14;
  const error = new Error("boom");
  const errorEvent = new PromiseRejectionEvent("error", { reason: error, promise: null });
  unhandledRejectionCb(errorEvent);
  assert.verifySteps(["in handler"]);
});

QUnit.test("error in error handler", async (assert) => {
  assert.expect(4);
  patchWithCleanup(browser, {
    console: Object.assign({}, window.console, {
      error: (err) => assert.step(String(err)),
    }),
  });
  errorHandlerRegistry.add("__test_handler__", () => () => {
    throw new Error("Handler broke");
  });
  await makeTestEnv();
  const error = new Error("boom");
  const errorEvent = new PromiseRejectionEvent("error", { reason: error, promise: null });
  unhandledRejectionCb(errorEvent);
  assert.verifySteps([
    "Error: boom",
    "An additional error occurred while handling the error above:",
    "Error: Handler broke",
  ]);
});
