import * as owl from "@odoo/owl";
import { hotkeysService, useHotkeys } from "../../src/services/hotkeys";
import { getFixture, makeTestEnv, mount, nextTick, OdooEnv } from "../helpers/index";
import { Registries } from "../../src/types";
import { Registry } from "../../src/core/registry";

let env: OdooEnv;
let serviceRegistry: Registries["serviceRegistry"];

QUnit.module("Hotkeys");

QUnit.skip("autoRegisterAccessKeys", async (assert) => {
  class TestComponent extends owl.Component {
    static template = owl.tags.xml`<div><button t-on-click="clicked" accesskey="b"/></div>`;
    hotkeys = useHotkeys({ autoRegisterAccessKeys: true });
    clicked() {
      assert.step("clicked");
    }
  }

  serviceRegistry = new Registry();
  serviceRegistry.add("hotkeys", hotkeysService);
  env = await makeTestEnv({ serviceRegistry });
  const target: HTMLElement = getFixture();
  await mount(TestComponent, { env, target });

  const ev = new KeyboardEvent("keydown", { key: "b" });
  target.dispatchEvent(ev);
  await nextTick();

  assert.verifySteps(["clicked"]);
});

// QUnit.debug("test", async (assert) => {
//   class TestComponent extends owl.Component {
//     static template = owl.tags.xml`<div></div>`;
//     // hotkeys = useHotkeys(["v=>[f,k,l]"]);
//     // hotkeys = useHotkeys(["vk","vf","vl"]);
//     // hotkeys = useHotkeys([{ scope: "v", key: "f" }, { scope: "v", key: "f" }, { scope: "v", key: "f" }]);
//     // hotkeys = useHotkeys(["alt+v-alt+k, alt+v-alt+f, alt+v-alt+l"]);
//     hotkeys = useHotkeys([{ scope: "alt,v", keys: "vfl" }]);
//     hotkeysService = useService("hotkeys");
//     constructor() {
//       super(...arguments);
//       hotkeys.listen((hotkey) => {
//         switch (hotkey.scope) {
//           case "v":
//             switch (hotkey.key) {
//               case "f":
//                 break;
//               case "k":
//                 break;
//               case "l":
//                 break;
//             }
//             break;
//           default:
//             if (hotkey.key === "v") {
//               this.hotkeysService.setScope("v");
//             }
//             break;
//         }
//       });
//     }
//   }
// });

// QUnit.debug("test", async (assert) => {
//   class TestComponent extends owl.Component {
//     static template = owl.tags.xml`<div></div>`;
//     // hotkeys = useHotkeys(["vk","vf","vl"]);
//     // hotkeys = useHotkeys(["v=>[f,k,l]"]);
//     // hotkeys = useHotkeys(["vk","vf","vl"]);
//     // hotkeys = useHotkeys([{ scope: "v", key: "f" }, { scope: "v", key: "f" }, { scope: "v", key: "f" }]);
//     // hotkeys = useHotkeys(["alt+v-alt+k, alt+v-alt+f, alt+v-alt+l"]);
//     // hotkeys = useHotkeys([{ scope: "alt,v", keys: "vfl" }]);
//     // hotkeysService = useService("hotkeys");
//     constructor() {
//       super(...arguments);
//       useHotkeys({
//         autoRegisterAccessKeys: true,
//         hotkeys: {
//           alt: this.showActualScopeOverlays,
//         },
//       });
//       useHotkeys({
//         hotkeys: {
//           v: this.setScopeAndShowOverlay,
//           "f,l,k": this.switchView,
//         },
//       });
//       useHotkeys({ hotkeys: { "shift+p, shift+n": this.onPrevNext } });
//       useHotkeys({
//         combinator: "-",
//         hotkeys: { "shift-w": this.openChat },
//       });
//       useHotkeys({
//         separator: "|",
//         hotkeys: {
//           m: "setScope",
//           "left|up|right|down": [this.moveFocus, { m: this.moveRecord }],
//           enter: { m: this.finishMove },
//         },
//       });
//     }

//     openChat() { }
//     showActualScopeOverlays() { }
//     setScopeAndShowOverlay() { }
//     onPrevNext() { }
//     moveFocus() { }
//     moveRecord() { }
//     finishMove() { }
//     switchView() { }
//   }
// });

QUnit.debug("test", async (assert) => {
  class TestComponent extends owl.Component {
    static template = owl.tags.xml`<div></div>`;
    // hotkeys = useHotkeys({
    //   autoRegisterAccessKeys: true,
    //   hotkeys: {
    //     alt: this.showActualScopeOverlays,
    //   },
    // });
    // hotkeys = useHotkeys({
    //   hotkeys: {
    //     v: this.setScopeAndShowOverlay,
    //     "f,l,k": this.switchView,
    //   },
    // });
    // hotkeys = useHotkeys({ hotkeys: { "shift+p, shift+n": this.onPrevNext } });
    // hotkeys = useHotkeys({
    //   combinator: "-",
    //   hotkeys: { "shift-w": this.openChat },
    // });
    hotkeys = useHotkeys({ separator: "|" });

    constructor() {
      super(...arguments);
      // this.hotkeys.register({ m: "setScope" });
      // this.hotkeys.register({ "left|up|right|down": this.moveFocus });
      // this.hotkeys.register("m", { "left|up|right|down": this.moveRecord });
      // this.hotkeys.register({ enter: this.finishMove }, { scope: "m" });

      // this.hotkeys.registerMany({
      //   m: "setScope",
      //   "left|up|right|down": [this.moveFocus, { m: this.moveRecord }],
      //   enter: { m: this.finishMove },
      // });

      // this.hotkeys.register({
      //   m: "setScope",
      //   "left|up|down|right": this.moveFocus,
      // });

      // this.hotkeys.register("m", {
      //   "left|up|down|right": this.moveRecord,
      //   enter: this.finishMove,
      // });

      // this.hotkeys.register({
      //   "left|up|down|right": this.moveFocus,
      //   m: "setScope",
      //   "[M] left|up|down|right": this.moveRecord,
      //   "[M] enter": this.finishMove,
      // });

      // this.hotkeys.register(
      //   {
      //     "left|up|down|right": this.moveRecord,
      //     enter: this.finishMove,
      //   },
      //   { scope: "m" }
      // );

      this.hotkeys.register({
        "left|up|down|right": [this.moveFocus, { scope: "m", callback: this.moveRecord }],
        m: "setScope",
        enter: { scope: "m", callback: this.finishMove },
      });
    }

    openChat() {}
    showActualScopeOverlays() {}
    setScopeAndShowOverlay() {}
    onPrevNext() {}
    moveFocus() {}
    moveRecord() {}
    finishMove() {}
    switchView() {}
  }
});
