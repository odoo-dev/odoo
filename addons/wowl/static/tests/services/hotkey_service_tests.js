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

QUnit.test("register / unregister", async (assert) => {
  assert.expect(2);

  const hotkey = env.services.hotkey;

  const key = "q";
  let keydown = new KeyboardEvent("keydown", { key });
  window.dispatchEvent(keydown);
  await nextTick();

  let token = hotkey.registerHotkey(key, () => assert.step(key));
  await nextTick();

  keydown = new KeyboardEvent("keydown", { key });
  window.dispatchEvent(keydown);
  await nextTick();

  hotkey.unregisterHotkey(token);
  keydown = new KeyboardEvent("keydown", { key });
  window.dispatchEvent(keydown);
  await nextTick();

  assert.verifySteps([key]);
});

QUnit.test("aria-keyshortcuts", async (assert) => {
  assert.expect(2);

  class MyComponent extends Component {
    onClick() {
      assert.step("click");
    }
  }
  MyComponent.template = xml`
    <div>
      <button t-on-click="onClick" aria-keyshortcuts="b" />
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
      useHotkey(key, () => assert.step(key));
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

QUnit.test("registration allowed in editable if specified", async (assert) => {
  const allowInEditableKey = "a";
  const disallowInEditableKey = "b";
  const defaultBehaviourKey = "c";
  class TestComponent extends Component {
    setup() {
      useHotkey(allowInEditableKey, () => assert.step(allowInEditableKey), { allowInEditable: true });
      useHotkey(disallowInEditableKey, () => assert.step(disallowInEditableKey), { allowInEditable: false });
      useHotkey(defaultBehaviourKey, () => assert.step(defaultBehaviourKey));
    }
  }
  TestComponent.template = xml`<div><input/></div>`;

  const comp = await mount(TestComponent, { env, target });

  let keydown = new KeyboardEvent("keydown", { key: allowInEditableKey });
  window.dispatchEvent(keydown);
  keydown = new KeyboardEvent("keydown", { key: disallowInEditableKey });
  window.dispatchEvent(keydown);
  keydown = new KeyboardEvent("keydown", { key: defaultBehaviourKey });
  window.dispatchEvent(keydown);
  await nextTick();

  assert.verifySteps([
    allowInEditableKey,
    disallowInEditableKey,
    defaultBehaviourKey,]);

  const input = comp.el.querySelector("input");
  input.focus();
  keydown = new KeyboardEvent("keydown", { key: allowInEditableKey });
  window.dispatchEvent(keydown);
  keydown = new KeyboardEvent("keydown", { key: disallowInEditableKey });
  window.dispatchEvent(keydown);
  keydown = new KeyboardEvent("keydown", { key: defaultBehaviourKey });
  window.dispatchEvent(keydown);
  await nextTick();

  assert.verifySteps([
    allowInEditableKey,
  ]);

  comp.destroy();
});

QUnit.test("[aria-keyshortcuts] never allowed in editable", async (assert) => {
  const key = "a";
  class TestComponent extends Component {
    onClick() {
      assert.step(key);
    }
  }
  TestComponent.template = xml`<div><input/><button t-on-click="onClick" aria-keyshortcuts="${key}"/></div>`;

  const comp = await mount(TestComponent, { env, target });

  let keydown = new KeyboardEvent("keydown", { key });
  window.dispatchEvent(keydown);
  await nextTick();

  assert.verifySteps([key]);

  const input = comp.el.querySelector("input");
  input.focus();
  keydown = new KeyboardEvent("keydown", { key });
  window.dispatchEvent(keydown);
  await nextTick();

  assert.verifySteps([]);

  comp.destroy();
});

QUnit.test("hotkeys evil 👹", async (assert) => {
  const hotkey = env.services.hotkey;

  assert.throws(function () {
    hotkey.registerHotkey();
  }, /must specify an hotkey/);
  assert.throws(function () {
    hotkey.registerHotkey(null);
  }, /must specify an hotkey/);

  function callback() {}
  assert.throws(function () {
    hotkey.registerHotkey(null, callback);
  }, /must specify an hotkey/);
  assert.throws(function () {
    hotkey.registerHotkey("");
  }, /must specify an hotkey/);
  assert.throws(function () {
    hotkey.registerHotkey("crap", callback);
  }, /not whitelisted/);
  assert.throws(function () {
    hotkey.registerHotkey("ctrl+o", callback);
  }, /not whitelisted/);
  assert.throws(function () {
    hotkey.registerHotkey("Control+o");
  }, /specify a callback/);
  assert.throws(function () {
    hotkey.registerHotkey("Control+o+d", callback);
  }, /more than one single key part/);
});

QUnit.test("component can register many hotkeys", async (assert) => {
  assert.expect(8);

  class MyComponent extends Component {
    setup() {
      for (const hotkey of ["a", "b", "c"]) {
        useHotkey(hotkey, () => assert.step(`callback:${hotkey}`))
      }
      for (const hotkey of ["d", "e", "f"]) {
        useHotkey(hotkey, () => assert.step(`callback2:${hotkey}`))
      }
    }
    onClick() {
      assert.step("click");
    }
  }
  MyComponent.template = xml`
    <div>
      <button t-on-click="onClick" aria-keyshortcuts="b" />
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

QUnit.test("many components can register same hotkeys", async (assert) => {
  assert.expect(1);

  const result = [];
  const hotkeys = ["a", "b", "c"];

  class MyComponent1 extends Component {
    setup() {
      for (const hotkey of hotkeys) {
        useHotkey(hotkey, () => result.push(`comp1:${hotkey}`))
      }
    }
    onClick() {
      result.push("comp1:click");
    }
  }
  MyComponent1.template = xml`
    <div>
      <button t-on-click="onClick" aria-keyshortcuts="b" />
    </div>
  `;

  class MyComponent2 extends Component {
    setup() {
      for (const hotkey of hotkeys) {
        useHotkey(hotkey, () => result.push(`comp2:${hotkey}`))
      }
    }
    onClick() {
      result.push("comp2:click");
    }
  }
  MyComponent2.template = xml`
    <div>
      <button t-on-click="onClick" aria-keyshortcuts="b" />
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
      useHotkey("a", () => assert.step("MyComponent1 subscription"));
    }
    onClick() {
      assert.step("MyComponent1 [aria-keyshortcuts]");
    }
  }
  MyComponent1.template = xml`<div><button aria-keyshortcuts="b" t-on-click="onClick()"/></div>`;

  class MyComponent2 extends Component {
    setup() {
      useHotkey("a", () => assert.step("MyComponent2 subscription"));
      useActiveElement();
    }
    onClick() {
      assert.step("MyComponent2 [aria-keyshortcuts]");
    }
  }
  MyComponent2.template = xml`<div><button aria-keyshortcuts="b" t-on-click="onClick()"/></div>`;

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
    "MyComponent1 [aria-keyshortcuts]",
    "MyComponent2 subscription",
    "MyComponent2 [aria-keyshortcuts]",
    "MyComponent1 subscription",
    "MyComponent1 [aria-keyshortcuts]",
  ]);

  comp1.destroy();
  comp2.destroy();
});

QUnit.skip('keep CSS position absolute for parent of overlay', async function (assert) {
  // If we change the CSS position of an 'absolute' element to 'relative',
  // we may likely change its position on the document. Since the overlay
  // CSS position is 'absolute', it will match the size and cover the
  // parent with 'absolute' > 'absolute', without altering the position
  // of the parent on the document.
  assert.expect(1);
  var $target = $('#qunit-fixture');
  var $button;
  var KeyboardWidget = Widget.extend(KeyboardNavigationMixin, {
    init: function () {
      this._super.apply(this, arguments);
      KeyboardNavigationMixin.init.call(this);
    },
    start: function () {
      KeyboardNavigationMixin.start.call(this);
      $button = $('<button>').text('Click Me!').attr('accesskey', 'o');
      // we need to define the accesskey because it will not be assigned on invisible buttons
      this.$el.append($button);
      return this._super.apply(this, arguments);
    },
    destroy: function () {
      KeyboardNavigationMixin.destroy.call(this);
      return this._super(...arguments);
    },
  });
  var parent = await testUtils.createParent({});
  var w = new KeyboardWidget(parent);
  await w.appendTo($target);

  $button.css('position', 'absolute');

  // minimum set of attribute to generate a native event that works with the mixin
  var e = new Event("keydown");
  e.key = '';
  e.altKey = true;
  w.$el[0].dispatchEvent(e);

  assert.strictEqual($button.css('position'), 'absolute',
    "should not have kept the CSS position of the button");

  parent.destroy();
});
