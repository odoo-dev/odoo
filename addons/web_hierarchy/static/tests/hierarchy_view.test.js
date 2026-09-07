import { describe, expect, test } from "@odoo/hoot";
import { press, queryAllTexts, queryOne, scroll } from "@odoo/hoot-dom";
import { advanceFrame, animationFrame } from "@odoo/hoot-mock";
import {
    contains,
    defineModels,
    fields,
    getService,
    makeServerError,
    MockServer,
    mockService,
    models,
    mountView,
    mountWithCleanup,
    onRpc,
    patchWithCleanup,
    removeFacet,
    toggleMenuItem,
    toggleSearchBarMenu,
} from "@web/../tests/web_test_helpers";
import { browser } from "@web/core/browser/browser";
import { WebClient } from "@web/webclient/webclient";
import { HierarchyModel } from "@web_hierarchy/hierarchy_model";

async function enableFilters(filterNames = []) {
    await toggleSearchBarMenu();
    for (const filter of filterNames) {
        await toggleMenuItem(filter);
    }
}

class Employee extends models.Model {
    _name = "hr.employee";

    name = fields.Char();
    parent_id = fields.Many2one({ string: "Manager", relation: "hr.employee" });
    child_ids = fields.One2many({
        string: "Subordinates",
        relation: "hr.employee",
        relation_field: "parent_id",
    });
    avatar_128 = fields.Image();

    _records = [
        { id: 1, name: "Albert", parent_id: false, child_ids: [2, 3] },
        { id: 2, name: "Georges", parent_id: 1, child_ids: [] },
        { id: 3, name: "Josephine", parent_id: 1, child_ids: [4] },
        { id: 4, name: "Louis", parent_id: 3, child_ids: [] },
    ];

    _views = {
        hierarchy: `
            <hierarchy>
                <templates>
                    <t t-name="hierarchy-box">
                        <div class="o_hierarchy_node_header">
                            <field name="name"/>
                        </div>
                        <div class="o_hierarchy_node_body">
                            <field name="parent_id"/>
                        </div>
                    </t>
                </templates>
            </hierarchy>
        `,
        "hierarchy,1": `
            <hierarchy child_field="child_ids">
                <field name="child_ids" invisible="1"/>
                <templates>
                    <t t-name="hierarchy-box">
                        <div class="o_hierarchy_node_header">
                            <field name="name"/>
                        </div>
                        <div class="o_hierarchy_node_body">
                            <field name="parent_id"/>
                        </div>
                    </t>
                </templates>
            </hierarchy>
        `,
        form: `
            <form>
                <sheet>
                    <group>
                        <field name="name"/>
                        <field name="parent_id"/>
                    </group>
                </sheet>
            </form>
        `,
    };
}

defineModels([Employee]);

describe.current.tags("desktop");

test("load hierarchy view", async () => {
    await mountView({
        type: "hierarchy",
        resModel: "hr.employee",
    });

    expect(".o_hierarchy_view").toHaveCount(1);
    expect(".o_hierarchy_button_add").toHaveCount(1);
    expect(".o_hierarchy_view .o_hierarchy_renderer").toHaveCount(1);
    expect(".o_hierarchy_view .o_hierarchy_renderer > .o_hierarchy_container").toHaveCount(1);
    // Only the root is shown initially. Albert is the sole root, so the backend also returns his
    // direct children (Georges, Josephine) in the same query, but they must still not render
    // until Albert is explicitly focused (nothing below the top level shows without a click).
    expect(".o_hierarchy_row").toHaveCount(1);
    expect(".o_hierarchy_separator").toHaveCount(0);
    expect(".o_hierarchy_node_container").toHaveCount(1);
    expect(".o_hierarchy_node").toHaveCount(1);
    expect(".o_hierarchy_node_button[title='Unfold']").toHaveCount(1);
    expect(".o_hierarchy_node_button[title='Unfold'].d-grid").toHaveCount(1);
    expect(".o_hierarchy_node_button[title='Unfold']").toHaveText("2 Unfold");
    expect(".o_hierarchy_node_content").toHaveText("Albert");
});

test("display child nodes", async () => {
    onRpc("web_search_read", () => {
        expect.step("get child data");
    });
    onRpc("formatted_read_group", () => {
        expect.step("fetch descendants");
    });
    await mountView({
        type: "hierarchy",
        resModel: "hr.employee",
    });

    expect(".o_hierarchy_row").toHaveCount(1);
    expect(".o_hierarchy_node_button[title='Unfold']").toHaveText("2 Unfold");

    // Albert's children were already fetched as part of the initial query (single-root case):
    // focusing him is a pure client-side render change, no RPC.
    await contains(".o_hierarchy_node_button[title='Unfold']").click();
    expect(".o_hierarchy_row").toHaveCount(2);
    expect(".o_hierarchy_separator").toHaveCount(1);
    expect(".o_hierarchy_line_part").toHaveCount(2);
    expect(".o_hierarchy_line_left").toHaveCount(1);
    expect(".o_hierarchy_line_right").toHaveCount(1);
    expect(".o_hierarchy_node_container").toHaveCount(3);
    expect(".o_hierarchy_row:eq(0) .o_hierarchy_node_content").toHaveText("Albert");
    expect(".o_hierarchy_node_button[title='Fold']").toHaveCount(1, {
        message: "Albert is focused (Fold=go back); Josephine has her own Unfold, not focused",
    });
    expect(".o_hierarchy_node_button[title='Fold']").toHaveText("2 Fold");
    expect(queryAllTexts(".o_hierarchy_row:eq(1) .o_hierarchy_node_content")).toEqual([
        "Georges\nAlbert",
        "Josephine\nAlbert",
    ]);
    expect(".o_hierarchy_node_button[title='Unfold']").toHaveText("1 Unfold", {
        message: "Josephine's own button: she has one child (Louis), not yet fetched",
    });

    // Drilling into Josephine replaces the view again (Albert and Georges disappear); this time
    // a real fetch is needed since Louis was never loaded.
    await contains(".o_hierarchy_node_button[title='Unfold']").click();
    expect(".o_hierarchy_row").toHaveCount(2);
    expect(".o_hierarchy_row:eq(0) .o_hierarchy_node_content").toHaveText("Josephine\nAlbert");
    expect(".o_hierarchy_row:eq(1) .o_hierarchy_node_content").toHaveText("Louis\nJosephine");
    expect.verifySteps(["get child data", "fetch descendants"]);

    // Go back one level: Albert + his children (Georges, Josephine) reappear exactly as before.
    await contains(".o_hierarchy_node_button[title='Fold']").click();
    expect(".o_hierarchy_row:eq(0) .o_hierarchy_node_content").toHaveText("Albert");
    expect(queryAllTexts(".o_hierarchy_row:eq(1) .o_hierarchy_node_content")).toEqual([
        "Georges\nAlbert",
        "Josephine\nAlbert",
    ]);

    // Go back again: the original top-level (unfocused) view. Nothing was re-fetched along the way.
    await contains(".o_hierarchy_node_button[title='Fold']").click();
    expect(".o_hierarchy_row").toHaveCount(1);
    expect(".o_hierarchy_node_content").toHaveText("Albert");
    expect.verifySteps([]);
});

test("display child nodes with child_field set on the view", async () => {
    onRpc("web_search_read", () => {
        expect.step("get child data with descendants");
    });
    await mountView({
        type: "hierarchy",
        resModel: "hr.employee",
        viewId: 1,
    });

    expect(".o_hierarchy_row").toHaveCount(1);
    expect(".o_hierarchy_node_button[title='Unfold']").toHaveText("2 Unfold");

    await contains(".o_hierarchy_node_button[title='Unfold']").click();
    expect(".o_hierarchy_row").toHaveCount(2);
    expect(".o_hierarchy_node_container").toHaveCount(3);
    expect(queryAllTexts(".o_hierarchy_row:eq(1) .o_hierarchy_node_content")).toEqual([
        "Georges\nAlbert",
        "Josephine\nAlbert",
    ]);

    await contains(".o_hierarchy_node_button[title='Unfold']").click();
    expect(".o_hierarchy_row:eq(0) .o_hierarchy_node_content").toHaveText("Josephine\nAlbert");
    expect(".o_hierarchy_row:eq(1) .o_hierarchy_node_content").toHaveText("Louis\nJosephine");
    expect.verifySteps(["get child data with descendants"]);
});

test("go back to the previous view after unfolding a record", async () => {
    await mountView({
        type: "hierarchy",
        resModel: "hr.employee",
    });

    expect(".o_hierarchy_row").toHaveCount(1);
    await contains(".o_hierarchy_node_button[title='Unfold']").click();
    expect(".o_hierarchy_row").toHaveCount(2);
    expect(".o_hierarchy_node_container").toHaveCount(3);

    await contains(".o_hierarchy_node_button[title='Fold']").click();
    expect(".o_hierarchy_row").toHaveCount(1);
    expect(".o_hierarchy_node_container").toHaveCount(1);
    expect(".o_hierarchy_node_button[title='Fold']").toHaveCount(0);
    expect(queryAllTexts(".o_hierarchy_row .o_hierarchy_node_content")).toEqual(["Albert"]);
});

test("unfolding a record hides its sibling roots", async () => {
    Employee._records.push({
        id: 5,
        name: "Alfred",
        parent_id: false,
        child_ids: [],
    });
    await mountView({
        type: "hierarchy",
        resModel: "hr.employee",
    });

    expect(".o_hierarchy_row").toHaveCount(1);
    expect(".o_hierarchy_node").toHaveCount(2);
    expect(queryAllTexts(".o_hierarchy_node_content")).toEqual(["Albert", "Alfred"]);

    await contains(".o_hierarchy_node_button[title='Unfold']").click();
    expect(".o_hierarchy_row:eq(0) .o_hierarchy_node").toHaveCount(1, {
        message: "Alfred (Albert's sibling root) is no longer shown once Albert is focused",
    });
    expect(".o_hierarchy_row:eq(0) .o_hierarchy_node_content").toHaveText("Albert");
    expect(".o_hierarchy_parent_node_container").toHaveCount(0, {
        message: "the parent-name-above-the-line label can't trigger anymore: row 0 is always a single node",
    });

    await contains(".o_hierarchy_node_button[title='Fold']").click();
    expect(queryAllTexts(".o_hierarchy_node_content")).toEqual(["Albert", "Alfred"]);
});

test("Add a custom domain leaf on default state of the view with a globalDomain and search default filters", async () => {
    Employee._records = [
        { id: 1, name: "A", parent_id: false, child_ids: [] },
        { id: 2, name: "B", parent_id: false, child_ids: [3, 4] },
        { id: 3, name: "C", parent_id: false, child_ids: [] },
        { id: 4, name: "D", parent_id: 2, child_ids: [5, 6] },
        { id: 5, name: "E", parent_id: 4, child_ids: [] },
        { id: 6, name: "F", parent_id: 4, child_ids: [] },
    ];
    await mountView({
        type: "hierarchy",
        resModel: "hr.employee",
        viewId: false,
        searchViewArch: `
                <search>
                    <filter name="exclude_third" domain="[['id', '!=', 3]]"/>
                    <filter name="find_fifth" domain="[['id', '=', 5]]"/>
                </search>
            `,
        context: { search_default_exclude_third: true },
        domain: [["id", "not in", [1, 6]]],
    });
    expect(".o_hierarchy_row").toHaveCount(2);
    expect(".o_hierarchy_node").toHaveCount(2);
    expect(queryAllTexts(".o_hierarchy_node_content")).toEqual(["B", "D\nB"], {
        message: `A (and F) should be hidden by the globalDomain, C is hidden because of the search_default and
            E (and F) are hidden because the custom domain leaf [['parent_id', '=', false]] is applied
            since the view is in its "default state", D is shown because the query has only one result (B) so
            its direct children are also fetched`,
    });
    await removeFacet("exclude_third");
    expect(".o_hierarchy_row").toHaveCount(1);
    expect(".o_hierarchy_node").toHaveCount(2);
    expect(queryAllTexts(".o_hierarchy_node_content")).toEqual(["B", "C"], {
        message: `C is now visible because the search_default was removed. E (and F) are still hidden because
            the custom domain leaf [['parent_id', '=', false]] is also applied when the search query is
            empty, D is hidden because the query now has more than one "root" record (B and C)`,
    });
    await enableFilters(["find_fifth"]);
    expect(".o_hierarchy_row").toHaveCount(2);
    expect(".o_hierarchy_node").toHaveCount(3);
    expect(queryAllTexts(".o_hierarchy_node_content")).toEqual(["D\nB", "E\nD", "F\nD"], {
        message: `E is shown because it matches the query and the custom domain leaf [['parent_id', '=', false]]
            is not applied since the view is not in its "default state", nor is the query empty. D and F are
            shown since E was the only record matching the query, so its parent and siblings are fetched`,
    });
    await removeFacet("find_fifth");
    await enableFilters(["exclude_third"]);
    expect(queryAllTexts(".o_hierarchy_node_content")).toEqual(["B", "D\nB"], {
        message: `Manually going back to the "default state" of the view should give the same result as the
            first load.`,
    });
});

test("root nodes are paginated with a load more button", async () => {
    Employee._records = Array.from({ length: 45 }, (_, i) => ({
        id: i + 1,
        name: `Employee ${i}`,
        parent_id: false,
        child_ids: [],
    }));
    await mountView({
        type: "hierarchy",
        resModel: "hr.employee",
    });

    expect(".o_hierarchy_node_container").toHaveCount(40);
    expect(".o_hierarchy_load_more").toHaveCount(1);
    await contains(".o_hierarchy_load_more button").click();
    expect(".o_hierarchy_node_container").toHaveCount(45);
    expect(".o_hierarchy_load_more").toHaveCount(0);
});

test("child nodes are paginated with a load more button", async () => {
    Employee._records = [
        { id: 1, name: "Albert", parent_id: false, child_ids: [] },
        // A second, unrelated root avoids the backend's "single root" special case (which
        // would fetch Albert's children unbounded, in the same query, bypassing pagination).
        { id: 999, name: "Zoe", parent_id: false, child_ids: [] },
        ...Array.from({ length: 45 }, (_, i) => ({
            id: i + 2,
            name: `Employee ${i}`,
            parent_id: 1,
            child_ids: [],
        })),
    ];
    await mountView({
        type: "hierarchy",
        resModel: "hr.employee",
    });

    // Zoe has no children, so hers is the only unfold-able button besides Albert's.
    expect(".o_hierarchy_node_button[title='Unfold']").toHaveText("45 Unfold");
    await contains(".o_hierarchy_node_button[title='Unfold']").click();
    expect(".o_hierarchy_row:eq(1) .o_hierarchy_node_container").toHaveCount(40);
    expect(".o_hierarchy_load_more").toHaveCount(1);
    await contains(".o_hierarchy_load_more button").click();
    expect(".o_hierarchy_row:eq(1) .o_hierarchy_node_container").toHaveCount(45);
    expect(".o_hierarchy_load_more").toHaveCount(0);
    expect(".o_hierarchy_node_button[title='Fold']").toHaveText("45 Fold");
});

test("going back and re-focusing a partially loaded node keeps the remaining ids", async () => {
    Employee._records = [
        { id: 1, name: "Albert", parent_id: false, child_ids: [] },
        { id: 999, name: "Zoe", parent_id: false, child_ids: [] },
        ...Array.from({ length: 45 }, (_, i) => ({
            id: i + 2,
            name: `Employee ${i}`,
            parent_id: 1,
            child_ids: [],
        })),
    ];
    await mountView({
        type: "hierarchy",
        resModel: "hr.employee",
    });

    await contains(".o_hierarchy_node_button[title='Unfold']").click();
    await contains(".o_hierarchy_load_more button").click();
    expect(".o_hierarchy_row:eq(1) .o_hierarchy_node_container").toHaveCount(40);

    await contains(".o_hierarchy_node_button[title='Fold']").click();
    expect(".o_hierarchy_row").toHaveCount(1);
    expect(".o_hierarchy_node").toHaveCount(2, { message: "back to Albert + Zoe" });

    await contains(".o_hierarchy_node_button[title='Unfold']").click();
    expect(".o_hierarchy_row:eq(1) .o_hierarchy_node_container").toHaveCount(40);
    expect(".o_hierarchy_load_more").toHaveCount(1);
    await contains(".o_hierarchy_load_more button").click();
    expect(".o_hierarchy_row:eq(1) .o_hierarchy_node_container").toHaveCount(45);
    expect(".o_hierarchy_load_more").toHaveCount(0);
});

test("pagination and the drill/back breadcrumb both work for grandchildren nodes", async () => {
    Employee._records = [
        { id: 1, name: "Albert", parent_id: false, child_ids: [] },
        { id: 999, name: "Zoe", parent_id: false, child_ids: [] },
        { id: 2, name: "Georges", parent_id: 1, child_ids: [] },
        ...Array.from({ length: 45 }, (_, i) => ({
            id: i + 3,
            name: `Employee ${i}`,
            parent_id: 2,
            child_ids: [],
        })),
    ];
    await mountView({
        type: "hierarchy",
        resModel: "hr.employee",
    });

    await contains(".o_hierarchy_node_button[title='Unfold']").click();
    expect(".o_hierarchy_row:eq(1) .o_hierarchy_node_container").toHaveCount(1);
    expect(".o_hierarchy_row:eq(1) .o_hierarchy_node_content").toHaveText("Georges\nAlbert");

    await contains(".o_hierarchy_row:eq(1) .o_hierarchy_node_button[title='Unfold']").click();
    expect(".o_hierarchy_row:eq(0) .o_hierarchy_node_content").toHaveText("Georges\nAlbert", {
        message: "drilling into Georges replaces the view -- Albert and Zoe are no longer shown",
    });
    expect(".o_hierarchy_row:eq(1) .o_hierarchy_node_container").toHaveCount(40);
    expect(".o_hierarchy_load_more").toHaveCount(1);
    await contains(".o_hierarchy_load_more button").click();
    expect(".o_hierarchy_row:eq(1) .o_hierarchy_node_container").toHaveCount(45);
    expect(".o_hierarchy_load_more").toHaveCount(0);

    // breadcrumb: going back once restores Albert (+ Georges among his children), going back
    // again restores the original top-level view (Albert + Zoe).
    await contains(".o_hierarchy_node_button[title='Fold']").click();
    expect(".o_hierarchy_row:eq(0) .o_hierarchy_node_content").toHaveText("Albert");
    expect(".o_hierarchy_row:eq(1) .o_hierarchy_node_content").toHaveText("Georges\nAlbert");

    await contains(".o_hierarchy_node_button[title='Fold']").click();
    expect(".o_hierarchy_row").toHaveCount(1);
    expect(".o_hierarchy_node").toHaveCount(2);
});

test("search record in hierarchy view", async () => {
    await mountView({
        type: "hierarchy",
        resModel: "hr.employee",
        viewId: false,
        searchViewArch: `
            <search>
                <filter name="test_filter" domain="[['id', '=', 4]]"/>
            </search>
        `,
    });
    await enableFilters(["test_filter"]);

    expect(".o_hierarchy_row").toHaveCount(2);
    expect(".o_hierarchy_node").toHaveCount(2);
    expect(".o_hierarchy_separator").toHaveCount(1);
    expect(queryAllTexts(".o_hierarchy_node_content")).toEqual([
        "Josephine\nAlbert",
        "Louis\nJosephine",
    ]);
});

test("search record in hierarchy view with child field name defined in the arch", async () => {
    await mountView({
        type: "hierarchy",
        resModel: "hr.employee",
        viewId: false,
        searchViewArch: `
            <search>
                <filter name="test_filter" domain="[['id', '=', 4]]"/>
            </search>
        `,
    });
    await enableFilters(["test_filter"]);

    expect(".o_hierarchy_row").toHaveCount(2);
    expect(".o_hierarchy_node").toHaveCount(2);
    expect(".o_hierarchy_separator").toHaveCount(1);
    expect(queryAllTexts(".o_hierarchy_node_content")).toEqual([
        "Josephine\nAlbert",
        "Louis\nJosephine",
    ]);
});

test("fetch parent record", async () => {
    await mountView({
        type: "hierarchy",
        resModel: "hr.employee",
        viewId: false,
        searchViewArch: `
            <search>
                <filter name="test_filter" domain="[['id', '=', 4]]"/>
            </search>
        `,
    });
    await enableFilters(["test_filter"]);

    expect(".o_hierarchy_row").toHaveCount(2);
    expect(".o_hierarchy_node").toHaveCount(2);
    expect(".o_hierarchy_separator").toHaveCount(1);

    expect(".o_hierarchy_row:eq(0) .o_hierarchy_node_content").toHaveText("Josephine\nAlbert");

    expect(".o_hierarchy_row:eq(1) .o_hierarchy_node_content").toHaveText("Louis\nJosephine");
    expect(".o_hierarchy_node_container button [data-icon='expand_less']").toHaveCount(1, {
        message:
            "Button to fetch the parent node should be visible on the first node displayed in the view.",
    });
    await contains(".o_hierarchy_node_container button [data-icon='expand_less']").click();
    expect(".o_hierarchy_row").toHaveCount(3);
    expect(".o_hierarchy_node").toHaveCount(4);
    expect(".o_hierarchy_separator").toHaveCount(2);

    expect(".o_hierarchy_row:eq(0) .o_hierarchy_node_content").toHaveText("Albert");
    expect(".o_hierarchy_row:eq(1) .o_hierarchy_node").toHaveCount(2);
    expect(queryAllTexts(".o_hierarchy_row:eq(1) .o_hierarchy_node_content")).toEqual([
        "Georges\nAlbert",
        "Josephine\nAlbert",
    ]);

    expect(".o_hierarchy_row:eq(2) .o_hierarchy_node_content").toHaveText("Louis\nJosephine");
});

test("fetch parent when there are many records without the same parent in the same row", async () => {
    Employee._records.push({
        id: 5,
        name: "Lisa",
        parent_id: 2,
        child_ids: [],
    });
    await mountView({
        type: "hierarchy",
        resModel: "hr.employee",
        viewId: false,
        searchViewArch: `
            <search>
                <filter name="test_filter" domain="[['name', 'ilike', 'l']]"/>
            </search>
        `,
    });
    await enableFilters(["test_filter"]);

    expect(".o_hierarchy_row").toHaveCount(1);
    expect(".o_hierarchy_node_container").toHaveCount(3);
    expect(queryAllTexts(".o_hierarchy_node_content")).toEqual([
        "Lisa\nGeorges",
        "Louis\nJosephine",
        "Albert",
    ]);
    expect(".o_hierarchy_node_container button [data-icon='expand_less']").toHaveCount(2);
    await contains(".o_hierarchy_node_container button [data-icon='expand_less']").click();
    expect(".o_hierarchy_row").toHaveCount(2);
    expect(".o_hierarchy_node").toHaveCount(2);
    expect(queryAllTexts(".o_hierarchy_node_content")).toEqual([
        "Georges\nAlbert",
        "Lisa\nGeorges",
    ]);
    expect(".o_hierarchy_node_container button [data-icon='expand_less']").toHaveCount(1);
    await contains(".o_hierarchy_node_container button [data-icon='expand_less']").click();
    expect(".o_hierarchy_row").toHaveCount(3);
    expect(".o_hierarchy_node").toHaveCount(4);
});

test("fetch parent when parent record is in the same row", async () => {
    Employee._records.push({
        id: 5,
        name: "Lisa",
        parent_id: 2,
        child_ids: [],
    });
    await mountView({
        type: "hierarchy",
        resModel: "hr.employee",
        viewId: false,
        searchViewArch: `
            <search>
                <filter name="test_filter" domain="[['id', 'in', [1, 2, 3, 4, 5]]]"/>
            </search>
        `,
    });
    await enableFilters(["test_filter"]);

    expect(".o_hierarchy_row").toHaveCount(1);
    expect(".o_hierarchy_node_container").toHaveCount(5);
    expect(".o_hierarchy_node_container button [data-icon='expand_less']").toHaveCount(4);
    await contains(".o_hierarchy_node_container button [data-icon='expand_less']").click();
    expect(".o_hierarchy_row").toHaveCount(2);
    expect(".o_hierarchy_node").toHaveCount(3);
    expect(queryAllTexts(".o_hierarchy_node_content")).toEqual([
        "Albert",
        "Georges\nAlbert",
        "Josephine\nAlbert",
    ]);
});

test("fetch parent of node with children displayed", async () => {
    Employee._records.push({
        id: 5,
        name: "Lisa",
        parent_id: 2,
        child_ids: [],
    });
    Employee._records.find((rec) => rec.id === 2).child_ids.push(5);
    await mountView({
        type: "hierarchy",
        resModel: "hr.employee",
        viewId: false,
        searchViewArch: `
            <search>
                <filter name="test_filter" domain="[['id', 'in', [1, 2, 3, 4, 5]]]"/>
            </search>
        `,
    });
    await enableFilters(["test_filter"]);

    expect(".o_hierarchy_row").toHaveCount(1);
    expect(".o_hierarchy_node_container").toHaveCount(5);
    expect(".o_hierarchy_node_container button [data-icon='expand_less']").toHaveCount(4);
    const georgesNode = queryOne(
        ".o_hierarchy_node_container:has(button[name=hierarchy_search_parent_node]):eq(0)"
    );
    expect(queryOne(".o_hierarchy_node_content", { root: georgesNode })).toHaveText(
        "Georges\nAlbert"
    );
    await contains(
        queryOne("button[name=hierarchy_search_subsidiaries]", { root: georgesNode })
    ).click();
    expect(".o_hierarchy_row").toHaveCount(2);
    expect(".o_hierarchy_node").toHaveCount(5);
    expect(".o_hierarchy_row:eq(0) .o_hierarchy_node").toHaveCount(4);
    expect(queryAllTexts(".o_hierarchy_row:eq(0) .o_hierarchy_node_content")).toEqual([
        "Albert",
        "Georges\nAlbert",
        "Josephine\nAlbert",
        "Louis\nJosephine",
    ]);
    expect(".o_hierarchy_row:eq(1) .o_hierarchy_node").toHaveCount(1);
    expect(".o_hierarchy_row:eq(1) .o_hierarchy_node_content").toHaveText("Lisa\nGeorges");
    await contains(".o_hierarchy_node_container button [data-icon='expand_less']").click();
    expect(".o_hierarchy_row").toHaveCount(3);
    expect(".o_hierarchy_node").toHaveCount(4);
});

test("drag and drop is disabled by default", async () => {
    await mountView({
        type: "hierarchy",
        resModel: "hr.employee",
    });
    expect(".o_hierarchy_row").toHaveCount(2);
    expect(".o_hierarchy_node").toHaveCount(3);
    expect(queryAllTexts(".o_hierarchy_node_content")).toEqual([
        "Albert",
        "Georges\nAlbert",
        "Josephine\nAlbert",
    ]);

    expect(".o_hierarchy_node_container:eq(1) .o_hierarchy_node_content").toHaveText(
        "Georges\nAlbert"
    );

    await contains(".o_hierarchy_node_container:eq(1) .o_hierarchy_node").dragAndDrop(
        ".o_hierarchy_row:first-child"
    );

    expect(".o_hierarchy_row").toHaveCount(2);
    expect(".o_hierarchy_node").toHaveCount(3);
    expect(queryAllTexts(".o_hierarchy_node_content")).toEqual([
        "Albert",
        "Georges\nAlbert",
        "Josephine\nAlbert",
    ]);
});

test("drag and drop record on another row", async () => {
    Employee._views["hierarchy"] = Employee._views["hierarchy"].replace(
        "<hierarchy>",
        "<hierarchy draggable='1'>"
    );
    await mountView({
        type: "hierarchy",
        resModel: "hr.employee",
    });
    expect(".o_hierarchy_row").toHaveCount(2);
    expect(".o_hierarchy_node").toHaveCount(3);
    expect(queryAllTexts(".o_hierarchy_node_content")).toEqual([
        "Albert",
        "Georges\nAlbert",
        "Josephine\nAlbert",
    ]);
    expect(".o_hierarchy_node_container:eq(1) .o_hierarchy_node_content").toHaveText(
        "Georges\nAlbert"
    );

    await contains(".o_hierarchy_node_container:eq(1) .o_hierarchy_node").dragAndDrop(
        ".o_hierarchy_row:first-child"
    );

    expect(".o_hierarchy_row").toHaveCount(2);
    expect(".o_hierarchy_node").toHaveCount(3);
    expect(queryAllTexts(".o_hierarchy_node_content")).toEqual(
        ["Albert", "Georges", "Josephine\nAlbert"],
        { message: "Georges should no longer have a manager" }
    );
});

test("drag and drop record at an invalid position", async () => {
    expect.assertions(8);
    Employee._views["hierarchy"] = Employee._views["hierarchy"].replace(
        "<hierarchy>",
        "<hierarchy draggable='1'>"
    );
    patchWithCleanup(HierarchyModel.prototype, {
        async updateParentId(node, parentResId = false) {
            return this.orm.call(this.resModel, "custom_update_parent_id", [node.resId], {
                parent_id: parentResId,
            });
        },
        async updateParentNode() {
            await expect(super.updateParentNode(...arguments)).rejects.toThrow(
                makeServerError({
                    type: "ValidationError",
                    description: "Prevented update parent",
                })
            );
        },
    });
    onRpc("custom_update_parent_id", () => {
        throw makeServerError({
            type: "ValidationError",
            description: "Prevented update parent",
        });
    });
    await mountView({
        type: "hierarchy",
        resModel: "hr.employee",
    });
    expect(".o_hierarchy_row").toHaveCount(2);
    expect(".o_hierarchy_node").toHaveCount(3);
    expect(queryAllTexts(".o_hierarchy_node_content")).toEqual([
        "Albert",
        "Georges\nAlbert",
        "Josephine\nAlbert",
    ]);

    expect(".o_hierarchy_node_container:eq(1) .o_hierarchy_node_content").toHaveText(
        "Georges\nAlbert"
    );

    await contains(".o_hierarchy_node_container:eq(1) .o_hierarchy_node").dragAndDrop(
        ".o_hierarchy_row:first-child"
    );

    expect(".o_hierarchy_row").toHaveCount(2);
    expect(".o_hierarchy_node").toHaveCount(3);
    expect(queryAllTexts(".o_hierarchy_node_content")).toEqual(
        ["Albert", "Georges\nAlbert", "Josephine\nAlbert"],
        { message: "The view should not have been modified since the position is invalid" }
    );
});

test("drag and drop record on sibling node", async () => {
    Employee._views["hierarchy"] = Employee._views["hierarchy"].replace(
        "<hierarchy>",
        "<hierarchy draggable='1'>"
    );
    await mountView({
        type: "hierarchy",
        resModel: "hr.employee",
    });
    expect(".o_hierarchy_row").toHaveCount(2);
    expect(".o_hierarchy_node").toHaveCount(3);
    expect(queryAllTexts(".o_hierarchy_node_content")).toEqual([
        "Albert",
        "Georges\nAlbert",
        "Josephine\nAlbert",
    ]);

    expect(".o_hierarchy_node_container:eq(1) .o_hierarchy_node_content").toHaveText(
        "Georges\nAlbert"
    );
    expect(".o_hierarchy_node_container:eq(2) .o_hierarchy_node_content").toHaveText(
        "Josephine\nAlbert"
    );

    await contains(".o_hierarchy_node_container:eq(1) .o_hierarchy_node").dragAndDrop(
        ".o_hierarchy_node_container:eq(2)"
    );

    expect(".o_hierarchy_row").toHaveCount(3);
    expect(".o_hierarchy_node").toHaveCount(4);
    expect(queryAllTexts(".o_hierarchy_node_content")).toEqual(
        ["Albert", "Josephine\nAlbert", "Georges\nJosephine", "Louis\nJosephine"],
        { message: "Georges should have Josephine as manager" }
    );
});

test("drag and drop record on node of another tree", async () => {
    Employee._views["hierarchy,1"] = Employee._views["hierarchy,1"].replace(
        `<hierarchy child_field="child_ids">`,
        `<hierarchy child_field="child_ids" draggable="1">`
    );
    Employee._records = [
        { id: 1, name: "A", parent_id: false, child_ids: [3, 4] },
        { id: 2, name: "B", parent_id: false, child_ids: [] },
        { id: 3, name: "C", parent_id: 1, child_ids: [5] },
        { id: 4, name: "D", parent_id: 1, child_ids: [] },
        { id: 5, name: "E", parent_id: 3, child_ids: [] },
    ];
    await mountView({
        type: "hierarchy",
        resModel: "hr.employee",
        viewId: 1,
    });

    expect(".o_hierarchy_row").toHaveCount(1);
    await contains(".o_hierarchy_node_button[title='Unfold']").click();
    expect(".o_hierarchy_row").toHaveCount(2);
    await contains(".o_hierarchy_node_button[title='Unfold']").click();
    expect(".o_hierarchy_row").toHaveCount(3);
    expect(queryAllTexts(".o_hierarchy_row .o_hierarchy_node_content")).toEqual([
        "A",
        "B",
        "C\nA",
        "D\nA",
        "E\nC",
    ]);

    expect(".o_hierarchy_node_container:eq(1) .o_hierarchy_node_content").toHaveText("B");
    expect(".o_hierarchy_node_container:eq(3) .o_hierarchy_node_content").toHaveText("D\nA");

    await contains(".o_hierarchy_node_container:eq(3) .o_hierarchy_node").dragAndDrop(
        ".o_hierarchy_node_container:eq(1)"
    );

    expect(".o_hierarchy_row").toHaveCount(2);
    expect(queryAllTexts(".o_hierarchy_row .o_hierarchy_node_content")).toEqual(["A", "B", "D\nB"]);

    expect(".o_hierarchy_node_container:eq(0) .o_hierarchy_node_content").toHaveText("A");

    await contains(
        ".o_hierarchy_node_container:eq(0) .o_hierarchy_node_button[title='Unfold']"
    ).click();

    expect(".o_hierarchy_node_container:eq(2) .o_hierarchy_node_content").toHaveText("C\nA");

    await contains(
        ".o_hierarchy_node_container:eq(2) .o_hierarchy_node_button[title='Unfold']"
    ).click();

    expect(queryAllTexts(".o_hierarchy_row .o_hierarchy_node_content")).toEqual(
        ["A", "B", "C\nA", "E\nC"],
        {
            message:
                "Nodes that were folded as a result of the drop operation should all still be unfoldable",
        }
    );
});

test("drag and drop node unfolded on first row", async () => {
    Employee._views["hierarchy"] = Employee._views["hierarchy"].replace(
        "<hierarchy>",
        "<hierarchy draggable='1'>"
    );
    await mountView({
        type: "hierarchy",
        resModel: "hr.employee",
    });
    expect(".o_hierarchy_row").toHaveCount(2);
    expect(".o_hierarchy_node").toHaveCount(3);
    expect(queryAllTexts(".o_hierarchy_node_content")).toEqual([
        "Albert",
        "Georges\nAlbert",
        "Josephine\nAlbert",
    ]);

    expect(".o_hierarchy_node_container:eq(2) .o_hierarchy_node_content").toHaveText(
        "Josephine\nAlbert"
    );
    await contains(
        ".o_hierarchy_node_container:eq(2) button[name='hierarchy_search_subsidiaries']"
    ).click();

    await contains(".o_hierarchy_node_container:eq(2) .o_hierarchy_node").dragAndDrop(
        ".o_hierarchy_row:first-child"
    );

    expect(".o_hierarchy_row").toHaveCount(2);
    expect(".o_hierarchy_node").toHaveCount(3);
    expect(queryAllTexts(".o_hierarchy_node_content")).toEqual(
        ["Albert", "Josephine", "Louis\nJosephine"],
        { message: "Georges should have Josephine as manager" }
    );

    expect(".o_hierarchy_node_container:eq(2) .o_hierarchy_node_content").toHaveText(
        "Louis\nJosephine"
    );
    await contains(".o_hierarchy_node_container:eq(2) .o_hierarchy_node").dragAndDrop(
        ".o_hierarchy_row:first-child"
    );

    expect(".o_hierarchy_row").toHaveCount(1);
    expect(".o_hierarchy_node").toHaveCount(3);
    expect(queryAllTexts(".o_hierarchy_node_content")).toEqual(["Albert", "Josephine", "Louis"], {
        message: "Louis should still be draggable after being dragged along with Josephine",
    });
});

test("drag and drop node when other node is unfolded on first row", async () => {
    Employee._views["hierarchy"] = Employee._views["hierarchy"].replace(
        "<hierarchy>",
        "<hierarchy draggable='1'>"
    );
    await mountView({
        type: "hierarchy",
        resModel: "hr.employee",
    });
    expect(".o_hierarchy_row").toHaveCount(2);
    expect(".o_hierarchy_node").toHaveCount(3);
    expect(queryAllTexts(".o_hierarchy_node_content")).toEqual([
        "Albert",
        "Georges\nAlbert",
        "Josephine\nAlbert",
    ]);

    expect(".o_hierarchy_node_container:eq(1) .o_hierarchy_node_content").toHaveText(
        "Georges\nAlbert"
    );
    expect(".o_hierarchy_node_container:eq(2) .o_hierarchy_node_content").toHaveText(
        "Josephine\nAlbert"
    );
    await contains(
        ".o_hierarchy_node_container:eq(2) button[name='hierarchy_search_subsidiaries']"
    ).click();

    await contains(".o_hierarchy_node_container:eq(1) .o_hierarchy_node").dragAndDrop(
        ".o_hierarchy_row:eq(0)"
    );

    expect(".o_hierarchy_row").toHaveCount(3);
    expect(".o_hierarchy_node").toHaveCount(4);
    expect(queryAllTexts(".o_hierarchy_node_content")).toEqual(
        ["Albert", "Georges", "Josephine\nAlbert", "Louis\nJosephine"],
        { message: "Georges should no longer have a manager" }
    );
});

test("drag and drop node unfolded on another row", async () => {
    Employee._views["hierarchy"] = Employee._views["hierarchy"].replace(
        "<hierarchy>",
        "<hierarchy draggable='1'>"
    );
    Employee._records = [
        { id: 1, name: "Albert", parent_id: false, child_ids: [2] },
        { id: 2, name: "Georges", parent_id: 1, child_ids: [3] },
        { id: 3, name: "Josephine", parent_id: 2, child_ids: [4] },
        { id: 4, name: "Louis", parent_id: 3, child_ids: [] },
        { id: 5, name: "Kelly", parent_id: 2, child_ids: [] },
    ];
    await mountView({
        type: "hierarchy",
        resModel: "hr.employee",
        viewId: false,
    });
    expect(".o_hierarchy_row").toHaveCount(2);
    expect(".o_hierarchy_node").toHaveCount(2);
    expect(queryAllTexts(".o_hierarchy_node_content")).toEqual(["Albert", "Georges\nAlbert"]);

    expect(".o_hierarchy_node_container:eq(1) .o_hierarchy_node_content").toHaveText(
        "Georges\nAlbert"
    );
    await contains(
        ".o_hierarchy_node_container:eq(1) button[name='hierarchy_search_subsidiaries']"
    ).click();

    expect(".o_hierarchy_node_container:eq(2) .o_hierarchy_node_content").toHaveText(
        "Josephine\nGeorges"
    );
    await contains(
        ".o_hierarchy_node_container:eq(2) button[name='hierarchy_search_subsidiaries']"
    ).click();

    expect(".o_hierarchy_node_container:eq(2) .o_hierarchy_node_content").toHaveText(
        "Josephine\nGeorges"
    );
    expect(".o_hierarchy_node_container:eq(4) .o_hierarchy_node_content").toHaveText(
        "Louis\nJosephine"
    );
    expect(".o_hierarchy_row").toHaveCount(4);
    expect(queryAllTexts(".o_hierarchy_node_content")).toEqual(
        ["Albert", "Georges\nAlbert", "Josephine\nGeorges", "Kelly\nGeorges", "Louis\nJosephine"],
        { message: "Kelly should be displayed" }
    );

    await contains(".o_hierarchy_node_container:eq(2) .o_hierarchy_node").dragAndDrop(
        ":nth-child(2 of .o_hierarchy_row)"
    );

    expect(".o_hierarchy_row").toHaveCount(3);
    expect(".o_hierarchy_node").toHaveCount(4);
    expect(queryAllTexts(".o_hierarchy_node_content")).toEqual(
        ["Albert", "Georges\nAlbert", "Josephine\nAlbert", "Louis\nJosephine"],
        { message: "Josephine should have Albert as a manager and Kelly should be hidden" }
    );

    expect(".o_hierarchy_node_container:eq(3) .o_hierarchy_node_content").toHaveText(
        "Louis\nJosephine"
    );

    await contains(".o_hierarchy_node_container:eq(3) .o_hierarchy_node").dragAndDrop(
        ":nth-child(2 of .o_hierarchy_row)"
    );

    expect(".o_hierarchy_row").toHaveCount(2);
    expect(".o_hierarchy_node").toHaveCount(4);
    expect(queryAllTexts(".o_hierarchy_node_content")).toEqual(
        ["Albert", "Georges\nAlbert", "Josephine\nAlbert", "Louis\nAlbert"],
        { message: "Louis should still be draggable after being dragged along with Josephine" }
    );
});

test("drag and drop node as a child of a sibling of its parent", async () => {
    Employee._views["hierarchy,1"] = Employee._views["hierarchy,1"].replace(
        `<hierarchy child_field="child_ids">`,
        `<hierarchy child_field="child_ids" draggable="1">`
    );
    Employee._records = [
        { id: 1, name: "A", parent_id: false, child_ids: [2, 3] },
        { id: 2, name: "B", parent_id: 1, child_ids: [4, 5] },
        { id: 3, name: "C", parent_id: 1, child_ids: [] },
        { id: 4, name: "D", parent_id: 2, child_ids: [] },
        { id: 5, name: "E", parent_id: 2, child_ids: [] },
    ];
    await mountView({
        type: "hierarchy",
        resModel: "hr.employee",
        viewId: 1,
    });
    expect(".o_hierarchy_row").toHaveCount(2);
    await contains(".o_hierarchy_node_button[title='Unfold']").click();
    expect(".o_hierarchy_row").toHaveCount(3);
    expect(queryAllTexts(".o_hierarchy_row .o_hierarchy_node_content")).toEqual([
        "A",
        "B\nA",
        "C\nA",
        "D\nB",
        "E\nB",
    ]);

    expect(".o_hierarchy_node_container:eq(2) .o_hierarchy_node_content").toHaveText("C\nA");
    expect(".o_hierarchy_node_container:eq(4) .o_hierarchy_node_content").toHaveText("E\nB");

    await contains(".o_hierarchy_node_container:eq(4) .o_hierarchy_node").dragAndDrop(
        ".o_hierarchy_node_container:eq(2)"
    );
    expect(".o_hierarchy_row").toHaveCount(3);
    expect(queryAllTexts(".o_hierarchy_row .o_hierarchy_node_content")).toEqual(
        ["A", "B\nA", "C\nA", "E\nC"],
        { message: "B should be folded and C unfolded" }
    );
});

test("drag and drop record and respect ordering", async () => {
    Employee._views["hierarchy"] = Employee._views["hierarchy"].replace(
        "<hierarchy>",
        "<hierarchy default_order='name' draggable='1'>"
    );
    Employee._records = [
        { id: 1, name: "F", parent_id: false, child_ids: [] },
        { id: 2, name: "E", parent_id: 6, child_ids: [] },
        { id: 3, name: "D", parent_id: 6, child_ids: [] },
        { id: 4, name: "C", parent_id: 6, child_ids: [] },
        { id: 5, name: "B", parent_id: 6, child_ids: [] },
        { id: 6, name: "A", parent_id: false, child_ids: [2, 3, 4, 5] },
    ];
    await mountView({
        type: "hierarchy",
        resModel: "hr.employee",
    });
    expect(".o_hierarchy_row").toHaveCount(1);
    await contains(".o_hierarchy_node_button[title='Unfold']").click();

    expect(".o_hierarchy_row").toHaveCount(2);
    expect(".o_hierarchy_node").toHaveCount(6);
    expect(queryAllTexts(".o_hierarchy_node_content")).toEqual([
        "A",
        "F",
        "B\nA",
        "C\nA",
        "D\nA",
        "E\nA",
    ]);

    await contains(".o_hierarchy_node_container:eq(4) .o_hierarchy_node").dragAndDrop(
        ".o_hierarchy_row:first-child"
    );

    expect(".o_hierarchy_row").toHaveCount(2);
    expect(".o_hierarchy_node").toHaveCount(6);
    expect(queryAllTexts(".o_hierarchy_node_content")).toEqual([
        "A",
        "D",
        "F",
        "B\nA",
        "C\nA",
        "E\nA",
    ]);

    await contains(".o_hierarchy_node_container:eq(1) .o_hierarchy_node").dragAndDrop(
        ":nth-child(2 of .o_hierarchy_row)"
    );

    expect(".o_hierarchy_row").toHaveCount(2);
    expect(".o_hierarchy_node").toHaveCount(6);
    expect(queryAllTexts(".o_hierarchy_node_content")).toEqual([
        "A",
        "F",
        "B\nA",
        "C\nA",
        "D\nA",
        "E\nA",
    ]);
});

test("drag node and move it on a row", async () => {
    Employee._views["hierarchy"] = Employee._views["hierarchy"].replace(
        "<hierarchy>",
        "<hierarchy draggable='1'>"
    );
    await mountView({
        type: "hierarchy",
        resModel: "hr.employee",
    });

    expect(".o_hierarchy_node").toHaveCount(3);
    expect(".o_hierarchy_node_container:eq(1) .o_hierarchy_node_content").toHaveText(
        "Georges\nAlbert"
    );
    const { drop, moveTo } = await contains(
        ".o_hierarchy_node_container:eq(1) .o_hierarchy_node"
    ).drag();

    await moveTo(".o_hierarchy_row:eq(0)");
    expect(".o_hierarchy_node_container:eq(1)").toHaveClass("o_hierarchy_dragged");
    expect(".o_hierarchy_row:eq(0)").toHaveClass("o_hierarchy_hover");

    await drop();
    expect(".o_hierarchy_node.o_hierarchy_dragged").toHaveCount(0);
    expect(".o_hierarchy_row.o_hierarchy_hover").toHaveCount(0);
});

test("drag node and move it on another node", async () => {
    Employee._views["hierarchy"] = Employee._views["hierarchy"].replace(
        "<hierarchy>",
        "<hierarchy draggable='1'>"
    );
    await mountView({
        type: "hierarchy",
        resModel: "hr.employee",
    });

    expect(".o_hierarchy_node").toHaveCount(3);
    expect(".o_hierarchy_node_container:eq(1) .o_hierarchy_node_content").toHaveText(
        "Georges\nAlbert"
    );
    expect(".o_hierarchy_node_container:eq(2) .o_hierarchy_node_content").toHaveText(
        "Josephine\nAlbert"
    );

    const { drop, moveTo } = await contains(
        ".o_hierarchy_node_container:eq(1) .o_hierarchy_node"
    ).drag();

    await moveTo(".o_hierarchy_node_container:eq(2) .o_hierarchy_node");
    expect(".o_hierarchy_node_container:eq(1)").toHaveClass("o_hierarchy_dragged");
    expect(".o_hierarchy_node_container:eq(1) .o_hierarchy_node").toHaveClass("shadow");
    expect(".o_hierarchy_node_container:eq(2)").toHaveClass("o_hierarchy_hover");

    await drop();
    expect(".o_hierarchy_node.o_hierarchy_dragged").toHaveCount(0);
    expect(".o_hierarchy_node.o_hierarchy_hover").toHaveCount(0);
    expect(".o_hierarchy_node.shadow").toHaveCount(0);
});

test("drag node to scroll", async () => {
    Employee._views["hierarchy"] = Employee._views["hierarchy"].replace(
        "<hierarchy>",
        "<hierarchy draggable='1'>"
    );
    Employee._records = [
        { id: 1, name: "A", parent_id: false, child_ids: [2] },
        { id: 2, name: "B", parent_id: 1, child_ids: [3] },
        { id: 3, name: "C", parent_id: 2, child_ids: [4] },
        { id: 4, name: "D", parent_id: 3, child_ids: [5] },
        { id: 5, name: "E", parent_id: 4, child_ids: [] },
        { id: 6, name: "F", parent_id: false, child_ids: [] },
    ];
    await mountView({
        type: "hierarchy",
        resModel: "hr.employee",
    });

    // Fully open the view
    expect(".o_hierarchy_row").toHaveCount(1);
    await contains(".o_hierarchy_node_button[title='Unfold']").click();
    expect(".o_hierarchy_row").toHaveCount(2);
    await contains(".o_hierarchy_node_button[title='Unfold']").click();
    expect(".o_hierarchy_row").toHaveCount(3);
    await contains(".o_hierarchy_node_button[title='Unfold']").click();
    expect(".o_hierarchy_row").toHaveCount(4);
    await contains(".o_hierarchy_node_button[title='Unfold']").click();
    expect(".o_hierarchy_row").toHaveCount(5);
    expect(queryAllTexts(".o_hierarchy_row .o_hierarchy_node_content")).toEqual([
        "A",
        "F",
        "B\nA",
        "C\nB",
        "D\nC",
        "E\nD",
    ]);
    await animationFrame();
    const content = queryOne(".o_content");
    await scroll(content, { top: 0 });

    // Limit the height and enable scrolling
    content.setAttribute("style", "min-height:600px;max-height:600px;overflow-y:auto;");
    expect(content.scrollTop).toBe(0);
    expect(content).toHaveRect({ height: 600 });

    const dragActions = await contains(".o_hierarchy_node:contains(F)").drag();
    await dragActions.moveTo(".o_hierarchy_row:eq(4)");
    await animationFrame();

    expect(content.scrollTop).toBeGreaterThan(0);
    expect(".o_hierarchy_node_container.o_hierarchy_dragged").toHaveCount(1);

    await advanceFrame(50);

    // should be at the end of the content
    expect(content.clientHeight + content.scrollTop).toBe(content.scrollHeight);

    await dragActions.moveTo(".o_hierarchy_row:eq(0)");
    await animationFrame();

    expect(content.clientHeight + content.scrollTop).toBeLessThan(content.scrollHeight);
    expect(".o_hierarchy_node_container.o_hierarchy_dragged").toHaveCount(1);

    await advanceFrame(50);

    // should be at the top of the content
    expect(content.scrollTop).toBe(0);

    // cancel drag: press "Escape"
    await press("Escape");
    await animationFrame();

    expect(".o_hierarchy_node_container.o_hierarchy_dragged").toHaveCount(0);
});

test("should display 'Unfold' button label when no label is provided", async () => {
    await mountView({
        type: "hierarchy",
        resModel: "hr.employee",
    });

    expect(".o_hierarchy_node button[name=hierarchy_search_subsidiaries][title='Unfold']").toHaveCount(
        1
    );
    expect(".o_hierarchy_node button[name=hierarchy_search_subsidiaries][title='Unfold']").toHaveText(
        "1 Unfold"
    );
});

test("use `hierarchy_res_id` context to load the view at that specific node with its siblings and parent node", async () => {
    Employee._records.push({
        id: 5,
        name: "Lisa",
        parent_id: 3,
        child_ids: [],
    });
    Employee._records.find((rec) => rec.id === 3).child_ids.push(5);
    await mountView({
        type: "hierarchy",
        resModel: "hr.employee",
        context: {
            hierarchy_res_id: 5,
        },
    });

    expect(".o_hierarchy_row").toHaveCount(2);
    expect(".o_hierarchy_node").toHaveCount(3);
    expect(queryAllTexts(".o_hierarchy_node_content")).toEqual([
        "Josephine\nAlbert",
        "Lisa\nJosephine",
        "Louis\nJosephine",
    ]);
    expect(".o_hierarchy_node_container button[name=hierarchy_search_parent_node]").toHaveCount(1);
});

test("cannot set the record dragged as parent", async () => {
    Employee._views["hierarchy"] = Employee._views["hierarchy"].replace(
        "<hierarchy>",
        "<hierarchy draggable='1'>"
    );
    onRpc("hr.employee", "write", () => {
        expect.step("setManager");
    });
    await mountView({
        type: "hierarchy",
        resModel: "hr.employee",
    });
    expect(".o_hierarchy_row").toHaveCount(2);
    expect(".o_hierarchy_node").toHaveCount(3);
    expect(queryAllTexts(".o_hierarchy_node_content")).toEqual([
        "Albert",
        "Georges\nAlbert",
        "Josephine\nAlbert",
    ]);
    await contains(".o_hierarchy_node:eq(0)").dragAndDrop(".o_hierarchy_row:eq(1)");
    expect(".o_hierarchy_row").toHaveCount(2);
    expect(".o_hierarchy_node").toHaveCount(3);
    expect(queryAllTexts(".o_hierarchy_node_content")).toEqual([
        "Albert",
        "Georges\nAlbert",
        "Josephine\nAlbert",
    ]);
    expect(".o_notification").toHaveCount(1);
    expect(".o_notification_bar.bg-danger").toHaveCount(1);

    expect.verifySteps([]);
});

test("cannot create cyclic", async () => {
    Employee._views["hierarchy"] = Employee._views["hierarchy"].replace(
        "<hierarchy>",
        "<hierarchy draggable='1'>"
    );
    onRpc("hr.employee", "write", () => {
        expect.step("setManager");
    });
    await mountView({
        type: "hierarchy",
        resModel: "hr.employee",
    });
    expect(".o_hierarchy_row").toHaveCount(2);
    expect(".o_hierarchy_node").toHaveCount(3);
    expect(queryAllTexts(".o_hierarchy_node_content")).toEqual([
        "Albert",
        "Georges\nAlbert",
        "Josephine\nAlbert",
    ]);
    await contains(".o_hierarchy_node:eq(0)").dragAndDrop(".o_hierarchy_node:eq(1)");
    expect(".o_hierarchy_row").toHaveCount(2);
    expect(".o_hierarchy_node").toHaveCount(3);
    expect(queryAllTexts(".o_hierarchy_node_content")).toEqual([
        "Albert",
        "Georges\nAlbert",
        "Josephine\nAlbert",
    ]);
    expect(".o_notification").toHaveCount(1);
    expect(".o_notification_bar.bg-danger").toHaveCount(1);

    await contains(".o_hierarchy_node_button[title='Unfold']").click();
    expect(".o_hierarchy_row").toHaveCount(3);
    expect(".o_hierarchy_node").toHaveCount(4);
    expect(queryAllTexts(".o_hierarchy_node_content")).toEqual([
        "Albert",
        "Georges\nAlbert",
        "Josephine\nAlbert",
        "Louis\nJosephine",
    ]);
    await contains(".o_hierarchy_node:eq(0)").dragAndDrop(".o_hierarchy_node:eq(3)");
    expect(".o_hierarchy_row").toHaveCount(3);
    expect(".o_hierarchy_node").toHaveCount(4);
    expect(queryAllTexts(".o_hierarchy_node_content")).toEqual([
        "Albert",
        "Georges\nAlbert",
        "Josephine\nAlbert",
        "Louis\nJosephine",
    ]);
    expect(".o_notification").toHaveCount(1);
    expect(".o_notification_bar.bg-danger").toHaveCount(1);

    await contains(".o_hierarchy_node:eq(0)").dragAndDrop(".o_hierarchy_row:eq(2)");
    expect(".o_hierarchy_row").toHaveCount(3);
    expect(".o_hierarchy_node").toHaveCount(4);
    expect(queryAllTexts(".o_hierarchy_node_content")).toEqual([
        "Albert",
        "Georges\nAlbert",
        "Josephine\nAlbert",
        "Louis\nJosephine",
    ]);
    expect(".o_notification").toHaveCount(1);
    expect(".o_notification_bar.bg-danger").toHaveCount(1);

    expect.verifySteps([]);
});

test("can properly evaluate invisible elements in a hierarchy card", async () => {
    await mountView({
        type: "hierarchy",
        resModel: "hr.employee",
        arch: `
                <hierarchy child_field="child_ids">
                    <field name="child_ids" invisible="1"/>
                    <templates>
                        <t t-name="hierarchy-box">
                            <div class="o_hierarchy_node_header">
                                <field name="name"/>
                            </div>
                            <div class="o_hierarchy_node_body">
                                <field name="parent_id"/>
                            </div>
                            <div invisible="not child_ids" class="o_children_text">
                                <p>withChildren</p>
                            </div>
                        </t>
                    </templates>
                </hierarchy>
            `,
    });
    expect(".o_hierarchy_row").toHaveCount(2);
    expect(".o_hierarchy_node").toHaveCount(3);
    expect(".o_hierarchy_node_container:eq(0) .o_hierarchy_node_content").toHaveText(
        "Albert\n\nwithChildren"
    );
    expect(".o_hierarchy_node_container:eq(1) .o_hierarchy_node_content").toHaveText(
        "Georges\nAlbert"
    );
    expect(".o_hierarchy_node_container:eq(2) .o_hierarchy_node_content").toHaveText(
        "Josephine\nAlbert\n\nwithChildren"
    );
    expect(".o_hierarchy_node_container:eq(0) .o_children_text").toHaveCount(1);
    expect(".o_hierarchy_node_container:eq(1) .o_children_text").toHaveCount(0);
    expect(".o_hierarchy_node_container:eq(2) .o_children_text").toHaveCount(1);
});

test("Reload the view with the same unfolded records when clicking with a view button", async () => {
    mockService("action", {
        doActionButton({ resId, onClose }) {
            for (const record of MockServer.env["hr.employee"].browse(resId)) {
                record.name = "_" + record.name;
            }
            onClose();
        },
    });
    await mountView({
        type: "hierarchy",
        resModel: "hr.employee",
        arch: `
                <hierarchy child_field="child_ids">
                    <templates>
                        <t t-name="hierarchy-box">
                            <div class="o_hierarchy_node_header">
                                <field name="name"/>
                            </div>
                            <div class="o_hierarchy_node_body">
                                <field name="parent_id"/>
                            </div>
                            <button type="object" name="prefix_underscore">prefix</button>
                        </t>
                    </templates>
                </hierarchy>
            `,
    });
    await contains(".o_hierarchy_node_button[title='Unfold']").click();
    expect(".o_hierarchy_row").toHaveCount(3);
    expect(".o_hierarchy_node").toHaveCount(4);
    expect(queryAllTexts(".o_hierarchy_node_content")).toEqual([
        "Albert\nprefix",
        "Georges\nAlbert\nprefix",
        "Josephine\nAlbert\nprefix",
        "Louis\nJosephine\nprefix",
    ]);
    expect(".o_hierarchy_node_container:eq(1) .o_hierarchy_node_content").toHaveText(
        "Georges\nAlbert\nprefix"
    );
    await contains(".o_hierarchy_node_container:eq(1) button[name='prefix_underscore']").click();
    expect(".o_hierarchy_row").toHaveCount(3);
    expect(".o_hierarchy_node").toHaveCount(4);
    expect(queryAllTexts(".o_hierarchy_node_content")).toEqual(
        [
            "Albert\nprefix",
            "_Georges\nAlbert\nprefix",
            "Josephine\nAlbert\nprefix",
            "Louis\nJosephine\nprefix",
        ],
        { message: "The view should have reloaded the same data (with Louis)" }
    );
});

test("The view displays the No Content help", async () => {
    Employee._records = [];
    await mountView({
        type: "hierarchy",
        resModel: "hr.employee",
    });
    expect("div.o_view_nocontent").toHaveCount(1);
});

test("Keep the same hierarchy state when we go back to the view with the breadcrumb", async () => {
    await mountWithCleanup(WebClient);
    await getService("action").doAction({
        res_model: "hr.employee",
        type: "ir.actions.act_window",
        views: [
            [false, "hierarchy"],
            [false, "form"],
        ],
    });

    expect(".o_hierarchy_row").toHaveCount(2);
    expect(".o_hierarchy_node_button").toHaveCount(2);
    expect(".o_hierarchy_node_button[title='Fold']").toHaveCount(1);
    expect(".o_hierarchy_node_button[title='Unfold']").toHaveCount(1);
    await contains(".o_hierarchy_node_button[title='Unfold']").click();
    expect(".o_hierarchy_row").toHaveCount(3);
    expect(".o_hierarchy_separator").toHaveCount(2);
    expect(".o_hierarchy_node_container").toHaveCount(4);
    expect(".o_hierarchy_node").toHaveCount(4);
    expect(".o_hierarchy_node_button").toHaveCount(2);
    expect(queryAllTexts(".o_hierarchy_node_content")).toEqual([
        "Albert",
        "Georges\nAlbert",
        "Josephine\nAlbert",
        "Louis\nJosephine",
    ]);
    await contains(".o_hierarchy_node_container:eq(1) .o_hierarchy_node").click();
    expect(".o_hierarchy_view").toHaveCount(0);
    expect(".o_form_view").toHaveCount(1);
    await contains(".o_back_button").click();
    expect(queryAllTexts(".o_hierarchy_node_content")).toEqual([
        "Albert",
        "Georges\nAlbert",
        "Josephine\nAlbert",
        "Louis\nJosephine",
    ]);
});

test("Keep the state of the branch when we open another branch in the same level", async () => {
    Employee._records.push(
        { id: 5, name: "Jean", parent_id: 2, child_ids: [6] },
        { id: 6, name: "Claude", parent_id: 5, child_ids: [] }
    );
    // check we keep in cache the previous branch to avoid fetching again the same data
    await mountView({
        resModel: "hr.employee",
        type: "hierarchy",
    });
    expect(".o_hierarchy_view").toHaveCount(1);
    expect(".o_hierarchy_row").toHaveCount(2);
    expect(queryAllTexts(".o_hierarchy_node_content")).toEqual([
        "Albert",
        "Georges\nAlbert",
        "Josephine\nAlbert",
    ]);
    await contains(".o_hierarchy_node_button[title='Unfold']:eq(0)").click();
    expect(queryAllTexts(".o_hierarchy_node_content")).toEqual([
        "Albert",
        "Georges\nAlbert",
        "Josephine\nAlbert",
        "Jean\nGeorges",
    ]);
    await contains(".o_hierarchy_node_button[title='Unfold']:eq(1)").click();
    expect(queryAllTexts(".o_hierarchy_node_content")).toEqual([
        "Albert",
        "Georges\nAlbert",
        "Josephine\nAlbert",
        "Jean\nGeorges",
        "Claude\nJean",
    ]);
    expect(".o_hierarchy_node_button[title='Unfold']").toHaveCount(1);
    await contains(".o_hierarchy_node_button[title='Unfold']").click();
    expect(queryAllTexts(".o_hierarchy_node_content")).toEqual([
        "Albert",
        "Georges\nAlbert",
        "Josephine\nAlbert",
        "Louis\nJosephine",
    ]);
    expect(".o_hierarchy_node_button[title='Unfold']").toHaveCount(1);
    await contains(".o_hierarchy_node_button[title='Unfold']").click();
    expect(queryAllTexts(".o_hierarchy_node_content")).toEqual([
        "Albert",
        "Georges\nAlbert",
        "Josephine\nAlbert",
        "Jean\nGeorges",
        "Claude\nJean",
    ]);
});

test("Avoid fetching subnodes if those subnodes are already in the view", async () => {
    Employee._records.push({ id: 5, name: "Jean", parent_id: 2, child_ids: [] });

    onRpc("web_search_read", () => {
        expect.step("get child data");
    });
    onRpc("read_group", () => {
        expect.step("fetch descendants");
    });
    await mountView({
        type: "hierarchy",
        resModel: "hr.employee",
        arch: Employee._views.hierarchy,
        searchViewArch: `
            <search>
                <filter name="test_filter" domain="[['id', 'in', [1, 2, 3, 4, 5]]]"/>
            </search>
        `,
    });
    await enableFilters(["test_filter"]);
    expect(".o_hierarchy_row").toHaveCount(1);
    expect(".o_hierarchy_node").toHaveCount(5);
    expect(queryAllTexts(".o_hierarchy_node_content")).toEqual([
        "Albert",
        "Georges\nAlbert",
        "Josephine\nAlbert",
        "Louis\nJosephine",
        "Jean\nGeorges",
    ]);
    await contains(".o_hierarchy_node_button[title='Unfold']:eq(0)").click();
    expect.verifySteps([]);
    expect(".o_hierarchy_row").toHaveCount(2);
    expect(queryAllTexts(".o_hierarchy_row:first-child .o_hierarchy_node_content")).toEqual([
        "Albert",
        "Louis\nJosephine",
        "Jean\nGeorges",
    ]);
    expect(queryAllTexts(".o_hierarchy_row:last-child .o_hierarchy_node_content")).toEqual([
        "Georges\nAlbert",
        "Josephine\nAlbert",
    ]);
    // The button to show the subnodes should be displayed for Georges and Josephine
    expect(".o_hierarchy_node_button[title='Unfold']").toHaveCount(2);
});

test("Open record on new window", async () => {
    patchWithCleanup(browser, {
        open: (url) => {
            expect.step(`opened in new window: ${url}`);
        },
    });
    patchWithCleanup(browser.sessionStorage, {
        setItem(key, value) {
            expect.step(`set ${key}-${value}`);
            super.setItem(key, value);
        },
        getItem(key) {
            const res = super.getItem(key);
            expect.step(`get ${key}-${res}`);
            return res;
        },
    });
    await mountWithCleanup(WebClient);
    await getService("action").doAction({
        res_model: "hr.employee",
        type: "ir.actions.act_window",
        views: [
            [false, "hierarchy"],
            [false, "form"],
        ],
    });

    await contains(".o_hierarchy_node_container:eq(1) .o_hierarchy_node").click({ ctrlKey: true });
    expect(".o_hierarchy_view").toHaveCount(1);
    expect(".o_form_view").toHaveCount(0);
    expect.verifySteps([
        "get menu_id-null",
        "get current_lang-null",
        "get current_state-null",
        "get current_action-null",
        'set current_state-{"actionStack":[{"displayName":"","model":"hr.employee","view_type":"hierarchy"}],"model":"hr.employee"}',
        'set current_action-{"res_model":"hr.employee","type":"ir.actions.act_window","views":[[false,"hierarchy"],[false,"form"]]}',
        "set current_lang-en",
        'get current_action-{"res_model":"hr.employee","type":"ir.actions.act_window","views":[[false,"hierarchy"],[false,"form"]]}',
        'get current_state-{"actionStack":[{"displayName":"","model":"hr.employee","view_type":"hierarchy"}],"model":"hr.employee"}',
        'set current_action-{"res_model":"hr.employee","type":"ir.actions.act_window","views":[[false,"hierarchy"],[false,"form"]]}',
        'set current_state-{"actionStack":[{"displayName":"","model":"hr.employee","view_type":"hierarchy"},{"displayName":"","model":"hr.employee","view_type":"form","resId":2}],"resId":2,"model":"hr.employee"}',
        "opened in new window: /odoo/hr.employee/2",
        'set current_action-{"res_model":"hr.employee","type":"ir.actions.act_window","views":[[false,"hierarchy"],[false,"form"]]}',
        'set current_state-{"actionStack":[{"displayName":"","model":"hr.employee","view_type":"hierarchy"}],"model":"hr.employee"}',
    ]);
});

