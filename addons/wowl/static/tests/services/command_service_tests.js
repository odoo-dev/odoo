/** @odoo-module **/
import { DEFAULT_COMMAND_CATEGORY } from "../../src/commands/command_category_registry";
import { useCommand } from "../../src/commands/command_hook";
import { commandService } from "../../src/commands/command_service";
import { Registry } from "../../src/core/registry";
import { dialogService } from "../../src/services/dialog_service";
import { hotkeyService } from "../../src/services/hotkey_service";
import { uiService } from "../../src/services/ui_service";
import { mainComponentRegistry } from "../../src/webclient/main_component_registry";
import { click, getFixture, makeTestEnv, nextTick } from "../helpers";

const { Component, mount, tags } = owl;
const { xml } = tags;

let env;
let target;
let testComponent;

class TestComponent extends Component { }
TestComponent.components = { DialogContainer: mainComponentRegistry.get("DialogContainer") };
TestComponent.template = xml`
  <div>
    <div class="o_dialog_container"/>
    <DialogContainer/>
  </div>
`;

QUnit.module("Command", {
  async beforeEach() {
    const serviceRegistry = new Registry();
    serviceRegistry.add("hotkey", hotkeyService);
    serviceRegistry.add("ui", uiService);
    serviceRegistry.add("dialog", dialogService);
    serviceRegistry.add("command", commandService);

    const commandCategoryRegistry = new Registry();
    commandCategoryRegistry.add("custom-nolabel", {});
    commandCategoryRegistry.add("custom", { label: "Custom" });
    commandCategoryRegistry.add("default", DEFAULT_COMMAND_CATEGORY);
    env = await makeTestEnv({ serviceRegistry, commandCategoryRegistry });
    target = getFixture();
  },
  afterEach() {
    if (testComponent) {
      testComponent.destroy();
    }
  },
});

QUnit.test("palette dialog can be rendered and closed on outside click", async (assert) => {
  testComponent = await mount(TestComponent, { env, target });
  // invoke command palette through hotkey control+k
  let keydown = new KeyboardEvent("keydown", { key: "k", ctrlKey: true });
  window.dispatchEvent(keydown);
  await nextTick();
  assert.containsOnce(target, ".o_command_palette");

  // Close on outside click
  const palette = target.querySelector(".o_command_palette");
  await click(palette.parentElement);
  assert.containsNone(target, ".o_command_palette");
});

QUnit.test("commands evilness 👹", async (assert) => {
  const command = env.services.command;
  function action() { }

  assert.throws(function () {
    command.registerCommand();
  }, /is undefined/);
  assert.throws(function () {
    command.registerCommand(null);
  }, /is null/);
  assert.throws(function () {
    command.registerCommand({});
  }, /A Command must have a name and an action function/);
  assert.throws(function () {
    command.registerCommand({ name: "" });
  }, /A Command must have a name and an action function/);
  assert.throws(function () {
    command.registerCommand({ action });
  }, /A Command must have a name and an action function/);
  assert.throws(function () {
    command.registerCommand({ name: "", action });
  }, /A Command must have a name and an action function/);

});

QUnit.test("useCommand hook", async (assert) => {
  assert.expect(5);

  class MyComponent extends TestComponent {
    setup() {
      super.setup();
      useCommand({ name: "Take the throne", action: () => { assert.step("Hodor"); } });
    }
  }
  testComponent = await mount(MyComponent, { env, target });

  let keydown = new KeyboardEvent("keydown", { key: "k", ctrlKey: true });
  window.dispatchEvent(keydown);
  await nextTick();

  assert.containsOnce(target, ".o_command");
  assert.deepEqual(target.querySelector(".o_command").innerText, "Take the throne");

  await click(target, ".o_command");
  testComponent.unmount();
  keydown = new KeyboardEvent("keydown", { key: "k", ctrlKey: true });
  window.dispatchEvent(keydown);
  await nextTick();
  assert.containsNone(target, ".o_command");

  assert.verifySteps(["Hodor"]);
});

QUnit.test("command with hotkey", async (assert) => {
  assert.expect(2);

  const hotkey = "a";
  env.services.command.registerCommand({
    name: "test",
    action: () => assert.step(hotkey),
    hotkey
  });
  await nextTick();

  window.dispatchEvent(new KeyboardEvent("keydown", { key: "a" }));
  await nextTick();
  assert.verifySteps([hotkey]);
});

QUnit.test("aria-keyshortcuts added to command palette", async (assert) => {
  assert.expect(8);

  class MyComponent extends Component {
    onClick() {
      assert.step("Hodor");
    }
  }
  MyComponent.components = { TestComponent };
  MyComponent.template = xml`
    <div>
      <button title="Aria Stark" aria-keyshortcuts="a" t-on-click="onClick" />
      <input title="Bran Stark" type="text" aria-keyshortcuts="b" />
      <TestComponent />
    </div>
  `;
  testComponent = await mount(MyComponent, { env, target });

  // Open palette
  let keydown = new KeyboardEvent("keydown", { key: "k", ctrlKey: true });
  window.dispatchEvent(keydown);
  await nextTick();

  assert.containsN(target, ".o_command", 2, "must contains two commands");
  assert.deepEqual(
    [...target.querySelectorAll(".o_command span")].map(el => el.innerText),
    ["Aria Stark", "Bran Stark"]
  );

  // Click on first command
  await click(target, "#o_command_0");
  assert.containsNone(target, ".o_command_palette", "palette is closed due to command action");

  // Reopen palette
  keydown = new KeyboardEvent("keydown", { key: "k", ctrlKey: true });
  window.dispatchEvent(keydown);
  await nextTick();

  // Click on second command
  assert.notStrictEqual(
    document.activeElement,
    target.querySelector("input[title='Bran Stark']"),
    "input should not have the focus"
  );
  await click(target, "#o_command_1");
  assert.containsNone(target, ".o_command_palette", "palette is closed due to command action");
  assert.strictEqual(
    document.activeElement,
    target.querySelector("input[title='Bran Stark']"),
    "input should now have the focus after matching command action has been executed"
  );

  // only step should come from the first command execution
  assert.verifySteps(["Hodor"]);
});

QUnit.test("can be searched", async (assert) => {
  assert.expect(4);

  testComponent = await mount(TestComponent, { env, target });

  // Register some commands
  function action() { }
  const names = [
    "Cersei Lannister",
    "Jaime Lannister",
    "Tyrion Lannister",
    "Tywin Lannister",
  ];
  for (const name of names) {
    env.services.command.registerCommand({ name, action });
  }
  await nextTick();

  // Open palette
  let keydown = new KeyboardEvent("keydown", { key: "k", ctrlKey: true });
  window.dispatchEvent(keydown);
  await nextTick();

  assert.deepEqual(
    target.querySelector(".o_command_palette_search").value,
    "",
    "search input is empty"
  );

  assert.deepEqual(
    [...target.querySelectorAll(".o_command")].map(el => el.innerText),
    names,
    "all commands are present"
  );

  // Search something
  let search = target.querySelector(".o_command_palette_search");
  search.value = "jl";
  search.dispatchEvent(new InputEvent("input"));
  await nextTick();

  assert.deepEqual(
    [...target.querySelectorAll(".o_command")].map(el => el.innerText),
    ["Jaime Lannister"],
    "only search matches are present"
  );

  // Clear search input
  search.value = "";
  search.dispatchEvent(new InputEvent("input"));
  await nextTick();

  assert.deepEqual(
    [...target.querySelectorAll(".o_command")].map(el => el.innerText),
    names,
    "all commands are again present"
  );
});

QUnit.test("command categories", async (assert) => {
  testComponent = await mount(TestComponent, { env, target });

  // Register some commands
  function action() { }
  env.services.command.registerCommand({ name: "a", action, category: "custom-nolabel" });
  env.services.command.registerCommand({ name: "b", action, category: "custom" });
  env.services.command.registerCommand({ name: "c", action });
  env.services.command.registerCommand({ name: "d", action, category: "invalid-category" });
  await nextTick();

  // Open palette
  let keydown = new KeyboardEvent("keydown", { key: "k", ctrlKey: true });
  window.dispatchEvent(keydown);
  await nextTick();

  assert.containsN(target, ".o_command", 4);
  assert.deepEqual(
    [...target.querySelectorAll(".o_command_category > span")].map(el => el.innerText),
    [
      "a",
      "Custom",
      "b",
      "Other commands",
      "c",
      "d"
    ]
  );
});

QUnit.test("data-command-category", async (assert) => {
  assert.expect(2);

  class MyComponent extends Component { }
  MyComponent.components = { TestComponent };
  MyComponent.template = xml`
    <div>
      <div>
        <button title="Aria Stark" aria-keyshortcuts="a" />
        <button title="Bran Stark" aria-keyshortcuts="b" />
      </div>
      <div data-command-category="custom">
        <button title="Robert Baratheon" aria-keyshortcuts="r" />
        <button title="Joffrey Baratheon" aria-keyshortcuts="j" />
      </div>
      <TestComponent />
    </div>
  `;
  testComponent = await mount(MyComponent, { env, target });

  // Open palette
  let keydown = new KeyboardEvent("keydown", { key: "k", ctrlKey: true });
  window.dispatchEvent(keydown);
  await nextTick();

  assert.containsN(target, ".o_command", 4);
  assert.deepEqual(
    [...target.querySelectorAll(".o_command_category_label, .o_command > span")].map(el => el.innerText),
    [
      "Custom",
      "Robert Baratheon",
      "Joffrey Baratheon",
      "Other commands",
      "Aria Stark",
      "Bran Stark"
    ]
  );
});
