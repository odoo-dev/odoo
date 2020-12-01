import * as QUnit from "qunit";
import { click, getFixture, makeTestEnv, mount, nextTick, OdooEnv } from "../helpers/index";
import { Registry } from "../../src/core/registry";
import { Registries } from "../../src/types";
import { dialogManagerService } from "../../src/services/dialog_manager";
import { Component, tags } from "@odoo/owl";
import { Dialog } from "../../src/components/dialog/dialog";

let env: OdooEnv;
let serviceRegistry: Registries["serviceRegistry"];
let target: HTMLElement;
let pseudoWebClient: Component;

class PseudoWebClient extends Component {
  static template = tags.xml`
        <div>
            <div class="o_dialog_container"/>
            <div>
                <t t-foreach="Components" t-as="Component" t-key="Component[0]">
                    <t t-component="Component[1]"/>
                </t>
            </div>
        </div>
    `;

  Components = odoo.mainComponentRegistry.getEntries();
}

QUnit.module("DialogManager", {
  async beforeEach() {
    target = getFixture();
    serviceRegistry = new Registry();
    serviceRegistry.add(dialogManagerService.name, dialogManagerService);
    env = await makeTestEnv({ serviceRegistry });
  },
  afterEach() {
    pseudoWebClient.unmount();
  },
});

QUnit.test("Simple rendering with a single dialog", async (assert) => {
  assert.expect(9);
  class CustomDialog extends Component<{}, OdooEnv> {
    static template = tags.xml`<Dialog title="'Welcome'"/>`;
    static components = { Dialog };
  }
  pseudoWebClient = await mount(PseudoWebClient, { target, env });
  assert.containsOnce(target, ".o_dialog_manager");
  assert.containsNone(target, ".o_dialog_manager portal");
  assert.containsNone(target, ".o_dialog_container .o_dialog");
  env.services[dialogManagerService.name].open(CustomDialog);
  await nextTick();
  assert.containsOnce(target, ".o_dialog_manager portal");
  assert.containsOnce(target, ".o_dialog_container .o_dialog");
  assert.strictEqual(target.querySelector("header .modal-title")?.textContent, "Welcome");
  await click(target.querySelector(".o_dialog_container .o_dialog footer button") as HTMLElement);
  assert.containsOnce(target, ".o_dialog_manager");
  assert.containsNone(target, ".o_dialog_manager portal");
  assert.containsNone(target, ".o_dialog_container .o_dialog");
});

QUnit.test("rendering with two dialogs", async (assert) => {
  assert.expect(12);
  class CustomDialog extends Component<{ title: string }, OdooEnv> {
    static template = tags.xml`<Dialog title="props.title"/>`;
    static components = { Dialog };
  }
  pseudoWebClient = await mount(PseudoWebClient, { target, env });
  assert.containsOnce(target, ".o_dialog_manager");
  assert.containsNone(target, ".o_dialog_manager portal");
  assert.containsNone(target, ".o_dialog_container .o_dialog");
  env.services[dialogManagerService.name].open(CustomDialog, { title: "Hello" });
  await nextTick();
  assert.containsOnce(target, ".o_dialog_manager portal");
  assert.containsOnce(target, ".o_dialog_container .o_dialog");
  assert.strictEqual(target.querySelector("header .modal-title")?.textContent, "Hello");
  env.services[dialogManagerService.name].open(CustomDialog, { title: "Sauron" });
  await nextTick();
  assert.containsN(target, ".o_dialog_manager portal", 2);
  assert.containsN(target, ".o_dialog_container .o_dialog", 2);
  assert.deepEqual(
    [...target.querySelectorAll("header .modal-title")].map((el) => el.textContent),
    ["Hello", "Sauron"]
  );
  await click(target.querySelector(".o_dialog_container .o_dialog footer button") as HTMLElement);
  assert.containsOnce(target, ".o_dialog_manager portal");
  assert.containsOnce(target, ".o_dialog_container .o_dialog");
  assert.strictEqual(target.querySelector("header .modal-title")?.textContent, "Sauron");
});
