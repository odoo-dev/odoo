// import * as QUnit from "qunit";
// import { click, getFixture, makeTestEnv, mount, nextTick, OdooEnv } from "../helpers/index";
// import { Dialog } from "../../src/components/dialog/dialog";
// import { Component, tags } from "@odoo/owl";

// let target: HTMLElement;
// let env: OdooEnv;
// let crashManager: CrashManager;

// QUnit.module("CrashManager", {
//   async beforeEach() {
//     target = getFixture();
//     const dialogContainer = document.createElement("div");
//     dialogContainer.classList.add("o_dialog_container");
//     target.append(dialogContainer);
//     env = await makeTestEnv({});
//   },
//   async afterEach() {
//     crashManager.unmount();
//   },
// });

// QUnit.test("simple rendering", async (assert) => {
//   assert.expect(1);
//   crashManager = await mount(CrashManager, { env, target });
//   assert.containsOnce(target, "div.o_crash_manager");
// });

// QUnit.test("does not handle RPC_ERROR with type='network'", async (assert) => {
//   assert.expect(4);
//   crashManager = await mount(CrashManager, { env, target });
//   assert.containsOnce(target, "div.o_crash_manager");
//   assert.containsNone(target, ".o_dialog_container .o_dialog");
//   env.bus.trigger("RPC_ERROR", {
//     type: "network",
//   });
//   assert.containsOnce(target, "div.o_crash_manager");
//   assert.containsNone(target, ".o_dialog_container .o_dialog");
// });

// QUnit.test("handle RPC_ERROR of type='server' and no associated dialog class", async (assert) => {
//   assert.expect(7);
//   crashManager = await mount(CrashManager, { env, target });
//   assert.containsOnce(target, "div.o_crash_manager");
//   assert.containsNone(target, ".o_dialog_container .o_dialog");
//   env.bus.trigger("RPC_ERROR", {
//     type: "server",
//     code: 701,
//     message: "Some strange error occured",
//     data: {
//       debug: "somewhere",
//     },
//     subType: "strange_error",
//   });
//   await nextTick();
//   assert.containsOnce(target, ".o_dialog_container .o_dialog");

//   assert.strictEqual(
//     target.querySelector(".o_dialog_container .o_dialog header .modal-title")?.textContent,
//     "Strange_error"
//   );
//   assert.containsOnce(target, ".o_dialog main .clearfix");
//   assert.strictEqual(
//     target.querySelector(".o_dialog_container .o_dialog footer button")?.textContent,
//     "Ok"
//   );
//   await click(target, ".o_dialog_container .o_dialog footer button");
//   assert.containsNone(target, ".o_dialog_container .o_dialog");
// });

// QUnit.test(
//   "handle RPC_ERROR of type='server' and associated custom dialog class",
//   async (assert) => {
//     assert.expect(7);
//     crashManager = await mount(CrashManager, { env, target });
//     class CustomDialog extends Component<{ error: { message: string; name: string } }, OdooEnv> {
//       static template = tags.xml`
//       <Dialog title="title">
//         <p t-esc="message"/>
//         <t t-set="buttons">
//           <button t-on-click="onClick">Find out what happened!</button>
//         </t>
//       </Dialog>
//     `;
//       static components = { Dialog };
//       title: string = this.props.error.name.toUpperCase();
//       message: string = this.props.error.message;

//       onClick() {
//         this.trigger("dialog-closed");
//       }
//     }
//     env.registries.errorDialogs.add("strange_error", CustomDialog);
//     assert.containsOnce(target, "div.o_crash_manager");
//     assert.containsNone(target, ".o_dialog_container .o_dialog");
//     env.bus.trigger("RPC_ERROR", {
//       type: "server",
//       code: 701,
//       message: "Some strange error occured",
//       name: "strange_error",
//     });
//     await nextTick();
//     assert.containsOnce(target, ".o_dialog_container .o_dialog");
//     assert.strictEqual(
//       target.querySelector(".o_dialog_container .o_dialog header .modal-title")?.textContent,
//       "STRANGE_ERROR"
//     );
//     assert.strictEqual(
//       target.querySelector(".o_dialog_container .o_dialog main")?.textContent,
//       "Some strange error occured"
//     );
//     assert.strictEqual(
//       target.querySelector(".o_dialog_container .o_dialog footer button")?.textContent,
//       "Find out what happened!"
//     );
//     await click(target, ".o_dialog_container .o_dialog footer button");
//     assert.containsNone(target, ".o_dialog_container .o_dialog");
//   }
// );
