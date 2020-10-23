import * as owl from "@odoo/owl";
const { hooks } = owl;
const { useState } = hooks;
import { Dialog } from "../../src/components/dialog/dialog";
import { OdooEnv } from "../../src/types";
import { click, getFixture, makeTestEnv, mount, nextTick } from "../helpers/index";

let parent: owl.Component;
let target: HTMLElement;
let env: OdooEnv;

QUnit.module("Dialog", {
  async beforeEach() {
    target = getFixture();
    const dialogContainer = document.createElement("div");
    dialogContainer.classList.add("o_dialog_container");
    target.append(dialogContainer);
    env = await makeTestEnv();
  },
  async afterEach() {
    if (parent) {
      parent.unmount();
    }
  },
});

QUnit.test("simple rendering", async function (assert) {
  assert.expect(8);
  class Parent extends owl.Component {
    static components = { Dialog };
    static template = owl.tags.xml`
            <Dialog title="'Wow(l) Effect'">
                Hello!
            </Dialog>
        `;
  }
  parent = await mount(Parent, { env, target });
  assert.containsOnce(target, "div.o_dialog_container .o_dialog");
  assert.containsOnce(target, ".o_dialog header .modal-title", "the header is rendered by default");
  assert.strictEqual(target.querySelector("header .modal-title")?.textContent, "Wow(l) Effect");
  assert.containsOnce(target, ".o_dialog main", "a dialog has always a main node");
  assert.strictEqual(target.querySelector("main")?.textContent, " Hello! ");
  assert.containsOnce(target, ".o_dialog footer", "the footer is rendered by default");
  assert.containsOnce(
    target,
    ".o_dialog footer button",
    "the footer is rendered with a single button 'Ok' by default"
  );
  assert.strictEqual(target.querySelector("footer button")?.textContent, "Ok");
});

QUnit.test("simple rendering with two dialogs", async function (assert) {
  assert.expect(2);
  class Parent extends owl.Component {
    static components = { Dialog };
    static template = owl.tags.xml`
            <div>
                <Dialog title="'First Title'">
                    Hello!
                </Dialog>
                <Dialog title="'Second Title'">
                    Hello again!
                </Dialog>
            </div>
        `;
  }
  parent = await mount(Parent, { env, target });
  assert.containsN(target, ".o_dialog", 2);
  assert.deepEqual(
    [...target.querySelectorAll(".o_dialog .modal-body")].map((el) => el.textContent),
    [" Hello again! ", " Hello! "] // mounted is called in reverse order
  );
});

QUnit.test("click on the button x triggers the custom event 'dialog-closed'", async function (
  assert
) {
  assert.expect(2);
  class Parent extends owl.Component {
    static components = { Dialog };
    static template = owl.tags.xml`
            <div t-on-dialog-closed="state.displayDialog = false">
                <Dialog t-if="state.displayDialog">
                    Hello!
                </Dialog>
            </div>
        `;
    state = useState({
      displayDialog: true,
    });
  }
  parent = await mount(Parent, { env, target });
  assert.containsOnce(target, ".o_dialog");
  await click(target, ".o_dialog header button.close");
  assert.containsNone(target, ".o_dialog");
});

QUnit.test(
  "click on the default footer button triggers the custom event 'dialog-closed'",
  async function (assert) {
    assert.expect(2);
    class Parent extends owl.Component {
      static components = { Dialog };
      static template = owl.tags.xml`
            <div t-on-dialog-closed="state.displayDialog = false">
                <Dialog t-if="state.displayDialog">
                    Hello!
                </Dialog>
            </div>
        `;
      state = useState({
        displayDialog: true,
      });
    }
    parent = await mount(Parent, { env, target });
    assert.containsOnce(target, ".o_dialog");
    await click(target, ".o_dialog footer button");
    assert.containsNone(target, ".o_dialog");
  }
);

QUnit.test("render custom footer buttons is possible", async function (assert) {
  assert.expect(3);
  class Parent extends owl.Component {
    static components = { Dialog };
    static template = owl.tags.xml`
            <div>
                <Dialog t-if="state.displayDialog">
                    <t t-set="buttons">
                        <button class="btn btn-primary" t-on-click="state.displayDialog = false">The First Button</button>
                        <button class="btn btn-primary">The Second Button</button>
                    </t>
                </Dialog>
            </div>
        `;
    state = useState({
      displayDialog: true,
    });
  }
  parent = await mount(Parent, { env, target });
  assert.containsOnce(target, ".o_dialog");
  assert.containsN(target, ".o_dialog footer button", 2);
  await click(target.querySelector(".o_dialog footer button") as HTMLElement);
  assert.containsNone(target, ".o_dialog");
});

QUnit.test("embed an arbitrary component in a dialog is possible", async function (assert) {
  assert.expect(6);
  class SubComponent extends owl.Component {
    static template = owl.tags.xml`
            <div class="o_subcomponent" t-esc="props.text" t-on-click="_onClick"/>
        `;
    _onClick() {
      assert.step("subcomponent-clicked");
      this.trigger("subcomponent-clicked");
    }
  }
  class Parent extends owl.Component {
    static components = { Dialog, SubComponent };
    static template = owl.tags.xml`
            <Dialog>
                <SubComponent text="'Wow(l) Effect'" t-on-subcomponent-clicked="_onSubcomponentClicked"/>
            </Dialog>
        `;
    _onSubcomponentClicked() {
      assert.step("message received by parent");
    }
  }
  parent = await mount(Parent, { env, target });
  assert.containsOnce(target, ".o_dialog");
  assert.containsOnce(target, ".o_dialog main .o_subcomponent");
  assert.strictEqual(target.querySelector(".o_subcomponent")?.textContent, "Wow(l) Effect");
  await click(target.querySelector(".o_subcomponent") as HTMLElement);
  assert.verifySteps(["subcomponent-clicked", "message received by parent"]);
});

QUnit.test("dialog without header/footer", async function (assert) {
  assert.expect(4);
  class Parent extends owl.Component {
    static components = { Dialog };
    static template = owl.tags.xml`
            <Dialog renderHeader="false" renderFooter="false"/>
        `;
  }
  parent = await mount(Parent, { env, target });
  assert.containsOnce(target, ".o_dialog");
  assert.containsNone(target, ".o_dialog header");
  assert.containsOnce(target, "main", "a dialog has always a main node");
  assert.containsNone(target, ".o_dialog footer");
});

QUnit.test("dialog size can be chosen", async function (assert) {
  assert.expect(2);
  class Parent extends owl.Component {
    static components = { Dialog };
    static template = owl.tags.xml`
            <Dialog size="'modal-xl'"/>
        `;
  }
  parent = await mount(Parent, { env, target });
  assert.containsOnce(target, ".o_dialog");
  assert.hasClass(target.querySelector(".o_dialog .modal-dialog") as HTMLElement, "modal-xl");
});

QUnit.test("dialog can be rendered on fullscreen", async function (assert) {
  assert.expect(2);
  class Parent extends owl.Component {
    static components = { Dialog };
    static template = owl.tags.xml`
            <div><Dialog fullscreen="true"/></div>
        `;
  }
  parent = await mount(Parent, { env, target });
  assert.containsOnce(target, ".o_dialog");
  assert.hasClass(target.querySelector(".o_dialog .modal") as HTMLElement, "o_modal_full");
});

QUnit.test("Interactions between multiple dialogs", async function (assert) {
  assert.expect(14);
  interface Ids {
    [key: number]: 1;
  }
  class Parent extends owl.Component {
    static components = { Dialog };
    static template = owl.tags.xml`
            <div>
              <Dialog t-foreach="Object.keys(dialogIds)" t-as="dialogId" t-key="dialogId"
                t-on-dialog-closed="_onDialogClosed(dialogId)"
                />
            </div>
        `;
    dialogIds = useState({}) as Ids;
    _onDialogClosed(id: number) {
      assert.step(`dialog_id=${id}_closed`);
      delete this.dialogIds[id];
    }
  }
  const parent = await mount(Parent, { env, target });
  parent.dialogIds[0] = 1;
  await nextTick();
  parent.dialogIds[1] = 1;
  await nextTick();
  parent.dialogIds[2] = 1;
  await nextTick();

  function activity(modals: NodeListOf<Element>) {
    const res = [];
    for (let i = 0; i < modals.length; i++) {
      res[i] = !modals[i].classList.contains("o_inactive_modal");
    }
    return res;
  }

  let modals = document.querySelectorAll(".modal");
  assert.containsN(target, ".o_dialog", 3);
  assert.deepEqual(activity(modals), [false, false, true]);
  assert.hasClass(target.querySelector(".o_dialog_container") as HTMLElement, "modal-open");

  let lastDialog = modals[modals.length - 1] as HTMLElement;
  lastDialog.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Escape" }));
  await nextTick();
  await nextTick();

  modals = document.querySelectorAll(".modal");
  assert.containsN(target, ".o_dialog", 2);
  assert.deepEqual(activity(modals), [false, true]);
  assert.hasClass(target.querySelector(".o_dialog_container") as HTMLElement, "modal-open");

  lastDialog = modals[modals.length - 1] as HTMLElement;
  await click(lastDialog, "footer button");

  modals = document.querySelectorAll(".modal");
  assert.containsN(target, ".o_dialog", 1);
  assert.deepEqual(activity(modals), [true]);
  assert.hasClass(target.querySelector(".o_dialog_container") as HTMLElement, "modal-open");

  parent.unmount();
  // dialog 0 is closed through the removal of its parent => no callback
  assert.containsNone(target, ".o_dialog_container .modal");
  assert.doesNotHaveClass(target.querySelector(".o_dialog_container") as HTMLElement, "modal-open");
  assert.verifySteps(["dialog_id=2_closed", "dialog_id=1_closed"]);
});
