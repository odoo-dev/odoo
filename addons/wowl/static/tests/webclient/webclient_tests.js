/** @odoo-module **/

import configure from "wowl.WebClientConfigure";
import { Registry } from "../../src/core/registry";
import { actionService } from "../../src/actions/action_service";
import { notificationService } from "../../src/notifications/notification_service";
import { click, mount, makeTestEnv } from "../helpers/utility";
import { menuService } from "../../src/services/menu_service";
import { fakeTitleService } from "../helpers/mocks";
import { hotkeyService } from "../../src/services/hotkey_service";
import { uiService } from "../../src/services/ui_service";
import { createWebClient, doAction, getActionManagerTestConfig } from "../actions/helpers";
import { getLegacy } from "wowl.test_legacy";
import { actionRegistry } from "../../src/actions/action_registry";
import { WebClient } from "../../src/webclient/webclient";

const { Component, tags, core } = owl;
const { xml } = tags;

let baseConfig;

QUnit.module("Web Client", {
  async beforeEach() {
    const serviceRegistry = new Registry();
    serviceRegistry
      .add("action", actionService)
      .add("hotkey", hotkeyService)
      .add("ui", uiService)
      .add("notification", notificationService)
      .add("title", fakeTitleService)
      .add("menu", menuService);
    baseConfig = { serviceRegistry, activateMockServer: true };
  },
});

QUnit.test("can be rendered", async (assert) => {
  assert.expect(1);
  const env = await makeTestEnv(baseConfig);
  const webClient = await mount(WebClient, { env });
  assert.containsOnce(webClient.el, "header > nav.o_main_navbar");
});

QUnit.test("can render a main component", async (assert) => {
  assert.expect(1);
  class MyComponent extends Component {}
  MyComponent.template = xml`<span class="chocolate">MyComponent</span>`;
  const mainComponentRegistry = new Registry();
  mainComponentRegistry.add("mycomponent", MyComponent);
  const env = await makeTestEnv({ ...baseConfig, mainComponentRegistry });
  const webClient = await mount(WebClient, { env });
  assert.containsOnce(webClient.el, ".chocolate");
});
// Tests to be executed with the same WebClient class as currently in production
QUnit.module("WebClient Common", (hooks) => {
  function createCurrentWebClient(params) {
    params.WebClientClass = configure(params.testConfig);
    return createWebClient(params);
  }
  let testConfig;
  const owner = Symbol("owner");
  hooks.beforeEach(() => {
    actionRegistry.on("UPDATE", owner, (payload) => {
      if (payload.operation === "add" && testConfig.actionRegistry) {
        testConfig.actionRegistry.add(payload.key, payload.value);
        actionRegistry.remove(payload.key);
      }
    });
  });
  hooks.afterEach(() => {
    actionRegistry.off("UPDATE", owner);
  });
  hooks.beforeEach(() => {
    testConfig = getActionManagerTestConfig();
    testConfig.userMenuRegistry = new Registry();
  });
  QUnit.test("can set window title (from legacy)", async function (assert) {
    assert.expect(1);
    const { AbstractAction, core } = await getLegacy();
    let actionInstance;
    const legacyAction = AbstractAction.extend({
      init() {
        this._super(...arguments);
        actionInstance = this;
      },
    });
    core.action_registry.add("legacyAction", legacyAction);
    const webClient = await createCurrentWebClient({ testConfig });
    await doAction(webClient, "legacyAction");
    actionInstance.trigger_up("set_title_part", { title: "fire", part: "b" });
    assert.deepEqual(webClient.env.services.title.current, '{"zopenerp":"Odoo","b":"fire"}');
    webClient.destroy();
  });
  QUnit.test("can set window title (from legacy bus)", async function (assert) {
    assert.expect(1);
    const legacyBus = new core.EventBus();
    const webClient = await createCurrentWebClient({
      testConfig,
      legacyParams: { bus: legacyBus },
    });
    legacyBus.trigger("set_title_part", { title: "fire", part: "b" });
    assert.deepEqual(webClient.env.services.title.current, '{"zopenerp":"Odoo","b":"fire"}');
    webClient.destroy();
  });
  QUnit.test("can click on anchor link", async function (assert) {
    assert.expect(3);
    testConfig.serverData.views["partner,false,form"] = `
    <form>
    <sheet>
    <a href="#anchored_div" id="the_trigger">The Trigger</a>
    <br/><br/><br/><br/><br/><br/><br/><br/><br/><br/><br/><br/><br/><br/><br/>
    <br/><br/><br/><br/><br/><br/><br/><br/><br/><br/><br/><br/><br/><br/><br/>
    <br/><br/><br/><br/><br/><br/><br/><br/><br/><br/><br/><br/><br/><br/><br/>
    <br/><br/><br/><br/><br/><br/><br/><br/><br/><br/><br/><br/><br/><br/><br/>
    <br/><br/><br/><br/><br/><br/><br/><br/><br/><br/><br/><br/><br/><br/><br/>
    <div id="anchored_div">
    <field name="display_name"/>
    </div>
    </sheet>
    </form>`;
    const fixture = document.createElement("div"); // Force to have realistic DOM values
    fixture.style.height = "50px";
    document.body.append(fixture);
    const webClient = await createWebClient({ testConfig, target: fixture });
    await doAction(webClient, 6, { viewType: "form", resId: 1 });
    const scrollableEl = webClient.el.querySelector(".o_content");
    scrollableEl.scrollTop = 0;
    const anchorTarget = document.getElementById("anchored_div");
    assert.notOk(scrollableEl.scrollTop > anchorTarget.getBoundingClientRect().top);
    await click(document.getElementById("the_trigger"));
    assert.ok(scrollableEl.scrollTop > anchorTarget.getBoundingClientRect().top);
    assert.notOk(document.location.hash.includes("anchored_div"));
    document.body.removeChild(fixture);
    webClient.destroy();
  });
  QUnit.test("can click on form notebook in main action", async function (assert) {
    assert.expect(4);
    testConfig.serverData.views["partner,false,form"] = `
      <form>
      <header><button name="do_something" string="Call button" type="object"/></header>
      <sheet>
      <field name="display_name"/>
      <notebook>
      <page string="red" name="red">
      <div id="righthand">Nick</div>
      </page>
      <page string="hell" name="hell">
      <div id="brokeluce">Tom</div>
      </page>
      </notebook>
      </sheet>
      </form>`;
    const webClient = await createWebClient({ testConfig });
    await doAction(webClient, 6, { resId: 1 });
    assert.isVisible(webClient.el.querySelector("#righthand"));
    assert.isNotVisible(webClient.el.querySelector("#brokeluce"));
    await click(webClient.el.querySelectorAll('a[data-toggle="tab"]')[1]);
    assert.isNotVisible(webClient.el.querySelector("#righthand"));
    assert.isVisible(webClient.el.querySelector("#brokeluce"));
    webClient.destroy();
  });
  QUnit.test("can click on form notebook in dialog action", async function (assert) {
    assert.expect(4);
    testConfig.serverData.views["partner,false,form"] = `
      <form>
      <header><button name="do_something" string="Call button" type="object"/></header>
      <sheet>
      <field name="display_name"/>
      <notebook>
      <page string="red" name="red">
      <div id="righthand">Nick</div>
      </page>
      <page string="hell" name="hell">
      <div id="brokeluce">Tom</div>
      </page>
      </notebook>
      </sheet>
      </form>`;
    testConfig.serverData.actions[6].target = "new";
    const webClient = await createWebClient({ testConfig });
    await doAction(webClient, 6, { resId: 1 });
    assert.isVisible(webClient.el.querySelector(".modal #righthand"));
    assert.isNotVisible(webClient.el.querySelector("#brokeluce"));
    await click(webClient.el.querySelectorAll('.modal a[data-toggle="tab"]')[1]);
    assert.isNotVisible(webClient.el.querySelector("#righthand"));
    assert.isVisible(webClient.el.querySelector(".modal #brokeluce"));
    webClient.destroy();
  });
});
