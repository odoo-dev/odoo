/** @odoo-module **/

import { browser, makeRAMLocalStorage } from "@web/core/browser/browser";
import { dialogService } from "@web/core/dialog/dialog_service";
import { notificationService } from "@web/core/notifications/notification_service";
import { ormService } from "@web/core/orm_service";
import { popoverService } from "@web/core/popover/popover_service";
import { registry } from "@web/core/registry";
import {
    makeLegacyActionManagerService,
    makeLegacyNotificationService,
    mapLegacyEnvToWowlEnv,
} from "@web/legacy/utils";
import { viewService } from "@web/views/view_service";
import { actionService } from "@web/webclient/actions/action_service";
import { effectService } from "@web/webclient/effects/effect_service";
import { hotkeyService } from "@web/webclient/hotkeys/hotkey_service";
import { menuService } from "@web/webclient/menu_service";
import { WebClient } from "@web/webclient/webclient";
import { getLegacy } from "web.test_legacy";
import { registerCleanup } from "../../helpers/cleanup";
import { makeTestEnv } from "../../helpers/mock_env";
import {
    fakeTitleService,
    makeFakeLocalizationService,
    makeFakeRouterService,
    makeFakeUIService,
    makeFakeUserService,
} from "../../helpers/mock_services";
import { getFixture, legacyExtraNextTick, nextTick, patchWithCleanup } from "../../helpers/utils";
import session from "web.session";

const { Component, mount, tags } = owl;

const actionRegistry = registry.category("actions");
const serviceRegistry = registry.category("services");
// -----------------------------------------------------------------------------
// Utils
// -----------------------------------------------------------------------------

/**
 * This method create a web client instance properly configured.
 *
 * Note that the returned web client will be automatically cleaned up after the
 * end of the test.
 *
 * @param {*} params
 */
export async function createWebClient(params) {
    const { AbstractAction, AbstractController } = getLegacy();
    // With the compatibility layer, the action manager keeps legacy alive if they
    // are still acessible from the breacrumbs. They are manually destroyed as soon
    // as they are no longer referenced in the stack. This works fine in production,
    // because the webclient is never destroyed. However, at the end of each test,
    // we destroy the webclient and expect every legacy that has been instantiated
    // to be destroyed. We thus need to manually destroy them here.
    const controllers = [];
    patchWithCleanup(AbstractAction.prototype, {
        init() {
            this._super(...arguments);
            controllers.push(this);
        },
    });
    patchWithCleanup(AbstractController.prototype, {
        init() {
            this._super(...arguments);
            controllers.push(this);
        },
    });
    if (params.legacyParams && params.legacyParams.getTZOffset) {
        patchWithCleanup(session, {
            getTZOffset: params.legacyParams.getTZOffset,
        });
    }

    const mockRPC = params.mockRPC || undefined;
    const env = await makeTestEnv({
        ...params.testConfig,
        mockRPC,
    });
    addLegacyMockEnvironment(env, params.testConfig, params.legacyParams);

    const WebClientClass = params.WebClientClass || WebClient;
    const target = params && params.target ? params.target : getFixture();
    const wc = await mount(WebClientClass, { env, target });
    registerCleanup(() => {
        for (const controller of controllers) {
            if (!controller.isDestroyed()) {
                controller.destroy();
            }
        }
        wc.destroy();
    });
    // Wait for visual changes caused by a potential loadState
    await nextTick();
    return wc;
}

/**
 * Remove this as soon as we drop the legacy support
 */
function addLegacyMockEnvironment(env, testConfig, legacyParams = {}) {
    const legacy = getLegacy();
    // setup a legacy env
    const dataManager = Object.assign(
        {
            load_action: (actionID, context) => {
                return env.services.rpc("/web/action/load", {
                    action_id: actionID,
                    additional_context: context,
                });
            },
            load_views: async (params, options) => {
                const result = await env.services.rpc(`/web/dataset/call_kw/${params.model}`, {
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
                for (const [, viewType] of params.views_descr) {
                    const fvg = views[viewType];
                    fvg.viewFields = fvg.fields;
                    fvg.fields = result.fields;
                }
                if (params.favoriteFilters && "search" in views) {
                    views.search.favoriteFilters = params.favoriteFilters;
                }
                return views;
            },
            load_filters: (params) => {
                if (QUnit.config.debug) {
                    console.log("[mock] load_filters", params);
                }
                return Promise.resolve([]);
            },
        },
        legacyParams.dataManager
    );

    // clear the ActionMenus registry to prevent external code from doing unknown rpcs
    const actionMenusRegistry = legacy.ActionMenus.registry;
    legacy.ActionMenus.registry = new legacy.Registry();
    registerCleanup(() => (legacy.ActionMenus.registry = actionMenusRegistry));

    const legacyEnv = legacy.makeTestEnvironment({ dataManager, bus: legacy.core.bus });

    if (legacyParams.serviceRegistry) {
        const legacyServiceMap = legacy.core.serviceRegistry.map;
        legacy.core.serviceRegistry.map = legacyParams.serviceRegistry.map;
        // notification isn't a deployed service, but it is added by `makeTestEnvironment`.
        // Here, we want full control on the deployed services, so we simply remove it.
        delete legacyEnv.services.notification;
        legacy.AbstractService.prototype.deployServices(legacyEnv);
        registerCleanup(() => {
            legacy.core.serviceRegistry.map = legacyServiceMap;
        });
    }

    Component.env = legacyEnv;
    mapLegacyEnvToWowlEnv(legacyEnv, env);
    // deploy the legacyActionManagerService (in Wowl env)
    const legacyActionManagerService = makeLegacyActionManagerService(legacyEnv);
    serviceRegistry.add("legacy_action_manager", legacyActionManagerService);

    serviceRegistry.add("legacy_notification", makeLegacyNotificationService(legacyEnv));
    // patch DebouncedField delay
    const debouncedField = legacy.basicFields.DebouncedField;
    const initialDebouncedVal = debouncedField.prototype.DEBOUNCE;
    debouncedField.prototype.DEBOUNCE = 0;
    registerCleanup(() => (debouncedField.prototype.DEBOUNCE = initialDebouncedVal));
}

export async function doAction(env, ...args) {
    if (env instanceof Component) {
        env = env.env;
    }
    try {
        await env.services.action.doAction(...args);
    } finally {
        await legacyExtraNextTick();
    }
}

export async function loadState(env, state) {
    if (env instanceof Component) {
        env = env.env;
    }
    env.bus.trigger("test:hashchange", state);
    await nextTick();
    await legacyExtraNextTick();
}

export function getActionManagerTestConfig() {
    patchWithCleanup(
        browser,
        {
            setTimeout: window.setTimeout.bind(window),
            clearTimeout: window.clearTimeout.bind(window),
            localStorage: makeRAMLocalStorage(),
            sessionStorage: makeRAMLocalStorage(),
        },
        { pure: true }
    );

    // build the service registry

    // need activateMockServer or something like that for odoo.browser.fetch !!! something is bad
    const fakeLocalizationService = makeFakeLocalizationService();
    const fakeUserService = makeFakeUserService();
    const fakeUIService = makeFakeUIService();
    const fakeRouterService = makeFakeRouterService();

    serviceRegistry.add("action", actionService);
    serviceRegistry.add("dialog", dialogService);
    serviceRegistry.add("effect", effectService);
    serviceRegistry.add("hotkey", hotkeyService);
    serviceRegistry.add("localization", fakeLocalizationService);
    serviceRegistry.add("menu", menuService);
    serviceRegistry.add("notification", notificationService);
    serviceRegistry.add("orm", ormService);
    serviceRegistry.add("popover", popoverService);
    serviceRegistry.add("router", fakeRouterService);
    serviceRegistry.add("title", fakeTitleService);
    serviceRegistry.add("ui", fakeUIService);
    serviceRegistry.add("user", fakeUserService);
    serviceRegistry.add("view", viewService);

    // additional basic client action
    class TestClientAction extends Component {}
    TestClientAction.template = tags.xml`
      <div class="test_client_action">
        ClientAction_<t t-esc="props.action.params?.description"/>
      </div>`;
    actionRegistry.add("__test__client__action__", TestClientAction);

    // build the mocked server data
    const menus = {
        root: { id: "root", children: [0, 1, 2], name: "root", appID: "root" },
        // id:0 is a hack to not load anything at webClient mount
        0: { id: 0, children: [], name: "UglyHack", appID: 0, xmlid: "menu_0" },
        1: { id: 1, children: [], name: "App1", appID: 1, actionID: 1001, xmlid: "menu_1" },
        2: { id: 2, children: [], name: "App2", appID: 2, actionID: 1002, xmlid: "menu_2" },
    };
    const actionsArray = [
        {
            id: 1,
            xml_id: "action_1",
            name: "Partners Action 1",
            res_model: "partner",
            type: "ir.actions.act_window",
            views: [[1, "kanban"]],
        },
        {
            id: 2,
            xml_id: "action_2",
            type: "ir.actions.server",
        },
        {
            id: 3,
            xml_id: "action_3",
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
            xml_id: "action_4",
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
            xml_id: "action_5",
            name: "Create a Partner",
            res_model: "partner",
            target: "new",
            type: "ir.actions.act_window",
            views: [[false, "form"]],
        },
        {
            id: 6,
            xml_id: "action_6",
            name: "Partner",
            res_id: 2,
            res_model: "partner",
            target: "inline",
            type: "ir.actions.act_window",
            views: [[false, "form"]],
        },
        {
            id: 7,
            xml_id: "action_7",
            name: "Some Report",
            report_name: "some_report",
            report_type: "qweb-pdf",
            type: "ir.actions.report",
        },
        {
            id: 8,
            xml_id: "action_8",
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
            xml_id: "action_9",
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
            xml_id: "action_11",
            name: "Another Report",
            report_name: "another_report",
            report_type: "qweb-pdf",
            type: "ir.actions.report",
            close_on_report_download: true,
        },
        {
            id: 12,
            xml_id: "action_12",
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
        {
            id: 1001,
            tag: "__test__client__action__",
            target: "main",
            type: "ir.actions.client",
            params: { description: "Id 1" },
        },
        {
            id: 1002,
            tag: "__test__client__action__",
            target: "main",
            type: "ir.actions.client",
            params: { description: "Id 2" },
        },
        {
            xmlId: "wowl.client_action",
            id: 1099,
            tag: "__test__client__action__",
            target: "main",
            type: "ir.actions.client",
            params: { description: "xmlId" },
        },
    ];
    const actions = {};
    actionsArray.forEach((act) => {
        actions[act.xmlId || act.id] = act;
    });
    const archs = {
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
            "<search>" +
            '<filter name="bar" help="Bar" domain="[(\'bar\', \'=\', 1)]"/>' +
            "</search>",
        "pony,false,search": "<search></search>",
    };
    const models = {
        partner: {
            fields: {
                id: { string: "Id", type: "integer" },
                foo: { string: "Foo", type: "char" },
                bar: { string: "Bar", type: "many2one", relation: "partner" },
                o2m: {
                    string: "One2Many",
                    type: "one2many",
                    relation: "partner",
                    relation_field: "bar",
                },
                m2o: { string: "Many2one", type: "many2one", relation: "partner" },
            },
            records: [
                { id: 1, display_name: "First record", foo: "yop", bar: 2, o2m: [2, 3], m2o: 3 },
                {
                    id: 2,
                    display_name: "Second record",
                    foo: "blip",
                    bar: 1,
                    o2m: [1, 4, 5],
                    m2o: 3,
                },
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
    const serverData = {
        models,
        views: archs,
        actions,
        menus,
    };
    return {
        browser,
        serverData,
    };
}
