import { beforeEach, expect, test } from "@odoo/hoot";
import { drag, queryAllTexts } from "@odoo/hoot-dom";
import { advanceTime, animationFrame, runAllTimers } from "@odoo/hoot-mock";
import {
    contains,
    defineActions,
    defineModels,
    fields,
    getService,
    models,
    mountWebClient,
    onRpc,
    patchWithCleanup,
} from "@web/../tests/web_test_helpers";

import { browser } from "@web/core/browser/browser";
import { user } from "@web/core/user";
import { redirect } from "@web/core/utils/urls";
import { session } from "@web/session";

class Partner extends models.Model {
    name = fields.Char();

    _records = [
        { id: 1, name: "First partner" },
        { id: 2, name: "Second partner" },
    ];
    _views = {
        form: `<form><field name="name"/></form>`,
        list: `<list><field name="name"/></list>`,
        search: `<search/>`,
    };
}

defineModels([Partner]);

/** the items of the hub of the partners, as returned by web_get_hub */
const ITEMS = [
    {
        key: "object:action_open_form",
        type: "object",
        name: "action_open_form",
        string: "Form",
        context: { from_item: "form" },
    },
    {
        key: "action:10",
        type: "action",
        name: "10",
        string: "Partners",
        context: { from_item: "partners" },
    },
];

/** the context of an action opened for the partner 1 */
const ACTIVE_CONTEXT = { active_model: "partner", active_id: 1 };

function setHubSetting(setting) {
    user.updateUserSettings("hub_config_ids", { "partner,1": setting });
}

/** open the item "Partners" for the partner 1, as a button would */
async function openPartners() {
    await getService("action").doAction(10, { additionalContext: ACTIVE_CONTEXT });
    await animationFrame(); // the hub is loaded
}

beforeEach(() => {
    defineActions([
        { id: 10, name: "Partners", res_model: "partner", views: [[false, "list"]] },
        { id: 20, name: "All partners", res_model: "partner", views: [[false, "form"]] },
    ]);
    patchWithCleanup(session, { hub_models: ["partner"] });
    onRpc("has_group", () => true);
    onRpc("web_get_hub", ({ args, kwargs }) => {
        expect.step(["web_get_hub", args[0], kwargs.view_id]);
        return { view_id: 1, display_name: "First partner", items: ITEMS };
    });
    onRpc("action_open_form", () => ({
        type: "ir.actions.act_window",
        res_model: "partner",
        res_id: 1,
        views: [[false, "form"]],
    }));
    onRpc("set_hub_setting", ({ args }) => {
        expect.step(["set_hub_setting", args[3]]);
        return true;
    });
    user.updateUserSettings("id", 1);
});

test.tags("desktop");
// the tabs are the pinned items of the hub of the active record, in their
// order, with the opened one active
test("tabs show the pinned items", async () => {
    setHubSetting({ pinned_item_keys: ["action:10", "object:action_open_form"], show_tabs: true });
    await mountWebClient();
    await openPartners();
    expect.verifySteps([["web_get_hub", [1], false]]);
    expect(queryAllTexts(".o_hub_tab")).toEqual(["Partners", "Form"]);
    expect(".o_hub_tab .nav-link.active").toHaveText("Partners");
    expect(".o_breadcrumb").toHaveText("First partner - Partners");
});

test.tags("desktop");
// clicking a tab opens its item for the active record, with its context, in
// place of the current action, and keeps the hub of the record
test("clicking a tab opens its item", async () => {
    setHubSetting({ pinned_item_keys: ["object:action_open_form", "action:10"], show_tabs: true });
    onRpc("action_open_form", ({ args, kwargs }) => {
        expect.step(["call", args[0], kwargs.context.from_item]);
    });
    onRpc("/web/action/load", async (request) => {
        const { params } = await request.json();
        expect.step(["load", params.action_id, params.context.from_item]);
    });
    await mountWebClient();
    await openPartners();
    expect.verifySteps([["load", 10, undefined], ["web_get_hub", [1], false]]);
    await contains(".o_hub_tab .nav-link:contains(Form)").click();
    expect.verifySteps([["call", [1], "form"]]);
    expect(".o_form_view").toHaveCount(1);
    expect(".o_hub_tab .nav-link.active").toHaveText("Form");
    expect(".o_breadcrumb .breadcrumb-item").toHaveCount(0);
    await contains(".o_hub_tab .nav-link:contains(Partners)").click();
    expect.verifySteps([["load", "10", "partners"]]);
    expect(".o_list_view").toHaveCount(1);
});

test.tags("desktop");
// the items depend on the values of the record: they are loaded again when a
// record of its model is saved
test("items are reloaded when the record is saved", async () => {
    setHubSetting({ pinned_item_keys: ["object:action_open_form"], show_tabs: true });
    await mountWebClient();
    await openPartners();
    await contains(".o_hub_tab .nav-link:contains(Form)").click();
    expect.verifySteps([["web_get_hub", [1], false]]);
    await contains(".o_field_widget[name=name] input").edit("Renamed partner");
    await contains(".o_form_button_save").click();
    expect.verifySteps([["web_get_hub", [1], false]]);
});

test.tags("desktop");
// a record of a model without hub view has no hub
test("no hub for a model without hub view", async () => {
    patchWithCleanup(session, { hub_models: [] });
    await mountWebClient();
    await openPartners();
    expect.verifySteps([]);
    expect("button[name=hub_tabs]").toHaveCount(0);
});

test.tags("desktop");
// restored from the url, the model of the active record is the one of the
// action displaying it, and its hub view is the one of that action
test("hub of a record restored from the url", async () => {
    setHubSetting({ pinned_item_keys: ["action:10"], show_tabs: true });
    onRpc("/web/action/load_breadcrumbs", async (request) => {
        const { actions } = (await request.json()).params;
        return actions.map(({ resId }) => ({
            display_name: resId ? "First partner" : "All partners",
            res_model: "partner",
            hub_view_id: 3,
        }));
    });
    redirect("/odoo/action-20/1/action-10");
    await mountWebClient();
    await animationFrame();
    expect.verifySteps([["web_get_hub", [1], 3]]);
    expect(".o_hub_tab .nav-link.active").toHaveText("Partners");
});

test.tags("desktop");
// on a reload, the state is restored from the session storage, without loading
// the breadcrumbs: the hub view of the action displaying the record and the
// opened item are kept in it
test("hub of a record after a reload", async () => {
    setHubSetting({ pinned_item_keys: ["action:10", "object:action_open_form"], show_tabs: true });
    onRpc("/web/action/load_breadcrumbs", () => {
        expect.step("load_breadcrumbs");
    });
    browser.sessionStorage.setItem(
        "current_state",
        JSON.stringify({
            actionStack: [
                {
                    action: 20,
                    displayName: "All partners",
                    view_type: "list",
                    extra: { hub: { res_model: "partner", view_id: 3 } },
                },
                {
                    action: 10,
                    active_id: 1,
                    displayName: "Partners",
                    view_type: "list",
                    // e.g. opened by a method returning the action 10
                    extra: { hub: { item_key: "object:action_open_form" } },
                },
            ],
            action: 10,
            active_id: 1,
        })
    );
    browser.sessionStorage.setItem(
        "current_action",
        JSON.stringify({
            id: 10,
            type: "ir.actions.act_window",
            res_model: "partner",
            views: [[false, "list"]],
            context: ACTIVE_CONTEXT,
        })
    );
    redirect("/odoo/action-20/1/action-10");
    await mountWebClient();
    await animationFrame();
    expect.verifySteps([["web_get_hub", [1], 3]]);
    expect(".o_hub_tab .nav-link.active").toHaveText("Form");
});

test.tags("desktop");
// the hub view of an action is kept in the state of the router, with its model
test("hub view of an action in the state", async () => {
    defineActions([
        {
            id: 30,
            name: "Partners with a hub",
            res_model: "partner",
            views: [[false, "list"]],
            hub_view_id: [3, "Demo hub"],
        },
    ]);
    await mountWebClient();
    await getService("action").doAction(30);
    expect(JSON.parse(browser.sessionStorage.getItem("current_state")).actionStack).toEqual([
        {
            action: 30,
            displayName: "Partners with a hub",
            view_type: "list",
            extra: { hub: { res_model: "partner", view_id: 3 } },
        },
    ]);
});

test.tags("desktop");
// showing the tabs the first time starts from the default setting of the server
test("first show of the tabs uses the default setting", async () => {
    onRpc("get_default_hub_setting", () => ({ pinned_item_keys: ["action:10"] }));
    await mountWebClient();
    await openPartners();
    expect(".o_hub_tabs").toHaveCount(0);
    await contains("button[name=hub_tabs]").click();
    expect.verifySteps([
        ["web_get_hub", [1], false],
        ["set_hub_setting", { show_tabs: true, pinned_item_keys: ["action:10"] }],
    ]);
    expect(queryAllTexts(".o_hub_tab")).toEqual(["Partners"]);
});

test.tags("desktop");
// showing the tabs with no item pinned pins the first item
test("showing the tabs with no pin pins the first item", async () => {
    onRpc("get_default_hub_setting", () => ({}));
    await mountWebClient();
    await openPartners();
    await contains("button[name=hub_tabs]").click();
    expect.verifySteps([
        ["web_get_hub", [1], false],
        ["set_hub_setting", { show_tabs: true, pinned_item_keys: ["object:action_open_form"] }],
    ]);
    expect(queryAllTexts(".o_hub_tab")).toEqual(["Form"]);
});

test.tags("desktop");
// hiding the tabs only saves their visibility
test("hiding the tabs", async () => {
    setHubSetting({ pinned_item_keys: ["action:10"], show_tabs: true });
    await mountWebClient();
    await openPartners();
    await contains("button[name=hub_tabs]").click();
    expect.verifySteps([["web_get_hub", [1], false], ["set_hub_setting", { show_tabs: false }]]);
    await runAllTimers(); // the tabs fade out
    expect(".o_hub_tabs").toHaveCount(0);
});

test.tags("desktop");
// selecting an item in the dropdown pins it last, selecting it again unpins it
test("pin and unpin items from the dropdown", async () => {
    setHubSetting({ pinned_item_keys: ["action:10"], show_tabs: true });
    await mountWebClient();
    await openPartners();
    await contains(".o_hub_tabs_toggler").click();
    await contains(".o_hub_tabs_dropdown_menu .o-dropdown-item:contains(Form)").click();
    expect.verifySteps([
        ["web_get_hub", [1], false],
        ["set_hub_setting", { pinned_item_keys: ["action:10", "object:action_open_form"] }],
    ]);
    expect(queryAllTexts(".o_hub_tab")).toEqual(["Partners", "Form"]);
    await contains(".o_hub_tabs_dropdown_menu .o-dropdown-item:contains(Form)").click();
    expect.verifySteps([["set_hub_setting", { pinned_item_keys: ["action:10"] }]]);
    expect(queryAllTexts(".o_hub_tab")).toEqual(["Partners"]);
});

test.tags("desktop");
// a save is only sent once the previous one is done, so the last one wins
test("saves of the pinned items are sent one after the other", async () => {
    setHubSetting({ pinned_item_keys: ["action:10"], show_tabs: true });
    const firstSave = Promise.withResolvers();
    let saveCount = 0;
    onRpc("set_hub_setting", async ({ args }) => {
        expect.step(["set_hub_setting", args[3]]);
        if (++saveCount === 1) {
            await firstSave.promise;
        }
        return true;
    });
    await mountWebClient();
    await openPartners();
    await contains(".o_hub_tabs_toggler").click();
    await contains(".o_hub_tabs_dropdown_menu .o-dropdown-item:contains(Form)").click();
    await contains(".o_hub_tabs_dropdown_menu .o-dropdown-item:contains(Form)").click();
    expect.verifySteps([
        ["web_get_hub", [1], false],
        ["set_hub_setting", { pinned_item_keys: ["action:10", "object:action_open_form"] }],
    ]);
    firstSave.resolve();
    await animationFrame();
    expect.verifySteps([["set_hub_setting", { pinned_item_keys: ["action:10"] }]]);
});

test.tags("desktop");
// dragging a tab after another one saves the new order of the pinned items
test("reorder tabs with drag and drop", async () => {
    setHubSetting({ pinned_item_keys: ["object:action_open_form", "action:10"], show_tabs: true });
    await mountWebClient();
    await openPartners();
    // the drag starts after a delay, and a move within the tab: only then
    // does entering another tab move the dragged one
    const { drop, moveTo } = await drag(".o_hub_tab:contains(Form)");
    await advanceTime(200);
    await moveTo(".o_hub_tab:contains(Form)", { position: "right" });
    await moveTo(".o_hub_tab:contains(Partners)");
    await drop();
    await animationFrame();
    expect.verifySteps([
        ["web_get_hub", [1], false],
        ["set_hub_setting", { pinned_item_keys: ["action:10", "object:action_open_form"] }],
    ]);
    expect(queryAllTexts(".o_hub_tab")).toEqual(["Partners", "Form"]);
});

test.tags("desktop");
// an action opened in a dialog doesn't display its hub
test("no hub in a dialog", async () => {
    setHubSetting({ pinned_item_keys: ["action:10"], show_tabs: true });
    await mountWebClient();
    await getService("action").doAction(
        { type: "ir.actions.act_window", res_model: "partner", views: [[false, "list"]], target: "new" },
        { additionalContext: ACTIVE_CONTEXT }
    );
    expect(".modal .o_list_view").toHaveCount(1);
    expect.verifySteps([]);
    expect(".o_hub_tabs").toHaveCount(0);
});

test.tags("desktop");
// hub_default opens the first item pinned by the user, and the opened action
// reuses the hub it loaded
test("hub_default opens the first pinned item", async () => {
    setHubSetting({ pinned_item_keys: ["action:10", "object:action_open_form"], show_tabs: true });
    await mountWebClient();
    await getService("action").doAction("hub_default", { additionalContext: ACTIVE_CONTEXT });
    expect.verifySteps([["web_get_hub", [1], false]]);
    expect(".o_list_view").toHaveCount(1);
    expect(".o_hub_tab .nav-link.active").toHaveText("Partners");
});

test.tags("desktop");
// hub_default opens the first item of the hub when the user pinned none
test("hub_default opens the first item without pin", async () => {
    await mountWebClient();
    await getService("action").doAction("hub_default", { additionalContext: ACTIVE_CONTEXT });
    expect.verifySteps([["web_get_hub", [1], false]]);
    expect(".o_form_view").toHaveCount(1);
});

// on small screens, the items are listed in a dropdown of the control panel instead of tabs
test.tags("mobile");
test("mobile dropdown lists the items", async () => {
    await mountWebClient();
    await openPartners();
    expect(".o_hub_tabs").toHaveCount(0);
    expect("button[name=hub_tabs]").toHaveCount(0);
    await contains(".o_control_panel button[data-tooltip='View related documents']").click();
    expect(queryAllTexts(".o_bottom_sheet .o_hub_items_mobile_dropdown .o-dropdown-item")).toEqual([
        "Form",
        "Partners",
    ]);
    expect(".o_bottom_sheet .o_hub_items_mobile_dropdown .o-dropdown-item.selected").toHaveText(
        "Partners"
    );
    await contains(
        ".o_bottom_sheet .o_hub_items_mobile_dropdown .o-dropdown-item:contains(Form)"
    ).click();
    expect(".o_form_view").toHaveCount(1);
    expect.verifySteps([["web_get_hub", [1], false]]);
});
