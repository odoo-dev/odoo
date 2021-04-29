/** @odoo-module **/

import { Registry } from "@web/core/registry";
import { errorService } from "@web/errors/error_service";
import { notificationService } from "@web/notifications/notification_service";
import { DialogContainer, dialogService } from "@web/services/dialog_service";
import { uiService } from "@web/services/ui_service";
import { mainComponentRegistry } from "@web/webclient/main_component_registry";
import { makeTestEnv } from "../helpers/mock_env";
import { makeFakeRPCService } from "../helpers/mock_services";
import { click, getFixture, makeDeferred, nextTick, patchWithCleanup } from "../helpers/utils";
import { registerCleanup } from "../helpers/cleanup";
import { ErrorDialog } from "@web/errors/error_dialogs";
import { hotkeyService } from "@web/hotkeys/hotkey_service";

const { Component, mount, tags } = owl;

let env;
let serviceRegistry;
let target;
let pseudoWebClient;

class PseudoWebClient extends Component {
  setup() {
    this.Components = odoo.mainComponentRegistry.getEntries();
  }
}
PseudoWebClient.template = tags.xml`
        <div>
            <div class="o_dialog_container"/>
            <div>
                <t t-foreach="Components" t-as="Component" t-key="Component[0]">
                    <t t-component="Component[1]"/>
                </t>
            </div>
        </div>
    `;

QUnit.module("DialogManager", {
  async beforeEach() {
    target = getFixture();
    serviceRegistry = new Registry();
    serviceRegistry.add("dialog", dialogService);
    serviceRegistry.add("ui", uiService);
    serviceRegistry.add("hotkey", hotkeyService);
    const componentRegistry = new Registry();
    componentRegistry.add("DialogContainer", mainComponentRegistry.get("DialogContainer"));
    env = await makeTestEnv({ serviceRegistry, mainComponentRegistry: componentRegistry });
  },
  afterEach() {
    pseudoWebClient.destroy();
  },
});
QUnit.test("Simple rendering with a single dialog", async (assert) => {
  assert.expect(9);
  class CustomDialog extends Component {}
  CustomDialog.template = tags.xml`<Dialog title="'Welcome'"/>`;
  pseudoWebClient = await mount(PseudoWebClient, { env, target });
  assert.containsOnce(target, ".o_dialog_manager");
  assert.containsNone(target, ".o_dialog_manager portal");
  assert.containsNone(target, ".o_dialog_container .o_dialog");
  env.services.dialog.open(CustomDialog);
  await nextTick();
  assert.containsOnce(target, ".o_dialog_manager portal");
  assert.containsOnce(target, ".o_dialog_container .o_dialog");
  assert.strictEqual(target.querySelector("header .modal-title").textContent, "Welcome");
  await click(target.querySelector(".o_dialog_container .o_dialog footer button"));
  assert.containsOnce(target, ".o_dialog_manager");
  assert.containsNone(target, ".o_dialog_manager portal");
  assert.containsNone(target, ".o_dialog_container .o_dialog");
});
QUnit.test("rendering with two dialogs", async (assert) => {
  assert.expect(12);
  class CustomDialog extends Component {}
  CustomDialog.template = tags.xml`<Dialog title="props.title"/>`;
  pseudoWebClient = await mount(PseudoWebClient, { env, target });
  assert.containsOnce(target, ".o_dialog_manager");
  assert.containsNone(target, ".o_dialog_manager portal");
  assert.containsNone(target, ".o_dialog_container .o_dialog");
  env.services.dialog.open(CustomDialog, { title: "Hello" });
  await nextTick();
  assert.containsOnce(target, ".o_dialog_manager portal");
  assert.containsOnce(target, ".o_dialog_container .o_dialog");
  assert.strictEqual(target.querySelector("header .modal-title").textContent, "Hello");
  env.services.dialog.open(CustomDialog, { title: "Sauron" });
  await nextTick();
  assert.containsN(target, ".o_dialog_manager portal", 2);
  assert.containsN(target, ".o_dialog_container .o_dialog", 2);
  assert.deepEqual(
    [...target.querySelectorAll("header .modal-title")].map((el) => el.textContent),
    ["Hello", "Sauron"]
  );
  await click(target.querySelector(".o_dialog_container .o_dialog footer button"));
  assert.containsOnce(target, ".o_dialog_manager portal");
  assert.containsOnce(target, ".o_dialog_container .o_dialog");
  assert.strictEqual(target.querySelector("header .modal-title").textContent, "Sauron");
});

QUnit.test("multiple dialogs can become the UI active element", async (assert) => {
  assert.expect(3);
  class CustomDialog extends Component {}
  CustomDialog.template = tags.xml`<Dialog title="props.title"/>`;
  pseudoWebClient = await mount(PseudoWebClient, { env, target });

  env.services.dialog.open(CustomDialog, { title: "Hello" });
  await nextTick();
  let dialogModal = target.querySelector(
    ".o_dialog_container .o_dialog .modal:not(.o_inactive_modal)"
  );

  assert.strictEqual(dialogModal, env.services.ui.activeElement);

  env.services.dialog.open(CustomDialog, { title: "Sauron" });
  await nextTick();
  dialogModal = target.querySelector(".o_dialog_container .o_dialog .modal:not(.o_inactive_modal)");

  assert.strictEqual(dialogModal, env.services.ui.activeElement);

  env.services.dialog.open(CustomDialog, { title: "Rafiki" });
  await nextTick();
  dialogModal = target.querySelector(".o_dialog_container .o_dialog .modal:not(.o_inactive_modal)");

  assert.strictEqual(dialogModal, env.services.ui.activeElement);
});

QUnit.test("dialog component crashes", async (assert) => {
  assert.expect(4);

  class FailingDialog extends Component {
    setup() {
      throw new Error("Some Error");
    }
  }
  FailingDialog.template = tags.xml`<Dialog title="'Error'"/>`;

  const prom = makeDeferred();
  patchWithCleanup(ErrorDialog.prototype, {
    mounted() {
      this._super();
      prom.resolve();
    },
  });

  const qunitUnhandledReject = QUnit.onUnhandledRejection;
  const windowUnhandledReject = window.onunhandledrejection;
  QUnit.onUnhandledRejection = () => {
    assert.step("error");
  };
  registerCleanup(() => {
    QUnit.onUnhandledRejection = qunitUnhandledReject;
    window.onunhandledrejection = windowUnhandledReject;
  });

  const rpc = makeFakeRPCService();
  serviceRegistry.add("rpc", rpc);
  serviceRegistry.add("notification", notificationService);
  serviceRegistry.add("error", errorService);

  pseudoWebClient = await mount(PseudoWebClient, { env, target });

  env.services.dialog.open(FailingDialog);
  await prom;
  assert.verifySteps(["error"]);
  assert.containsOnce(pseudoWebClient, ".modal");
  assert.containsOnce(pseudoWebClient, ".modal .o_dialog_error");
});
