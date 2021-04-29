/** @odoo-module **/

import { serviceRegistry } from "@web/webclient/service_registry";
import { uiService, useActiveElement } from "@web/services/ui_service";
import { BlockUI } from "@web/webclient/block_ui/block_ui";
import { makeTestEnv } from "../helpers/mock_env";
import { makeFakeLocalizationService } from "../helpers/mock_services";
import { getFixture, nextTick } from "../helpers/utils";

const { Component, mount } = owl;

let target;
let browser;
let baseConfig;

QUnit.module("UI", {
  async beforeEach() {
    target = getFixture();
    serviceRegistry.add("ui", uiService);
    serviceRegistry.add("localization", makeFakeLocalizationService());
    browser = { setTimeout: () => 1 };
    baseConfig = { browser };
  },
});

QUnit.test("block and unblock once ui with ui service", async (assert) => {
  const env = await makeTestEnv({ ...baseConfig });
  const ui = env.services.ui;
  await mount(BlockUI, { env, target });
  let blockUI = target.querySelector(".o_blockUI");
  assert.strictEqual(blockUI, null, "ui should not be blocked");
  ui.block();
  await nextTick();
  blockUI = target.querySelector(".o_blockUI");
  assert.notStrictEqual(blockUI, null, "ui should be blocked");
  ui.unblock();
  await nextTick();
  blockUI = target.querySelector(".o_blockUI");
  assert.strictEqual(blockUI, null, "ui should not be blocked");
});

QUnit.test("use block and unblock several times to block ui with ui service", async (assert) => {
  const env = await makeTestEnv({ ...baseConfig });
  const ui = env.services.ui;
  await mount(BlockUI, { env, target });
  let blockUI = target.querySelector(".o_blockUI");
  assert.strictEqual(blockUI, null, "ui should not be blocked");
  ui.block();
  ui.block();
  ui.block();
  await nextTick();
  blockUI = target.querySelector(".o_blockUI");
  assert.notStrictEqual(blockUI, null, "ui should be blocked");
  ui.unblock();
  ui.unblock();
  await nextTick();
  blockUI = target.querySelector(".o_blockUI");
  assert.notStrictEqual(blockUI, null, "ui should be blocked");
  ui.unblock();
  await nextTick();
  blockUI = target.querySelector(".o_blockUI");
  assert.strictEqual(blockUI, null, "ui should not be blocked");
});

QUnit.test("a component can be the active element", async (assert) => {
  class MyComponent extends Component {
    setup() {
      useActiveElement();
    }
  }
  MyComponent.template = owl.tags.xml`<div/>`;

  const env = await makeTestEnv({ ...baseConfig });
  const ui = env.services.ui;
  assert.deepEqual(ui.activeElement, document);

  const comp = await mount(MyComponent, { env, target });
  assert.deepEqual(ui.activeElement, comp.el);

  comp.unmount();
  assert.deepEqual(ui.activeElement, document);
  comp.destroy();
});

QUnit.test("a component can be the  UI active element: with t-ref delegation", async (assert) => {
  class MyComponent extends Component {
    setup() {
      useActiveElement("delegatedRef");
    }
  }
  MyComponent.template = owl.tags.xml`
    <div>
      <h1>My Component</h1>
      <div id="owner" t-ref="delegatedRef"/>
    </div>
  `;

  const env = await makeTestEnv({ ...baseConfig });
  const ui = env.services.ui;
  assert.deepEqual(ui.activeElement, document);

  const comp = await mount(MyComponent, { env, target });
  assert.deepEqual(ui.activeElement, comp.el.querySelector("div#owner"));

  comp.unmount();
  assert.deepEqual(ui.activeElement, document);
  comp.destroy();
});
