/** @odoo-module **/
import { Registry } from "../../src/core/registry";
import { hotkeyService, useHotkeys, } from "../../src/services/hotkey_service";
import { uiService } from "../../src/services/ui_service";
import { makeTestEnv, mount, nextTick } from "../helpers";

let env;

QUnit.module("Hotkey Service", {
  async beforeEach() {
    const serviceRegistry = new Registry();
    serviceRegistry.add(hotkeyService.name, hotkeyService);
    serviceRegistry.add(uiService.name, uiService);
    env = await makeTestEnv({ serviceRegistry });
  },
});

QUnit.test("subscribe / unsubscribe", async (assert) => {
  assert.expect(2);

  function callback(arg) {
    assert.step(arg);
  }

  const hotkey = env.services.hotkey;

  const key = "q";
  let keydown = new KeyboardEvent("keydown", { key });
  window.dispatchEvent(keydown);
  await nextTick();

  let token = hotkey.subscribe({ hotkeys: [key], callback });

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

  class MyComponent extends owl.Component {
    onClick() {
      assert.step("click");
    }
  }
  MyComponent.template = owl.tags.xml`
    <div>
      <button t-on-click="onClick" data-hotkey="b" />
    </div>
  `;

  const key = "b";
  let keydown = new KeyboardEvent("keydown", { key });
  window.dispatchEvent(keydown);
  await nextTick();

  const comp = await mount(MyComponent, { env });

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
  class TestComponent extends owl.Component {
    setup() {
      useHotkeys([{ hotkeys: [key], callback: this.callback }]);
    }
    callback(arg) {
      assert.step(arg);
    }
  }
  TestComponent.template = owl.tags.xml`<div/>`;

  let keydown = new KeyboardEvent("keydown", { key });
  window.dispatchEvent(keydown);
  await nextTick();

  const comp = await mount(TestComponent, { env });

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
  });
  assert.throws(function () {
    hotkey.subscribe({});
  });

  function callback() {}
  assert.throws(function () {
    hotkey.subscribe({ callback });
  });
  assert.throws(function () {
    hotkey.subscribe({ hotkeys: [] });
  }, /at least one hotkey/);
  assert.throws(function () {
    hotkey.subscribe({ hotkeys: [], callback });
  }, /at least one hotkey/);
  assert.throws(function () {
    hotkey.subscribe({ hotkeys: ["crap"], callback });
  }, /not whitelisted/);
  assert.throws(function () {
    hotkey.subscribe({ hotkeys: ["ctrl-o"], callback });
  }, /not whitelisted/);
  assert.throws(function () {
    hotkey.subscribe({ hotkeys: ["Control-O"], callback });
  }, /not whitelisted/, "should throw 'not whitelisted' when other than lowercase chars are used");
  assert.throws(function () {
    hotkey.subscribe({ hotkeys: ["control-o"] });
  }, /specify a callback/);
  assert.throws(function () {
    hotkey.subscribe({ hotkeys: ["control-o-d"], callback });
  }, /more than one single key part/);
});

QUnit.test("component can subscribe many hotkeys", async (assert) => {
  assert.expect(8);

  class MyComponent extends owl.Component {
    setup() {
      useHotkeys([
        { hotkeys: ["a", "b", "c"], callback: this.callback },
        { hotkeys: ["d", "e", "f"], callback: this.callback2 }
      ]);
    }
    onClick() {
      assert.step("click");
    }
    callback(arg) {
      assert.step(`callback:${arg}`);
    }
    callback2(arg) {
      assert.step(`callback2:${arg}`);
    }
  }
  MyComponent.template = owl.tags.xml`
    <div>
      <button t-on-click="onClick" data-hotkey="b" />
    </div>
  `;

  const comp = await mount(MyComponent, { env });
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

  class MyComponent1 extends owl.Component {
    setup() {
      useHotkeys([
        { hotkeys, callback: this.callback }
      ]);
    }
    onClick() {
      result.push("comp1:click");
    }
    callback(arg) {
      result.push(`comp1:${arg}`);
    }
  }
  MyComponent1.template = owl.tags.xml`
    <div>
      <button t-on-click="onClick" data-hotkey="b" />
    </div>
  `;

  class MyComponent2 extends owl.Component {
    setup() {
      useHotkeys([
        { hotkeys, callback: this.callback }
      ]);
    }
    onClick() {
      result.push("comp2:click");
    }
    callback(arg) {
      result.push(`comp2:${arg}`);
    }
  }
  MyComponent2.template = owl.tags.xml`
    <div>
      <button t-on-click="onClick" data-hotkey="b" />
    </div>
  `;

  const comp1 = await mount(MyComponent1, { env });
  const comp2 = await mount(MyComponent2, { env });
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
