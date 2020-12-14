import * as QUnit from "qunit";
import $ from "jquery";
import { WebClient } from "../../src/webclient/webclient";
import { Registry } from "../../src/core/registry";
import { makeFakeUserService, nextTick, OdooEnv } from "../helpers/index";
import { click, legacyExtraNextTick, makeTestEnv, mount, TestConfig } from "../helpers/utility";
import { notificationService } from "../../src/notifications/notification_service";
import { dialogManagerService } from "../../src/services/dialog_manager";
import { menusService } from "../../src/services/menus";
import {
  ActionManager,
  actionManagerService,
  clearUncommittedChanges,
  useSetupAction,
} from "../../src/action_manager/action_manager";
import { Component, tags } from "@odoo/owl";
import {
  makeFakeRouterService,
  fakeTitleService,
  makeFakeDownloadService,
  makeFakeNotificationService,
  makeFakeUIService,
  makeFakeDeviceService,
} from "../helpers/mocks";
import { useService } from "../../src/core/hooks";

import { viewManagerService } from "../../src/services/view_manager";
import { modelService } from "../../src/services/model";
import { ServerData } from "../helpers/mock_server";
import { makeRAMLocalStorage } from "../../src/env";
import { RPC } from "../../src/services/rpc";
import { makeLegacyActionManagerService, mapLegacyEnvToWowlEnv } from "../../src/legacy/legacy";
import { getLegacy } from "../helpers/legacy";
import { actionRegistry } from "../../src/action_manager/action_registry";
import { viewRegistry } from "../../src/views/view_registry";
import { Route } from "../../src/services/router";
import type { Context } from "../../src/core/context";
import { DowloadFileOptionsFromParams } from "../../src/services/download";
import { uiService } from "../../src/services/ui/ui";

// JQuery :visible selector
// https://stackoverflow.com/questions/13388616/firefox-query-selector-and-the-visible-pseudo-selector

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

interface LegacyMockParams {
  dataManager?: any;
}

interface CreateParams {
  baseConfig: TestConfig;
  legacyParams?: LegacyMockParams;
  mockRPC?: RPC;
}

// -----------------------------------------------------------------------------
// Utils
// -----------------------------------------------------------------------------

async function doAction(env: Component | OdooEnv, ...args: Parameters<ActionManager["doAction"]>) {
  if (env instanceof Component) {
    env = env.env as OdooEnv;
  }
  try {
    await env.services.action_manager.doAction(...args);
  } finally {
    await legacyExtraNextTick();
  }
}
async function loadState(env: Component | OdooEnv, state: Route["hash"]) {
  if (env instanceof Component) {
    env = env.env as OdooEnv;
  }
  env.bus.trigger("test:hashchange", state);
  await nextTick();
  await legacyExtraNextTick();
}

function addLegacyMockEnvironment(
  comp: Component<{}, OdooEnv>,
  baseConfig: TestConfig,
  legacyParams: LegacyMockParams = {}
) {
  const cleanUps: (() => void)[] = [];
  const legacy = getLegacy() as any;

  // setup a legacy env
  const dataManager = Object.assign(
    {
      load_action: (actionID: number, context: Context) => {
        return comp.env.services.rpc("/web/action/load", {
          action_id: actionID,
          additional_context: context,
        });
      },
      load_views: async (params: any, options: any) => {
        const result = await comp.env.services.rpc(`/web/dataset/call_kw/${params.model}`, {
          args: [],
          kwargs: {
            context: params.context,
            options: options,
            views: params.views_descr,
          },
          method: "load_views",
          model: params.model,
        });
        const views = result.fields_views;
        for (const [_, viewType] of params.views_descr) {
          const fvg = views[viewType];
          fvg.viewFields = fvg.fields;
          fvg.fields = result.fields;
        }
        if (params.favoriteFilters && "search" in views) {
          views.search.favoriteFilters = params.favoriteFilters;
        }
        return views;
      },
      load_filters: (params: any) => {
        if (QUnit.config.debug) {
          console.log("[mock] load_filters", params);
        }
        return Promise.resolve([]);
      },
    },
    legacyParams.dataManager
  );
  const legacyEnv = legacy.makeTestEnvironment({ dataManager, bus: legacy.core.bus });
  Component.env = legacyEnv;
  mapLegacyEnvToWowlEnv(legacyEnv, comp.env);

  // deploy the legacyActionManagerService (in Wowl env)
  const legacyActionManagerService = makeLegacyActionManagerService(legacyEnv);
  baseConfig.serviceRegistry!.add("legacy_action_manager", legacyActionManagerService);

  // patch DebouncedField delay
  const debouncedField = legacy.basicFields.DebouncedField;
  const initialDebouncedVal = debouncedField.prototype.DEBOUNCE;
  debouncedField.prototype.DEBOUNCE = 0;
  cleanUps.push(() => (debouncedField.prototype.DEBOUNCE = initialDebouncedVal));

  // clean up at end of test
  const compDestroy = comp.destroy.bind(comp);
  comp.destroy = () => {
    cleanUps.forEach((fn) => fn());
    compDestroy();
  };
}

async function createWebClient(params: CreateParams) {
  const { AbstractAction, AbstractController, testUtils } = getLegacy() as any;
  const { patch, unpatch } = testUtils.mock;

  // With the compatibility layer, the action manager keeps legacy alive if they
  // are still acessible from the breacrumbs. They are manually destroyed as soon
  // as they are no longer referenced in the stack. This works fine in production,
  // because the webclient is never destroyed. However, at the end of each test,
  // we destroy the webclient and expect every legacy that has been instantiated
  // to be destroyed. We thus need to manually destroy them here.
  const controllers: any[] = [];
  patch(AbstractAction, {
    init() {
      this._super(...arguments);
      controllers.push(this);
    },
  });
  patch(AbstractController, {
    init() {
      this._super(...arguments);
      controllers.push(this);
    },
  });

  const mockRPC = params.mockRPC || undefined;
  const env = await makeTestEnv({
    ...params.baseConfig,
    mockRPC,
  });
  const wc = await mount(WebClient, { env });

  const _destroy = wc.destroy;
  wc.destroy = () => {
    _destroy.call(wc);
    for (const controller of controllers) {
      if (!controller.isDestroyed()) {
        controller.destroy();
      }
    }
    unpatch(AbstractAction);
    unpatch(AbstractController);
  };

  (wc as any)._____testname = QUnit.config.current.testName;

  addLegacyMockEnvironment(wc, params.baseConfig, params.legacyParams);
  await legacyExtraNextTick();

  return wc;
}

// PREPARE AND DATA
function beforeEachActionManager(): TestConfig {
  const serviceRegistry = new Registry<any>();
  serviceRegistry
    .add("user", makeFakeUserService())
    .add(notificationService.name, notificationService)
    .add(dialogManagerService.name, dialogManagerService)
    .add("menus", menusService)
    .add("action_manager", actionManagerService)
    .add("router", makeFakeRouterService())
    .add("view_manager", viewManagerService)
    .add("model", modelService)
    .add(fakeTitleService.name, fakeTitleService)
    .add(uiService.name, uiService)
    .add("device", makeFakeDeviceService());

  const browser = {
    setTimeout: window.setTimeout.bind(window),
    clearTimeout: window.clearTimeout.bind(window),
    localStorage: makeRAMLocalStorage(),
    sessionStorage: makeRAMLocalStorage(),
  };

  const serverData = makeServerData();

  return { serverData, serviceRegistry, browser };
}

function makeServerData(): ServerData {
  // action_manager_tests.js
  const recordData: ServerData["models"] = {
    partner: {
      fields: {
        id: { string: "Id", type: "integer" },
        foo: { string: "Foo", type: "char" },
        bar: { string: "Bar", type: "many2one", relation: "partner" },
        o2m: { string: "One2Many", type: "one2many", relation: "partner", relation_field: "bar" },
        m2o: { string: "Many2one", type: "many2one", relation: "partner" },
      },
      records: [
        { id: 1, display_name: "First record", foo: "yop", bar: 2, o2m: [2, 3], m2o: 3 },
        { id: 2, display_name: "Second record", foo: "blip", bar: 1, o2m: [1, 4, 5], m2o: 3 },
        { id: 3, display_name: "Third record", foo: "gnap", bar: 1, o2m: [], m2o: 1 },
        { id: 4, display_name: "Fourth record", foo: "plop", bar: 2, o2m: [], m2o: 1 },
        { id: 5, display_name: "Fifth record", foo: "zoup", bar: 2, o2m: [], m2o: 1 },
      ],
    },
    pony: {
      fields: {
        id: { string: "Id", type: "integer" },
        name: { string: "Name", type: "char" },
      },
      records: [
        { id: 4, name: "Twilight Sparkle" },
        { id: 6, name: "Applejack" },
        { id: 9, name: "Fluttershy" },
      ],
    },
  };

  const actionsArray = [
    {
      id: 1,
      name: "Partners Action 1",
      res_model: "partner",
      type: "ir.actions.act_window",
      views: [[1, "kanban"]],
    },
    {
      id: 2,
      type: "ir.actions.server",
    },
    {
      id: 3,
      name: "Partners",
      res_model: "partner",
      type: "ir.actions.act_window",
      views: [
        [false, "list"],
        [1, "kanban"],
        [false, "form"],
      ],
    },
    {
      id: 4,
      name: "Partners Action 4",
      res_model: "partner",
      type: "ir.actions.act_window",
      views: [
        [1, "kanban"],
        [2, "list"],
        [false, "form"],
      ],
    },
    {
      id: 5,
      name: "Create a Partner",
      res_model: "partner",
      target: "new",
      type: "ir.actions.act_window",
      views: [[false, "form"]],
    },
    {
      id: 6,
      name: "Partner",
      res_id: 2,
      res_model: "partner",
      target: "inline",
      type: "ir.actions.act_window",
      views: [[false, "form"]],
    },
    {
      id: 7,
      name: "Some Report",
      report_name: "some_report",
      report_type: "qweb-pdf",
      type: "ir.actions.report",
    },
    {
      id: 8,
      name: "Favorite Ponies",
      res_model: "pony",
      type: "ir.actions.act_window",
      views: [
        [false, "list"],
        [false, "form"],
      ],
    },
    {
      id: 9,
      name: "A Client Action",
      tag: "ClientAction",
      type: "ir.actions.client",
    },
    {
      id: 10,
      type: "ir.actions.act_window_close",
    },
    {
      id: 11,
      name: "Another Report",
      report_name: "another_report",
      report_type: "qweb-pdf",
      type: "ir.actions.report",
      close_on_report_download: true,
    },
    {
      id: 12,
      name: "Some HTML Report",
      report_name: "some_report",
      report_type: "qweb-html",
      type: "ir.actions.report",
    },
    {
      id: 24,
      name: "Partner",
      res_id: 2,
      res_model: "partner",
      type: "ir.actions.act_window",
      views: [[666, "form"]],
    },
    {
      id: 25,
      name: "Create a Partner",
      res_model: "partner",
      target: "new",
      type: "ir.actions.act_window",
      views: [[1, "form"]],
    },
    // pure client actions for simple testing
    {
      xmlId: "wowl.client_action",
      id: 1099,
      tag: "clientAction",
      target: "main",
      type: "ir.actions.client",
      params: { description: "xmlId" },
    },
    {
      id: 1001,
      tag: "clientAction",
      target: "main",
      type: "ir.actions.client",
      params: { description: "Id 1" },
    },
    {
      id: 1002,
      tag: "clientAction",
      target: "main",
      type: "ir.actions.client",
      params: { description: "Id 2" },
    },
  ];

  const archs: ServerData["views"] = {
    // kanban views
    "partner,1,kanban":
      '<kanban><templates><t t-name="kanban-box">' +
      '<div class="oe_kanban_global_click"><field name="foo"/></div>' +
      "</t></templates></kanban>",

    // list views
    "partner,false,list": '<tree><field name="foo"/></tree>',
    "partner,2,list": '<tree limit="3"><field name="foo"/></tree>',
    "pony,false,list": '<tree><field name="name"/></tree>',

    // form views
    "partner,false,form":
      "<form>" +
      "<header>" +
      '<button name="object" string="Call method" type="object"/>' +
      '<button name="4" string="Execute action" type="action"/>' +
      "</header>" +
      "<group>" +
      '<field name="display_name"/>' +
      '<field name="foo"/>' +
      "</group>" +
      "</form>",

    "partner,1,form": `
    <form>
    <footer>
    <button class="btn-primary" string="Save" special="save"/>
    </footer>
    </form>`,

    "partner,666,form": `<form>
    <header></header>
    <sheet>
    <div class="oe_button_box" name="button_box" modifiers="{}">
    <button class="oe_stat_button" type="action" name="1" icon="fa-star" context="{'default_partner': active_id}">
    <field string="Partners" name="o2m" widget="statinfo"/>
    </button>
    </div>
    <field name="display_name"/>
    </sheet>
    </form>`,

    "pony,false,form": "<form>" + '<field name="name"/>' + "</form>",

    // search views
    "partner,false,search": '<search><field name="foo" string="Foo"/></search>',
    "partner,1,search":
      "<search>" + '<filter name="bar" help="Bar" domain="[(\'bar\', \'=\', 1)]"/>' + "</search>",
    "pony,false,search": "<search></search>",
  };

  const actions: ServerData["actions"] = {};
  actionsArray.forEach((act) => {
    const id = act.xmlId || act.id;
    actions[id] = act;
  });

  const menus = {
    root: { id: "root", children: [0, 1, 2], name: "root", appID: "root" },
    // id:0 is a hack to not load anything at webClient mount
    0: { id: 0, children: [], name: "UglyHack", appID: 0 },
    1: { id: 1, children: [], name: "App1", appID: 1, actionID: 1001 },
    2: { id: 2, children: [], name: "App2", appID: 2, actionID: 1002 },
  };

  return {
    models: recordData,
    views: archs,
    actions,
    menus,
  };
}

// -----------------------------------------------------------------------------
// Tests
// -----------------------------------------------------------------------------

let baseConfig: TestConfig;

// legacy stuff
let AbstractAction: any;
let cpHelpers: any;
let core: any;
let ListController: any;
let testUtils: any;
let Widget: any;
let ReportClientAction: any;

QUnit.module("web client integrated tests", (hooks) => {
  hooks.beforeEach(() => {
    baseConfig = beforeEachActionManager();
    const actionsRegistry = new Registry<any>();
    class ClientAction extends Component<{}, OdooEnv> {
      static template = tags.xml`
        <div class="test_client_action">
          ClientAction_<t t-esc="props.action.params?.description" />
        </div>`;
    }
    actionsRegistry.add("clientAction", ClientAction);
    baseConfig.actionRegistry = actionsRegistry;
  });

  QUnit.module("Basic rendering");

  QUnit.test("can display client actions in Dialog", async function (assert) {
    assert.expect(2);

    const env = await makeTestEnv(baseConfig);
    const webClient = await mount(WebClient, { env });
    env.services.action_manager.doAction({
      name: "Dialog Test",
      target: "new",
      tag: "clientAction",
      type: "ir.actions.client",
    });
    await nextTick();
    assert.containsOnce(webClient, ".modal .test_client_action");
    assert.strictEqual(webClient.el!.querySelector(".modal-title")!.textContent, "Dialog Test");
    webClient.destroy();
  });

  QUnit.test("can display client actions as main, then in Dialog", async function (assert) {
    assert.expect(3);

    const env = await makeTestEnv(baseConfig);
    const webClient = await mount(WebClient, { env });

    env.services.action_manager.doAction("clientAction");
    await nextTick();
    assert.containsOnce(webClient, ".o_action_manager .test_client_action");
    env.services.action_manager.doAction({
      target: "new",
      tag: "clientAction",
      type: "ir.actions.client",
    });
    await nextTick();
    assert.containsOnce(webClient, ".o_action_manager .test_client_action");
    assert.containsOnce(webClient, ".modal .test_client_action");
    webClient.destroy();
  });

  QUnit.test(
    "can display client actions in Dialog, then as main destroys Dialog",
    async function (assert) {
      assert.expect(4);

      const env = await makeTestEnv(baseConfig);
      const webClient = await mount(WebClient, { env });
      env.services.action_manager.doAction({
        target: "new",
        tag: "clientAction",
        type: "ir.actions.client",
      });
      await nextTick();
      assert.containsOnce(webClient, ".test_client_action");
      assert.containsOnce(webClient, ".modal .test_client_action");
      env.services.action_manager.doAction("clientAction");
      await nextTick();
      assert.containsOnce(webClient, ".test_client_action");
      assert.containsNone(webClient, ".modal .test_client_action");
      webClient.destroy();
    }
  );

  QUnit.module("load router state");

  QUnit.test("action loading", async (assert) => {
    assert.expect(2);

    const env = await makeTestEnv(baseConfig);
    const webClient = await mount(WebClient, { env });
    env.bus.trigger("test:hashchange", {
      action: 1001,
    });
    await nextTick();
    await nextTick();
    assert.containsOnce(webClient, ".test_client_action");
    assert.strictEqual(webClient.el!.querySelector(".o_menu_brand")!.textContent, "App1");
    webClient.destroy();
  });

  QUnit.test("menu loading", async (assert) => {
    assert.expect(2);

    const env = await makeTestEnv(baseConfig);
    const webClient = await mount(WebClient, { env });
    env.bus.trigger("test:hashchange", {
      menu_id: 2,
    });
    await nextTick();
    await nextTick();
    assert.strictEqual(
      webClient.el!.querySelector(".test_client_action")!.textContent!.trim(),
      "ClientAction_Id 2"
    );
    assert.strictEqual(webClient.el!.querySelector(".o_menu_brand")!.textContent, "App2");
    webClient.destroy();
  });

  QUnit.test("action and menu loading", async (assert) => {
    assert.expect(2);

    const env = await makeTestEnv(baseConfig);
    const webClient = await mount(WebClient, { env });
    env.bus.trigger("test:hashchange", {
      action: 1001,
      menu_id: 2,
    });
    await nextTick();
    await nextTick();
    assert.strictEqual(
      webClient.el!.querySelector(".test_client_action")!.textContent!.trim(),
      "ClientAction_Id 1"
    );
    assert.strictEqual(webClient.el!.querySelector(".o_menu_brand")!.textContent, "App2");
    webClient.destroy();
  });

  QUnit.test("supports action as xmlId", async (assert) => {
    assert.expect(2);

    const env = await makeTestEnv(baseConfig);
    const webClient = await mount(WebClient, { env });
    env.bus.trigger("test:hashchange", {
      action: "wowl.client_action",
    });
    await nextTick();
    await nextTick();
    assert.strictEqual(
      webClient.el!.querySelector(".test_client_action")!.textContent!.trim(),
      "ClientAction_xmlId"
    );
    assert.containsNone(webClient, ".o_menu_brand");
    webClient.destroy();
  });

  QUnit.test("supports opening action in dialog", async (assert) => {
    assert.expect(3);

    baseConfig.serverData!.actions!["wowl.client_action"].target = "new";
    const env = await makeTestEnv(baseConfig);
    const webClient = await mount(WebClient, { env });
    env.bus.trigger("test:hashchange", {
      action: "wowl.client_action",
    });
    await nextTick();
    await nextTick();
    assert.containsOnce(webClient, ".test_client_action");
    assert.containsOnce(webClient, ".modal .test_client_action");
    assert.containsNone(webClient, ".o_menu_brand");
    webClient.destroy();
  });

  QUnit.module("push state to router");

  QUnit.test("basic action as App", async (assert) => {
    assert.expect(5);

    const env = await makeTestEnv(baseConfig);
    const webClient = await mount(WebClient, { env });
    let urlState = env.services.router.current;
    assert.deepEqual(urlState.hash, {});
    await click(webClient.el!, ".o_navbar_apps_menu button");
    await click(webClient.el!, ".o_navbar_apps_menu .o_dropdown_item:nth-child(3)");
    await nextTick();
    await nextTick();
    urlState = env.services.router.current;
    assert.strictEqual(urlState.hash.action, "1002");
    assert.strictEqual(urlState.hash.menu_id, "2");
    assert.strictEqual(
      webClient.el!.querySelector(".test_client_action")!.textContent!.trim(),
      "ClientAction_Id 2"
    );
    assert.strictEqual(webClient.el!.querySelector(".o_menu_brand")!.textContent, "App2");

    webClient.destroy();
  });

  QUnit.test("do action keeps menu in url", async (assert) => {
    assert.expect(9);

    const env = await makeTestEnv(baseConfig);
    const webClient = await mount(WebClient, { env });
    let urlState = env.services.router.current;
    assert.deepEqual(urlState.hash, {});
    await click(webClient.el!, ".o_navbar_apps_menu button");
    await click(webClient.el!, ".o_navbar_apps_menu .o_dropdown_item:nth-child(3)");
    await nextTick();
    await nextTick();
    urlState = env.services.router.current;
    assert.strictEqual(urlState.hash.action, "1002");
    assert.strictEqual(urlState.hash.menu_id, "2");
    assert.strictEqual(
      webClient.el!.querySelector(".test_client_action")!.textContent!.trim(),
      "ClientAction_Id 2"
    );
    assert.strictEqual(webClient.el!.querySelector(".o_menu_brand")!.textContent, "App2");

    env.services.action_manager.doAction(1001, { clearBreadcrumbs: true });
    await nextTick();
    await nextTick();
    urlState = env.services.router.current;
    assert.strictEqual(urlState.hash.action, "1001");
    assert.strictEqual(urlState.hash.menu_id, "2");
    assert.strictEqual(
      webClient.el!.querySelector(".test_client_action")!.textContent!.trim(),
      "ClientAction_Id 1"
    );
    assert.strictEqual(webClient.el!.querySelector(".o_menu_brand")!.textContent, "App2");

    webClient.destroy();
  });

  QUnit.test("actions can push state", async (assert) => {
    assert.expect(5);
    class ClientActionPushes extends Component<{}, OdooEnv> {
      static template = tags.xml`
      <div class="test_client_action" t-on-click="_actionPushState">
        ClientAction_<t t-esc="props.params?.description" />
      </div>`;
      router = useService("router");
      _actionPushState() {
        this.router.pushState({ arbitrary: "actionPushed" });
      }
    }
    baseConfig.actionRegistry!.add("client_action_pushes", ClientActionPushes);

    const env = await makeTestEnv(baseConfig);
    const webClient = await mount(WebClient, { env });
    let urlState = env.services.router.current;
    assert.deepEqual(urlState.hash, {});
    env.services.action_manager.doAction("client_action_pushes");
    await nextTick();
    await nextTick();
    urlState = env.services.router.current;
    assert.strictEqual(urlState.hash.action, "client_action_pushes");
    assert.strictEqual(urlState.hash.menu_id, undefined);
    await click(webClient.el!, ".test_client_action");
    urlState = env.services.router.current;
    assert.strictEqual(urlState.hash.action, "client_action_pushes");
    assert.strictEqual(urlState.hash.arbitrary, "actionPushed");

    webClient.destroy();
  });

  QUnit.test("actions override previous state", async (assert) => {
    assert.expect(5);
    class ClientActionPushes extends Component<{}, OdooEnv> {
      static template = tags.xml`
      <div class="test_client_action" t-on-click="_actionPushState">
        ClientAction_<t t-esc="props.params?.description" />
      </div>`;
      router = useService("router");
      _actionPushState() {
        this.router.pushState({ arbitrary: "actionPushed" });
      }
    }
    baseConfig.actionRegistry!.add("client_action_pushes", ClientActionPushes);

    const env = await makeTestEnv(baseConfig);
    const webClient = await mount(WebClient, { env });
    let urlState = env.services.router.current;
    assert.deepEqual(urlState.hash, {});
    env.services.action_manager.doAction("client_action_pushes");
    await nextTick();
    await nextTick();
    await click(webClient.el!, ".test_client_action");
    urlState = env.services.router.current;
    assert.strictEqual(urlState.hash.action, "client_action_pushes");
    assert.strictEqual(urlState.hash.arbitrary, "actionPushed");
    env.services.action_manager.doAction(1001);
    await nextTick();
    await nextTick();
    urlState = env.services.router.current;
    assert.strictEqual(urlState.hash.action, "1001");
    assert.strictEqual(urlState.hash.arbitrary, undefined);

    webClient.destroy();
  });

  QUnit.test("actions override previous state from menu click", async (assert) => {
    assert.expect(3);
    class ClientActionPushes extends Component<{}, OdooEnv> {
      static template = tags.xml`
      <div class="test_client_action" t-on-click="_actionPushState">
        ClientAction_<t t-esc="props.params?.description" />
      </div>`;
      router = useService("router");
      _actionPushState() {
        this.router.pushState({ arbitrary: "actionPushed" });
      }
    }
    baseConfig.actionRegistry!.add("client_action_pushes", ClientActionPushes);

    const env = await makeTestEnv(baseConfig);
    const webClient = await mount(WebClient, { env });
    let urlState = env.services.router.current;
    assert.deepEqual(urlState.hash, {});
    env.services.action_manager.doAction("client_action_pushes");
    await nextTick();
    await nextTick();
    await click(webClient.el!, ".test_client_action");
    await click(webClient.el!, ".o_navbar_apps_menu button");
    await click(webClient.el!, ".o_navbar_apps_menu .o_dropdown_item:nth-child(3)");
    await nextTick();
    await nextTick();
    urlState = env.services.router.current;
    assert.strictEqual(urlState.hash.action, "1002");
    assert.strictEqual(urlState.hash.menu_id, "2");

    webClient.destroy();
  });

  QUnit.test("action in target new do not push state", async (assert) => {
    assert.expect(1);

    baseConfig.serverData!.actions![1001].target = "new";
    baseConfig.serviceRegistry!.add(
      "router",
      makeFakeRouterService({
        onPushState(mode, newState) {
          throw new Error("should not push state");
        },
      }),
      true
    );
    const env = await makeTestEnv(baseConfig);
    const webClient = await mount(WebClient, { env });
    await env.services.action_manager.doAction(1001);
    assert.containsOnce(webClient, ".modal .test_client_action");

    webClient.destroy();
  });
});

QUnit.module("Action Manager Legacy Tests Porting", (hooks) => {
  hooks.before(() => {
    const legacy = getLegacy() as any;
    AbstractAction = legacy.AbstractAction;
    core = legacy.core;
    ListController = legacy.ListController;
    testUtils = legacy.testUtils;
    cpHelpers = testUtils.controlPanel;
    Widget = legacy.Widget;
    ReportClientAction = legacy.ReportClientAction;
  });

  hooks.beforeEach(async (assert) => {
    baseConfig = beforeEachActionManager();
    baseConfig.actionRegistry = actionRegistry;
    baseConfig.viewRegistry = viewRegistry;
  });

  QUnit.module("Misc");

  QUnit.test("no widget memory leaks when doing some action stuff", async function (assert) {
    assert.expect(1);

    let delta = 0;
    testUtils.mock.patch(Widget, {
      init: function () {
        delta++;
        this._super.apply(this, arguments);
      },
      destroy: function () {
        delta--;
        this._super.apply(this, arguments);
      },
    });

    const webClient = await createWebClient({ baseConfig });
    await doAction(webClient, 8);

    const n = delta;
    await doAction(webClient, 4);

    // kanban view is loaded, switch to list view
    await cpHelpers.switchView(webClient.el, "list");
    await legacyExtraNextTick();
    // open a record in form view
    await testUtils.dom.click(webClient.el!.querySelector(".o_list_view .o_data_row"));
    await legacyExtraNextTick();
    // go back to action 7 in breadcrumbs
    await testUtils.dom.click(webClient.el!.querySelector(".o_control_panel .breadcrumb a"));
    await legacyExtraNextTick();

    assert.strictEqual(delta, n, "should have properly destroyed all other widgets");
    webClient.destroy();
    testUtils.mock.unpatch(Widget);
  });

  QUnit.test("no widget memory leaks when executing actions in dialog", async function (assert) {
    assert.expect(1);

    let delta = 0;
    testUtils.mock.patch(Widget, {
      init: function () {
        delta++;
        this._super.apply(this, arguments);
      },
      destroy: function () {
        if (!this.isDestroyed()) {
          delta--;
        }
        this._super.apply(this, arguments);
      },
    });

    const webClient = await createWebClient({ baseConfig });
    const n = delta;

    await doAction(webClient, 5);
    await doAction(webClient, { type: "ir.actions.act_window_close" });

    assert.strictEqual(delta, n, "should have properly destroyed all widgets");

    webClient.destroy();
    testUtils.mock.unpatch(Widget);
  });

  QUnit.test(
    "no memory leaks when executing an action while switching view",
    async function (assert) {
      assert.expect(1);

      let def: any;
      let delta = 0;
      testUtils.mock.patch(Widget, {
        init: function () {
          delta += 1;
          this._super.apply(this, arguments);
        },
        destroy: function () {
          delta -= 1;
          this._super.apply(this, arguments);
        },
      });

      const mockRPC: RPC = async function (route, args) {
        if (args && args.method === "read") {
          await Promise.resolve(def);
        }
      };
      const webClient = await createWebClient({ baseConfig, mockRPC });

      await doAction(webClient, 4);
      const n = delta;

      await doAction(webClient, 3, { clearBreadcrumbs: true });

      // switch to the form view (this request is blocked)
      def = testUtils.makeTestPromise();
      await testUtils.dom.click(webClient.el!.querySelector(".o_list_view .o_data_row"));

      // execute another action meanwhile (don't block this request)
      await doAction(webClient, 4, { clearBreadcrumbs: true });

      // unblock the switch to the form view in action 3
      def.resolve();
      await testUtils.nextTick();

      assert.strictEqual(n, delta, "all widgets of action 3 should have been destroyed");

      webClient.destroy();
      testUtils.mock.unpatch(Widget);
    }
  );

  QUnit.test(
    "no memory leaks when executing an action while loading views",
    async function (assert) {
      assert.expect(1);

      let def: any;
      let delta = 0;
      testUtils.mock.patch(Widget, {
        init: function () {
          delta += 1;
          this._super.apply(this, arguments);
        },
        destroy: function () {
          delta -= 1;
          this._super.apply(this, arguments);
        },
      });

      const mockRPC: RPC = async function (route, args) {
        if (args && args.method === "load_views") {
          await Promise.resolve(def);
        }
      };
      const webClient = await createWebClient({ baseConfig, mockRPC });

      // execute action 4 to know the number of widgets it instantiates
      await doAction(webClient, 4);
      const n = delta;

      // execute a first action (its 'load_views' RPC is blocked)
      def = testUtils.makeTestPromise();
      doAction(webClient, 3, { clearBreadcrumbs: true });
      await testUtils.nextTick();
      await legacyExtraNextTick();

      // execute another action meanwhile (and unlock the RPC)
      doAction(webClient, 4, { clearBreadcrumbs: true });
      def.resolve();
      await testUtils.nextTick();
      await legacyExtraNextTick();

      assert.strictEqual(n, delta, "all widgets of action 3 should have been destroyed");

      webClient.destroy();
      testUtils.mock.unpatch(Widget);
    }
  );

  QUnit.test(
    "no memory leaks when executing an action while loading data of default view",
    async function (assert) {
      assert.expect(1);

      let def: any;
      let delta = 0;
      testUtils.mock.patch(Widget, {
        init: function () {
          delta += 1;
          this._super.apply(this, arguments);
        },
        destroy: function () {
          delta -= 1;
          this._super.apply(this, arguments);
        },
      });

      const mockRPC: RPC = async function (route, args) {
        if (route === "/web/dataset/search_read") {
          await Promise.resolve(def);
        }
      };
      const webClient = await createWebClient({ baseConfig, mockRPC });

      // execute action 4 to know the number of widgets it instantiates
      await doAction(webClient, 4);
      const n = delta;

      // execute a first action (its 'search_read' RPC is blocked)
      def = testUtils.makeTestPromise();
      doAction(webClient, 3, { clearBreadcrumbs: true });
      await testUtils.nextTick();
      await legacyExtraNextTick();

      // execute another action meanwhile (and unlock the RPC)
      doAction(webClient, 4, { clearBreadcrumbs: true });
      def.resolve();
      await testUtils.nextTick();
      await legacyExtraNextTick();

      assert.strictEqual(n, delta, "all widgets of action 3 should have been destroyed");

      webClient.destroy();
      testUtils.mock.unpatch(Widget);
    }
  );

  QUnit.test('action with "no_breadcrumbs" set to true', async function (assert) {
    assert.expect(2);

    baseConfig.serverData!.actions![4].context = { no_breadcrumbs: true };
    const webClient = await createWebClient({
      baseConfig,
    });
    await doAction(webClient, 3);
    assert.containsOnce(webClient, ".o_control_panel .breadcrumb-item");

    // push another action flagged with 'no_breadcrumbs=true'
    await doAction(webClient, 4);
    assert.containsNone(webClient, ".o_control_panel .breadcrumb-item");

    webClient.destroy();
  });

  QUnit.test("document's title is updated when an action is executed", async function (assert) {
    assert.expect(8);

    const defaultTitle: any = { zopenerp: "Odoo" };

    const webClient = await createWebClient({ baseConfig });
    let currentTitle = webClient.env.services.title.getParts();
    assert.deepEqual(currentTitle, defaultTitle);
    let currentHash = webClient.env.services.router.current.hash;
    assert.deepEqual(currentHash, {});

    await doAction(webClient, 4);
    currentTitle = webClient.env.services.title.getParts();
    assert.deepEqual(currentTitle, {
      ...defaultTitle,
      action: "Partners Action 4",
    });
    currentHash = webClient.env.services.router.current.hash;
    assert.deepEqual(currentHash, { action: "4", model: "partner", view_type: "kanban" });

    await doAction(webClient, 8);
    currentTitle = webClient.env.services.title.getParts();
    assert.deepEqual(currentTitle, {
      ...defaultTitle,
      action: "Favorite Ponies",
    });
    currentHash = webClient.env.services.router.current.hash;
    assert.deepEqual(currentHash, { action: "8", model: "pony", view_type: "list" });

    await testUtils.dom.click($(webClient.el!).find("tr.o_data_row:first"));
    await legacyExtraNextTick();
    currentTitle = webClient.env.services.title.getParts();
    assert.deepEqual(currentTitle, {
      ...defaultTitle,
      action: "Twilight Sparkle",
    });
    currentHash = webClient.env.services.router.current.hash;
    assert.deepEqual(currentHash, { action: "8", id: "4", model: "pony", view_type: "form" });

    webClient.destroy();
  });

  QUnit.test("on_reverse_breadcrumb handler is correctly called (legacy)", async function (assert) {
    // This test can be removed as soon as we no longer support legacy actions as the new
    // ActionManager doesn't support this option. Indeed, it is used to reload the previous
    // action when coming back, but we won't need such an artefact to that with Wowl, as the
    // controller will be re-instantiated with an (exported) state given in props.
    assert.expect(5);

    const ClientAction = AbstractAction.extend({
      events: {
        "click button": "_onClick",
      },
      start() {
        this.$el.html('<button class="my_button">Execute another action</button>');
      },
      _onClick() {
        this.do_action(4, {
          on_reverse_breadcrumb: () => assert.step("on_reverse_breadcrumb"),
        });
      },
    });
    core.action_registry.add("ClientAction", ClientAction);

    const webClient = await createWebClient({ baseConfig });

    await doAction(webClient, "ClientAction");

    assert.containsOnce(webClient, ".my_button");

    await testUtils.dom.click(webClient.el!.querySelector(".my_button"));
    await legacyExtraNextTick();

    assert.containsOnce(webClient, ".o_kanban_view");

    await testUtils.dom.click($(webClient.el!).find(".o_control_panel .breadcrumb a:first"));
    await legacyExtraNextTick();

    assert.containsOnce(webClient, ".my_button");
    assert.verifySteps(["on_reverse_breadcrumb"]);

    webClient.destroy();
    delete core.action_registry.map.ClientAction;
    baseConfig.actionRegistry!.remove("ClientAction");
  });

  QUnit.test('handles "history_back" event', async function (assert) {
    assert.expect(3);

    const webClient = await createWebClient({ baseConfig });

    await doAction(webClient, 4);
    await doAction(webClient, 3);
    assert.containsN(webClient, ".o_control_panel .breadcrumb-item", 2);

    // simulate an "history-back" event
    const ev = new Event("history-back", { bubbles: true, cancelable: true });
    webClient.el!.querySelector(".o_view_controller")!.dispatchEvent(ev);
    await testUtils.nextTick();
    await legacyExtraNextTick();
    assert.containsOnce(webClient, ".o_control_panel .breadcrumb-item");
    assert.strictEqual(
      $(webClient.el!).find(".o_control_panel .breadcrumb-item").text(),
      "Partners Action 4",
      "breadcrumbs should display the display_name of the action"
    );

    webClient.destroy();
  });

  QUnit.test("stores and restores scroll position", async function (assert) {
    assert.expect(3);

    for (let i = 0; i < 60; i++) {
      baseConfig.serverData!.models!.partner.records.push({ id: 100 + i, foo: `Record ${i}` });
    }

    const webClient = await createWebClient({ baseConfig });
    webClient.el!.style.height = "250px";

    // execute a first action
    await doAction(webClient, 3);
    assert.strictEqual(webClient.el!.querySelector(".o_content")!.scrollTop, 0);

    // simulate a scroll
    webClient.el!.querySelector(".o_content")!.scrollTop = 100;

    // execute a second action (in which we don't scroll)
    await doAction(webClient, 4);
    assert.strictEqual(webClient.el!.querySelector(".o_content")!.scrollTop, 0);

    // go back using the breadcrumbs
    await testUtils.dom.click($(webClient.el!).find(".o_control_panel .breadcrumb a"));
    await legacyExtraNextTick();
    assert.strictEqual(webClient.el!.querySelector(".o_content")!.scrollTop, 100);

    webClient.destroy();
  });

  QUnit.test(
    'executing an action with target != "new" closes all dialogs',
    async function (assert) {
      assert.expect(4);

      baseConfig.serverData!.views!["partner,false,form"] = `
      <form>
        <field name="o2m">
          <tree><field name="foo"/></tree>
          <form><field name="foo"/></form>
        </field>
      </form>`;

      const webClient = await createWebClient({ baseConfig });

      await doAction(webClient, 3);
      assert.containsOnce(webClient, ".o_list_view");

      await testUtils.dom.click($(webClient.el!).find(".o_list_view .o_data_row:first"));
      await legacyExtraNextTick();
      assert.containsOnce(webClient, ".o_form_view");

      await testUtils.dom.click($(webClient.el!).find(".o_form_view .o_data_row:first"));
      await legacyExtraNextTick();
      assert.containsOnce(document.body, ".modal .o_form_view");

      await doAction(webClient, 1); // target != 'new'
      assert.containsNone(document.body, ".modal");

      webClient.destroy();
    }
  );

  QUnit.test(
    'executing an action with target "new" does not close dialogs',
    async function (assert) {
      assert.expect(4);

      baseConfig.serverData!.views!["partner,false,form"] = `
      <form>
        <field name="o2m">
          <tree><field name="foo"/></tree>
          <form><field name="foo"/></form>
        </field>
      </form>`;

      const webClient = await createWebClient({ baseConfig });

      await doAction(webClient, 3);
      assert.containsOnce(webClient, ".o_list_view");

      await testUtils.dom.click($(webClient.el!).find(".o_list_view .o_data_row:first"));
      await legacyExtraNextTick();
      assert.containsOnce(webClient, ".o_form_view");

      await testUtils.dom.click($(webClient.el!).find(".o_form_view .o_data_row:first"));
      await legacyExtraNextTick();
      assert.containsOnce(document.body, ".modal .o_form_view");

      await doAction(webClient, 5); // target 'new'
      assert.containsN(document.body, ".modal .o_form_view", 2);

      webClient.destroy();
    }
  );

  QUnit.module("Push State");

  QUnit.test("properly push state", async function (assert) {
    assert.expect(3);

    const webClient = await createWebClient({ baseConfig });

    await doAction(webClient, 4);
    assert.deepEqual(webClient.env.services.router.current.hash, {
      action: "4",
      model: "partner",
      view_type: "kanban",
    });

    await doAction(webClient, 8);
    assert.deepEqual(webClient.env.services.router.current.hash, {
      action: "8",
      model: "pony",
      view_type: "list",
    });

    await testUtils.dom.click($(webClient.el!).find("tr.o_data_row:first"));
    await legacyExtraNextTick();
    assert.deepEqual(webClient.env.services.router.current.hash, {
      action: "8",
      model: "pony",
      view_type: "form",
      id: "4",
    });

    webClient.destroy();
  });

  QUnit.test("push state after action is loaded, not before", async function (assert) {
    assert.expect(2);

    const def = testUtils.makeTestPromise();
    const mockRPC: RPC = async function (route, args) {
      if (route === "/web/dataset/search_read") {
        await def;
      }
    };
    const webClient = await createWebClient({ baseConfig, mockRPC });

    doAction(webClient, 4);
    await testUtils.nextTick();
    await legacyExtraNextTick();

    assert.deepEqual(webClient.env.services.router.current.hash, {});

    def.resolve();
    await testUtils.nextTick();
    await legacyExtraNextTick();

    assert.deepEqual(webClient.env.services.router.current.hash, {
      action: "4",
      model: "partner",
      view_type: "kanban",
    });

    webClient.destroy();
  });

  QUnit.test("do not push state when action fails", async function (assert) {
    assert.expect(3);

    const mockRPC: RPC = async function (route, args) {
      if (args && args.method === "read") {
        return Promise.reject();
      }
    };
    const webClient = await createWebClient({ baseConfig, mockRPC });

    await doAction(webClient, 8);
    assert.deepEqual(webClient.env.services.router.current.hash, {
      action: "8",
      model: "pony",
      view_type: "list",
    });

    await testUtils.dom.click($(webClient.el!).find("tr.o_data_row:first"));
    await legacyExtraNextTick();
    // we make sure here that the list view is still in the dom
    assert.containsOnce(webClient, ".o_list_view", "there should still be a list view in dom");
    assert.deepEqual(webClient.env.services.router.current.hash, {
      action: "8",
      model: "pony",
      view_type: "list",
    });

    webClient.destroy();
  });

  QUnit.module("Load State");

  QUnit.test("should not crash on invalid state", async function (assert) {
    assert.expect(3);

    const mockRPC: RPC = async function (route, args) {
      assert.step((args && args.method) || route);
    };
    const webClient = await createWebClient({ baseConfig, mockRPC });

    await loadState(webClient, {
      res_model: "partner", // the valid key for the model is 'model', not 'res_model'
    });

    assert.strictEqual($(webClient.el!).text(), "", "should display nothing");
    assert.verifySteps(["/wowl/load_menus"]);

    webClient.destroy();
  });

  QUnit.test("properly load client actions", async function (assert) {
    assert.expect(3);

    class ClientAction extends Component<{}, OdooEnv> {
      static template = tags.xml`<div class="o_client_action_test">Hello World</div>`;
    }
    baseConfig!.actionRegistry!.add("HelloWorldTest", ClientAction);

    const mockRPC: RPC = async function (route, args) {
      assert.step((args && args.method) || route);
    };
    const webClient = await createWebClient({ baseConfig, mockRPC });

    webClient.env.bus.trigger("test:hashchange", {
      action: "HelloWorldTest",
    });

    await testUtils.nextTick();

    assert.strictEqual(
      $(webClient.el!).find(".o_client_action_test").text(),
      "Hello World",
      "should have correctly rendered the client action"
    );
    assert.verifySteps(["/wowl/load_menus"]);

    webClient.destroy();
    baseConfig!.actionRegistry!.remove("HelloWorldTest");
  });

  QUnit.test("properly load act window actions", async function (assert) {
    assert.expect(7);

    const mockRPC: RPC = async function (route, args) {
      assert.step((args && args.method) || route);
    };
    const webClient = await createWebClient({ baseConfig, mockRPC });
    webClient.env.bus.trigger("test:hashchange", {
      action: 1,
    });
    await testUtils.nextTick();
    await legacyExtraNextTick();

    assert.containsOnce(webClient, ".o_control_panel");
    assert.containsOnce(webClient, ".o_kanban_view");

    assert.verifySteps([
      "/wowl/load_menus",
      "/web/action/load",
      "load_views",
      "/web/dataset/search_read",
    ]);

    webClient.destroy();
  });

  QUnit.test("properly load records", async function (assert) {
    assert.expect(6);

    const mockRPC: RPC = async function (route, args) {
      assert.step((args && args.method) || route);
    };
    const webClient = await createWebClient({ baseConfig, mockRPC });
    webClient.env.bus.trigger("test:hashchange", {
      id: 2,
      model: "partner",
    });
    await testUtils.nextTick();
    await legacyExtraNextTick();

    assert.containsOnce(webClient, ".o_form_view");
    assert.strictEqual(
      $(webClient.el!).find(".o_control_panel .breadcrumb-item").text(),
      "Second record",
      "should have opened the second record"
    );

    assert.verifySteps(["/wowl/load_menus", "load_views", "read"]);

    webClient.destroy();
  });

  QUnit.test("properly load default record", async function (assert) {
    assert.expect(6);

    const mockRPC: RPC = async function (route, args) {
      assert.step((args && args.method) || route);
    };
    const webClient = await createWebClient({ baseConfig, mockRPC });
    webClient.env.bus.trigger("test:hashchange", {
      action: 3,
      id: "", // might happen with bbq and id=& in URL
      model: "partner",
      view_type: "form",
    });
    await testUtils.nextTick();
    await legacyExtraNextTick();

    assert.containsOnce(webClient, ".o_form_view");

    assert.verifySteps(["/wowl/load_menus", "/web/action/load", "load_views", "onchange"]);

    webClient.destroy();
  });

  QUnit.test("load requested view for act window actions", async function (assert) {
    assert.expect(7);

    const mockRPC: RPC = async function (route, args) {
      assert.step((args && args.method) || route);
    };
    const webClient = await createWebClient({ baseConfig, mockRPC });
    webClient.env.bus.trigger("test:hashchange", {
      action: 3,
      view_type: "kanban",
    });
    await testUtils.nextTick();
    await legacyExtraNextTick();

    assert.containsNone(webClient, ".o_list_view");
    assert.containsOnce(webClient, ".o_kanban_view");

    assert.verifySteps([
      "/wowl/load_menus",
      "/web/action/load",
      "load_views",
      "/web/dataset/search_read",
    ]);

    webClient.destroy();
  });

  QUnit.test(
    "lazy load multi record view if mono record one is requested",
    async function (assert) {
      assert.expect(12);

      const mockRPC: RPC = async function (route, args) {
        assert.step((args && args.method) || route);
      };
      const webClient = await createWebClient({ baseConfig, mockRPC });
      webClient.env.bus.trigger("test:hashchange", {
        action: 3,
        id: 2,
        view_type: "form",
      });
      await testUtils.nextTick();
      await legacyExtraNextTick();

      assert.containsNone(webClient, ".o_list_view");
      assert.containsOnce(webClient, ".o_form_view");
      assert.containsN(webClient, ".o_control_panel .breadcrumb-item", 2);
      assert.strictEqual(
        $(webClient.el!).find(".o_control_panel .breadcrumb-item:last").text(),
        "Second record",
        "breadcrumbs should contain the display_name of the opened record"
      );

      // go back to Lst
      await testUtils.dom.click($(webClient.el!).find(".o_control_panel .breadcrumb a"));
      await legacyExtraNextTick();
      assert.containsOnce(webClient, ".o_list_view");
      assert.containsNone(webClient, ".o_form_view");

      assert.verifySteps([
        "/wowl/load_menus",
        "/web/action/load",
        "load_views",
        "read", // read the opened record
        "/web/dataset/search_read", // search read when coming back to List
      ]);

      webClient.destroy();
    }
  );

  QUnit.test("lazy load multi record view with previous action", async function (assert) {
    assert.expect(6);

    const webClient = await createWebClient({ baseConfig });
    await doAction(webClient, 4);

    assert.containsOnce(
      webClient.el!,
      ".o_control_panel .breadcrumb li",
      "there should be one controller in the breadcrumbs"
    );
    assert.strictEqual(
      $(webClient.el!).find(".o_control_panel .breadcrumb li").text(),
      "Partners Action 4",
      "breadcrumbs should contain the display_name of the opened record"
    );

    await doAction(webClient, 3, {
      resId: 2,
      viewType: "form",
    });

    assert.containsN(
      webClient.el!,
      ".o_control_panel .breadcrumb li",
      3,
      "there should be three controllers in the breadcrumbs"
    );
    assert.strictEqual(
      $(webClient.el!).find(".o_control_panel .breadcrumb li").text(),
      "Partners Action 4PartnersSecond record",
      "the breadcrumb elements should be correctly ordered"
    );

    // go back to List
    await testUtils.dom.click($(webClient.el!).find(".o_control_panel .breadcrumb a:last"));
    await legacyExtraNextTick();

    assert.containsN(
      webClient.el!,
      ".o_control_panel .breadcrumb li",
      2,
      "there should be two controllers in the breadcrumbs"
    );
    assert.strictEqual(
      $(webClient.el!).find(".o_control_panel .breadcrumb li").text(),
      "Partners Action 4Partners",
      "the breadcrumb elements should be correctly ordered"
    );

    webClient.destroy();
  });

  QUnit.test("lazy loaded multi record view with failing mono record one", async function (assert) {
    assert.expect(3);

    const mockRPC: RPC = async function (route, args) {
      if (args && args.method === "read") {
        return Promise.reject();
      }
    };
    const webClient = await createWebClient({ baseConfig, mockRPC });

    await loadState(webClient, {
      action: "3",
      id: "2",
      view_type: "form",
    });

    assert.containsNone(webClient, ".o_form_view");
    assert.containsNone(webClient, ".o_list_view");

    await doAction(webClient, 1);

    assert.containsOnce(webClient, ".o_kanban_view");

    webClient.destroy();
  });

  QUnit.test("change the viewType of the current action", async function (assert) {
    assert.expect(14);

    const mockRPC: RPC = async function (route, args) {
      assert.step((args && args.method) || route);
    };
    const webClient = await createWebClient({ baseConfig, mockRPC });
    await doAction(webClient, 3);

    assert.containsOnce(webClient, ".o_list_view");

    // switch to kanban view
    webClient.env.bus.trigger("test:hashchange", {
      action: 3,
      view_type: "kanban",
    });
    await testUtils.nextTick();
    await legacyExtraNextTick();

    assert.containsNone(webClient, ".o_list_view");
    assert.containsOnce(webClient, ".o_kanban_view");

    // switch to form view, open record 4
    webClient.env.bus.trigger("test:hashchange", {
      action: 3,
      id: 4,
      view_type: "form",
    });
    await testUtils.nextTick();
    await legacyExtraNextTick();

    assert.containsNone(webClient, ".o_kanban_view");
    assert.containsOnce(webClient, ".o_form_view");
    assert.containsN(
      webClient.el!,
      ".o_control_panel .breadcrumb-item",
      2,
      "there should be two controllers in the breadcrumbs"
    );
    assert.strictEqual(
      $(webClient.el!).find(".o_control_panel .breadcrumb-item:last").text(),
      "Fourth record",
      "should have opened the requested record"
    );

    // verify steps to ensure that the whole action hasn't been re-executed
    // (if it would have been, /web/action/load and load_views would appear
    // several times)
    assert.verifySteps([
      "/wowl/load_menus",
      "/web/action/load",
      "load_views",
      "/web/dataset/search_read", // list view
      "/web/dataset/search_read", // kanban view
      "read", // form view
    ]);

    webClient.destroy();
  });

  QUnit.test("change the id of the current action", async function (assert) {
    assert.expect(12);

    const mockRPC: RPC = async function (route, args) {
      assert.step((args && args.method) || route);
    };
    const webClient = await createWebClient({ baseConfig, mockRPC });

    // execute action 3 and open the first record in a form view
    await doAction(webClient, 3);
    await testUtils.dom.click($(webClient.el!).find(".o_list_view .o_data_row:first"));
    await legacyExtraNextTick();

    assert.containsOnce(webClient, ".o_form_view");
    assert.strictEqual(
      $(webClient.el!).find(".o_control_panel .breadcrumb-item:last").text(),
      "First record",
      "should have opened the first record"
    );

    // switch to record 4
    webClient.env.bus.trigger("test:hashchange", {
      action: 3,
      id: 4,
      view_type: "form",
    });
    await testUtils.nextTick();
    await legacyExtraNextTick();

    assert.containsOnce(webClient, ".o_form_view");
    assert.containsN(
      webClient.el!,
      ".o_control_panel .breadcrumb-item",
      2,
      "there should be two controllers in the breadcrumbs"
    );
    assert.strictEqual(
      $(webClient.el!).find(".o_control_panel .breadcrumb-item:last").text(),
      "Fourth record",
      "should have switched to the requested record"
    );

    // verify steps to ensure that the whole action hasn't been re-executed
    // (if it would have been, /web/action/load and load_views would appear
    // twice)
    assert.verifySteps([
      "/wowl/load_menus",
      "/web/action/load",
      "load_views",
      "/web/dataset/search_read", // list view
      "read", // form view, record 1
      "read", // form view, record 4
    ]);

    webClient.destroy();
  });

  QUnit.test("should push the correct state at the right time", async function (assert) {
    // formerly "should not push a loaded state"
    assert.expect(7);

    baseConfig.serviceRegistry!.add(
      "router",
      makeFakeRouterService({
        onPushState() {
          assert.step("push_state");
        },
      }),
      true
    );

    const webClient = await createWebClient({ baseConfig });
    let currentHash = webClient.env.services.router.current.hash;
    assert.deepEqual(currentHash, {});

    await loadState(webClient, { action: "3" });
    currentHash = webClient.env.services.router.current.hash;
    assert.deepEqual(currentHash, {
      action: "3",
      model: "partner",
      view_type: "list",
    });
    assert.verifySteps(["push_state"], "should have pushed the final state");

    await testUtils.dom.click($(webClient.el!).find("tr.o_data_row:first"));
    await legacyExtraNextTick();
    currentHash = webClient.env.services.router.current.hash;
    assert.deepEqual(currentHash, {
      action: "3",
      id: "1",
      model: "partner",
      view_type: "form",
    });

    assert.verifySteps(["push_state"], "should push the state of it changes afterwards");

    webClient.destroy();
  });

  QUnit.test("should not push a loaded state of a legacy client action", async function (assert) {
    assert.expect(6);

    const ClientAction = AbstractAction.extend({
      init: function (parent: any, action: any, options: any) {
        this._super.apply(this, arguments);
        this.controllerID = options.controllerID;
      },
      start: function () {
        const $button = $("<button id='client_action_button'>").text("Click Me!");
        $button.on("click", () => {
          this.trigger_up("push_state", {
            controllerID: this.controllerID,
            state: { someValue: "X" },
          });
        });
        this.$el.append($button);
        return this._super.apply(this, arguments);
      },
    });
    core.action_registry.add("ClientAction", ClientAction);

    baseConfig.serviceRegistry!.add(
      "router",
      makeFakeRouterService({
        onPushState() {
          assert.step("push_state");
        },
      }),
      true
    );

    const webClient = await createWebClient({ baseConfig });
    let currentHash = webClient.env.services.router.current.hash;
    assert.deepEqual(currentHash, {});
    await loadState(webClient, { action: "9" });
    currentHash = webClient.env.services.router.current.hash;
    assert.deepEqual(currentHash, {
      action: "9",
    });
    assert.verifySteps([], "should not push the loaded state");

    await testUtils.dom.click($(webClient.el!).find("#client_action_button"));
    await legacyExtraNextTick();
    assert.verifySteps(["push_state"], "should push the state of it changes afterwards");
    currentHash = webClient.env.services.router.current.hash;
    assert.deepEqual(currentHash, {
      action: "9",
      someValue: "X",
    });

    webClient.destroy();
    baseConfig.actionRegistry!.remove("ClientAction");
    delete core.action_registry.map.ClientAction;
  });

  QUnit.test("change a param of an ir.actions.client in the url", async function (assert) {
    assert.expect(13);

    const ClientAction = AbstractAction.extend({
      hasControlPanel: true,
      init: function (parent: any, action: any) {
        this._super.apply(this, arguments);
        const context = action.context;
        this.a = (context.params && context.params.a) || "default value";
      },
      start: function () {
        assert.step("start");
        this.$(".o_content").text(this.a);
        this.$el.addClass("o_client_action");
        this.trigger_up("push_state", {
          controllerID: this.controllerID,
          state: { a: this.a },
        });
        return this._super.apply(this, arguments);
      },
    });
    core.action_registry.add("ClientAction", ClientAction);

    baseConfig.serviceRegistry!.add(
      "router",
      makeFakeRouterService({
        onPushState(mode) {
          assert.step(`push_state ${mode}`);
        },
      }),
      true
    );

    const webClient = await createWebClient({ baseConfig });
    let currentHash = webClient.env.services.router.current.hash;
    assert.deepEqual(currentHash, {});
    // execute the client action
    await doAction(webClient, 9);
    assert.verifySteps(["start", "push_state push"]);
    currentHash = webClient.env.services.router.current.hash;
    assert.deepEqual(currentHash, {
      action: "9",
      a: "default value",
    });
    assert.strictEqual(
      $(webClient.el!).find(".o_client_action .o_content").text(),
      "default value",
      "should have rendered the client action"
    );
    assert.containsN(
      webClient.el!,
      ".o_control_panel .breadcrumb-item",
      1,
      "there should be one controller in the breadcrumbs"
    );

    // update param 'a' in the url
    await loadState(webClient, {
      action: "9",
      a: "new value",
    });
    assert.verifySteps(["start", "push_state push"]);
    currentHash = webClient.env.services.router.current.hash;
    assert.deepEqual(currentHash, {
      action: "9",
      a: "new value",
    });
    assert.strictEqual(
      $(webClient.el!).find(".o_client_action .o_content").text(),
      "new value",
      "should have rerendered the client action with the correct param"
    );
    assert.containsN(
      webClient.el!,
      ".o_control_panel .breadcrumb-item",
      1,
      "there should still be one controller in the breadcrumbs"
    );

    webClient.destroy();
    delete core.action_registry.map.ClientAction;
    baseConfig.actionRegistry!.remove("ClientAction");
  });

  QUnit.test("load a window action without id (in a multi-record view)", async function (assert) {
    assert.expect(14);

    const sessionStorage = baseConfig.browser!.sessionStorage;
    baseConfig.browser!.sessionStorage = Object.assign(Object.create(sessionStorage!), {
      getItem(k: any) {
        assert.step(`getItem session ${k}`);
        return sessionStorage!.getItem(k);
      },
      setItem(k: any, v: any) {
        assert.step(`setItem session ${k}`);
        return sessionStorage!.setItem(k, v);
      },
    });

    const mockRPC: RPC = async (route, args) => {
      assert.step((args && args.method) || route);
    };
    const webClient = await createWebClient({ baseConfig, mockRPC });

    await doAction(webClient, 4);

    assert.containsOnce(webClient, ".o_kanban_view", "should display a kanban view");
    assert.strictEqual(
      $(webClient.el!).find(".o_control_panel .breadcrumb-item").text(),
      "Partners Action 4",
      "breadcrumbs should display the display_name of the action"
    );

    await loadState(webClient, {
      model: "partner",
      view_type: "list",
    });

    assert.strictEqual(
      $(webClient.el!).find(".o_control_panel .breadcrumb-item").text(),
      "Partners Action 4",
      "should still be in the same action"
    );
    assert.containsNone(webClient, ".o_kanban_view", "should no longer display a kanban view");
    assert.containsOnce(webClient, ".o_list_view", "should display a list view");

    assert.verifySteps([
      "/wowl/load_menus",
      "/web/action/load", // action 3
      "load_views", // action 3
      "/web/dataset/search_read", // action 3
      "setItem session current_action", // action 3
      "getItem session current_action", // loadState
      "/web/dataset/search_read", // loaded action
      "setItem session current_action", // loaded action
    ]);

    webClient.destroy();
  });

  QUnit.module("Concurrency management");

  QUnit.test("drop previous actions if possible", async function (assert) {
    assert.expect(7);

    const def = testUtils.makeTestPromise();
    const mockRPC: RPC = async function (route, args) {
      assert.step(route);
      if (route === "/web/action/load") {
        await def;
      }
    };
    const webClient = await createWebClient({ baseConfig, mockRPC });

    doAction(webClient, 4);
    doAction(webClient, 8);

    def.resolve();
    await testUtils.nextTick();
    await legacyExtraNextTick();

    // action 4 loads a kanban view first, 6 loads a list view. We want a list
    assert.containsOnce(webClient, ".o_list_view");

    assert.verifySteps([
      "/wowl/load_menus",
      "/web/action/load", // load action 4
      "/web/action/load", // load action 6
      "/web/dataset/call_kw/pony/load_views", // load views for action 6
      "/web/dataset/search_read", // search read for list view action 6
    ]);

    webClient.destroy();
  });

  QUnit.test("handle switching view and switching back on slow network", async function (assert) {
    assert.expect(9);

    let def = testUtils.makeTestPromise();
    const defs = [Promise.resolve(), def, Promise.resolve()];

    const mockRPC: RPC = async function (route, args) {
      assert.step(route);
      if (route === "/web/dataset/search_read") {
        await defs.shift();
      }
    };
    const webClient = await createWebClient({ baseConfig, mockRPC });
    await doAction(webClient, 4);

    // kanban view is loaded, switch to list view
    await cpHelpers.switchView(webClient.el!, "list");
    await legacyExtraNextTick();

    // here, list view is not ready yet, because def is not resolved
    // switch back to kanban view
    await cpHelpers.switchView(webClient.el!, "kanban");
    await legacyExtraNextTick();

    // here, we want the kanban view to reload itself, regardless of list view
    assert.verifySteps([
      "/wowl/load_menus",
      "/web/action/load", // initial load action
      "/web/dataset/call_kw/partner/load_views", // load views
      "/web/dataset/search_read", // search_read for kanban view
      "/web/dataset/search_read", // search_read for list view (not resolved yet)
      "/web/dataset/search_read", // search_read for kanban view reload (not resolved yet)
    ]);

    // we resolve def => list view is now ready (but we want to ignore it)
    def.resolve();
    await testUtils.nextTick();
    assert.containsOnce(webClient, ".o_kanban_view", "there should be a kanban view in dom");
    assert.containsNone(webClient, ".o_list_view", "there should not be a list view in dom");

    webClient.destroy();
  });

  QUnit.test("when an server action takes too much time...", async function (assert) {
    assert.expect(1);

    const def = testUtils.makeTestPromise();

    const mockRPC: RPC = async function (route, args) {
      if (route === "/web/action/run") {
        await def;
        return 1;
      }
    };
    const webClient = await createWebClient({ baseConfig, mockRPC });
    doAction(webClient, 2);
    doAction(webClient, 4);

    def.resolve();
    await testUtils.nextTick();
    await legacyExtraNextTick();

    assert.strictEqual(
      $(webClient.el!).find(".o_control_panel .breadcrumb-item.active").text(),
      "Partners Action 4",
      "action 4 should be loaded"
    );

    webClient.destroy();
  });

  QUnit.test("clicking quickly on breadcrumbs...", async function (assert) {
    assert.expect(1);

    let def: any;

    const mockRPC: RPC = async function (route, args) {
      if (args && args.method === "read") {
        await def;
      }
    };
    const webClient = await createWebClient({ baseConfig, mockRPC });

    // create a situation with 3 breadcrumbs: kanban/form/list
    await doAction(webClient, 4);
    await testUtils.dom.click($(webClient.el!).find(".o_kanban_record:first"));
    await legacyExtraNextTick();
    await doAction(webClient, 8);
    await legacyExtraNextTick();

    // now, the next read operations will be promise (this is the read
    // operation for the form view reload)
    def = testUtils.makeTestPromise();

    // click on the breadcrumbs for the form view, then on the kanban view
    // before the form view is fully reloaded
    await testUtils.dom.click($(webClient.el!).find(".o_control_panel .breadcrumb-item:eq(1)"));
    await legacyExtraNextTick();
    await testUtils.dom.click($(webClient.el!).find(".o_control_panel .breadcrumb-item:eq(0)"));
    await legacyExtraNextTick();

    // resolve the form view read
    def.resolve();
    await testUtils.nextTick();
    await legacyExtraNextTick();

    assert.strictEqual(
      $(webClient.el!).find(".o_control_panel .breadcrumb-item.active").text(),
      "Partners Action 4",
      "action 4 should be loaded and visible"
    );

    webClient.destroy();
  });

  QUnit.test(
    "execute a new action while loading a lazy-loaded controller",
    async function (assert) {
      assert.expect(16);

      let def: any;
      const mockRPC: RPC = async function (route, args) {
        assert.step((args && args.method) || route);
        if (route === "/web/dataset/search_read" && args && args.model === "partner") {
          await def;
        }
      };
      const webClient = await createWebClient({ baseConfig, mockRPC });

      webClient.env.bus.trigger("test:hashchange", {
        action: 4,
        id: 2,
        view_type: "form",
      });
      await testUtils.nextTick();
      await legacyExtraNextTick();

      assert.containsOnce(
        webClient.el!,
        ".o_form_view",
        "should display the form view of action 4"
      );

      // click to go back to Kanban (this request is blocked)
      def = testUtils.makeTestPromise();
      await testUtils.nextTick();
      await legacyExtraNextTick();
      await testUtils.dom.click($(webClient.el!).find(".o_control_panel .breadcrumb a"));
      await legacyExtraNextTick();

      assert.containsOnce(
        webClient.el!,
        ".o_form_view",
        "should still display the form view of action 4"
      );

      // execute another action meanwhile (don't block this request)
      await doAction(webClient, 8, { clearBreadcrumbs: true });

      assert.containsOnce(webClient, ".o_list_view", "should display action 8");
      assert.containsNone(webClient, ".o_form_view", "should no longer display the form view");

      assert.verifySteps([
        "/wowl/load_menus",
        "/web/action/load", // load state action 4
        "load_views", // load state action 4
        "read", // read the opened record (action 4)
        "/web/dataset/search_read", // blocked search read when coming back to Kanban (action 4)
        "/web/action/load", // action 8
        "load_views", // action 8
        "/web/dataset/search_read", // search read action 8
      ]);

      // unblock the switch to Kanban in action 4
      def.resolve();
      await testUtils.nextTick();
      await legacyExtraNextTick();

      assert.containsOnce(webClient, ".o_list_view", "should still display action 8");
      assert.containsNone(
        webClient.el!,
        ".o_kanban_view",
        "should not display the kanban view of action 4"
      );

      assert.verifySteps([]);

      webClient.destroy();
    }
  );

  QUnit.test("execute a new action while handling a call_button", async function (assert) {
    assert.expect(17);

    const def = testUtils.makeTestPromise();
    const mockRPC: RPC = async function (route, args) {
      assert.step((args && args.method) || route);
      if (route === "/web/dataset/call_button") {
        await def;
        return baseConfig.serverData!.actions![1];
      }
    };
    const webClient = await createWebClient({ baseConfig, mockRPC });

    // execute action 3 and open a record in form view
    await doAction(webClient, 3);
    await testUtils.dom.click($(webClient.el!).find(".o_list_view .o_data_row:first"));
    await legacyExtraNextTick();

    assert.containsOnce(webClient, ".o_form_view", "should display the form view of action 3");

    // click on 'Call method' button (this request is blocked)
    await testUtils.dom.click($(webClient.el!).find(".o_form_view button:contains(Call method)"));

    assert.containsOnce(
      webClient.el!,
      ".o_form_view",
      "should still display the form view of action 3"
    );

    // execute another action
    await doAction(webClient, 8, { clearBreadcrumbs: true });

    assert.containsOnce(webClient, ".o_list_view", "should display the list view of action 8");
    assert.containsNone(webClient, ".o_form_view", "should no longer display the form view");

    assert.verifySteps([
      "/wowl/load_menus",
      "/web/action/load", // action 3
      "load_views", // action 3
      "/web/dataset/search_read", // list for action 3
      "read", // form for action 3
      "object", // click on 'Call method' button (this request is blocked)
      "/web/action/load", // action 8
      "load_views", // action 8
      "/web/dataset/search_read", // list for action 8
    ]);

    // unblock the call_button request
    def.resolve();
    await testUtils.nextTick();
    await legacyExtraNextTick();
    assert.containsOnce(
      webClient.el!,
      ".o_list_view",
      "should still display the list view of action 8"
    );
    assert.containsNone(webClient, ".o_kanban_view", "should not display action 1");

    assert.verifySteps([]);

    webClient.destroy();
  });

  QUnit.test("execute a new action while switching to another controller", async function (assert) {
    assert.expect(16);

    // This test's bottom line is that a doAction always has priority
    // over a switch controller (clicking on a record row to go to form view).
    // In general, the last actionManager's operation has priority because we want
    // to allow the user to make mistakes, or to rapidly reconsider her next action.
    // Here we assert that the actionManager's RPC are in order, but a 'read' operation
    // is expected, with the current implementation, to take place when switching to the form view.
    // Ultimately the form view's 'read' is superfluous, but can happen at any point of the flow,
    // except at the very end, which should always be the final action's list's 'search_read'.

    let def: any;
    const mockRPC: RPC = async function (route, args) {
      assert.step((args && args.method) || route);
      if (args && args.method === "read") {
        await def;
      }
    };
    const webClient = await createWebClient({ baseConfig, mockRPC });

    await doAction(webClient, 3);

    assert.containsOnce(webClient, ".o_list_view", "should display the list view of action 3");

    // switch to the form view (this request is blocked)
    def = testUtils.makeTestPromise();
    testUtils.dom.click($(webClient.el!).find(".o_list_view .o_data_row:first"));
    await testUtils.nextTick();
    await legacyExtraNextTick();

    assert.containsOnce(
      webClient.el!,
      ".o_list_view",
      "should still display the list view of action 3"
    );

    // execute another action meanwhile (don't block this request)
    await doAction(webClient, 4, { clearBreadcrumbs: true });

    assert.containsOnce(
      webClient.el!,
      ".o_kanban_view",
      "should display the kanban view of action 8"
    );
    assert.containsNone(webClient, ".o_list_view", "should no longer display the list view");

    assert.verifySteps([
      "/wowl/load_menus",
      "/web/action/load", // action 3
      "load_views", // action 3
      "/web/dataset/search_read", // search read of list view of action 3
      "read", // read of form view of action 3 (this request is blocked)
      "/web/action/load", // action 4
      "load_views", // action 4
      "/web/dataset/search_read", // search read action 4
    ]);

    // unblock the switch to the form view in action 3
    def.resolve();
    await testUtils.nextTick();
    await legacyExtraNextTick();

    assert.containsOnce(
      webClient.el!,
      ".o_kanban_view",
      "should still display the kanban view of action 8"
    );
    assert.containsNone(
      webClient.el!,
      ".o_form_view",
      "should not display the form view of action 3"
    );

    assert.verifySteps([]);

    webClient.destroy();
  });

  QUnit.test("execute a new action while loading views", async function (assert) {
    assert.expect(11);

    const def = testUtils.makeTestPromise();
    const mockRPC: RPC = async function (route, args) {
      assert.step((args && args.method) || route);
      if (args && args.method === "load_views") {
        await def;
      }
    };
    const webClient = await createWebClient({ baseConfig, mockRPC });

    // execute a first action (its 'load_views' RPC is blocked)
    doAction(webClient, 3);
    await testUtils.nextTick();
    await legacyExtraNextTick();

    assert.containsNone(
      webClient.el!,
      ".o_list_view",
      "should not display the list view of action 3"
    );

    // execute another action meanwhile (and unlock the RPC)
    doAction(webClient, 4);
    def.resolve();
    await testUtils.nextTick();
    await legacyExtraNextTick();

    assert.containsOnce(
      webClient.el!,
      ".o_kanban_view",
      "should display the kanban view of action 4"
    );
    assert.containsNone(
      webClient.el!,
      ".o_list_view",
      "should not display the list view of action 3"
    );
    assert.containsOnce(
      webClient.el!,
      ".o_control_panel .breadcrumb-item",
      "there should be one controller in the breadcrumbs"
    );

    assert.verifySteps([
      "/wowl/load_menus",
      "/web/action/load", // action 3
      "load_views", // action 3
      "/web/action/load", // action 4
      "load_views", // action 4
      "/web/dataset/search_read", // search read action 4
    ]);

    webClient.destroy();
  });

  QUnit.test("execute a new action while loading data of default view", async function (assert) {
    assert.expect(12);

    const def = testUtils.makeTestPromise();
    const mockRPC: RPC = async function (route, args) {
      assert.step((args && args.method) || route);
      if (route === "/web/dataset/search_read") {
        await def;
      }
    };
    const webClient = await createWebClient({ baseConfig, mockRPC });

    // execute a first action (its 'search_read' RPC is blocked)
    doAction(webClient, 3);
    await testUtils.nextTick();
    await legacyExtraNextTick();

    assert.containsNone(
      webClient.el!,
      ".o_list_view",
      "should not display the list view of action 3"
    );

    // execute another action meanwhile (and unlock the RPC)
    doAction(webClient, 4);
    def.resolve();
    await testUtils.nextTick();
    await legacyExtraNextTick();
    assert.containsOnce(
      webClient.el!,
      ".o_kanban_view",
      "should display the kanban view of action 4"
    );
    assert.containsNone(
      webClient.el!,
      ".o_list_view",
      "should not display the list view of action 3"
    );
    assert.containsOnce(
      webClient.el!,
      ".o_control_panel .breadcrumb-item",
      "there should be one controller in the breadcrumbs"
    );

    assert.verifySteps([
      "/wowl/load_menus",
      "/web/action/load", // action 3
      "load_views", // action 3
      "/web/dataset/search_read", // search read action 3
      "/web/action/load", // action 4
      "load_views", // action 4
      "/web/dataset/search_read", // search read action 4
    ]);

    webClient.destroy();
  });

  QUnit.test("open a record while reloading the list view", async function (assert) {
    assert.expect(12);

    let def: any;
    const mockRPC: RPC = async function (route, args) {
      if (route === "/web/dataset/search_read") {
        await def;
      }
    };
    const webClient = await createWebClient({ baseConfig, mockRPC });

    await doAction(webClient, 3);

    assert.containsOnce(webClient, ".o_list_view");
    assert.containsN(webClient, ".o_list_view .o_data_row", 5);
    assert.containsOnce(webClient, ".o_control_panel .o_list_buttons");

    // reload (the search_read RPC will be blocked)
    def = testUtils.makeTestPromise();
    await cpHelpers.switchView(webClient.el!, "list");
    await legacyExtraNextTick();

    assert.containsN(webClient, ".o_list_view .o_data_row", 5);
    assert.containsOnce(webClient, ".o_control_panel .o_list_buttons");

    // open a record in form view
    await testUtils.dom.click($(webClient.el!).find(".o_list_view .o_data_row:first"));
    await legacyExtraNextTick();

    assert.containsOnce(webClient, ".o_form_view");
    assert.containsNone(webClient, ".o_control_panel .o_list_buttons");
    assert.containsOnce(webClient, ".o_control_panel .o_form_buttons_view");

    // unblock the search_read RPC
    def.resolve();
    await testUtils.nextTick();
    await legacyExtraNextTick();

    assert.containsOnce(webClient, ".o_form_view");
    assert.containsNone(webClient, ".o_list_view");
    assert.containsNone(webClient, ".o_control_panel .o_list_buttons");
    assert.containsOnce(webClient, ".o_control_panel .o_form_buttons_view");

    webClient.destroy();
  });

  QUnit.test("properly drop client actions after new action is initiated", async function (assert) {
    assert.expect(3);

    const slowWillStartDef = testUtils.makeTestPromise();

    const actionsRegistry = new Registry<any>();
    class ClientAction extends Component<{}, OdooEnv> {
      static template = tags.xml`<div class="client_action">ClientAction</div>`;
      willStart() {
        return slowWillStartDef;
      }
    }
    actionsRegistry.add("slowAction", ClientAction);
    baseConfig.actionRegistry = actionsRegistry;

    const webClient = await createWebClient({ baseConfig });
    doAction(webClient, "slowAction");
    await nextTick();
    await legacyExtraNextTick();
    assert.containsNone(webClient, ".client_action", "client action isn't ready yet");

    doAction(webClient, 4);
    await nextTick();
    await legacyExtraNextTick();
    assert.containsOnce(webClient, ".o_kanban_view", "should have loaded a kanban view");

    slowWillStartDef.resolve();
    await testUtils.nextTick();
    await legacyExtraNextTick();
    assert.containsOnce(webClient, ".o_kanban_view", "should still display the kanban view");

    webClient.destroy();
  });

  QUnit.module("Client Actions");

  QUnit.test("can execute client actions from tag name (legacy)", async function (assert) {
    // remove this test as soon as legacy Widgets are no longer supported
    assert.expect(4);

    const ClientAction = AbstractAction.extend({
      start: function () {
        this.$el.text("Hello World");
        this.$el.addClass("o_client_action_test");
      },
    });
    core.action_registry.add("HelloWorldTestLeg", ClientAction);

    const mockRPC: RPC = async function (route, args) {
      assert.step((args && args.method) || route);
    };
    const webClient = await createWebClient({ baseConfig, mockRPC });
    await doAction(webClient, "HelloWorldTestLeg");

    assert.containsNone(
      document.body,
      ".o_control_panel",
      "shouldn't have rendered a control panel"
    );
    assert.strictEqual(
      $(webClient.el!).find(".o_client_action_test").text(),
      "Hello World",
      "should have correctly rendered the client action"
    );
    assert.verifySteps(["/wowl/load_menus"]);

    webClient.destroy();
    delete core.action_registry.map.HelloWorldTestLeg;
    baseConfig.actionRegistry!.remove("HelloWorldTestLeg");
  });

  QUnit.test("can execute client actions from tag name", async function (assert) {
    assert.expect(4);

    class ClientAction extends Component<{}, OdooEnv> {
      static template = tags.xml`<div class="o_client_action_test">Hello World</div>`;
    }
    baseConfig!.actionRegistry!.add("HelloWorldTest", ClientAction);

    const mockRPC: RPC = async function (route, args) {
      assert.step((args && args.method) || route);
    };
    const webClient = await createWebClient({ baseConfig, mockRPC });
    await doAction(webClient, "HelloWorldTest");

    assert.containsNone(
      document.body,
      ".o_control_panel",
      "shouldn't have rendered a control panel"
    );
    assert.strictEqual(
      $(webClient.el!).find(".o_client_action_test").text(),
      "Hello World",
      "should have correctly rendered the client action"
    );
    assert.verifySteps(["/wowl/load_menus"]);

    webClient.destroy();
    baseConfig!.actionRegistry!.remove("HelloWorldTest");
  });

  QUnit.test("client action with control panel (legacy)", async function (assert) {
    assert.expect(4);
    // LPE Fixme: at this time we don't really know the API that wowl ClientActions implement
    const ClientAction = AbstractAction.extend({
      hasControlPanel: true,
      start() {
        this.$(".o_content").text("Hello World");
        this.$el.addClass("o_client_action_test");
        this.controlPanelProps.title = "Hello";
        return this._super.apply(this, arguments);
      },
    });
    core.action_registry.add("HelloWorldTest", ClientAction);

    const webClient = await createWebClient({ baseConfig });
    await doAction(webClient, "HelloWorldTest");

    assert.strictEqual(
      $(".o_control_panel:visible").length,
      1,
      "should have rendered a control panel"
    );
    assert.containsN(
      webClient.el!,
      ".o_control_panel .breadcrumb-item",
      1,
      "there should be one controller in the breadcrumbs"
    );
    assert.strictEqual(
      $(".o_control_panel .breadcrumb-item").text(),
      "Hello",
      "breadcrumbs should still display the title of the controller"
    );
    assert.strictEqual(
      $(webClient.el!).find(".o_client_action_test .o_content").text(),
      "Hello World",
      "should have correctly rendered the client action"
    );

    webClient.destroy();
    delete core.action_registry.map.HelloWorldTest;
    baseConfig.actionRegistry!.remove("HelloWorldTest");
  });

  QUnit.test("state is pushed for client action (legacy)", async function (assert) {
    assert.expect(6);

    const ClientAction = AbstractAction.extend({
      getTitle: function () {
        return "a title";
      },
      getState: function () {
        return { foo: "baz" };
      },
    });
    core.action_registry.add("HelloWorldTest", ClientAction);

    baseConfig.serviceRegistry!.add(
      "router",
      makeFakeRouterService({
        onPushState() {
          assert.step("push_state");
        },
      }),
      true
    );

    const webClient = await createWebClient({ baseConfig });
    let currentTitle = webClient.env.services.title.current;
    assert.strictEqual(currentTitle, '{"zopenerp":"Odoo"}');
    let currentHash = webClient.env.services.router.current.hash;
    assert.deepEqual(currentHash, {});

    await doAction(webClient, "HelloWorldTest");
    currentTitle = webClient.env.services.title.current;
    assert.strictEqual(currentTitle, '{"zopenerp":"Odoo","action":"a title"}');
    currentHash = webClient.env.services.router.current.hash;
    assert.deepEqual(currentHash, {
      action: "HelloWorldTest",
      foo: "baz",
    });
    assert.verifySteps(["push_state"]);

    webClient.destroy();
    delete core.action_registry.map.HelloWorldTest;
    actionRegistry.remove("HelloWorldTest");
  });

  QUnit.test("action can use a custom control panel (legacy)", async function (assert) {
    assert.expect(1);

    class CustomControlPanel extends Component {
      static template = tags.xml`
        <div class="custom-control-panel">My custom control panel</div>
      `;
    }
    const ClientAction = AbstractAction.extend({
      hasControlPanel: true,
      config: {
        ControlPanel: CustomControlPanel,
      },
    });
    const webClient = await createWebClient({ baseConfig });
    core.action_registry.add("HelloWorldTest", ClientAction);

    await doAction(webClient, "HelloWorldTest");
    assert.containsOnce(
      webClient.el!,
      ".custom-control-panel",
      "should have a custom control panel"
    );

    webClient.destroy();
    delete core.action_registry.map.HelloWorldTest;
    baseConfig.actionRegistry!.remove("HelloWorldTest");
  });

  QUnit.test("breadcrumb is updated on title change (legacy)", async function (assert) {
    assert.expect(2);

    const ClientAction = AbstractAction.extend({
      hasControlPanel: true,
      events: {
        click: function () {
          (this as any).updateControlPanel({ title: "new title" });
        },
      },
      start: async function () {
        this.$(".o_content").text("Hello World");
        this.$el.addClass("o_client_action_test");
        this.controlPanelProps.title = "initial title";
        await this._super.apply(this, arguments);
      },
    });
    core.action_registry.add("HelloWorldTest", ClientAction);

    const webClient = await createWebClient({ baseConfig });
    await doAction(webClient, "HelloWorldTest");

    assert.strictEqual(
      $("ol.breadcrumb").text(),
      "initial title",
      "should have initial title as breadcrumb content"
    );

    await testUtils.dom.click($(webClient.el!).find(".o_client_action_test"));
    await legacyExtraNextTick();
    assert.strictEqual(
      $("ol.breadcrumb").text(),
      "new title",
      "should have updated title as breadcrumb content"
    );

    webClient.destroy();
    delete core.action_registry.map.HelloWorldTest;
    baseConfig.actionRegistry!.remove("HelloWorldTest");
  });

  QUnit.test("client actions can have breadcrumbs (legacy)", async function (assert) {
    assert.expect(4);

    const ClientAction = AbstractAction.extend({
      hasControlPanel: true,
      init(parent: any, action: any) {
        action.display_name = "Goldeneye";
        this._super.apply(this, arguments);
      },
      start() {
        this.$el.addClass("o_client_action_test");
        return this._super.apply(this, arguments);
      },
    });
    core.action_registry.add("ClientAction", ClientAction);

    const ClientAction2 = AbstractAction.extend({
      hasControlPanel: true,
      init(parent: any, action: any) {
        action.display_name = "No time for sweetness";
        this._super.apply(this, arguments);
      },
      start() {
        this.$el.addClass("o_client_action_test_2");
        return this._super.apply(this, arguments);
      },
    });
    core.action_registry.add("ClientAction2", ClientAction2);

    const webClient = await createWebClient({ baseConfig });
    await doAction(webClient, "ClientAction");
    assert.containsOnce(webClient.el!, ".breadcrumb-item");
    assert.strictEqual(
      webClient.el!.querySelector(".breadcrumb-item.active")!.textContent,
      "Goldeneye"
    );

    await doAction(webClient, "ClientAction2", { clearBreadcrumbs: false });
    assert.containsN(webClient.el!, ".breadcrumb-item", 2);
    assert.strictEqual(
      webClient.el!.querySelector(".breadcrumb-item.active")!.textContent,
      "No time for sweetness"
    );

    webClient.destroy();
    delete core.action_registry.map.ClientAction;
    delete core.action_registry.map.ClientAction2;
    baseConfig.actionRegistry!.remove("ClientAction");
    baseConfig.actionRegistry!.remove("ClientAction2");
  });

  QUnit.test("ClientAction receives breadcrumbs and exports title (wowl)", async (assert) => {
    assert.expect(4);
    class ClientAction extends Component<{}, OdooEnv> {
      static template = tags.xml`<div class="my_owl_action" t-on-click="onClick">owl client action</div>`;
      breadcrumbTitle = "myOwlAction";

      constructor(parent: any, props: any) {
        super(parent, props);
        const breadCrumbs = props.breadcrumbs;
        assert.strictEqual(breadCrumbs.length, 1);
        assert.strictEqual(breadCrumbs[0].name, "Favorite Ponies");

        useSetupAction({
          getTitle: () => {
            return this.breadcrumbTitle;
          },
        });
      }
      onClick() {
        this.breadcrumbTitle = "newOwlTitle";
      }
    }
    baseConfig.actionRegistry!.add("OwlClientAction", ClientAction);
    const webClient = await createWebClient({ baseConfig });
    await doAction(webClient, 8);

    await doAction(webClient, "OwlClientAction");
    assert.containsOnce(webClient.el!, ".my_owl_action");
    await click(webClient.el!, ".my_owl_action");

    await doAction(webClient, 3);
    assert.strictEqual(
      webClient.el!.querySelector(".breadcrumb")!.textContent,
      "Favorite PoniesnewOwlTitlePartners"
    );
    webClient.destroy();
    baseConfig.actionRegistry!.remove("OwlClientAction");
  });

  QUnit.test("test display_notification client action", async function (assert) {
    assert.expect(6);

    baseConfig!.serviceRegistry!.add("notification", notificationService);

    const webClient = await createWebClient({ baseConfig });

    await doAction(webClient, 1);
    assert.containsOnce(webClient, ".o_kanban_view");

    await doAction(webClient, {
      type: "ir.actions.client",
      tag: "display_notification",
      params: {
        title: "title",
        message: "message",
        sticky: true,
      },
    });
    const notificationSelector = ".o_notification_manager .o_notification";

    assert.containsOnce(document.body, notificationSelector, "a notification should be present");

    const notificationElement = document.body.querySelector(notificationSelector);
    assert.strictEqual(
      notificationElement!.querySelector(".o_notification_title")!.textContent,
      "title",
      "the notification should have the correct title"
    );
    assert.strictEqual(
      notificationElement!.querySelector(".o_notification_content")!.textContent,
      "message",
      "the notification should have the correct message"
    );

    assert.containsOnce(webClient, ".o_kanban_view");

    await testUtils.dom.click(notificationElement!.querySelector(".o_notification_close"));

    assert.containsNone(document.body, notificationSelector, "the notification should be destroy ");

    webClient.destroy();
  });

  QUnit.module("Server actions");

  QUnit.test("can execute server actions from db ID", async function (assert) {
    assert.expect(10);

    const mockRPC: RPC = async (route, args) => {
      assert.step((args && args.method) || route);
      if (route === "/web/action/run") {
        assert.strictEqual(args!.action_id, 2, "should call the correct server action");
        return Promise.resolve(1); // execute action 1
      }
    };
    const webClient = await createWebClient({ baseConfig, mockRPC });
    await doAction(webClient, 2);

    assert.containsOnce(webClient, ".o_control_panel", "should have rendered a control panel");
    assert.containsOnce(webClient, ".o_kanban_view", "should have rendered a kanban view");
    assert.verifySteps([
      "/wowl/load_menus",
      "/web/action/load",
      "/web/action/run",
      "/web/action/load",
      "load_views",
      "/web/dataset/search_read",
    ]);

    webClient.destroy();
  });

  QUnit.test("handle server actions returning false", async function (assert) {
    assert.expect(10);

    const mockRPC: RPC = async (route, args) => {
      assert.step((args && args.method) || route);
      if (route === "/web/action/run") {
        return Promise.resolve(false);
      }
    };
    const webClient = await createWebClient({ baseConfig, mockRPC });

    // execute an action in target="new"
    function onClose() {
      assert.step("close handler");
    }
    await doAction(webClient, 5, { onClose });
    assert.containsOnce(
      document.body,
      ".o_technical_modal .o_form_view",
      "should have rendered a form view in a modal"
    );

    // execute a server action that returns false
    await doAction(webClient, 2);

    assert.containsNone(document.body, ".o_technical_modal", "should have closed the modal");
    assert.verifySteps([
      "/wowl/load_menus",
      "/web/action/load", // action 5
      "load_views",
      "onchange",
      "/web/action/load", // action 2
      "/web/action/run",
      "close handler",
    ]);

    webClient.destroy();
  });

  QUnit.module("Report actions");

  QUnit.test("can execute report actions from db ID", async function (assert) {
    assert.expect(6);

    baseConfig.serviceRegistry!.add(
      "download",
      makeFakeDownloadService((options: DowloadFileOptionsFromParams) => {
        assert.step(options.url);
        return Promise.resolve();
      })
    );

    const mockRPC: RPC = async (route, args) => {
      assert.step(args?.method || route);
      if (route === "/report/check_wkhtmltopdf") {
        return Promise.resolve("ok");
      }
    };
    const webClient = await createWebClient({ baseConfig, mockRPC });

    await doAction(webClient, 7, { onClose: () => assert.step("on_close") });

    assert.verifySteps([
      "/wowl/load_menus",
      "/web/action/load",
      "/report/check_wkhtmltopdf",
      "/report/download",
      "on_close",
    ]);

    webClient.destroy();
  });

  QUnit.test("report actions can close modals and reload views", async function (assert) {
    assert.expect(8);

    baseConfig.serviceRegistry!.add(
      "download",
      makeFakeDownloadService((options: DowloadFileOptionsFromParams) => {
        assert.step(options.url);
        return Promise.resolve();
      })
    );
    const mockRPC: RPC = async (route) => {
      if (route === "/report/check_wkhtmltopdf") {
        return Promise.resolve("ok");
      }
    };
    const webClient = await createWebClient({ baseConfig, mockRPC });

    await doAction(webClient, 5, { onClose: () => assert.step("on_close") });
    assert.containsOnce(
      document.body,
      ".o_technical_modal .o_form_view",
      "should have rendered a form view in a modal"
    );

    await doAction(webClient, 7, { onClose: () => assert.step("on_printed") });
    assert.containsOnce(
      document.body,
      ".o_technical_modal .o_form_view",
      "The modal should still exist"
    );

    await doAction(webClient, 11);
    assert.containsNone(
      document.body,
      ".o_technical_modal .o_form_view",
      "the modal should have been closed after the action report"
    );
    assert.verifySteps(["/report/download", "on_printed", "/report/download", "on_close"]);

    webClient.destroy();
  });

  QUnit.test("should trigger a notification if wkhtmltopdf is to upgrade", async function (assert) {
    baseConfig.serviceRegistry!.add(
      notificationService.name,
      makeFakeNotificationService(
        () => {
          assert.step("notify");
        },
        () => {}
      ),
      true
    );
    baseConfig.serviceRegistry!.add(
      "download",
      makeFakeDownloadService((options: DowloadFileOptionsFromParams) => {
        assert.step(options.url);
        return Promise.resolve();
      })
    );

    const mockRPC: RPC = async (route, args) => {
      assert.step(args?.method || route);
      if (route === "/report/check_wkhtmltopdf") {
        return Promise.resolve("upgrade");
      }
    };
    const webClient = await createWebClient({ baseConfig, mockRPC });

    await doAction(webClient, 7);
    assert.verifySteps([
      "/wowl/load_menus",
      "/web/action/load",
      "/report/check_wkhtmltopdf",
      "notify",
      "/report/download",
    ]);

    webClient.destroy();
  });

  QUnit.test(
    "should open the report client action if wkhtmltopdf is broken",
    async function (assert) {
      baseConfig.serviceRegistry!.add(
        "download",
        makeFakeDownloadService((options: DowloadFileOptionsFromParams) => {
          assert.step("download"); // should not be called
          return Promise.resolve();
        })
      );
      baseConfig.serviceRegistry!.add(
        notificationService.name,
        makeFakeNotificationService(
          () => {
            assert.step("notify");
          },
          () => {}
        ),
        true
      );

      const mockRPC: RPC = async (route, args) => {
        assert.step(args!.method || route);
        if (route === "/report/check_wkhtmltopdf") {
          return Promise.resolve("broken");
        }
        if (route.includes("/report/html/some_report")) {
          return Promise.resolve(true);
        }
      };

      // patch the report client action to override its iframe's url so that
      // it doesn't trigger an RPC when it is appended to the DOM (for this
      // usecase, using removeSRCAttribute doesn't work as the RPC is
      // triggered as soon as the iframe is in the DOM, even if its src
      // attribute is removed right after)
      testUtils.mock.patch(ReportClientAction, {
        async start() {
          await this._super(...arguments);
          this._rpc({ route: this.iframe.getAttribute("src") });
          this.iframe.setAttribute("src", "about:blank");
        },
      });

      const webClient = await createWebClient({ baseConfig, mockRPC });

      await doAction(webClient, 7);

      assert.containsOnce(
        webClient,
        ".o_report_iframe",
        "should have opened the report client action"
      );
      assert.containsOnce(webClient, ".o_cp_buttons .o_report_buttons .o_report_print");

      assert.verifySteps([
        "/wowl/load_menus",
        "/web/action/load",
        "/report/check_wkhtmltopdf",
        "notify",
        // context={"lang":'en',"uid":7,"tz":'taht'}
        "/report/html/some_report?context=%7B%22lang%22%3A%22en%22%2C%22uid%22%3A7%2C%22tz%22%3A%22taht%22%7D",
      ]);

      webClient.destroy();
      testUtils.mock.unpatch(ReportClientAction);
    }
  );

  QUnit.test("send context in case of html report", async function (assert) {
    assert.expect(5);

    baseConfig.serviceRegistry!.add(
      "download",
      makeFakeDownloadService((options: DowloadFileOptionsFromParams) => {
        assert.step("download"); // should not be called
        return Promise.resolve();
      })
    );
    baseConfig.serviceRegistry!.add(
      notificationService.name,
      makeFakeNotificationService(
        (message: string, options: any) => {
          assert.step(options.type || "notification");
        },
        () => {}
      ),
      true
    );
    baseConfig.serviceRegistry!.add(
      "user",
      makeFakeUserService({ context: { some_key: 2 } } as any),
      true
    );

    const mockRPC: RPC = async (route, args) => {
      assert.step(args!.method || route);
      if (route.includes("/report/html/some_report")) {
        return Promise.resolve(true);
      }
    };

    // patch the report client action to override its iframe's url so that
    // it doesn't trigger an RPC when it is appended to the DOM (for this
    // usecase, using removeSRCAttribute doesn't work as the RPC is
    // triggered as soon as the iframe is in the DOM, even if its src
    // attribute is removed right after)
    testUtils.mock.patch(ReportClientAction, {
      async start() {
        await this._super(...arguments);
        this._rpc({ route: this.iframe.getAttribute("src") });
        this.iframe.setAttribute("src", "about:blank");
      },
    });

    const webClient = await createWebClient({ baseConfig, mockRPC });
    await doAction(webClient, 12);

    assert.containsOnce(webClient, ".o_report_iframe", "should have opened the client action");

    assert.verifySteps([
      "/wowl/load_menus",
      "/web/action/load",
      // context={"some_key":2}
      "/report/html/some_report?context=%7B%22some_key%22%3A2%7D", // report client action's iframe
    ]);

    webClient.destroy();
    testUtils.mock.unpatch(ReportClientAction);
  });

  QUnit.test(
    "UI unblocks after downloading the report even if it threw an error",
    async function (assert) {
      assert.expect(8);

      let timesDownloasServiceHasBeenCalled = 0;
      baseConfig.serviceRegistry!.add(
        "download",
        makeFakeDownloadService((options: DowloadFileOptionsFromParams) => {
          if (timesDownloasServiceHasBeenCalled === 0) {
            assert.step("successful download");
            timesDownloasServiceHasBeenCalled++;
            return Promise.resolve();
          }
          if (timesDownloasServiceHasBeenCalled === 1) {
            assert.step("failed download");
            return Promise.reject();
          }
        })
      );

      baseConfig.serviceRegistry!.add(
        "ui",
        makeFakeUIService(
          () => {
            assert.step("block");
          },
          () => {
            assert.step("unblock");
          }
        ),
        true
      );

      const mockRPC: RPC = async (route, args) => {
        if (route === "/report/check_wkhtmltopdf") {
          return Promise.resolve("ok");
        }
      };

      const webClient = await createWebClient({ baseConfig, mockRPC });

      await doAction(webClient, 7);

      try {
        await doAction(webClient, 7);
      } catch (e) {
        assert.step("error caught");
      }

      assert.verifySteps([
        "block",
        "successful download",
        "unblock",
        "block",
        "failed download",
        "unblock",
        "error caught",
      ]);

      webClient.destroy();
    }
  );

  QUnit.module("Window Actions");

  QUnit.test("can execute act_window actions from db ID", async function (assert) {
    assert.expect(7);

    const mockRPC: RPC = async (route, args) => {
      assert.step((args && args.method) || route);
    };
    const webClient = await createWebClient({ baseConfig, mockRPC });

    await doAction(webClient, 1);

    assert.containsOnce(document.body, ".o_control_panel", "should have rendered a control panel");
    assert.containsOnce(webClient, ".o_kanban_view", "should have rendered a kanban view");
    assert.verifySteps([
      "/wowl/load_menus",
      "/web/action/load",
      "load_views",
      "/web/dataset/search_read",
    ]);

    webClient.destroy();
  });

  QUnit.test("sidebar is present in list view", async function (assert) {
    assert.expect(4);

    baseConfig.serverData!.models!.partner.toolbar = {
      print: [{ name: "Print that record" }],
    };

    const mockRPC: RPC = async (route, args) => {
      if (args && args.method === "load_views") {
        assert.strictEqual(args.kwargs.options.toolbar, true, "should ask for toolbar information");
      }
    };
    const webClient = await createWebClient({ baseConfig, mockRPC });

    await doAction(webClient, 3);

    assert.containsNone(webClient, ".o_cp_action_menus");

    await testUtils.dom.clickFirst($(webClient.el!).find("input.custom-control-input"));
    assert.isVisible(
      $(webClient.el!).find('.o_cp_action_menus button.o_dropdown_toggler_btn:contains("Print")')[0]
    );
    assert.isVisible(
      $(webClient.el!).find(
        '.o_cp_action_menus button.o_dropdown_toggler_btn:contains("Action")'
      )[0]
    );

    webClient.destroy();
  });

  QUnit.test("can switch between views", async function (assert) {
    assert.expect(19);

    const mockRPC: RPC = async (route, args) => {
      assert.step((args && args.method) || route);
    };
    const webClient = await createWebClient({ baseConfig, mockRPC });
    await doAction(webClient, 3);

    assert.containsOnce(webClient, ".o_list_view", "should display the list view");

    // switch to kanban view
    await cpHelpers.switchView(webClient.el!, "kanban");
    await legacyExtraNextTick();
    assert.containsNone(webClient, ".o_list_view", "should no longer display the list view");
    assert.containsOnce(webClient, ".o_kanban_view", "should display the kanban view");

    // switch back to list view
    await cpHelpers.switchView(webClient.el!, "list");
    await legacyExtraNextTick();
    assert.containsOnce(webClient, ".o_list_view", "should display the list view");
    assert.containsNone(
      webClient.el!,
      ".o_kanban_view",
      "should no longer display the kanban view"
    );

    // open a record in form view
    await testUtils.dom.click(webClient.el!.querySelector(".o_list_view .o_data_row"));
    await legacyExtraNextTick();
    assert.containsNone(webClient, ".o_list_view", "should no longer display the list view");
    assert.containsOnce(webClient, ".o_form_view", "should display the form view");
    assert.strictEqual(
      $(webClient.el!).find(".o_field_widget[name=foo]").text(),
      "yop",
      "should have opened the correct record"
    );

    // go back to list view using the breadcrumbs
    await testUtils.dom.click(webClient.el!.querySelector(".o_control_panel .breadcrumb a"));
    await legacyExtraNextTick();
    assert.containsOnce(webClient, ".o_list_view", "should display the list view");
    assert.containsNone(webClient, ".o_form_view", "should no longer display the form view");

    assert.verifySteps([
      "/wowl/load_menus",
      "/web/action/load",
      "load_views",
      "/web/dataset/search_read", // list
      "/web/dataset/search_read", // kanban
      "/web/dataset/search_read", // list
      "read", // form
      "/web/dataset/search_read", // list
    ]);

    webClient.destroy();
  });

  QUnit.test(
    "orderedBy in context is not propagated when executing another action",
    async function (assert) {
      assert.expect(6);

      baseConfig.serverData!.models!.partner.fields.foo.sortable = true;
      baseConfig.serverData!.views!["partner,false,form"] = `
        <form>
          <header>
            <button name="8" string="Execute action" type="action"/>
          </header>
        </form>`;
      baseConfig.serverData!.models!.partner.filters = [
        {
          id: 1,
          context: "{}",
          domain: "[]",
          sort: "[]",
          is_default: true,
          name: "My filter",
        },
      ];

      let searchReadCount = 1;
      const mockRPC: RPC = async (route, args) => {
        if (route === "/web/dataset/search_read") {
          args = args || {};
          if (searchReadCount === 1) {
            assert.strictEqual(args.model, "partner");
            assert.notOk(args.sort);
          }
          if (searchReadCount === 2) {
            assert.strictEqual(args.model, "partner");
            assert.strictEqual(args.sort, "foo ASC");
          }
          if (searchReadCount === 3) {
            assert.strictEqual(args.model, "pony");
            assert.notOk(args.sort);
          }
          searchReadCount += 1;
        }
      };
      const webClient = await createWebClient({ baseConfig, mockRPC });
      await doAction(webClient, 3);

      // Sort records
      await testUtils.dom.click($(webClient.el!).find(".o_list_view th.o_column_sortable"));
      await legacyExtraNextTick();

      // Get to the form view of the model, on the first record
      await testUtils.dom.click($(webClient.el!).find(".o_data_cell:first"));
      await legacyExtraNextTick();

      // Execute another action by clicking on the button within the form
      await testUtils.dom.click($(webClient.el!).find("button[name=8]"));
      await legacyExtraNextTick();

      webClient.destroy();
    }
  );

  QUnit.test("breadcrumbs are updated when switching between views", async function (assert) {
    assert.expect(15);

    const webClient = await createWebClient({ baseConfig });
    await doAction(webClient, 3);

    assert.containsOnce(
      webClient.el!,
      ".o_control_panel .breadcrumb-item",
      "there should be one controller in the breadcrumbs"
    );
    assert.strictEqual(
      $(webClient.el!).find(".o_control_panel .breadcrumb-item").text(),
      "Partners",
      "breadcrumbs should display the display_name of the action"
    );

    // switch to kanban view
    await cpHelpers.switchView(webClient.el!, "kanban");
    await legacyExtraNextTick();
    assert.containsOnce(
      webClient.el!,
      ".o_control_panel .breadcrumb-item",
      "there should still be one controller in the breadcrumbs"
    );
    assert.strictEqual(
      $(webClient.el!).find(".o_control_panel .breadcrumb-item").text(),
      "Partners",
      "breadcrumbs should still display the display_name of the action"
    );

    // open a record in form view
    await testUtils.dom.click(webClient.el!.querySelector(".o_kanban_view .o_kanban_record"));
    await legacyExtraNextTick();
    assert.containsN(
      webClient.el!,
      ".o_control_panel .breadcrumb-item",
      2,
      "there should be two controllers in the breadcrumbs"
    );
    assert.strictEqual(
      $(webClient.el!).find(".o_control_panel .breadcrumb-item:last").text(),
      "First record"
    );

    // go back to kanban view using the breadcrumbs
    await testUtils.dom.click(webClient.el!.querySelector(".o_control_panel .breadcrumb a"));
    await legacyExtraNextTick();
    assert.containsOnce(
      webClient.el!,
      ".o_control_panel .breadcrumb-item",
      "there should be one controller in the breadcrumbs"
    );
    assert.strictEqual(
      $(webClient.el!).find(".o_control_panel .breadcrumb-item").text(),
      "Partners",
      "breadcrumbs should display the display_name of the action"
    );

    // switch back to list view
    await cpHelpers.switchView(webClient.el!, "list");
    await legacyExtraNextTick();
    assert.containsOnce(
      webClient.el!,
      ".o_control_panel .breadcrumb-item",
      "there should still be one controller in the breadcrumbs"
    );
    assert.strictEqual(
      $(webClient.el!).find(".o_control_panel .breadcrumb-item").text(),
      "Partners",
      "breadcrumbs should still display the display_name of the action"
    );

    // open a record in form view
    await testUtils.dom.click(webClient.el!.querySelector(".o_list_view .o_data_row"));
    await legacyExtraNextTick();
    assert.containsN(
      webClient.el!,
      ".o_control_panel .breadcrumb-item",
      2,
      "there should be two controllers in the breadcrumbs"
    );
    assert.strictEqual(
      $(webClient.el!).find(".o_control_panel .breadcrumb-item:last").text(),
      "First record"
    );

    // go back to list view using the breadcrumbs
    await testUtils.dom.click(webClient.el!.querySelector(".o_control_panel .breadcrumb a"));
    await legacyExtraNextTick();
    assert.containsOnce(webClient, ".o_list_view", "should be back on list view");
    assert.containsOnce(
      webClient.el!,
      ".o_control_panel .breadcrumb-item",
      "there should be one controller in the breadcrumbs"
    );
    assert.strictEqual(
      $(webClient.el!).find(".o_control_panel .breadcrumb-item").text(),
      "Partners",
      "breadcrumbs should display the display_name of the action"
    );

    webClient.destroy();
  });

  QUnit.test("switch buttons are updated when switching between views", async function (assert) {
    assert.expect(13);

    const webClient = await createWebClient({ baseConfig });
    await doAction(webClient, 3);

    assert.containsN(
      webClient.el!,
      ".o_control_panel button.o_switch_view",
      2,
      "should have two switch buttons (list and kanban)"
    );
    assert.containsOnce(
      webClient.el!,
      ".o_control_panel button.o_switch_view.active",
      "should have only one active button"
    );
    assert.hasClass(
      webClient.el!.querySelector(".o_control_panel .o_switch_view") as HTMLElement,
      "o_list",
      "list switch button should be the first one"
    );
    assert.hasClass(
      webClient.el!.querySelector(".o_control_panel .o_switch_view.o_list") as HTMLElement,
      "active",
      "list should be the active view"
    );

    // switch to kanban view
    await cpHelpers.switchView(webClient.el!, "kanban");
    await legacyExtraNextTick();
    assert.containsN(
      webClient.el!,
      ".o_control_panel .o_switch_view",
      2,
      "should still have two switch buttons (list and kanban)"
    );
    assert.containsOnce(
      webClient.el!,
      ".o_control_panel .o_switch_view.active",
      "should still have only one active button"
    );
    assert.hasClass(
      webClient.el!.querySelector(".o_control_panel .o_switch_view") as HTMLElement,
      "o_list",
      "list switch button should still be the first one"
    );
    assert.hasClass(
      webClient.el!.querySelector(".o_control_panel .o_switch_view.o_kanban") as HTMLElement,
      "active",
      "kanban should now be the active view"
    );

    // switch back to list view
    await cpHelpers.switchView(webClient.el!, "list");
    await legacyExtraNextTick();
    assert.containsN(
      webClient.el!,
      ".o_control_panel .o_switch_view",
      2,
      "should still have two switch buttons (list and kanban)"
    );
    assert.hasClass(
      webClient.el!.querySelector(".o_control_panel .o_switch_view.o_list") as HTMLElement,
      "active",
      "list should now be the active view"
    );

    // open a record in form view
    await testUtils.dom.click(webClient.el!.querySelector(".o_list_view .o_data_row"));
    await legacyExtraNextTick();
    assert.containsNone(
      webClient.el!,
      ".o_control_panel .o_switch_view",
      "should not have any switch buttons"
    );

    // go back to list view using the breadcrumbs
    await testUtils.dom.click($(webClient.el!).find(".o_control_panel .breadcrumb a"));
    await legacyExtraNextTick();
    assert.containsN(
      webClient.el!,
      ".o_control_panel .o_switch_view",
      2,
      "should have two switch buttons (list and kanban)"
    );
    assert.hasClass(
      webClient.el!.querySelector(".o_control_panel .o_switch_view.o_list") as HTMLElement,
      "active",
      "list should be the active view"
    );

    webClient.destroy();
  });

  QUnit.test("pager is updated when switching between views", async function (assert) {
    assert.expect(10);

    const webClient = await createWebClient({ baseConfig });
    await doAction(webClient, 4);

    assert.strictEqual(
      $(webClient.el!).find(".o_control_panel .o_pager_value").text(),
      "1-5",
      "value should be correct for kanban"
    );
    assert.strictEqual(
      $(webClient.el!).find(".o_control_panel .o_pager_limit").text(),
      "5",
      "limit should be correct for kanban"
    );

    // switch to list view
    await cpHelpers.switchView(webClient.el!, "list");
    await legacyExtraNextTick();
    assert.strictEqual(
      $(webClient.el!).find(".o_control_panel .o_pager_value").text(),
      "1-3",
      "value should be correct for list"
    );
    assert.strictEqual(
      $(webClient.el!).find(".o_control_panel .o_pager_limit").text(),
      "5",
      "limit should be correct for list"
    );

    // open a record in form view
    await testUtils.dom.click(webClient.el!.querySelector(".o_list_view .o_data_row"));
    await legacyExtraNextTick();
    assert.strictEqual(
      $(webClient.el!).find(".o_control_panel .o_pager_value").text(),
      "1",
      "value should be correct for form"
    );
    assert.strictEqual(
      $(webClient.el!).find(".o_control_panel .o_pager_limit").text(),
      "3",
      "limit should be correct for form"
    );

    // go back to list view using the breadcrumbs
    await testUtils.dom.click(webClient.el!.querySelector(".o_control_panel .breadcrumb a"));
    await legacyExtraNextTick();
    assert.strictEqual(
      $(webClient.el!).find(".o_control_panel .o_pager_value").text(),
      "1-3",
      "value should be correct for list"
    );
    assert.strictEqual(
      $(webClient.el!).find(".o_control_panel .o_pager_limit").text(),
      "5",
      "limit should be correct for list"
    );

    // switch back to kanban view
    await cpHelpers.switchView(webClient.el!, "kanban");
    await legacyExtraNextTick();
    assert.strictEqual(
      $(webClient.el!).find(".o_control_panel .o_pager_value").text(),
      "1-5",
      "value should be correct for kanban"
    );
    assert.strictEqual(
      $(webClient.el!).find(".o_control_panel .o_pager_limit").text(),
      "5",
      "limit should be correct for kanban"
    );

    webClient.destroy();
  });

  QUnit.test("domain is kept when switching between views", async function (assert) {
    assert.expect(5);

    baseConfig.serverData!.actions![3].search_view_id = [1, "a custom search view"];

    const webClient = await createWebClient({ baseConfig });

    await doAction(webClient, 3);
    assert.containsN(webClient, ".o_data_row", 5);

    // activate a domain
    await cpHelpers.toggleFilterMenu(webClient.el!);
    await cpHelpers.toggleMenuItem(webClient.el!, "Bar");
    await legacyExtraNextTick();
    assert.containsN(webClient, ".o_data_row", 2);

    // switch to kanban
    await cpHelpers.switchView(webClient.el!, "kanban");
    await legacyExtraNextTick();
    assert.containsN(webClient, ".o_kanban_record:not(.o_kanban_ghost)", 2);

    // remove the domain
    await testUtils.dom.click(webClient.el!.querySelector(".o_searchview .o_facet_remove"));
    await legacyExtraNextTick();
    assert.containsN(webClient, ".o_kanban_record:not(.o_kanban_ghost)", 5);

    // switch back to list
    await cpHelpers.switchView(webClient.el!, "list");
    await legacyExtraNextTick();
    assert.containsN(webClient, ".o_data_row", 5);

    webClient.destroy();
  });

  QUnit.test("there is no flickering when switching between views", async function (assert) {
    assert.expect(20);

    let def: any;
    const mockRPC: RPC = async (route, args) => {
      await def;
    };
    const webClient = await createWebClient({ baseConfig, mockRPC });

    await doAction(webClient, 3);

    // switch to kanban view
    def = testUtils.makeTestPromise();
    await cpHelpers.switchView(webClient.el!, "kanban");
    await legacyExtraNextTick();
    assert.containsOnce(webClient, ".o_list_view", "should still display the list view");
    assert.containsNone(webClient, ".o_kanban_view", "shouldn't display the kanban view yet");
    def.resolve();
    await testUtils.nextTick();
    await legacyExtraNextTick();
    assert.containsNone(webClient, ".o_list_view", "shouldn't display the list view anymore");
    assert.containsOnce(webClient, ".o_kanban_view", "should now display the kanban view");

    // switch back to list view
    def = testUtils.makeTestPromise();
    await cpHelpers.switchView(webClient.el!, "list");
    await legacyExtraNextTick();
    assert.containsOnce(webClient, ".o_kanban_view", "should still display the kanban view");
    assert.containsNone(webClient, ".o_list_view", "shouldn't display the list view yet");
    def.resolve();
    await testUtils.nextTick();
    await legacyExtraNextTick();
    assert.containsNone(
      webClient.el!,
      ".o_kanban_view",
      "shouldn't display the kanban view anymore"
    );
    assert.containsOnce(webClient, ".o_list_view", "should now display the list view");

    // open a record in form view
    def = testUtils.makeTestPromise();
    await testUtils.dom.click($(webClient.el!).find(".o_list_view .o_data_row:first"));
    await legacyExtraNextTick();
    assert.containsOnce(webClient, ".o_list_view", "should still display the list view");
    assert.containsNone(webClient, ".o_form_view", "shouldn't display the form view yet");
    assert.containsOnce(
      webClient.el!,
      ".o_control_panel .breadcrumb-item",
      "there should still be one controller in the breadcrumbs"
    );
    def.resolve();
    await testUtils.nextTick();
    await legacyExtraNextTick();
    assert.containsNone(webClient, ".o_list_view", "should no longer display the list view");
    assert.containsOnce(webClient, ".o_form_view", "should display the form view");
    assert.containsN(
      webClient.el!,
      ".o_control_panel .breadcrumb-item",
      2,
      "there should be two controllers in the breadcrumbs"
    );

    // go back to list view using the breadcrumbs
    def = testUtils.makeTestPromise();
    await testUtils.dom.click($(webClient.el!).find(".o_control_panel .breadcrumb a"));
    await legacyExtraNextTick();
    assert.containsOnce(webClient, ".o_form_view", "should still display the form view");
    assert.containsNone(webClient, ".o_list_view", "shouldn't display the list view yet");
    assert.containsN(
      webClient.el!,
      ".o_control_panel .breadcrumb-item",
      2,
      "there should still be two controllers in the breadcrumbs"
    );
    def.resolve();
    await testUtils.nextTick();
    await legacyExtraNextTick();
    assert.containsNone(webClient, ".o_form_view", "should no longer display the form view");
    assert.containsOnce(webClient, ".o_list_view", "should display the list view");
    assert.containsOnce(
      webClient.el!,
      ".o_control_panel .breadcrumb-item",
      "there should be one controller in the breadcrumbs"
    );

    webClient.destroy();
  });

  QUnit.test("breadcrumbs are updated when display_name changes", async function (assert) {
    assert.expect(4);

    const webClient = await createWebClient({ baseConfig });
    await doAction(webClient, 3);

    // open a record in form view
    await testUtils.dom.click(webClient.el!.querySelector(".o_list_view .o_data_row"));
    await legacyExtraNextTick();
    assert.containsN(
      webClient.el!,
      ".o_control_panel .breadcrumb-item",
      2,
      "there should be two controllers in the breadcrumbs"
    );
    assert.strictEqual(
      $(webClient.el!).find(".o_control_panel .breadcrumb-item:last").text(),
      "First record",
      "breadcrumbs should contain the display_name of the opened record"
    );

    // switch to edit mode and change the display_name
    await testUtils.dom.click($(webClient.el!).find(".o_control_panel .o_form_button_edit"));
    await testUtils.fields.editInput(
      webClient.el!.querySelector(".o_field_widget[name=display_name]"),
      "New name"
    );
    await testUtils.dom.click(webClient.el!.querySelector(".o_control_panel .o_form_button_save"));

    assert.containsN(
      webClient.el!,
      ".o_control_panel .breadcrumb-item",
      2,
      "there should still be two controllers in the breadcrumbs"
    );
    assert.strictEqual(
      $(webClient.el!).find(".o_control_panel .breadcrumb-item:last").text(),
      "New name",
      "breadcrumbs should contain the display_name of the opened record"
    );

    webClient.destroy();
  });

  QUnit.test('reverse breadcrumb works on accesskey "b"', async function (assert) {
    assert.expect(4);

    const webClient = await createWebClient({ baseConfig });
    await doAction(webClient, 3);

    // open a record in form view
    await testUtils.dom.click($(webClient.el!).find(".o_list_view .o_data_row:first"));
    await legacyExtraNextTick();
    await testUtils.dom.click(
      $(webClient.el!).find(".o_form_view button:contains(Execute action)")
    );
    await legacyExtraNextTick();

    assert.containsN(webClient, ".o_control_panel .breadcrumb li", 3);

    var $previousBreadcrumb = $(webClient.el!)
      .find(".o_control_panel .breadcrumb li.active")
      .prev();
    assert.strictEqual(
      $previousBreadcrumb.attr("accesskey"),
      "b",
      "previous breadcrumb should have accessKey 'b'"
    );
    await testUtils.dom.click($previousBreadcrumb);
    await legacyExtraNextTick();

    assert.containsN(webClient, ".o_control_panel .breadcrumb li", 2);

    var $previousBreadcrumb = $(webClient.el!)
      .find(".o_control_panel .breadcrumb li.active")
      .prev();
    assert.strictEqual(
      $previousBreadcrumb.attr("accesskey"),
      "b",
      "previous breadcrumb should have accessKey 'b'"
    );

    webClient.destroy();
  });

  QUnit.test("reload previous controller when discarding a new record", async function (assert) {
    assert.expect(9);

    const mockRPC: RPC = async (route, args) => {
      assert.step((args && args.method) || route);
    };
    const webClient = await createWebClient({ baseConfig, mockRPC });
    await doAction(webClient, 3);

    // create a new record
    await testUtils.dom.click($(webClient.el!).find(".o_control_panel .o_list_button_add"));
    await legacyExtraNextTick();
    assert.containsOnce(
      webClient.el!,
      ".o_form_view.o_form_editable",
      "should have opened the form view in edit mode"
    );

    // discard
    await testUtils.dom.click($(webClient.el!).find(".o_control_panel .o_form_button_cancel"));
    await legacyExtraNextTick();
    assert.containsOnce(
      webClient.el!,
      ".o_list_view",
      "should have switched back to the list view"
    );

    assert.verifySteps([
      "/wowl/load_menus",
      "/web/action/load",
      "load_views",
      "/web/dataset/search_read", // list
      "onchange", // form
      "/web/dataset/search_read", // list
    ]);

    webClient.destroy();
  });

  QUnit.test("requests for execute_action of type object are handled", async function (assert) {
    assert.expect(11);

    baseConfig.serviceRegistry!.add(
      "user",
      makeFakeUserService({
        context: Object.assign({}, { some_key: 2 } as any),
      }),
      true
    );

    const mockRPC: RPC = async (route, args) => {
      assert.step((args && args.method) || route);
      if (route === "/web/dataset/call_button") {
        assert.deepEqual(
          args,
          {
            args: [[1]],
            kwargs: { context: { some_key: 2 } },
            method: "object",
            model: "partner",
          },
          "should call route with correct arguments"
        );
        const record = baseConfig.serverData!.models!.partner.records.find(
          (r) => r.id === args!.args[0][0]
        );
        record!.foo = "value changed";
        return Promise.resolve(false);
      }
    };
    const webClient = await createWebClient({ baseConfig, mockRPC });
    await doAction(webClient, 3);

    // open a record in form view
    await testUtils.dom.click($(webClient.el!).find(".o_list_view .o_data_row:first"));
    await legacyExtraNextTick();
    assert.strictEqual(
      $(webClient.el!).find(".o_field_widget[name=foo]").text(),
      "yop",
      "check initial value of 'yop' field"
    );

    // click on 'Call method' button (should call an Object method)
    await testUtils.dom.click($(webClient.el!).find(".o_form_view button:contains(Call method)"));
    await legacyExtraNextTick();
    assert.strictEqual(
      $(webClient.el!).find(".o_field_widget[name=foo]").text(),
      "value changed",
      "'yop' has been changed by the server, and should be updated in the UI"
    );

    assert.verifySteps([
      "/wowl/load_menus",
      "/web/action/load",
      "load_views",
      "/web/dataset/search_read", // list for action 3
      "read", // form for action 3
      "object", // click on 'Call method' button
      "read", // re-read form view
    ]);

    webClient.destroy();
  });

  QUnit.test(
    "requests for execute_action of type object: disable buttons (2)",
    async function (assert) {
      assert.expect(6);

      baseConfig.serverData!.views!["pony,44,form"] = `
    <form>
    <field name="name"/>
    <button string="Cancel" class="cancel-btn" special="cancel"/>
    </form>`;
      baseConfig.serverData!.actions![4] = {
        id: 4,
        name: "Create a Partner",
        res_model: "pony",
        target: "new",
        type: "ir.actions.act_window",
        views: [[44, "form"]],
      };
      const def = testUtils.makeTestPromise();
      const mockRPC: RPC = async (route, args) => {
        if (args!.method === "onchange") {
          // delay the opening of the dialog
          await def;
        }
      };
      const webClient = await createWebClient({ baseConfig, mockRPC });
      await doAction(webClient, 3);
      assert.containsOnce(webClient.el!, ".o_list_view");

      // open first record in form view
      await testUtils.dom.click(webClient.el!.querySelector(".o_list_view .o_data_row"));
      await legacyExtraNextTick();
      assert.containsOnce(webClient.el!, ".o_form_view");

      // click on 'Execute action', to execute action 4 in a dialog
      await testUtils.dom.click(webClient.el!.querySelector('.o_form_view button[name="4"]'));
      await legacyExtraNextTick();
      assert.ok(
        (webClient.el!.querySelector(".o_cp_buttons .o_form_button_edit")! as any).disabled,
        "control panel buttons should be disabled"
      );

      def.resolve();
      await nextTick();
      await legacyExtraNextTick();
      assert.containsOnce(webClient.el!, ".modal .o_form_view");
      assert.notOk(
        (webClient.el!.querySelector(".o_cp_buttons .o_form_button_edit")! as any).disabled,
        "control panel buttons should have been re-enabled"
      );

      await testUtils.dom.click(webClient.el!.querySelector(".modal .cancel-btn"));
      await legacyExtraNextTick();
      assert.notOk(
        (webClient.el!.querySelector(".o_cp_buttons .o_form_button_edit")! as any).disabled,
        "control panel buttons should still be enabled"
      );

      webClient.destroy();
    }
  );

  QUnit.test(
    "requests for execute_action of type object raises error: re-enables buttons",
    async function (assert) {
      assert.expect(3);

      const mockRPC: RPC = async (route, args) => {
        if (route === "/web/dataset/call_button") {
          return Promise.reject();
        }
      };
      const webClient = await createWebClient({ baseConfig, mockRPC });

      await doAction(webClient, 3, { viewType: "form" });
      assert.containsOnce(webClient.el!, ".o_form_view");

      // click on 'Execute action', to execute action 4 in a dialog
      testUtils.dom.click(webClient.el!.querySelector('.o_form_view button[name="object"]'));
      assert.ok((webClient.el!.querySelector(".o_cp_buttons button")! as any).disabled);
      await nextTick();
      await legacyExtraNextTick();
      assert.notOk((webClient.el!.querySelector(".o_cp_buttons button")! as any).disabled);
      webClient.destroy();
    }
  );

  QUnit.test("requests for execute_action of type action are handled", async function (assert) {
    assert.expect(12);

    const mockRPC: RPC = async (route, args) => {
      assert.step((args && args.method) || route);
    };
    const webClient = await createWebClient({ baseConfig, mockRPC });
    await doAction(webClient, 3);

    // open a record in form view
    await testUtils.dom.click($(webClient.el!).find(".o_list_view .o_data_row:first"));
    await legacyExtraNextTick();

    // click on 'Execute action' button (should execute an action)
    assert.containsN(
      webClient.el!,
      ".o_control_panel .breadcrumb-item",
      2,
      "there should be two parts in the breadcrumbs"
    );
    await testUtils.dom.click(
      $(webClient.el!).find(".o_form_view button:contains(Execute action)")
    );
    await legacyExtraNextTick();
    assert.containsN(
      webClient.el!,
      ".o_control_panel .breadcrumb-item",
      3,
      "the returned action should have been stacked over the previous one"
    );
    assert.containsOnce(
      webClient.el!,
      ".o_kanban_view",
      "the returned action should have been executed"
    );

    assert.verifySteps([
      "/wowl/load_menus",
      "/web/action/load",
      "load_views",
      "/web/dataset/search_read", // list for action 3
      "read", // form for action 3
      "/web/action/load", // click on 'Execute action' button
      "load_views",
      "/web/dataset/search_read", // kanban for action 4
    ]);

    webClient.destroy();
  });

  QUnit.test("execute smart button and back", async function (assert) {
    assert.expect(8);

    const mockRPC: RPC = async (route, args) => {
      if (args!.method === "read") {
        assert.notOk("default_partner" in args!.kwargs.context);
      }
      if (route === "/web/dataset/search_read") {
        assert.strictEqual(args!.context.default_partner, 2);
      }
    };
    const webClient = await createWebClient({ baseConfig, mockRPC });

    await doAction(webClient, 24);
    assert.containsOnce(webClient.el!, ".o_form_view");
    assert.containsN(webClient.el!, ".o_form_buttons_view button:not([disabled])", 2);

    await testUtils.dom.click(webClient.el!.querySelector(".oe_stat_button"));
    await legacyExtraNextTick();
    assert.containsOnce(webClient.el!, ".o_kanban_view");

    await testUtils.dom.click(webClient.el!.querySelector(".breadcrumb-item"));
    await legacyExtraNextTick();
    assert.containsOnce(webClient.el!, ".o_form_view");
    assert.containsN(webClient.el!, ".o_form_buttons_view button:not([disabled])", 2);
    webClient.destroy();
  });

  QUnit.test("execute smart button and fails", async function (assert) {
    assert.expect(12);

    const mockRPC: RPC = async (route, args) => {
      assert.step(route);
      if (route === "/web/dataset/search_read") {
        return Promise.reject();
      }
    };
    const webClient = await createWebClient({ baseConfig, mockRPC });

    await doAction(webClient, 24);
    assert.containsOnce(webClient.el!, ".o_form_view");
    assert.containsN(webClient.el!, ".o_form_buttons_view button:not([disabled])", 2);

    await testUtils.dom.click(webClient.el!.querySelector(".oe_stat_button"));
    await legacyExtraNextTick();
    assert.containsOnce(webClient.el!, ".o_form_view");
    assert.containsN(webClient.el!, ".o_form_buttons_view button:not([disabled])", 2);

    assert.verifySteps([
      "/wowl/load_menus",
      "/web/action/load",
      "/web/dataset/call_kw/partner/load_views",
      "/web/dataset/call_kw/partner/read",
      "/web/action/load",
      "/web/dataset/call_kw/partner/load_views",
      "/web/dataset/search_read",
    ]);
    webClient.destroy();
  });

  QUnit.test(
    "requests for execute_action of type object: disable buttons",
    async function (assert) {
      assert.expect(2);

      let def: any;
      const mockRPC: RPC = async (route, args) => {
        if (route === "/web/dataset/call_button") {
          return Promise.resolve(false);
        } else if (args && args.method === "read") {
          await def; // block the 'read' call
        }
      };
      const webClient = await createWebClient({ baseConfig, mockRPC });
      await doAction(webClient, 3);

      // open a record in form view
      await testUtils.dom.click($(webClient.el!).find(".o_list_view .o_data_row:first"));
      await legacyExtraNextTick();

      // click on 'Call method' button (should call an Object method)
      def = testUtils.makeTestPromise();
      await testUtils.dom.click($(webClient.el!).find(".o_form_view button:contains(Call method)"));
      await legacyExtraNextTick();

      // Buttons should be disabled
      assert.strictEqual(
        $(webClient.el!).find(".o_form_view button:contains(Call method)").attr("disabled"),
        "disabled",
        "buttons should be disabled"
      );

      // Release the 'read' call
      def.resolve();
      await testUtils.nextTick();
      await legacyExtraNextTick();

      // Buttons should be enabled after the reload
      assert.strictEqual(
        $(webClient.el!).find(".o_form_view button:contains(Call method)").attr("disabled"),
        undefined,
        "buttons should not be disabled anymore"
      );

      webClient.destroy();
    }
  );

  QUnit.test("can open different records from a multi record view", async function (assert) {
    assert.expect(12);

    const mockRPC: RPC = async (route, args) => {
      assert.step((args && args.method) || route);
    };
    const webClient = await createWebClient({ baseConfig, mockRPC });
    await doAction(webClient, 3);

    // open the first record in form view
    await testUtils.dom.click($(webClient.el!).find(".o_list_view .o_data_row:first"));
    await legacyExtraNextTick();
    assert.strictEqual(
      $(webClient.el!).find(".o_control_panel .breadcrumb-item:last").text(),
      "First record",
      "breadcrumbs should contain the display_name of the opened record"
    );
    assert.strictEqual(
      $(webClient.el!).find(".o_field_widget[name=foo]").text(),
      "yop",
      "should have opened the correct record"
    );

    // go back to list view using the breadcrumbs
    await testUtils.dom.click($(webClient.el!).find(".o_control_panel .breadcrumb a"));
    await legacyExtraNextTick();

    // open the second record in form view
    await testUtils.dom.click($(webClient.el!).find(".o_list_view .o_data_row:nth(1)"));
    await legacyExtraNextTick();
    assert.strictEqual(
      $(webClient.el!).find(".o_control_panel .breadcrumb-item:last").text(),
      "Second record",
      "breadcrumbs should contain the display_name of the opened record"
    );
    assert.strictEqual(
      $(webClient.el!).find(".o_field_widget[name=foo]").text(),
      "blip",
      "should have opened the correct record"
    );

    assert.verifySteps([
      "/wowl/load_menus",
      "/web/action/load",
      "load_views",
      "/web/dataset/search_read", // list
      "read", // form
      "/web/dataset/search_read", // list
      "read", // form
    ]);

    webClient.destroy();
  });

  QUnit.test("restore previous view state when switching back", async function (assert) {
    assert.expect(5);

    baseConfig.serverData!.actions![3].views.unshift([false, "graph"]);
    baseConfig.serverData!.views!["partner,false,graph"] = "<graph/>";

    const webClient = await createWebClient({ baseConfig });
    await doAction(webClient, 3);

    assert.hasClass(
      $(webClient.el!).find(".o_control_panel  .fa-bar-chart-o")[0],
      "active",
      "bar chart button is active"
    );
    assert.doesNotHaveClass(
      $(webClient.el!).find(".o_control_panel  .fa-area-chart")[0],
      "active",
      "line chart button is not active"
    );

    // display line chart
    await testUtils.dom.click($(webClient.el!).find(".o_control_panel  .fa-area-chart"));
    await legacyExtraNextTick();
    assert.hasClass(
      $(webClient.el!).find(".o_control_panel  .fa-area-chart")[0],
      "active",
      "line chart button is now active"
    );

    // switch to kanban and back to graph view
    await cpHelpers.switchView(webClient.el, "kanban");
    await legacyExtraNextTick();
    assert.containsNone(
      webClient.el!,
      ".o_control_panel  .fa-area-chart",
      "graph buttons are no longer in control panel"
    );

    await cpHelpers.switchView(webClient.el, "graph");
    await legacyExtraNextTick();
    assert.hasClass(
      $(webClient.el!).find(".o_control_panel  .fa-area-chart")[0],
      "active",
      "line chart button is still active"
    );
    webClient.destroy();
  });

  QUnit.test("view switcher is properly highlighted in graph view", async function (assert) {
    assert.expect(4);

    baseConfig.serverData!.actions![3].views.splice(1, 1, [false, "graph"]);
    baseConfig.serverData!.views!["partner,false,graph"] = "<graph/>";

    const webClient = await createWebClient({ baseConfig });
    await doAction(webClient, 3);

    assert.hasClass(
      $(webClient.el!).find(".o_control_panel .o_switch_view.o_list")[0],
      "active",
      "list button in control panel is active"
    );
    assert.doesNotHaveClass(
      $(webClient.el!).find(".o_control_panel .o_switch_view.o_graph")[0],
      "active",
      "graph button in control panel is not active"
    );

    // switch to graph view
    await cpHelpers.switchView(webClient.el!, "graph");
    await legacyExtraNextTick();
    assert.doesNotHaveClass(
      $(webClient.el!).find(".o_control_panel .o_switch_view.o_list")[0],
      "active",
      "list button in control panel is not active"
    );
    assert.hasClass(
      $(webClient.el!).find(".o_control_panel .o_switch_view.o_graph")[0],
      "active",
      "graph button in control panel is active"
    );
    webClient.destroy();
  });

  QUnit.test("can interact with search view", async function (assert) {
    assert.expect(2);

    baseConfig.serverData!.views!["partner,false,search"] = `
      <search>
        <group>
          <filter name="foo" string="foo" context="{'group_by': 'foo'}"/>
        </group>
      </search>`;

    const webClient = await createWebClient({ baseConfig });
    await doAction(webClient, 3);

    assert.doesNotHaveClass(
      $(webClient.el!).find(".o_list_table")[0],
      "o_list_table_grouped",
      "list view is not grouped"
    );

    // open group by dropdown
    await testUtils.dom.click(
      $(webClient.el!).find(".o_control_panel .o_cp_bottom_right button:contains(Group By)")
    );

    // click on first link
    await testUtils.dom.click($(webClient.el!).find(".o_control_panel .o_group_by_menu a:first"));
    await legacyExtraNextTick();

    assert.hasClass(
      $(webClient.el!).find(".o_list_table")[0],
      "o_list_table_grouped",
      "list view is now grouped"
    );

    webClient.destroy();
  });

  QUnit.test("can open a many2one external window", async function (assert) {
    assert.expect(9);

    baseConfig.serverData!.models!.partner.records[0].bar = 2;
    baseConfig.serverData!.views!["partner,false,search"] = `
      <search>
        <group>
          <filter name="foo" string="foo" context="{'group_by': 'foo'}"/>
        </group>
      </search>`;
    baseConfig.serverData!.views!["partner,false,form"] = `
      <form>
        <field name="foo"/>
        <field name="bar"/>
      </form>`;

    const mockRPC: RPC = async (route, args) => {
      assert.step(route);
      if (args && args.method === "get_formview_id") {
        return Promise.resolve(false);
      }
    };

    const webClient = await createWebClient({ baseConfig, mockRPC });
    await doAction(webClient, 3);

    // open first record in form view
    await testUtils.dom.click($(webClient.el!).find(".o_data_row:first"));
    await legacyExtraNextTick();
    // click on edit
    await testUtils.dom.click($(webClient.el!).find(".o_control_panel .o_form_button_edit"));
    await legacyExtraNextTick();

    // click on external button for m2o
    await testUtils.dom.click($(webClient.el!).find(".o_external_button"));
    await legacyExtraNextTick();

    assert.verifySteps([
      "/wowl/load_menus",
      "/web/action/load", // initial load action
      "/web/dataset/call_kw/partner/load_views", // load views
      "/web/dataset/search_read", // read list view data
      "/web/dataset/call_kw/partner/read", // read form view data
      "/web/dataset/call_kw/partner/get_formview_id", // get form view id
      "/web/dataset/call_kw/partner", // load form view for modal
      "/web/dataset/call_kw/partner/read", // read data for m2o record
    ]);
    webClient.destroy();
  });

  QUnit.test('ask for confirmation when leaving a "dirty" view', async function (assert) {
    assert.expect(4);

    const webClient = await createWebClient({ baseConfig });
    await doAction(webClient, 4);

    // open record in form view
    await testUtils.dom.click($(webClient.el!).find(".o_kanban_record:first")[0]);
    await legacyExtraNextTick();

    // edit record
    await testUtils.dom.click($(webClient.el!).find(".o_control_panel button.o_form_button_edit"));
    await testUtils.fields.editInput($(webClient.el!).find('input[name="foo"]'), "pinkypie");

    // go back to kanban view
    await testUtils.dom.click($(webClient.el!).find(".o_control_panel .breadcrumb-item:first a"));
    await legacyExtraNextTick();

    assert.strictEqual(
      $(".modal .modal-body").text(),
      "The record has been modified, your changes will be discarded. Do you want to proceed?",
      "should display a modal dialog to confirm discard action"
    );

    // cancel
    await testUtils.dom.click($(".modal .modal-footer button.btn-secondary"));
    await legacyExtraNextTick();

    assert.containsOnce(webClient, ".o_form_view", "should still be in form view");

    // go back again to kanban view
    await testUtils.dom.click($(webClient.el!).find(".o_control_panel .breadcrumb-item:first a"));
    await legacyExtraNextTick();

    // confirm discard
    await testUtils.dom.click($(".modal .modal-footer button.btn-primary"));
    await legacyExtraNextTick();

    assert.containsNone(webClient, ".o_form_view", "should no longer be in form view");
    assert.containsOnce(webClient, ".o_kanban_view", "should be in kanban view");

    webClient.destroy();
  });

  QUnit.test("limit set in action is passed to each created controller", async function (assert) {
    assert.expect(2);

    baseConfig.serverData!.actions![3].limit = 2;
    const webClient = await createWebClient({ baseConfig });
    await doAction(webClient, 3);

    assert.containsN(webClient, ".o_data_row", 2);

    // switch to kanban view
    await cpHelpers.switchView(webClient.el!, "kanban");
    await legacyExtraNextTick();

    assert.containsN(webClient, ".o_kanban_record:not(.o_kanban_ghost)", 2);

    webClient.destroy();
  });

  QUnit.test("go back to a previous action using the breadcrumbs", async function (assert) {
    assert.expect(10);

    const webClient = await createWebClient({ baseConfig });
    await doAction(webClient, 3);

    // open a record in form view
    await testUtils.dom.click($(webClient.el!).find(".o_list_view .o_data_row:first"));
    await legacyExtraNextTick();
    assert.containsN(
      webClient.el!,
      ".o_control_panel .breadcrumb-item",
      2,
      "there should be two controllers in the breadcrumbs"
    );
    assert.strictEqual(
      $(webClient.el!).find(".o_control_panel .breadcrumb-item:last").text(),
      "First record",
      "breadcrumbs should contain the display_name of the opened record"
    );

    // push another action on top of the first one, and come back to the form view
    await doAction(webClient, 4);
    assert.containsN(
      webClient.el!,
      ".o_control_panel .breadcrumb-item",
      3,
      "there should be three controllers in the breadcrumbs"
    );
    assert.strictEqual(
      $(webClient.el!).find(".o_control_panel .breadcrumb-item:last").text(),
      "Partners Action 4",
      "breadcrumbs should contain the name of the current action"
    );
    // go back using the breadcrumbs
    await testUtils.dom.click($(webClient.el!).find(".o_control_panel .breadcrumb a:nth(1)"));
    await legacyExtraNextTick();
    assert.containsN(
      webClient.el!,
      ".o_control_panel .breadcrumb-item",
      2,
      "there should be two controllers in the breadcrumbs"
    );
    assert.strictEqual(
      $(webClient.el!).find(".o_control_panel .breadcrumb-item:last").text(),
      "First record",
      "breadcrumbs should contain the display_name of the opened record"
    );

    // push again the other action on top of the first one, and come back to the list view
    await doAction(webClient, 4);
    assert.containsN(
      webClient.el!,
      ".o_control_panel .breadcrumb-item",
      3,
      "there should be three controllers in the breadcrumbs"
    );
    assert.strictEqual(
      $(webClient.el!).find(".o_control_panel .breadcrumb-item:last").text(),
      "Partners Action 4",
      "breadcrumbs should contain the name of the current action"
    );
    // go back using the breadcrumbs
    await testUtils.dom.click($(webClient.el!).find(".o_control_panel .breadcrumb a:first"));
    await legacyExtraNextTick();
    assert.containsN(
      webClient.el!,
      ".o_control_panel .breadcrumb-item",
      1,
      "there should be one controller in the breadcrumbs"
    );
    assert.strictEqual(
      $(webClient.el!).find(".o_control_panel .breadcrumb-item:last").text(),
      "Partners",
      "breadcrumbs should contain the name of the current action"
    );

    webClient.destroy();
  });

  QUnit.test(
    "form views are restored in readonly when coming back in breadcrumbs",
    async function (assert) {
      assert.expect(2);

      const webClient = await createWebClient({ baseConfig });
      await doAction(webClient, 3);

      // open a record in form view
      await testUtils.dom.click($(webClient.el!).find(".o_list_view .o_data_row:first"));
      await legacyExtraNextTick();
      // switch to edit mode
      await testUtils.dom.click($(webClient.el!).find(".o_control_panel .o_form_button_edit"));
      await legacyExtraNextTick();

      assert.hasClass($(webClient.el!).find(".o_form_view")[0], "o_form_editable");
      // do some other action
      await doAction(webClient, 4);
      // go back to form view
      await testUtils.dom.clickLast($(webClient.el!).find(".o_control_panel .breadcrumb a"));
      await legacyExtraNextTick();
      assert.hasClass($(webClient.el!).find(".o_form_view")[0], "o_form_readonly");

      webClient.destroy();
    }
  );

  QUnit.test("honor group_by specified in actions context", async function (assert) {
    assert.expect(5);

    baseConfig.serverData!.actions![3].context = "{'group_by': 'bar'}";
    baseConfig.serverData!.views!["partner,false,search"] = `
      <search>
        <group>
          <filter name="foo" string="foo" context="{'group_by': 'foo'}"/>
        </group>
      </search>`;

    const webClient = await createWebClient({ baseConfig });
    await doAction(webClient, 3);

    assert.containsOnce(webClient, ".o_list_table_grouped", "should be grouped");
    assert.containsN(
      webClient.el!,
      ".o_group_header",
      2,
      "should be grouped by 'bar' (two groups) at first load"
    );

    // groupby 'bar' using the searchview
    await testUtils.dom.click(
      $(webClient.el!).find(".o_control_panel .o_cp_bottom_right button:contains(Group By)")
    );
    await testUtils.dom.click($(webClient.el!).find(".o_control_panel .o_group_by_menu a:first"));
    await legacyExtraNextTick();

    assert.containsN(
      webClient.el!,
      ".o_group_header",
      5,
      "should be grouped by 'foo' (five groups)"
    );

    // remove the groupby in the searchview
    await testUtils.dom.click(
      $(webClient.el!).find(".o_control_panel .o_searchview .o_facet_remove")
    );
    await legacyExtraNextTick();

    assert.containsOnce(webClient, ".o_list_table_grouped", "should still be grouped");
    assert.containsN(
      webClient.el!,
      ".o_group_header",
      2,
      "should be grouped by 'bar' (two groups) at reload"
    );

    webClient.destroy();
  });

  QUnit.test("switch request to unknown view type", async function (assert) {
    assert.expect(8);

    baseConfig.serverData!.actions![33] = {
      id: 33,
      name: "Partners",
      res_model: "partner",
      type: "ir.actions.act_window",
      views: [
        [false, "list"],
        [1, "kanban"],
      ], // no form view
    };

    const mockRPC: RPC = async (route, args) => {
      assert.step((args && args.method) || route);
    };
    const webClient = await createWebClient({ baseConfig, mockRPC });
    await doAction(webClient, 33);

    assert.containsOnce(webClient, ".o_list_view", "should display the list view");

    // try to open a record in a form view
    testUtils.dom.click($(webClient.el!).find(".o_list_view .o_data_row:first"));
    await legacyExtraNextTick();
    assert.containsOnce(webClient, ".o_list_view", "should still display the list view");
    assert.containsNone(webClient, ".o_form_view", "should not display the form view");

    assert.verifySteps([
      "/wowl/load_menus",
      "/web/action/load",
      "load_views",
      "/web/dataset/search_read",
    ]);

    webClient.destroy();
  });

  QUnit.test("save current search", async function (assert) {
    assert.expect(4);

    testUtils.mock.patch(ListController, {
      getOwnedQueryParams: function () {
        return {
          context: {
            shouldBeInFilterContext: true,
          },
        };
      },
    });

    baseConfig.serverData!.actions![33] = {
      id: 33,
      context: {
        shouldNotBeInFilterContext: false,
      },
      name: "Partners",
      res_model: "partner",
      search_view_id: [1, "a custom search view"],
      type: "ir.actions.act_window",
      views: [[false, "list"]],
    };

    const legacyParams = {
      dataManager: {
        create_filter: function (filter: any) {
          assert.strictEqual(filter.domain, `[("bar", "=", 1)]`, "should save the correct domain");
          const expectedContext = {
            group_by: [], // default groupby is an empty list
            shouldBeInFilterContext: true,
          };
          assert.deepEqual(filter.context, expectedContext, "should save the correct context");
        },
      },
    };
    const webClient = await createWebClient({ baseConfig, legacyParams });
    await doAction(webClient, 33);

    assert.containsN(webClient, ".o_data_row", 5, "should contain 5 records");

    // filter on bar
    await cpHelpers.toggleFilterMenu(webClient.el!);
    await cpHelpers.toggleMenuItem(webClient.el!, "Bar");

    assert.containsN(webClient, ".o_data_row", 2);

    // save filter
    await cpHelpers.toggleFavoriteMenu(webClient.el!);
    await cpHelpers.toggleSaveFavorite(webClient.el!);
    await cpHelpers.editFavoriteName(webClient.el!, "some name");
    await cpHelpers.saveFavorite(webClient.el!);
    await legacyExtraNextTick();

    testUtils.mock.unpatch(ListController);
    webClient.destroy();
  });

  QUnit.test(
    "list with default_order and favorite filter with no orderedBy",
    async function (assert) {
      assert.expect(5);

      baseConfig.serverData!.views!["partner,1,list"] =
        '<tree default_order="foo desc"><field name="foo"/></tree>';
      baseConfig.serverData!.actions![100] = {
        id: 100,
        name: "Partners",
        res_model: "partner",
        type: "ir.actions.act_window",
        views: [
          [1, "list"],
          [false, "form"],
        ],
      };
      baseConfig.serverData!.models!.partner.filters = [
        {
          name: "favorite filter",
          id: 5,
          context: "{}",
          sort: "[]",
          domain: '[("bar", "=", 1)]',
          is_default: false,
        },
      ];

      const webClient = await createWebClient({ baseConfig });
      await doAction(webClient, 100);

      assert.strictEqual(
        $(webClient.el!).find(".o_list_view tr.o_data_row .o_data_cell").text(),
        "zoupyopplopgnapblip",
        "record should be in descending order as default_order applies"
      );

      await cpHelpers.toggleFavoriteMenu(webClient.el!);
      await cpHelpers.toggleMenuItem(webClient.el!, "favorite filter");
      await legacyExtraNextTick();

      assert.strictEqual(
        $(webClient.el!).find(".o_control_panel .o_facet_values").text().trim(),
        "favorite filter",
        "favorite filter should be applied"
      );
      assert.strictEqual(
        $(webClient.el!).find(".o_list_view tr.o_data_row .o_data_cell").text(),
        "gnapblip",
        "record should still be in descending order after default_order applied"
      );

      // go to formview and come back to listview
      await testUtils.dom.click($(webClient.el!).find(".o_list_view .o_data_row:first"));
      await legacyExtraNextTick();
      await testUtils.dom.click($(webClient.el!).find(".o_control_panel .breadcrumb a:eq(0)"));
      await legacyExtraNextTick();
      assert.strictEqual(
        $(webClient.el!).find(".o_list_view tr.o_data_row .o_data_cell").text(),
        "gnapblip",
        "order of records should not be changed, while coming back through breadcrumb"
      );

      // remove filter
      await cpHelpers.removeFacet(webClient.el!, 0);
      await legacyExtraNextTick();
      assert.strictEqual(
        $(webClient.el!).find(".o_list_view tr.o_data_row .o_data_cell").text(),
        "zoupyopplopgnapblip",
        "order of records should not be changed, after removing current filter"
      );

      webClient.destroy();
    }
  );

  QUnit.test(
    "search menus are still available when switching between actions",
    async function (assert) {
      assert.expect(3);

      const webClient = await createWebClient({ baseConfig });

      await doAction(webClient, 1);
      assert.isVisible(
        webClient.el!.querySelector(".o_search_options .o_dropdown.o_filter_menu") as HTMLElement,
        "the search options should be available"
      );

      await doAction(webClient, 3);
      assert.isVisible(
        webClient.el!.querySelector(".o_search_options .o_dropdown.o_filter_menu") as HTMLElement,
        "the search options should be available"
      );

      // go back using the breadcrumbs
      await testUtils.dom.click($(webClient.el!).find(".o_control_panel .breadcrumb a:first"));
      await legacyExtraNextTick();
      assert.isVisible(
        webClient.el!.querySelector(".o_search_options .o_dropdown.o_filter_menu") as HTMLElement,
        "the search options should be available"
      );

      webClient.destroy();
    }
  );

  QUnit.test("current act_window action is stored in session_storage", async function (assert) {
    assert.expect(1);

    const expectedAction = {
      ...baseConfig.serverData!.actions![3],
      context: {
        lang: "en",
        uid: 7,
        tz: "taht",
      },
    };
    const sessionStorage = baseConfig.browser!.sessionStorage;
    baseConfig.browser!.sessionStorage = Object.assign(Object.create(sessionStorage!), {
      setItem(k: any, value: any) {
        assert.strictEqual(
          value,
          JSON.stringify(expectedAction),
          "should store the executed action in the sessionStorage"
        );
      },
    });
    const webClient = await createWebClient({ baseConfig });
    await doAction(webClient, 3);
    webClient.destroy();
  });

  QUnit.test(
    "store evaluated context of current action in session_storage",
    async function (assert) {
      // this test ensures that we don't store stringified instances of
      // CompoundContext in the session_storage, as they would be meaningless
      // once restored
      assert.expect(1);

      const expectedAction = {
        ...baseConfig.serverData!.actions![4],
        context: {
          lang: "en",
          uid: 7,
          tz: "taht",
          active_model: "partner",
          active_id: 1,
          active_ids: [1],
        },
      };
      let checkSessionStorage = false;

      const sessionStorage = baseConfig.browser!.sessionStorage;
      baseConfig.browser!.sessionStorage = Object.assign(Object.create(sessionStorage!), {
        setItem(k: any, value: any) {
          if (checkSessionStorage) {
            assert.strictEqual(
              value,
              JSON.stringify(expectedAction),
              "should store the executed action in the sessionStorage"
            );
          }
        },
      });
      const webClient = await createWebClient({ baseConfig });

      // execute an action and open a record in form view
      await doAction(webClient, 3);
      await testUtils.dom.click($(webClient.el!).find(".o_list_view .o_data_row:first"));
      await legacyExtraNextTick();

      // click on 'Execute action' button (it executes an action with a CompoundContext as context)
      checkSessionStorage = true;
      await testUtils.dom.click(
        $(webClient.el!).find(".o_form_view button:contains(Execute action)")
      );
      await legacyExtraNextTick();

      webClient.destroy();
    }
  );

  QUnit.test("destroy action with lazy loaded controller", async function (assert) {
    assert.expect(6);

    const webClient = await createWebClient({ baseConfig });
    await loadState(webClient, {
      action: "3",
      id: "2",
      view_type: "form",
    });
    assert.containsNone(webClient, ".o_list_view");
    assert.containsOnce(webClient, ".o_form_view");
    assert.containsN(
      webClient.el!,
      ".o_control_panel .breadcrumb-item",
      2,
      "there should be two controllers in the breadcrumbs"
    );
    assert.strictEqual(
      $(webClient.el!).find(".o_control_panel .breadcrumb-item:last").text(),
      "Second record",
      "breadcrumbs should contain the display_name of the opened record"
    );

    await doAction(webClient, 1, { clearBreadcrumbs: true });

    assert.containsNone(webClient, ".o_form_view");
    assert.containsOnce(webClient, ".o_kanban_view");

    webClient.destroy();
  });

  QUnit.test("execute action from dirty, new record, and come back", async function (assert) {
    assert.expect(18);

    baseConfig.serverData!.models!.partner.fields.bar.default = 1;
    baseConfig.serverData!.views!["partner,false,form"] = `
      <form>
        <field name="foo"/>
        <field name="bar" readonly="1"/>
      </form>`;

    const mockRPC: RPC = async (route, args) => {
      assert.step((args && args.method) || route);
      if (args && args.method === "get_formview_action") {
        return Promise.resolve({
          res_id: 1,
          res_model: "partner",
          type: "ir.actions.act_window",
          views: [[false, "form"]],
        });
      }
    };
    const webClient = await createWebClient({ baseConfig, mockRPC });

    // execute an action and create a new record
    await doAction(webClient, 3);
    await testUtils.dom.click($(webClient.el!).find(".o_list_button_add"));
    await legacyExtraNextTick();
    assert.containsOnce(webClient, ".o_form_view.o_form_editable");
    assert.containsOnce(webClient, ".o_form_uri:contains(First record)");
    assert.strictEqual(
      $(webClient.el!).find(".o_control_panel .breadcrumb-item").text(),
      "PartnersNew"
    );

    // set form view dirty and open m2o record
    await testUtils.fields.editInput($(webClient.el!).find("input[name=foo]"), "val");
    await testUtils.dom.click($(webClient.el!).find(".o_form_uri:contains(First record)"));
    await legacyExtraNextTick();
    assert.containsOnce(document.body, ".modal"); // confirm discard dialog

    // confirm discard changes
    await testUtils.dom.click($(".modal .modal-footer .btn-primary"));
    await legacyExtraNextTick();

    assert.containsOnce(webClient, ".o_form_view.o_form_readonly");
    assert.strictEqual(
      $(webClient.el!).find(".o_control_panel .breadcrumb-item").text(),
      "PartnersNewFirst record"
    );

    // go back to New using the breadcrumbs
    await testUtils.dom.click($(webClient.el!).find(".o_control_panel .breadcrumb-item:nth(1) a"));
    await legacyExtraNextTick();
    assert.containsOnce(webClient, ".o_form_view.o_form_editable");
    assert.strictEqual(
      $(webClient.el!).find(".o_control_panel .breadcrumb-item").text(),
      "PartnersNew"
    );

    assert.verifySteps([
      "/wowl/load_menus",
      "/web/action/load", // action 3
      "load_views", // views of action 3
      "/web/dataset/search_read", // list
      "onchange", // form (create)
      "get_formview_action", // click on m2o
      "load_views", // form view of dynamic action
      "read", // form
      "onchange", // form (create)
    ]);

    webClient.destroy();
  });

  QUnit.test("execute a contextual action from a form view", async function (assert) {
    assert.expect(4);

    const contextualAction = baseConfig.serverData!.actions![8];
    contextualAction.context = "{}"; // need a context to evaluate
    baseConfig.serverData!.models!.partner.toolbar = {
      action: [contextualAction],
      print: [],
    };

    const mockRPC: RPC = async (route, args) => {
      if (args && args.method === "load_views" && args.model === "partner") {
        assert.strictEqual(args.kwargs.options.toolbar, true, "should ask for toolbar information");
      }
    };
    const webClient = await createWebClient({ baseConfig, mockRPC });

    // execute an action and open a record
    await doAction(webClient, 3);
    assert.containsOnce(webClient, ".o_list_view");
    await testUtils.dom.click($(webClient.el!).find(".o_data_row:first"));
    await legacyExtraNextTick();
    assert.containsOnce(webClient, ".o_form_view");

    // execute the custom action from the action menu
    await cpHelpers.toggleActionMenu(webClient.el!);
    await cpHelpers.toggleMenuItem(webClient.el!, "Favorite Ponies");
    await legacyExtraNextTick();
    assert.containsOnce(webClient, ".o_list_view");

    webClient.destroy();
  });

  QUnit.test("go back to action with form view as main view, and res_id", async function (assert) {
    assert.expect(7);

    baseConfig.serverData!.actions![999] = {
      id: 999,
      name: "Partner",
      res_model: "partner",
      type: "ir.actions.act_window",
      res_id: 2,
      views: [[44, "form"]],
    };
    baseConfig.serverData!.views!["partner,44,form"] = '<form><field name="m2o"/></form>';

    const mockRPC: RPC = async (route, args) => {
      if (args!.method === "get_formview_action") {
        return Promise.resolve({
          res_id: 3,
          res_model: "partner",
          type: "ir.actions.act_window",
          views: [[false, "form"]],
        });
      }
    };
    const webClient = await createWebClient({ baseConfig, mockRPC });

    await doAction(webClient, 999);

    assert.containsOnce(webClient.el!, ".o_form_view");
    assert.hasClass(webClient.el!.querySelector(".o_form_view")! as HTMLElement, "o_form_readonly");
    assert.strictEqual(
      webClient.el!.querySelector(".o_control_panel .breadcrumb")!.textContent,
      "Second record"
    );

    // push another action in the breadcrumb
    await testUtils.dom.click($(webClient.el!).find(".o_form_uri:contains(Third record)"));
    await legacyExtraNextTick();
    assert.strictEqual(
      webClient.el!.querySelector(".o_control_panel .breadcrumb")!.textContent,
      "Second recordThird record"
    );

    // go back to the form view
    await testUtils.dom.click($(webClient.el!).find(".o_control_panel .breadcrumb a:first"));
    await legacyExtraNextTick();

    assert.containsOnce(webClient.el!, ".o_form_view");
    assert.hasClass(webClient.el!.querySelector(".o_form_view")! as HTMLElement, "o_form_readonly");
    assert.strictEqual(
      webClient.el!.querySelector(".o_control_panel .breadcrumb-item")!.textContent,
      "Second record"
    );

    webClient.destroy();
  });

  QUnit.test("open a record, come back, and create a new record", async function (assert) {
    assert.expect(7);

    const webClient = await createWebClient({ baseConfig });

    // execute an action and open a record
    await doAction(webClient, 3);
    assert.containsOnce(webClient.el!, ".o_list_view");
    assert.containsN(webClient.el!, ".o_list_view .o_data_row", 5);

    await testUtils.dom.click($(webClient.el!).find(".o_list_view .o_data_row:first"));
    await legacyExtraNextTick();
    assert.containsOnce(webClient.el!, ".o_form_view");
    assert.hasClass(webClient.el!.querySelector(".o_form_view") as HTMLElement, "o_form_readonly");

    // go back using the breadcrumbs
    await testUtils.dom.click($(webClient.el!).find(".o_control_panel .breadcrumb-item a"));
    await legacyExtraNextTick();
    assert.containsOnce(webClient.el!, ".o_list_view");

    // create a new record
    await testUtils.dom.click($(webClient.el!).find(".o_list_button_add"));
    await legacyExtraNextTick();
    assert.containsOnce(webClient.el!, ".o_form_view");
    assert.hasClass(webClient.el!.querySelector(".o_form_view") as HTMLElement, "o_form_editable");

    webClient.destroy();
  });

  QUnit.test(
    "open form view, use the pager, execute action, and come back",
    async function (assert) {
      assert.expect(8);

      const webClient = await createWebClient({ baseConfig });

      // execute an action and open a record
      await doAction(webClient, 3);
      assert.containsOnce(webClient.el!, ".o_list_view");
      assert.containsN(webClient.el!, ".o_list_view .o_data_row", 5);
      await testUtils.dom.click($(webClient.el!).find(".o_list_view .o_data_row:first"));
      await legacyExtraNextTick();
      assert.containsOnce(webClient.el!, ".o_form_view");
      assert.strictEqual(
        $(webClient.el!).find(".o_field_widget[name=display_name]").text(),
        "First record"
      );

      // switch to second record
      await testUtils.dom.click($(webClient.el!).find(".o_pager_next"));
      assert.strictEqual(
        $(webClient.el!).find(".o_field_widget[name=display_name]").text(),
        "Second record"
      );

      // execute an action from the second record
      await testUtils.dom.click($(webClient.el!).find(".o_statusbar_buttons button[name=4]"));
      await legacyExtraNextTick();
      assert.containsOnce(webClient.el!, ".o_kanban_view");

      // go back using the breadcrumbs
      await testUtils.dom.click(
        $(webClient.el!).find(".o_control_panel .breadcrumb-item:nth(1) a")
      );
      await legacyExtraNextTick();
      assert.containsOnce(webClient.el!, ".o_form_view");
      assert.strictEqual(
        $(webClient.el!).find(".o_field_widget[name=display_name]").text(),
        "Second record"
      );

      webClient.destroy();
    }
  );

  QUnit.test(
    "create a new record in a form view, execute action, and come back",
    async function (assert) {
      assert.expect(8);

      const webClient = await createWebClient({ baseConfig });

      // execute an action and create a new record
      await doAction(webClient, 3);
      assert.containsOnce(webClient.el!, ".o_list_view");
      await testUtils.dom.click($(webClient.el!).find(".o_list_button_add"));
      await legacyExtraNextTick();
      assert.containsOnce(webClient.el!, ".o_form_view");
      assert.hasClass($(webClient.el!).find(".o_form_view")[0], "o_form_editable");
      await testUtils.fields.editInput(
        $(webClient.el!).find(".o_field_widget[name=display_name]"),
        "another record"
      );
      await testUtils.dom.click($(webClient.el!).find(".o_form_button_save"));
      assert.hasClass($(webClient.el!).find(".o_form_view")[0], "o_form_readonly");

      // execute an action from the second record
      await testUtils.dom.click($(webClient.el!).find(".o_statusbar_buttons button[name=4]"));
      await legacyExtraNextTick();
      assert.containsOnce(webClient.el!, ".o_kanban_view");

      // go back using the breadcrumbs
      await testUtils.dom.click(
        $(webClient.el!).find(".o_control_panel .breadcrumb-item:nth(1) a")
      );
      await legacyExtraNextTick();
      assert.containsOnce(webClient.el!, ".o_form_view");
      assert.hasClass($(webClient.el!).find(".o_form_view")[0], "o_form_readonly");
      assert.strictEqual(
        $(webClient.el!).find(".o_field_widget[name=display_name]").text(),
        "another record"
      );

      webClient.destroy();
    }
  );

  QUnit.module('Actions in target="new"');

  QUnit.test('can execute act_window actions in target="new"', async function (assert) {
    assert.expect(8);

    const mockRPC: RPC = async (route, args) => {
      assert.step((args && args.method) || route);
    };
    const webClient = await createWebClient({ baseConfig, mockRPC });
    await doAction(webClient, 5);

    assert.containsOnce(
      document.body,
      ".o_technical_modal .o_form_view",
      "should have rendered a form view in a modal"
    );
    assert.hasClass(
      $(".o_technical_modal .modal-body")[0],
      "o_act_window",
      "dialog main element should have classname 'o_act_window'"
    );
    assert.hasClass(
      $(".o_technical_modal .o_form_view")[0],
      "o_form_editable",
      "form view should be in edit mode"
    );

    assert.verifySteps(["/wowl/load_menus", "/web/action/load", "load_views", "onchange"]);

    webClient.destroy();
  });

  QUnit.test("chained action on_close", async function (assert) {
    assert.expect(4);

    function onClose(closeInfo: any) {
      assert.strictEqual(closeInfo, "smallCandle");
      assert.step("Close Action");
    }

    const webClient = await createWebClient({ baseConfig });
    await doAction(webClient, 5, { onClose });

    // a target=new action shouldn't activate the on_close
    await doAction(webClient, 5);
    assert.verifySteps([]);

    // An act_window_close should trigger the on_close
    await doAction(webClient, { type: "ir.actions.act_window_close", infos: "smallCandle" });
    assert.verifySteps(["Close Action"]);

    webClient.destroy();
  });

  QUnit.test("footer buttons are moved to the dialog footer", async function (assert) {
    assert.expect(3);

    baseConfig.serverData!.views!["partner,false,form"] = `
      <form>
        <field name="display_name"/>
        <footer>
          <button string="Create" type="object" class="infooter"/>
        </footer>
      </form>`;

    const webClient = await createWebClient({ baseConfig });
    await doAction(webClient, 5);

    assert.containsNone(
      $(".o_technical_modal .modal-body")[0],
      "button.infooter",
      "the button should not be in the body"
    );
    assert.containsOnce(
      $(".o_technical_modal .modal-footer")[0],
      "button.infooter",
      "the button should be in the footer"
    );
    assert.containsOnce(
      $(".o_technical_modal .modal-footer")[0],
      "button",
      "the modal footer should only contain one button"
    );

    webClient.destroy();
  });

  QUnit.test("Button with `close` attribute closes dialog", async function (assert) {
    assert.expect(19);

    baseConfig.serverData!.views! = {
      "partner,false,form": `
        <form>
          <header>
            <button string="Open dialog" name="5" type="action"/>
          </header>
        </form>
      `,
      "partner,view_ref,form": `
          <form>
            <footer>
              <button string="I close the dialog" name="some_method" type="object" close="1"/>
            </footer>
          </form>
      `,
      "partner,false,search": "<search></search>",
    };

    baseConfig.serverData!.actions![4] = {
      id: 4,
      name: "Partners Action 4",
      res_model: "partner",
      type: "ir.actions.act_window",
      views: [[false, "form"]],
    };
    baseConfig.serverData!.actions![5] = {
      id: 5,
      name: "Create a Partner",
      res_model: "partner",
      target: "new",
      type: "ir.actions.act_window",
      views: [["view_ref", "form"]],
    };

    const mockRPC: RPC = async (route, args) => {
      assert.step(route);
      if (route === "/web/dataset/call_button" && args!.method === "some_method") {
        return {
          tag: "display_notification",
          type: "ir.actions.client",
        };
      }
    };

    const webClient = await createWebClient({ baseConfig, mockRPC });
    assert.verifySteps(["/wowl/load_menus"]);
    await doAction(webClient, 4);
    assert.verifySteps([
      "/web/action/load",
      "/web/dataset/call_kw/partner/load_views",
      "/web/dataset/call_kw/partner/onchange",
    ]);

    await testUtils.dom.click(`button[name="5"]`);
    assert.verifySteps([
      "/web/dataset/call_kw/partner/create",
      "/web/dataset/call_kw/partner/read",
      "/web/action/load",
      "/web/dataset/call_kw/partner/load_views",
      "/web/dataset/call_kw/partner/onchange",
    ]);
    await legacyExtraNextTick();
    assert.strictEqual($(".modal").length, 1, "It should display a modal");
    await testUtils.dom.click(`button[name="some_method"]`);
    assert.verifySteps([
      "/web/dataset/call_kw/partner/create",
      "/web/dataset/call_kw/partner/read",
      "/web/dataset/call_button",
      "/web/dataset/call_kw/partner/read",
    ]);
    await legacyExtraNextTick();
    assert.strictEqual($(".modal").length, 0, "It should have closed the modal");
    webClient.destroy();
  });

  QUnit.test('on_attach_callback is called for actions in target="new"', async function (assert) {
    assert.expect(3);

    const ClientAction = AbstractAction.extend({
      on_attach_callback: function () {
        assert.step("on_attach_callback");
        assert.containsOnce(
          document.body,
          ".modal .o_test",
          "should have rendered the client action in a dialog"
        );
      },
      start: function () {
        this.$el.addClass("o_test");
      },
    });
    core.action_registry.add("test", ClientAction);

    const webClient = await createWebClient({ baseConfig });
    await doAction(webClient, {
      tag: "test",
      target: "new",
      type: "ir.actions.client",
    });

    assert.verifySteps(["on_attach_callback"]);

    webClient.destroy();
    delete core.action_registry.map.test;
    baseConfig.actionRegistry!.remove("test");
  });

  QUnit.module('Actions in target="inline"');

  QUnit.test(
    'form views for actions in target="inline" open in edit mode',
    async function (assert) {
      assert.expect(6);

      const mockRPC: RPC = async (route, args) => {
        assert.step(args!.method || route);
      };
      const webClient = await createWebClient({ baseConfig, mockRPC });
      await doAction(webClient, 6);

      assert.containsOnce(
        webClient,
        ".o_form_view.o_form_editable",
        "should have rendered a form view in edit mode"
      );

      assert.verifySteps(["/wowl/load_menus", "/web/action/load", "load_views", "read"]);

      webClient.destroy();
    }
  );

  QUnit.test("breadcrumbs and actions with target inline", async function (assert) {
    assert.expect(4);

    baseConfig.serverData!.actions![4].views = [[false, "form"]];
    baseConfig.serverData!.actions![4].target = "inline";

    const webClient = await createWebClient({ baseConfig });

    await doAction(webClient, 4);
    assert.containsNone(webClient, ".o_control_panel");

    await doAction(webClient, 1, { clearBreadcrumbs: true });
    assert.containsOnce(webClient, ".o_control_panel");
    assert.isVisible(webClient.el!.querySelector(".o_control_panel") as HTMLElement);
    assert.strictEqual(
      webClient.el!.querySelector(".o_control_panel .breadcrumb")!.textContent,
      "Partners Action 1",
      "should have only one current action visible in breadcrumbs"
    );

    webClient.destroy();
  });

  QUnit.module('Actions in target="fullscreen"');

  QUnit.test(
    'correctly execute act_window actions in target="fullscreen"',
    async function (assert) {
      assert.expect(3);

      baseConfig.serverData!.actions![1].target = "fullscreen";

      const webClient = await createWebClient({ baseConfig });
      await doAction(webClient, 1);

      assert.containsOnce(
        webClient.el!,
        ".o_control_panel",
        "should have rendered a control panel"
      );
      assert.containsOnce(webClient, ".o_kanban_view", "should have rendered a kanban view");
      assert.isNotVisible(webClient.el!.querySelector(".o_main_navbar") as HTMLElement);

      webClient.destroy();
    }
  );

  QUnit.test('fullscreen on action change: back to a "current" action', async function (assert) {
    assert.expect(3);

    baseConfig.serverData!.actions![1].target = "fullscreen";
    baseConfig.serverData!.views![
      "partner,false,form"
    ] = `<form><button name="1" type="action" class="oe_stat_button" /></form>`;

    const webClient = await createWebClient({ baseConfig });
    await doAction(webClient, 6);
    assert.isVisible(webClient.el!.querySelector(".o_main_navbar") as HTMLElement);

    await testUtils.dom.click($(webClient.el!).find("button[name=1]"));
    await legacyExtraNextTick();
    assert.isNotVisible(webClient.el!.querySelector(".o_main_navbar") as HTMLElement);

    await testUtils.dom.click($(webClient.el!).find(".breadcrumb li a:first"));
    await legacyExtraNextTick();
    assert.isVisible(webClient.el!.querySelector(".o_main_navbar") as HTMLElement);

    webClient.destroy();
  });

  QUnit.test('fullscreen on action change: all "fullscreen" actions', async function (assert) {
    assert.expect(3);

    baseConfig.serverData!.actions![6].target = "fullscreen";
    baseConfig.serverData!.views![
      "partner,false,form"
    ] = `<form><button name="1" type="action" class="oe_stat_button" /></form>`;

    const webClient = await createWebClient({ baseConfig });
    await doAction(webClient, 6);
    assert.isNotVisible(webClient.el!.querySelector(".o_main_navbar") as HTMLElement);

    await testUtils.dom.click($(webClient.el!).find("button[name=1]"));
    await legacyExtraNextTick();
    assert.isNotVisible(webClient.el!.querySelector(".o_main_navbar") as HTMLElement);

    await testUtils.dom.click($(webClient.el!).find(".breadcrumb li a:first"));
    await legacyExtraNextTick();
    assert.isNotVisible(webClient.el!.querySelector(".o_main_navbar") as HTMLElement);

    webClient.destroy();
  });

  QUnit.module('"ir.actions.act_window_close" actions');

  QUnit.test("close the currently opened dialog", async function (assert) {
    assert.expect(2);

    const webClient = await createWebClient({ baseConfig });

    // execute an action in target="new"
    await doAction(webClient, 5);
    assert.containsOnce(
      document.body,
      ".o_technical_modal .o_form_view",
      "should have rendered a form view in a modal"
    );

    // execute an 'ir.actions.act_window_close' action
    await doAction(webClient, {
      type: "ir.actions.act_window_close",
    });
    assert.containsNone(document.body, ".o_technical_modal", "should have closed the modal");

    webClient.destroy();
  });

  QUnit.test('execute "on_close" only if there is no dialog to close', async function (assert) {
    assert.expect(3);

    const webClient = await createWebClient({ baseConfig });

    // execute an action in target="new"
    await doAction(webClient, 5);

    function onClose() {
      assert.step("on_close");
    }
    const options = { onClose };
    // execute an 'ir.actions.act_window_close' action
    // should not call 'on_close' as there is a dialog to close
    await doAction(webClient, { type: "ir.actions.act_window_close" }, options);

    assert.verifySteps([]);

    // execute again an 'ir.actions.act_window_close' action
    // should call 'on_close' as there is no dialog to close
    await doAction(webClient, { type: "ir.actions.act_window_close" }, options);

    assert.verifySteps(["on_close"]);

    webClient.destroy();
  });

  QUnit.test("close action with provided infos", async function (assert) {
    assert.expect(1);

    const webClient = await createWebClient({ baseConfig });

    const options = {
      onClose: function (infos: any) {
        assert.strictEqual(infos, "just for testing", "should have the correct close infos");
      },
    };

    await doAction(
      webClient,
      {
        type: "ir.actions.act_window_close",
        infos: "just for testing",
      },
      options
    );

    webClient.destroy();
  });

  QUnit.test("history back calls on_close handler of dialog action", async function (assert) {
    assert.expect(4);

    const webClient = await createWebClient({ baseConfig });

    function onClose() {
      assert.step("on_close");
    }
    // open a new dialog form
    await doAction(webClient, 5, { onClose });
    assert.containsOnce(webClient.el!, ".modal");

    const ev = new Event("history-back", { bubbles: true, cancelable: true });
    webClient.el!.querySelector(".o_view_controller")!.dispatchEvent(ev);
    assert.verifySteps(["on_close"], "should have called the on_close handler");
    await nextTick();
    assert.containsNone(webClient.el!, ".modal");
    webClient.destroy();
  });

  QUnit.test(
    "history back calls on_close handler of dialog action with 2 breadcrumbs",
    async function (assert) {
      assert.expect(7);

      const webClient = await createWebClient({ baseConfig });
      await doAction(webClient, 1); // kanban
      await doAction(webClient, 3); // list
      assert.containsOnce(webClient.el!, ".o_list_view");

      function onClose() {
        assert.step("on_close");
      }
      // open a new dialog form
      await doAction(webClient, 5, { onClose });
      assert.containsOnce(webClient.el!, ".modal");
      assert.containsOnce(webClient.el!, ".o_list_view");

      const ev = new Event("history-back", { bubbles: true, cancelable: true });
      webClient.el!.querySelector(".o_view_controller")!.dispatchEvent(ev);
      assert.verifySteps(["on_close"], "should have called the on_close handler");
      await nextTick();
      await legacyExtraNextTick();
      assert.containsOnce(webClient.el!, ".o_list_view");
      assert.containsNone(webClient.el!, ".modal");

      webClient.destroy();
    }
  );

  QUnit.test("web client is not deadlocked when a view crashes", async function (assert) {
    assert.expect(3);

    const readOnFirstRecordDef = testUtils.makeTestPromise();

    const mockRPC: RPC = (route, args) => {
      if (args!.method === "read" && args!.args[0][0] === 1) {
        return readOnFirstRecordDef;
      }
    };
    const webClient = await createWebClient({ baseConfig, mockRPC });

    await doAction(webClient, 3);

    // open first record in form view. this will crash and will not
    // display a form view
    await testUtils.dom.click($(webClient.el!).find(".o_list_view .o_data_row:first"));
    await legacyExtraNextTick();

    readOnFirstRecordDef.reject("not working as intended");
    await nextTick();
    assert.containsOnce(webClient, ".o_list_view", "there should still be a list view in dom");

    // open another record, the read will not crash
    await testUtils.dom.click($(webClient.el!).find(".o_list_view .o_data_row:eq(2)"));
    await legacyExtraNextTick();

    assert.containsNone(webClient, ".o_list_view", "there should not be a list view in dom");

    assert.containsOnce(webClient, ".o_form_view", "there should be a form view in dom");

    webClient.destroy();
  });

  QUnit.module("Search View Action");

  QUnit.test("search view should keep focus during do_search", async function (assert) {
    assert.expect(5);

    // One should be able to type something in the search view, press on enter to
    // make the facet and trigger the search, then do this process
    // over and over again seamlessly.
    // Verifying the input's value is a lot trickier than verifying the search_read
    // because of how native events are handled in tests

    const searchPromise = testUtils.makeTestPromise();

    const mockRPC: RPC = async (route, args) => {
      if (route === "/web/dataset/search_read") {
        assert.step("search_read " + args!.domain);
        if (JSON.stringify(args!.domain) === JSON.stringify([["foo", "ilike", "m"]])) {
          await searchPromise;
        }
      }
    };
    const webClient = await createWebClient({ baseConfig, mockRPC });
    await doAction(webClient, 3);

    await cpHelpers.editSearch(webClient.el!, "m");
    await cpHelpers.validateSearch(webClient.el!);

    assert.verifySteps(["search_read ", "search_read foo,ilike,m"]);

    // Triggering the do_search above will kill the current searchview Input
    await cpHelpers.editSearch(webClient.el!, "o");

    // We have something in the input of the search view. Making the search_read
    // return at this point will trigger the redraw of the view.
    // However we want to hold on to what we just typed
    searchPromise.resolve();
    await cpHelpers.validateSearch(webClient.el!);

    assert.verifySteps(["search_read |,foo,ilike,m,foo,ilike,o"]);

    webClient.destroy();
  });

  QUnit.test(
    "Call twice clearUncommittedChanges in a row does not display twice the discard warning",
    async function (assert) {
      assert.expect(4);

      const webClient = await createWebClient({ baseConfig });

      // execute an action and edit existing record
      await doAction(webClient, 3);

      await testUtils.dom.click($(webClient.el!).find(".o_list_view .o_data_row:first"));
      await legacyExtraNextTick();
      assert.containsOnce(webClient, ".o_form_view.o_form_readonly");

      await testUtils.dom.click($(webClient.el!).find(".o_control_panel .o_form_button_edit"));
      assert.containsOnce(webClient, ".o_form_view.o_form_editable");

      await testUtils.fields.editInput($(webClient.el!).find("input[name=foo]"), "val");
      clearUncommittedChanges(webClient.env);
      await testUtils.nextTick();
      await legacyExtraNextTick();

      assert.containsOnce(document.body, ".modal"); // confirm discard dialog
      // confirm discard changes
      await testUtils.dom.click($(".modal .modal-footer .btn-primary"));

      clearUncommittedChanges(webClient.env);
      await testUtils.nextTick();
      await legacyExtraNextTick();

      assert.containsNone(document.body, ".modal");

      webClient.destroy();
    }
  );

  QUnit.module("LPE's new tests");

  QUnit.test("switching when doing an action -- load_views slow", async function (assert) {
    assert.expect(13);

    let def: any;
    const mockRPC: RPC = async (route, args) => {
      assert.step((args && args.method) || route);
      if (args && args.method === "load_views") {
        return Promise.resolve(def);
      }
    };
    const webClient = await createWebClient({ baseConfig, mockRPC });

    await doAction(webClient, 3);
    assert.containsOnce(webClient, ".o_list_view");

    def = testUtils.makeTestPromise();
    doAction(webClient, 4, { clearBreadcrumbs: true });
    await nextTick();
    await legacyExtraNextTick();
    assert.containsOnce(webClient, ".o_list_view", "should still contain the list view");

    await cpHelpers.switchView(webClient, "kanban");
    def.resolve();
    await testUtils.nextTick();
    await legacyExtraNextTick();

    assert.containsOnce(webClient, ".o_kanban_view");
    assert.strictEqual(
      webClient.el!.querySelector(".o_control_panel .breadcrumb-item")!.textContent,
      "Partners"
    );
    assert.containsNone(webClient, ".o_list_view");

    assert.verifySteps([
      "/wowl/load_menus",
      "/web/action/load", // action 3
      "load_views", // action 3
      "/web/dataset/search_read", // action 3 list fetch
      "/web/action/load", // action 4
      "load_views", // action 4 Hanging
      "/web/dataset/search_read", // action 3 kanban fetch
    ]);

    webClient.destroy();
  });

  QUnit.test("switching when doing an action -- search_read slow", async function (assert) {
    assert.expect(13);

    const def = testUtils.makeTestPromise();
    const defs = [null, def, null];
    const mockRPC: RPC = async (route, args) => {
      assert.step((args && args.method) || route);
      if (route === "/web/dataset/search_read") {
        await Promise.resolve(defs.shift());
      }
    };
    const webClient = await createWebClient({ baseConfig, mockRPC });

    await doAction(webClient, 3);
    assert.containsOnce(webClient, ".o_list_view");

    doAction(webClient, 4, { clearBreadcrumbs: true });
    await testUtils.nextTick();
    await legacyExtraNextTick();

    await cpHelpers.switchView(webClient, "kanban");
    def.resolve();
    await testUtils.nextTick();
    await legacyExtraNextTick();

    assert.containsOnce(webClient, ".o_kanban_view");
    assert.strictEqual(
      webClient.el!.querySelector(".o_control_panel .breadcrumb-item")!.textContent,
      "Partners"
    );
    assert.containsNone(webClient, ".o_list_view");

    assert.verifySteps([
      "/wowl/load_menus",
      "/web/action/load", // action 3
      "load_views", // action 3
      "/web/dataset/search_read", // action 3 list fetch
      "/web/action/load", // action 4
      "load_views", // action 4
      "/web/dataset/search_read", // action 4 kanban fetch Hanging
      "/web/dataset/search_read", // action 3 kanban fetch
    ]);

    webClient.destroy();
  });

  QUnit.test("load state supports being given menu_id alone", async function (assert) {
    assert.expect(7);

    baseConfig.serverData!.menus![666] = {
      id: 666,
      children: [],
      name: "App1",
      appID: 1,
      actionID: 1,
    };

    const mockRPC: RPC = async function (route, args) {
      assert.step(route);
    };
    const webClient = await createWebClient({ baseConfig, mockRPC });

    await loadState(webClient, {
      menu_id: "666",
    });

    assert.containsOnce(webClient, ".o_kanban_view", "should display a kanban view");
    assert.strictEqual(
      $(webClient.el!).find(".o_control_panel .breadcrumb-item").text(),
      "Partners Action 1",
      "breadcrumbs should display the display_name of the action"
    );

    assert.verifySteps([
      "/wowl/load_menus",
      "/web/action/load",
      "/web/dataset/call_kw/partner/load_views",
      "/web/dataset/search_read",
    ]);

    webClient.destroy();
  });

  QUnit.test("load state supports #home", async function (assert) {
    assert.expect(6);

    baseConfig.serverData!.menus! = {
      root: { id: "root", children: [1], name: "root", appID: "root" },
      1: { id: 1, children: [], name: "App1", appID: 1, actionID: 1 },
    };

    const webClient = await createWebClient({ baseConfig });
    await testUtils.nextTick(); // wait for the load state (default app)
    await legacyExtraNextTick();
    assert.containsOnce(webClient, ".o_kanban_view"); // action 1 (default app)
    assert.strictEqual(
      $(webClient.el!).find(".o_control_panel .breadcrumb-item").text(),
      "Partners Action 1"
    );

    await loadState(webClient, {
      action: "3",
    });
    assert.containsOnce(webClient, ".o_list_view"); // action 3
    assert.strictEqual(
      $(webClient.el!).find(".o_control_panel .breadcrumb-item").text(),
      "Partners"
    );

    await loadState(webClient, {
      home: "1",
    });
    assert.containsOnce(webClient, ".o_kanban_view"); // action 1 (default app)
    assert.strictEqual(
      $(webClient.el!).find(".o_control_panel .breadcrumb-item").text(),
      "Partners Action 1"
    );

    webClient.destroy();
  });

  QUnit.test("load state supports #home as initial state", async function (assert) {
    assert.expect(7);

    baseConfig.serverData!.menus! = {
      root: { id: "root", children: [1], name: "root", appID: "root" },
      1: { id: 1, children: [], name: "App1", appID: 1, actionID: 1 },
    };

    baseConfig.serviceRegistry!.add(
      "router",
      makeFakeRouterService({
        initialRoute: {
          hash: { home: "1" },
        },
      }),
      true
    );

    const mockRPC: RPC = async function (route, args) {
      assert.step(route);
    };
    const webClient = await createWebClient({ baseConfig, mockRPC });
    await testUtils.nextTick(); // wait for the load state (default app)
    await legacyExtraNextTick();

    assert.containsOnce(webClient, ".o_kanban_view", "should display a kanban view");
    assert.strictEqual(
      $(webClient.el!).find(".o_control_panel .breadcrumb-item").text(),
      "Partners Action 1"
    );
    assert.verifySteps([
      "/wowl/load_menus",
      "/web/action/load",
      "/web/dataset/call_kw/partner/load_views",
      "/web/dataset/search_read",
    ]);

    webClient.destroy();
  });

  QUnit.test("load state: in a form view, remove the id from the state", async function (assert) {
    assert.expect(13);

    baseConfig.serverData!.actions![999] = {
      id: 999,
      name: "Partner",
      res_model: "partner",
      type: "ir.actions.act_window",
      views: [
        [false, "list"],
        [666, "form"],
      ],
    };

    const mockRPC: RPC = async (route, args) => {
      assert.step(route);
    };
    const webClient = await createWebClient({ baseConfig, mockRPC });

    await doAction(webClient, 999, { viewType: "form", resId: 2 });
    assert.containsOnce(webClient, ".o_form_view");
    assert.containsN(webClient, ".breadcrumb-item", 2);
    assert.strictEqual(
      $(webClient.el!).find(".o_control_panel .breadcrumb-item.active").text(),
      "Second record"
    );
    assert.verifySteps([
      "/wowl/load_menus",
      "/web/action/load",
      "/web/dataset/call_kw/partner/load_views",
      "/web/dataset/call_kw/partner/read",
    ]);

    await loadState(webClient, { action: "999", view_type: "form", id: undefined });
    assert.verifySteps(["/web/dataset/call_kw/partner/onchange"]);
    assert.containsOnce(webClient, ".o_form_view.o_form_editable");
    assert.containsN(webClient, ".breadcrumb-item", 2);
    assert.strictEqual(
      $(webClient.el!).find(".o_control_panel .breadcrumb-item.active").text(),
      "New"
    );

    webClient.destroy();
  });

  QUnit.skip("rainbowman integrated to webClient", async function (assert) {
    /*
        assert.expect(10);
        const webClient = await createWebClient({
            actions: this.actions,
            archs: this.archs,
            data: this.data,
            menus: this.menus,
            session: {
                show_effect: true,
            },
        });
        await doAction(webClient, 1);
        assert.containsOnce(webClient, '.o_kanban_view');
        assert.containsNone(webClient, '.o_reward');
        webClient.env.bus.trigger('show-effect', {type: 'rainbow_man', fadeout: 'no'});
        await testUtils.nextTick();
        await legacyExtraNextTick();

        assert.containsOnce(webClient, '.o_reward');
        assert.containsOnce(webClient, '.o_kanban_view');
        await testUtils.dom.click(webClient.el.querySelector('.o_kanban_record'));
        await legacyExtraNextTick();
        assert.containsNone(webClient, '.o_reward');
        assert.containsOnce(webClient, '.o_kanban_view');

        webClient.env.bus.trigger('show-effect', {type: 'rainbow_man', fadeout: 'no'});
        await testUtils.nextTick();
        await legacyExtraNextTick();
        assert.containsOnce(webClient, '.o_reward');
        assert.containsOnce(webClient, '.o_kanban_view');

        // Do not force rainbow man to destroy on doAction
        // we let it die either after its animation or on user click
        await doAction(webClient, 3);
        assert.containsOnce(webClient, '.o_reward');
        assert.containsOnce(webClient, '.o_list_view');

        webClient.destroy();
        */
  });

  QUnit.skip("show effect notification", async function (assert) {
    /*
        assert.expect(6);

        const webClient = await createWebClient({
            actions: this.actions,
            archs: this.archs,
            data: this.data,
            menus: this.menus,
            session: {
                show_effect: false,
            },
            services: {
                notification: NotificationService
            }
        });
        await doAction(webClient, 1);
        assert.containsOnce(webClient, '.o_kanban_view');
        assert.containsNone(webClient, '.o_reward');
        assert.containsNone(document.querySelector('body'), '.o_notification');
        webClient.env.bus.trigger('show-effect', {type: 'rainbow_man', fadeout: 'no'});
        await testUtils.nextTick();
        await legacyExtraNextTick();
        assert.containsOnce(webClient, '.o_kanban_view');
        assert.containsNone(webClient, '.o_reward');
        assert.containsOnce(document.querySelector('body'), '.o_notification');
        webClient.destroy();
        */
  });

  QUnit.test("display warning as notification", async function (assert) {
    // this test can be removed as soon as the legacy layer is dropped
    assert.expect(5);

    let list: any;
    testUtils.patch(ListController, {
      init() {
        this._super(...arguments);
        list = this;
      },
    });

    const webClient = await createWebClient({ baseConfig });

    await doAction(webClient, 3);
    assert.containsOnce(webClient, ".o_list_view");

    list.trigger_up("warning", {
      title: "Warning!!!",
      message: "This is a warning...",
    });
    await testUtils.nextTick();
    await legacyExtraNextTick();

    assert.containsOnce(webClient, ".o_list_view");
    assert.containsOnce(document.body, ".o_notification.bg-warning");
    assert.strictEqual($(".o_notification_title").text(), "Warning!!!");
    assert.strictEqual($(".o_notification_content").text(), "This is a warning...");

    webClient.destroy();
  });

  QUnit.test("display warning as modal", async function (assert) {
    // this test can be removed as soon as the legacy layer is dropped
    assert.expect(5);

    let list: any;
    testUtils.patch(ListController, {
      init() {
        this._super(...arguments);
        list = this;
      },
    });

    const webClient = await createWebClient({ baseConfig });

    await doAction(webClient, 3);
    assert.containsOnce(webClient, ".o_list_view");

    list.trigger_up("warning", {
      title: "Warning!!!",
      message: "This is a warning...",
      type: "dialog",
    });
    await testUtils.nextTick();
    await legacyExtraNextTick();

    assert.containsOnce(webClient, ".o_list_view");
    assert.containsOnce(document.body, ".modal");
    assert.strictEqual($(".modal-title").text(), "Warning!!!");
    assert.strictEqual($(".modal-body").text(), "This is a warning...");

    webClient.destroy();
  });

  QUnit.test(
    "requests for execute_action of type object raises error in modal: re-enables buttons",
    async function (assert) {
      assert.expect(5);

      baseConfig.serverData!.views!["partner,false,form"] = `
        <form>
          <field name="display_name"/>
          <footer>
            <button name="object" string="Call method" type="object"/>
          </footer>
        </form>
      `;

      const mockRPC: RPC = async (route, args) => {
        if (route === "/web/dataset/call_button") {
          return Promise.reject();
        }
      };
      const webClient = await createWebClient({ baseConfig, mockRPC });
      await doAction(webClient, 5);
      assert.containsOnce(webClient.el!, ".modal .o_form_view");

      testUtils.dom.click(webClient.el!.querySelector('.modal footer button[name="object"]')!);
      assert.containsOnce(webClient.el!, ".modal .o_form_view");
      assert.ok(
        (webClient.el!.querySelector(".modal footer button") as HTMLButtonElement).disabled
      );
      await testUtils.nextTick();
      await legacyExtraNextTick();
      assert.containsOnce(webClient.el!, ".modal .o_form_view");
      assert.notOk(
        (webClient.el!.querySelector(".modal footer button") as HTMLButtonElement).disabled
      );
      webClient.destroy();
    }
  );

  QUnit.test(
    'fullscreen on action change: back to another "current" action',
    async function (assert) {
      assert.expect(8);
      baseConfig.serverData!.menus = {
        root: { id: "root", children: [1], name: "root", appID: "root" },
        1: { id: 1, children: [], name: "MAIN APP", appID: 1, actionID: 6 },
      };

      baseConfig.serverData!.actions![1].target = "fullscreen";
      baseConfig.serverData!.views!["partner,false,form"] =
        '<form><button name="24" type="action" class="oe_stat_button"/></form>';

      const webClient = await createWebClient({ baseConfig });
      await testUtils.nextTick(); // wait for the load state (default app)
      await legacyExtraNextTick();
      assert.containsOnce(webClient, "nav .o_menu_brand");
      assert.strictEqual($(webClient.el!).find("nav .o_menu_brand").text(), "MAIN APP");
      assert.doesNotHaveClass(webClient.el!, "o_fullscreen");

      await testUtils.dom.click($(webClient.el!).find('button[name="24"]'));
      await legacyExtraNextTick();
      assert.doesNotHaveClass(webClient.el!, "o_fullscreen");

      await testUtils.dom.click($(webClient.el!).find('button[name="1"]'));
      await legacyExtraNextTick();
      assert.hasClass(webClient.el!, "o_fullscreen");

      await testUtils.dom.click($(webClient.el!).find(".breadcrumb li a")[1]);
      await legacyExtraNextTick();
      assert.doesNotHaveClass(webClient.el!, "o_fullscreen");

      assert.containsOnce(webClient, "nav .o_menu_brand");
      assert.strictEqual($(webClient.el!).find("nav .o_menu_brand").text(), "MAIN APP");

      webClient.destroy();
    }
  );

  QUnit.test(
    'footer buttons are updated when having another action in target "new"',
    async function (assert) {
      assert.expect(9);

      baseConfig.serverData!.views!["partner,false,form"] =
        "<form>" +
        '<field name="display_name"/>' +
        "<footer>" +
        '<button string="Create" type="object" class="infooter"/>' +
        "</footer>" +
        "</form>";

      const webClient = await createWebClient({ baseConfig });
      await doAction(webClient, 5);
      assert.containsNone(webClient.el!, '.o_technical_modal .modal-body button[special="save"]');
      assert.containsNone(webClient.el!, ".o_technical_modal .modal-body button.infooter");
      assert.containsOnce(webClient.el!, ".o_technical_modal .modal-footer button.infooter");
      assert.containsOnce(webClient.el!, ".o_technical_modal .modal-footer button");

      await doAction(webClient, 25);
      assert.containsNone(webClient.el!, ".o_technical_modal .modal-body button.infooter");
      assert.containsNone(webClient.el!, ".o_technical_modal .modal-footer button.infooter");
      assert.containsNone(webClient.el!, '.o_technical_modal .modal-body button[special="save"]');
      assert.containsOnce(webClient.el!, '.o_technical_modal .modal-footer button[special="save"]');
      assert.containsOnce(webClient.el!, ".o_technical_modal .modal-footer button");

      webClient.destroy();
    }
  );

  QUnit.test(
    'buttons of client action in target="new" and transition to MVC action',
    async function (assert) {
      assert.expect(4);

      const ClientAction = AbstractAction.extend({
        renderButtons($target: JQuery) {
          const button = document.createElement("button");
          button.setAttribute("class", "o_stagger_lee");
          $target[0].appendChild(button);
        },
      });
      core.action_registry.add("test", ClientAction);

      const webClient = await createWebClient({ baseConfig });
      await doAction(webClient, {
        tag: "test",
        target: "new",
        type: "ir.actions.client",
      });
      assert.containsOnce(webClient.el!, ".modal footer button.o_stagger_lee");
      assert.containsNone(webClient.el!, '.modal footer button[special="save"]');
      await doAction(webClient, 25);
      assert.containsNone(webClient.el!, ".modal footer button.o_stagger_lee");
      assert.containsOnce(webClient.el!, '.modal footer button[special="save"]');

      webClient.destroy();
      delete core.action_registry.map.test;
      baseConfig.actionRegistry!.remove("test");
    }
  );

  QUnit.skip("execute action without modal", async function (assert) {
    /*
        // TODO: I don't like those 2 tooltips
        // Just because there are two bodies
        assert.expect(11);

        Object.assign(this.archs, {
            'partner,666,form': `<form>
                <header><button name="object" string="Call method" type="object" help="need somebody"/></header>
                    <field name="display_name"/>
                </form>`,
        });

        const webClient = await createWebClient({
            actions: this.actions,
            archs: this.archs,
            data: this.data,
            menus: this.menus,
            webClient: {
                _getWindowHash() {
                    return '#action=24';
                }
            },
            mockRPC(route) {
                assert.step(route);
                if (route === '/web/dataset/call_button') {
                    // Some business stuff server side, then return an implicit close action
                    return Promise.resolve(false);
                }
                return this._super.apply(this, arguments);
            }
        });
        assert.verifySteps([
            '/web/action/load',
            '/web/dataset/call_kw/partner',
            '/web/dataset/call_kw/partner/read',
        ]);
        assert.containsN(webClient, '.o_form_buttons_view button:not([disabled])', 2);
        const actionButton = webClient.el.querySelector('button[name=object]');
        const tooltipProm = new Promise((resolve) => {
            $(document.body).one("shown.bs.tooltip", () => {
                $(actionButton).mouseleave();
                resolve();
            });
        });
        $(actionButton).mouseenter();
        await tooltipProm;
        assert.containsN(document.body, '.tooltip', 2);
        await testUtils.dom.click(actionButton);
        await legacyExtraNextTick();
        assert.verifySteps([
            '/web/dataset/call_button',
            '/web/dataset/call_kw/partner/read',
        ]);
        assert.containsNone(document.body, '.tooltip'); // body different from webClient in tests !
        assert.containsN(webClient, '.o_form_buttons_view button:not([disabled])', 2);
        webClient.destroy();
        */
  });

  QUnit.skip("on close with effect from server", async function (assert) {
    /*
        assert.expect(1);

        const webClient = await createWebClient({
            actions: this.actions,
            archs: this.archs,
            data: this.data,
            menus: this.menus,
            session: {
                show_effect: true,
            },
            mockRPC(route, args) {
                if (route === '/web/dataset/call_button') {
                    return Promise.resolve({
                        type: 'ir.actions.act_window_close',
                        effect: {
                            type: 'rainbow_man',
                            message: 'button called',
                        }
                    });
                }
                return this._super.apply(this, arguments);
            },
        });
        await doAction(webClient, 6);
        await testUtils.dom.click(webClient.el.querySelector('button[name="object"]'));
        await legacyExtraNextTick();
        assert.containsOnce(webClient, '.o_reward');

        webClient.destroy();
        */
  });

  QUnit.skip("on close with effect in xml", async function (assert) {
    /*
        assert.expect(2);

        this.archs['partner,false,form'] = `
            <form>
                <header>
                    <button string="Call method"
                        name="object"
                        type="object"
                        effect="{'type': 'rainbow_man', 'message': 'rainBowInXML'}"/>
                </header>
                    <field name="display_name"/>
            </form>`;

        const webClient = await createWebClient({
            actions: this.actions,
            archs: this.archs,
            data: this.data,
            menus: this.menus,
            session: {
                show_effect: true,
            },
            mockRPC(route, args) {
                if (route === '/web/dataset/call_button') {
                    return Promise.resolve();
                }
                return this._super.apply(this, arguments);
            },
        });
        await doAction(webClient, 6);
        await testUtils.dom.click(webClient.el.querySelector('button[name="object"]'));
        await legacyExtraNextTick();
        assert.containsOnce(webClient, '.o_reward');
        assert.strictEqual(
            webClient.el.querySelector('.o_reward .o_reward_msg_content').textContent,
            'rainBowInXML'
        );

        webClient.destroy();
        */
  });

  QUnit.test("hashchange does not trigger canberemoved right away", async function (assert) {
    assert.expect(9);

    const ClientAction = AbstractAction.extend({
      start() {
        this.$el.text("Hello World");
        this.$el.addClass("o_client_action_test");
      },
      canBeRemoved() {
        assert.step("canBeRemoved");
        return this._super.apply(this, arguments);
      },
    });
    core.action_registry.add("ClientAction", ClientAction);

    const ClientAction2 = AbstractAction.extend({
      start() {
        this.$el.text("Hello World");
        this.$el.addClass("o_client_action_test_2");
      },
      canBeRemoved() {
        assert.step("canBeRemoved_2");
        return this._super.apply(this, arguments);
      },
    });
    core.action_registry.add("ClientAction2", ClientAction2);

    baseConfig.serviceRegistry!.add(
      "router",
      makeFakeRouterService({ onPushState: () => assert.step("hashSet") }),
      true
    );
    const webClient = await createWebClient({ baseConfig });
    assert.verifySteps([]);
    await doAction(webClient, 9);
    assert.verifySteps(["hashSet"]);
    assert.containsOnce(webClient.el!, ".o_client_action_test");
    assert.verifySteps([]);
    await doAction(webClient, "ClientAction2");
    assert.containsOnce(webClient.el!, ".o_client_action_test_2");
    assert.verifySteps(["canBeRemoved", "hashSet"]);
    webClient.destroy();
    delete core.action_registry.map.ClientAction;
    delete core.action_registry.map.ClientAction2;
    baseConfig.actionRegistry!.remove("ClientAction");
    baseConfig.actionRegistry!.remove("ClientAction2");
  });

  QUnit.skip("on_close should be called only once", async function (assert) {
    /**
     * TODO: Improve this test
     *
     * When clicking on dialog button it should trigger act_window_close and
     * then execute_action (that will be redirected to an act_window_close)
     *
     * The execute_action comes from BasicController._callButtonAction
     *
     * A real case: event_configurator_widget.js
     */
    /*
        assert.expect(2);

        const webClient = await createWebClient({
            actions: this.actions,
            archs: this.archs,
            data: this.data,
            menus: this.menus,
        });

        await doAction(webClient, 3);
        await testUtils.dom.click(webClient.el.querySelector('.o_list_view .o_data_row'));
        await legacyExtraNextTick();
        await testUtils.dom.click(webClient.el.querySelector('.o_form_buttons_view .o_form_button_edit'));

        await doAction(webClient, 25, {
            on_close() {
                assert.step('on_close');
            },
        });

        // Close dialog by clicking on save button
        await testUtils.dom.click(webClient.el.querySelector('.o_dialog .modal-footer button[special=save]'));
        await legacyExtraNextTick();
        // Directly do act_window_close
        await doAction(webClient, 10);

        assert.verifySteps(['on_close']);

        webClient.destroy();
        */
  });

  QUnit.test("jsClass legacy", async function (assert) {
    assert.expect(2);
    const { AbstractView, legacyViewRegistry } = getLegacy() as any;

    const TestView = AbstractView.extend({
      viewType: "test_view",
    });
    legacyViewRegistry.add("test_view", TestView);

    const TestJsClassView = TestView.extend({
      init() {
        this._super.call(this, ...arguments);
        assert.step("init js class");
      },
    });
    legacyViewRegistry.add("test_jsClass", TestJsClassView);

    baseConfig.serverData!.views!["partner,false,test_view"] = `
      <div js_class="test_jsClass"></div>
    `;
    baseConfig.serverData!.actions![9999] = {
      id: 1,
      name: "Partners Action 1",
      res_model: "partner",
      type: "ir.actions.act_window",
      views: [[false, "test_view"]],
    };

    const webClient = await createWebClient({ baseConfig });
    await doAction(webClient, 9999);
    assert.verifySteps(["init js class"]);
    delete legacyViewRegistry.map.test_view;
    delete legacyViewRegistry.map.test_jsClass;
    baseConfig.viewRegistry!.remove("test_view");
    baseConfig.viewRegistry!.remove("test_jsClass");
    webClient.destroy();
  });

  QUnit.skip("jsClass wowl", async function (assert) {});

  QUnit.test("properly push state active_id", async function (assert) {
    assert.expect(3);

    baseConfig.serviceRegistry!.add(
      "router",
      makeFakeRouterService({
        initialRoute: {
          hash: { action: "1" },
        },
      }),
      true
    );
    baseConfig.serverData!.views!["partner,1,kanban"] = `
         <kanban><templates><t t-name="kanban-box">
            <div class="oe_kanban_global_click">
              <a name="3" type="action">Execute Action 3</a>
              <field name="foo"/>
            </div>
        </t></templates></kanban>`;

    const webClient = await createWebClient({ baseConfig });
    const router = webClient.env.services["router"];

    await testUtils.nextTick(); // wait for the load state (default app)
    await legacyExtraNextTick();
    assert.deepEqual(router.current.hash, {
      model: "partner",
      view_type: "kanban",
      action: "1",
    });

    await testUtils.dom.click($(webClient.el!).find(".o_kanban_record a:first"));
    await legacyExtraNextTick();
    assert.deepEqual(router.current.hash, {
      model: "partner",
      view_type: "list",
      action: "3",
      active_id: "1",
    });

    await testUtils.dom.click($(webClient.el!).find(".breadcrumb-item:first"));
    await legacyExtraNextTick();
    assert.deepEqual(router.current.hash, {
      model: "partner",
      view_type: "kanban",
      action: "1",
    });

    webClient.destroy();
  });
});
