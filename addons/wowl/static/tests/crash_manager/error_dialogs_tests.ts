import * as QUnit from "qunit";
import { click, getFixture, makeTestEnv, mount, nextTick, OdooEnv } from "../helpers/index";
import { Component, tags } from "@odoo/owl";
import {
  ErrorDialog,
  Error504Dialog,
  RedirectWarningDialog,
  SessionExpiredDialog,
  WarningDialog,
} from "../../src/crash_manager/error_dialogs";
import { Registry } from "../../src/core/registry";
import { OdooBrowser, Registries, Service } from "../../src/types";

let target: HTMLElement;
let env: OdooEnv;
let parent: Component;

QUnit.module("Error dialogs", {
  async beforeEach() {
    target = getFixture();
    const dialogContainer = document.createElement("div");
    dialogContainer.classList.add("o_dialog_container");
    target.append(dialogContainer);
    env = await makeTestEnv({});
  },
  async afterEach() {
    parent.unmount();
  },
});

QUnit.test("ErrorDialog", async (assert) => {
  assert.expect(9);
  class Parent extends Component {
    static components = { ErrorDialog };
    static template = tags.xml`<ErrorDialog error="error"/>`;
    error = {
      message: "Something bad happened",
      data: { debug: "Some strange unreadable stack" },
    };
  }
  assert.containsNone(target, ".o_dialog");
  parent = await mount(Parent, { env, target });
  assert.containsOnce(target, "div.o_dialog_container .o_dialog");
  assert.strictEqual(target.querySelector("header .modal-title")?.textContent, "Odoo Client Error");
  const mainButtons = target.querySelectorAll("main button");
  assert.deepEqual(
    [...mainButtons].map((el) => el.textContent),
    ["Copy the full error to clipboard", "See details"]
  );
  assert.deepEqual(
    [...target.querySelectorAll("main .clearfix p")].map((el) => el.textContent),
    ["An error occurred", "Please use the copy button to report the error to your support service."]
  );
  assert.containsNone(target, "div.o_error_detail");
  assert.strictEqual(target.querySelector(".o_dialog footer button")?.textContent, "Ok");
  click(mainButtons[1] as HTMLElement);
  await nextTick();
  assert.containsOnce(target, "div.o_error_detail");
  assert.strictEqual(
    target.querySelector("div.o_error_detail")?.textContent,
    "Something bad happened\nSome strange unreadable stack"
  );
});

QUnit.test("ErrorDialog type script with traceback", async (assert) => {
  assert.expect(5);
  const error = {
    type: "script",
    traceback: "Something bad happened\nSome strange unreadable stack",
  };
  class Parent extends Component {
    static components = { ErrorDialog };
    static template = tags.xml`<ErrorDialog error="error"/>`;
    error = error;
  }
  assert.containsNone(target, ".o_dialog");
  parent = await mount(Parent, { env, target });
  const mainButtons = target.querySelectorAll("main button");
  assert.containsNone(target, "div.o_error_detail");
  assert.strictEqual(target.querySelector(".o_dialog footer button")?.textContent, "Ok");
  click(mainButtons[1] as HTMLElement);
  await nextTick();
  assert.containsOnce(target, "div.o_error_detail");
  assert.strictEqual(
    target.querySelector("div.o_error_detail")?.textContent,
    "Something bad happened\nSome strange unreadable stack"
  );
});

QUnit.test("button clipboard copy error traceback", async (assert) => {
  assert.expect(1);
  const error = {
    message: "Something bad happened",
    data: { debug: "Some strange unreadable stack" },
  };
  const browser = {
    navigator: {
      clipboard: {
        writeText: (value) => {
          assert.strictEqual(value, `${error.message}\n${error.data.debug}`);
        },
      },
    },
  } as OdooBrowser;
  env = await makeTestEnv({ browser });
  class Parent extends Component {
    static components = { ErrorDialog };
    static template = tags.xml`<ErrorDialog error="error"/>`;
    error = error;
  }
  parent = await mount(Parent, { env, target });
  const clipboardButton = target.querySelector(".fa-clipboard");
  click(clipboardButton as HTMLElement);
  await nextTick();
});

QUnit.test("WarningDialog", async (assert) => {
  assert.expect(5);
  class Parent extends Component {
    static components = { WarningDialog };
    static template = tags.xml`<WarningDialog error="error"/>`;
    error = {
      name: "odoo.exceptions.UserError",
      message: "...",
      data: { arguments: ["Some strange unreadable message"] },
    };
  }
  assert.containsNone(target, ".o_dialog");
  parent = await mount(Parent, { env, target });
  assert.containsOnce(target, "div.o_dialog_container .o_dialog");
  assert.strictEqual(target.querySelector("header .modal-title")?.textContent, "User Error");
  assert.strictEqual(target.querySelector("main")?.textContent, "Some strange unreadable message");
  assert.strictEqual(target.querySelector(".o_dialog footer button")?.textContent, "Ok");
});

QUnit.test("RedirectWarningDialog", async (assert) => {
  assert.expect(8);
  class Parent extends Component {
    static components = { RedirectWarningDialog };
    static template = tags.xml`<RedirectWarningDialog error="error" t-on-dialog-closed="onDialogClosed"/>`;
    error = {
      data: {
        arguments: ["Some strange unreadable message", "buy_action_id", "Buy book on cryptography"],
      },
    };
    onDialogClosed() {
      assert.step("dialog-closed");
    }
  }
  const serviceRegistry: Registries["serviceRegistry"] = new Registry();
  const fakeActionManagerService: Service = {
    name: "action_manager",
    deploy(): { doAction: Function } {
      return {
        doAction(actionId: string) {
          assert.step(actionId);
        },
      };
    },
  };
  serviceRegistry.add("action_manager", fakeActionManagerService);
  env = await makeTestEnv({ serviceRegistry });
  assert.containsNone(target, ".o_dialog");
  parent = await mount(Parent, { env, target });
  assert.containsOnce(target, "div.o_dialog_container .o_dialog");
  assert.strictEqual(target.querySelector("header .modal-title")?.textContent, "Odoo Warning");
  assert.strictEqual(target.querySelector("main")?.textContent, "Some strange unreadable message");
  const footerButtons = target.querySelectorAll("footer button");
  assert.deepEqual(
    [...footerButtons].map((el) => el.textContent),
    ["Buy book on cryptography", "Cancel"]
  );
  click(footerButtons[0] as HTMLElement);
  click(footerButtons[1] as HTMLElement);
  assert.verifySteps(["buy_action_id", "dialog-closed"]);
});

QUnit.test("Error504Dialog", async (assert) => {
  assert.expect(5);
  class Parent extends Component {
    static components = { Error504Dialog };
    static template = tags.xml`<Error504Dialog/>`;
  }
  assert.containsNone(target, ".o_dialog");
  parent = await mount(Parent, { env, target });
  assert.containsOnce(target, "div.o_dialog_container .o_dialog");
  assert.strictEqual(target.querySelector("header .modal-title")?.textContent, "Request timeout");
  assert.strictEqual(
    target.querySelector("main p")?.textContent,
    " The operation was interrupted. This usually means that the current operation is taking too much time. "
  );
  assert.strictEqual(target.querySelector(".o_dialog footer button")?.textContent, "Ok");
});

QUnit.test("SessionExpiredDialog", async (assert) => {
  assert.expect(7);
  class Parent extends Component {
    static components = { SessionExpiredDialog };
    static template = tags.xml`<SessionExpiredDialog/>`;
  }
  const browser = {
    location: {
      reload() {
        assert.step("location reload");
      },
    },
  } as OdooBrowser;
  env = await makeTestEnv({ browser });
  assert.containsNone(target, ".o_dialog");
  parent = await mount(Parent, { env, target });
  assert.containsOnce(target, "div.o_dialog_container .o_dialog");
  assert.strictEqual(
    target.querySelector("header .modal-title")?.textContent,
    "Odoo Session Expired"
  );
  assert.strictEqual(
    target.querySelector("main p")?.textContent,
    " Your Odoo session expired. The current page is about to be refreshed. "
  );
  const footerButton = target.querySelector(".o_dialog footer button") as HTMLElement;
  assert.strictEqual(footerButton.textContent, "Ok");
  click(footerButton);
  assert.verifySteps(["location reload"]);
});
