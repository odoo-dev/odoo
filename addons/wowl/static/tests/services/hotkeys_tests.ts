import * as owl from "@odoo/owl";
import { hotkeysService, useHotkeys } from "../../src/services/hotkeys";
import { getFixture, makeTestEnv, mount, nextTick, OdooEnv } from "../helpers/index";
import { Registries } from "../../src/types";
import { Registry } from "../../src/core/registry";

let env: OdooEnv;
let serviceRegistry: Registries["serviceRegistry"];

QUnit.module("Hotkeys");

QUnit.only("test", async (assert) => {
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
