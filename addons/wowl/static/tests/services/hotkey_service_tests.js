/** @odoo-module **/
import { Registry } from "../../src/core/registry";
import { hotkeyService, useHotkey } from "../../src/services/hotkey_service";
import { uiService, useActiveElement } from "../../src/services/ui_service";
import { getFixture, makeTestEnv, nextTick } from "../helpers";

const { Component, mount, tags } = owl;
const { xml } = tags;

let env;
let target;

QUnit.module("Hotkey Service", {
  async beforeEach() {
    const serviceRegistry = new Registry();
    serviceRegistry.add("hotkey", hotkeyService);
    serviceRegistry.add("ui", uiService);
    env = await makeTestEnv({ serviceRegistry });
    target = getFixture();
  },
});

QUnit.test("subscribe / unsubscribe", async (assert) => {
  assert.expect(2);

  const hotkey = env.services.hotkey;

  const key = "q";
  let keydown = new KeyboardEvent("keydown", { key });
  window.dispatchEvent(keydown);
  await nextTick();

  let token = hotkey.subscribe({ hotkey: key, callback: (arg) => assert.step(arg) });
  await nextTick();

  keydown = new KeyboardEvent("keydown", { key });
  window.dispatchEvent(keydown);
  await nextTick();

  hotkey.unsubscribe(token);
  keydown = new KeyboardEvent("keydown", { key });
  window.dispatchEvent(keydown);
  await nextTick();

  assert.verifySteps([key]);
});

QUnit.test("data-hotkey", async (assert) => {
  assert.expect(2);

  class MyComponent extends Component {
    onClick() {
      assert.step("click");
    }
  }
  MyComponent.template = xml`
    <div>
      <button t-on-click="onClick" data-hotkey="b" />
    </div>
  `;

  const key = "b";
  let keydown = new KeyboardEvent("keydown", { key });
  window.dispatchEvent(keydown);
  await nextTick();

  const comp = await mount(MyComponent, { env, target });

  keydown = new KeyboardEvent("keydown", { key });
  window.dispatchEvent(keydown);
  await nextTick();

  comp.unmount();

  keydown = new KeyboardEvent("keydown", { key });
  window.dispatchEvent(keydown);
  await nextTick();

  assert.verifySteps(["click"]);
  comp.destroy();
});

QUnit.test("hook", async (assert) => {
  const key = "q";
  class TestComponent extends Component {
    setup() {
      useHotkey({ hotkey: key, callback: (arg) => assert.step(arg) });
    }
  }
  TestComponent.template = xml`<div/>`;

  let keydown = new KeyboardEvent("keydown", { key });
  window.dispatchEvent(keydown);
  await nextTick();

  const comp = await mount(TestComponent, { env, target });

  keydown = new KeyboardEvent("keydown", { key });
  window.dispatchEvent(keydown);
  await nextTick();

  comp.unmount();

  keydown = new KeyboardEvent("keydown", { key });
  window.dispatchEvent(keydown);
  await nextTick();

  assert.verifySteps([key]);
  comp.destroy();
});

QUnit.test("hotkeys evil 👹", async (assert) => {
  const hotkey = env.services.hotkey;

  assert.throws(function () {
    hotkey.subscribe();
  }, /is undefined/);
  assert.throws(function () {
    hotkey.subscribe({});
  }, /must specify an hotkey/);

  function callback() {}
  assert.throws(function () {
    hotkey.subscribe({ callback });
  }, /must specify an hotkey/);
  assert.throws(function () {
    hotkey.subscribe({ hotkey: "" });
  }, /must specify an hotkey/);
  assert.throws(function () {
    hotkey.subscribe({ hotkey: "crap", callback });
  }, /not whitelisted/);
  assert.throws(function () {
    hotkey.subscribe({ hotkey: "ctrl-o", callback });
  }, /not whitelisted/);
  assert.throws(
    function () {
      hotkey.subscribe({ hotkey: "Control-O", callback });
    },
    /not whitelisted/,
    "should throw 'not whitelisted' when other than lowercase chars are used"
  );
  assert.throws(function () {
    hotkey.subscribe({ hotkey: "control-o" });
  }, /specify a callback/);
  assert.throws(function () {
    hotkey.subscribe({ hotkey: "control-o-d", callback });
  }, /more than one single key part/);
});

QUnit.test("component can subscribe many hotkeys", async (assert) => {
  assert.expect(8);

  class MyComponent extends Component {
    setup() {
      for (const hotkey of ["a", "b", "c"]) {
        useHotkey({ hotkey, callback: (arg) => assert.step(`callback:${arg}`) });
      }
      for (const hotkey of ["d", "e", "f"]) {
        useHotkey({ hotkey, callback: (arg) => assert.step(`callback2:${arg}`) });
      }
    }
    onClick() {
      assert.step("click");
    }
  }
  MyComponent.template = xml`
    <div>
      <button t-on-click="onClick" data-hotkey="b" />
    </div>
  `;

  const comp = await mount(MyComponent, { env, target });
  window.dispatchEvent(new KeyboardEvent("keydown", { key: "a" }));
  window.dispatchEvent(new KeyboardEvent("keydown", { key: "b" }));
  window.dispatchEvent(new KeyboardEvent("keydown", { key: "c" }));
  window.dispatchEvent(new KeyboardEvent("keydown", { key: "d" }));
  window.dispatchEvent(new KeyboardEvent("keydown", { key: "e" }));
  window.dispatchEvent(new KeyboardEvent("keydown", { key: "f" }));
  await nextTick();

  assert.verifySteps([
    "callback:a",
    "callback:b",
    "click",
    "callback:c",
    "callback2:d",
    "callback2:e",
    "callback2:f",
  ]);
  comp.destroy();
});

QUnit.test("many components can subscribe same hotkeys", async (assert) => {
  assert.expect(1);

  const result = [];
  const hotkeys = ["a", "b", "c"];

  class MyComponent1 extends Component {
    setup() {
      for (const hotkey of hotkeys) {
        useHotkey({ hotkey, callback: (arg) => result.push(`comp1:${arg}`) });
      }
    }
    onClick() {
      result.push("comp1:click");
    }
  }
  MyComponent1.template = xml`
    <div>
      <button t-on-click="onClick" data-hotkey="b" />
    </div>
  `;

  class MyComponent2 extends Component {
    setup() {
      for (const hotkey of hotkeys) {
        useHotkey({ hotkey, callback: (arg) => result.push(`comp2:${arg}`) });
      }
    }
    onClick() {
      result.push("comp2:click");
    }
  }
  MyComponent2.template = xml`
    <div>
      <button t-on-click="onClick" data-hotkey="b" />
    </div>
  `;

  const comp1 = await mount(MyComponent1, { env, target });
  const comp2 = await mount(MyComponent2, { env, target });
  window.dispatchEvent(new KeyboardEvent("keydown", { key: "a" }));
  window.dispatchEvent(new KeyboardEvent("keydown", { key: "b" }));
  window.dispatchEvent(new KeyboardEvent("keydown", { key: "c" }));
  await nextTick();

  assert.deepEqual(result.sort(), [
    "comp1:a",
    "comp1:b",
    "comp1:c",
    "comp1:click",
    "comp2:a",
    "comp2:b",
    "comp2:c",
    "comp2:click",
  ]);
  comp1.destroy();
  comp2.destroy();
});

QUnit.test("subscriptions and elements belong to the correct UI owner", async (assert) => {
  assert.expect(7);
  class MyComponent1 extends Component {
    setup() {
      useHotkey({ hotkey: "a", callback: () => assert.step("MyComponent1 subscription") });
    }
    onClick() {
      assert.step("MyComponent1 [data-hotkey]");
    }
  }
  MyComponent1.template = xml`<div><button data-hotkey="b" t-on-click="onClick()"/></div>`;

  class MyComponent2 extends Component {
    setup() {
      useHotkey({ hotkey: "a", callback: () => assert.step("MyComponent2 subscription") });
      useActiveElement();
    }
    onClick() {
      assert.step("MyComponent2 [data-hotkey]");
    }
  }
  MyComponent2.template = xml`<div><button data-hotkey="b" t-on-click="onClick()"/></div>`;

  const comp1 = await mount(MyComponent1, { env, target });
  window.dispatchEvent(new KeyboardEvent("keydown", { key: "a" }));
  window.dispatchEvent(new KeyboardEvent("keydown", { key: "b" }));
  await nextTick();

  const comp2 = await mount(MyComponent2, { env, target });
  window.dispatchEvent(new KeyboardEvent("keydown", { key: "a" }));
  window.dispatchEvent(new KeyboardEvent("keydown", { key: "b" }));
  await nextTick();

  comp2.unmount();
  window.dispatchEvent(new KeyboardEvent("keydown", { key: "a" }));
  window.dispatchEvent(new KeyboardEvent("keydown", { key: "b" }));
  await nextTick();

  assert.verifySteps([
    "MyComponent1 subscription",
    "MyComponent1 [data-hotkey]",
    "MyComponent2 subscription",
    "MyComponent2 [data-hotkey]",
    "MyComponent1 subscription",
    "MyComponent1 [data-hotkey]",
  ]);

  comp1.destroy();
  comp2.destroy();
});
