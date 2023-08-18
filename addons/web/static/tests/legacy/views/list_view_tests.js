/** @odoo-module alias=@web/../tests/views/list_view_tests default=false */

import { browser } from "@web/core/browser/browser";
import { registry } from "@web/core/registry";
import { tooltipService } from "@web/core/tooltip/tooltip_service";
import { uiService } from "@web/core/ui/ui_service";
import {
    click,
    dragAndDrop,
    editInput,
    getFixture,
    getNodesTextContent,
    nextTick,
    patchWithCleanup,
    triggerEvent,
    triggerEvents,
    triggerHotkey,
} from "../helpers/utils";
import { makeView, setupViewRegistries } from "./helpers";

const serviceRegistry = registry.category("services");

let serverData;
let target;

function getGroup(position) {
    return target.querySelectorAll(".o_group_header")[position - 1];
}

QUnit.module("Views", (hooks) => {
    hooks.beforeEach(() => {
        serverData = {
            models: {
                foo: {
                    fields: {
                        foo: { string: "Foo", type: "char" },
                        bar: { string: "Bar", type: "boolean" },
                        date: { string: "Some Date", type: "date" },
                        int_field: {
                            string: "int_field",
                            type: "integer",
                            sortable: true,
                            aggregator: "sum",
                        },
                        text: { string: "text field", type: "text" },
                        qux: { string: "my float", type: "float", aggregator: "sum" },
                        m2o: { string: "M2O field", type: "many2one", relation: "bar" },
                        o2m: { string: "O2M field", type: "one2many", relation: "bar" },
                        m2m: { string: "M2M field", type: "many2many", relation: "bar" },
                        amount: { string: "Monetary field", type: "monetary", aggregator: "sum" },
                        amount_currency: {
                            string: "Monetary field (currency)",
                            type: "monetary",
                            currency_field: "company_currency_id",
                        },
                        currency_id: {
                            string: "Currency",
                            type: "many2one",
                            relation: "res_currency",
                            default: 1,
                        },
                        currency_test: {
                            string: "Currency",
                            type: "many2one",
                            relation: "res_currency",
                            default: 1,
                        },
                        company_currency_id: {
                            string: "Company Currency",
                            type: "many2one",
                            relation: "res_currency",
                            default: 2,
                        },
                        datetime: { string: "Datetime Field", type: "datetime" },
                        reference: {
                            string: "Reference Field",
                            type: "reference",
                            selection: [
                                ["bar", "Bar"],
                                ["res_currency", "Currency"],
                                ["event", "Event"],
                            ],
                        },
                        properties: {
                            type: "properties",
                            definition_record: "m2o",
                            definition_record_field: "definitions",
                        },
                    },
                    records: [
                        {
                            id: 1,
                            bar: true,
                            foo: "yop",
                            int_field: 10,
                            qux: 0.4,
                            m2o: 1,
                            m2m: [1, 2],
                            amount: 1200,
                            amount_currency: 1100,
                            currency_id: 2,
                            company_currency_id: 1,
                            date: "2017-01-25",
                            datetime: "2016-12-12 10:55:05",
                            reference: "bar,1",
                            properties: [],
                        },
                        {
                            id: 2,
                            bar: true,
                            foo: "blip",
                            int_field: 9,
                            qux: 13,
                            m2o: 2,
                            m2m: [1, 2, 3],
                            amount: 500,
                            reference: "res_currency,1",
                            properties: [],
                        },
                        {
                            id: 3,
                            bar: true,
                            foo: "gnap",
                            int_field: 17,
                            qux: -3,
                            m2o: 1,
                            m2m: [],
                            amount: 300,
                            reference: "res_currency,2",
                            properties: [],
                        },
                        {
                            id: 4,
                            bar: false,
                            foo: "blip",
                            int_field: -4,
                            qux: 9,
                            m2o: 1,
                            m2m: [1],
                            amount: 0,
                            properties: [],
                        },
                    ],
                },
                bar: {
                    fields: {
                        definitions: { type: "properties_definitions" },
                    },
                    records: [
                        { id: 1, display_name: "Value 1", definitions: [] },
                        { id: 2, display_name: "Value 2", definitions: [] },
                        { id: 3, display_name: "Value 3", definitions: [] },
                    ],
                },
                res_currency: {
                    fields: {
                        symbol: { string: "Symbol", type: "char" },
                        position: {
                            string: "Position",
                            type: "selection",
                            selection: [
                                ["after", "A"],
                                ["before", "B"],
                            ],
                        },
                    },
                    records: [
                        { id: 1, display_name: "USD", symbol: "$", position: "before" },
                        { id: 2, display_name: "EUR", symbol: "€", position: "after" },
                    ],
                },
                event: {
                    fields: {
                        id: { string: "ID", type: "integer" },
                        name: { string: "name", type: "char" },
                    },
                    records: [{ id: "2-20170808020000", name: "virtual" }],
                },
            },
        };
        setupViewRegistries();
        serviceRegistry.add("tooltip", tooltipService);
        patchWithCleanup(browser, {
            setTimeout: (fn) => fn(),
            clearTimeout: () => {},
        });
        target = getFixture();
        serviceRegistry.add("ui", uiService);
    });

    QUnit.module("ListView");

    QUnit.test(
        "multi_edit: edit a required field with invalid value and click 'Ok' of alert dialog",
        async function (assert) {
            serverData.models.foo.fields.foo.required = true;

            await makeView({
                type: "list",
                resModel: "foo",
                serverData,
                arch: `
                    <tree multi_edit="1">
                        <field name="foo"/>
                        <field name="int_field"/>
                    </tree>
                `,
                mockRPC(route, args) {
                    assert.step(args.method);
                },
            });
            assert.containsN(target, ".o_data_row", 4);
            assert.verifySteps(["get_views", "web_search_read"]);

            const rows = target.querySelectorAll(".o_data_row");
            await click(rows[0], ".o_list_record_selector input");
            await click(rows[0].querySelector(".o_data_cell"));
            await editInput(target, "[name='foo'] input", "");
            await click(target, ".o_list_view");
            assert.containsOnce(target, ".modal");
            assert.strictEqual(target.querySelector(".modal .btn").textContent, "Ok");

            await click(target.querySelector(".modal .btn"));
            assert.strictEqual(
                target.querySelector(".o_data_row .o_data_cell[name='foo']").textContent,
                "yop"
            );
            assert.hasClass(target.querySelector(".o_data_row"), "o_data_row_selected");

            assert.verifySteps([]);
        }
    );

    QUnit.test(
        "multi_edit: edit a required field with invalid value and dismiss alert dialog",
        async function (assert) {
            serverData.models.foo.fields.foo.required = true;
            await makeView({
                type: "list",
                resModel: "foo",
                serverData,
                arch: `
                <tree multi_edit="1">
                    <field name="foo"/>
                    <field name="int_field"/>
                </tree>`,
                mockRPC(route, args) {
                    assert.step(args.method);
                },
            });
            assert.containsN(target, ".o_data_row", 4);
            assert.verifySteps(["get_views", "web_search_read"]);

            const rows = target.querySelectorAll(".o_data_row");
            await click(rows[0], ".o_list_record_selector input");
            await click(rows[0].querySelector(".o_data_cell"));
            await editInput(target, "[name='foo'] input", "");
            await click(target, ".o_list_view");

            assert.containsOnce(target, ".modal");
            await click(target.querySelector(".modal-header .btn-close"));
            assert.strictEqual(
                target.querySelector(".o_data_row .o_data_cell[name='foo']").textContent,
                "yop"
            );
            assert.hasClass(target.querySelector(".o_data_row"), "o_data_row_selected");
            assert.verifySteps([]);
        }
    );

<<<<<<< saas-17.4
||||||| 4aadc5f2582b36d9c3e75863458c2a3c383e9f72
    QUnit.test(
        "multi_edit: clicking on a readonly field switches the focus to the next editable field",
        async function (assert) {
            await makeView({
                type: "list",
                resModel: "foo",
                serverData,
                arch: `
                <tree multi_edit="1">
                    <field name="int_field" readonly="1"/>
                    <field name="foo" />
                </tree>`,
            });

            const firstRow = target.querySelector(".o_data_row");
            await click(firstRow, ".o_list_record_selector input");

            let intField = firstRow.querySelector("[name='int_field']");
            intField.focus();
            await click(intField);
            assert.strictEqual(
                document.activeElement.closest(".o_field_widget").getAttribute("name"),
                "foo"
            );

            intField = firstRow.querySelector("[name='int_field']");
            intField.focus();
            await click(intField);
            assert.strictEqual(
                document.activeElement.closest(".o_field_widget").getAttribute("name"),
                "foo"
            );
        }
    );

    QUnit.test("save a record with an required field computed by another", async function (assert) {
        serverData.models.foo.onchanges = {
            foo(record) {
                if (record.foo) {
                    record.text = "plop";
                }
            },
        };
        await makeView({
            type: "list",
            resModel: "foo",
            serverData,
            arch: `
                <tree editable="top">
                    <field name="foo"/>
                    <field name="int_field"/>
                    <field name="text" required="1"/>
                </tree>`,
        });
        assert.containsN(target, ".o_data_row", 4);
        assert.containsNone(target, ".o_selected_row");

        await click($(".o_list_button_add:visible").get(0));
        await editInput(target, "[name='int_field'] input", 1);
        await click(target, ".o_list_view");
        assert.containsN(target, ".o_data_row", 5);
        assert.containsOnce(target, ".o_field_invalid");
        assert.containsOnce(target, ".o_selected_row");

        await editInput(target, "[name='foo'] input", "hello");
        assert.containsNone(target, ".o_field_invalid");
        assert.containsOnce(target, ".o_selected_row");

        await click(target, ".o_list_view");
        assert.containsN(target, ".o_data_row", 5);
        assert.containsNone(target, ".o_selected_row");
    });

    QUnit.test("field with nolabel has no title", async function (assert) {
        await makeView({
            type: "list",
            resModel: "foo",
            serverData,
            arch: '<tree><field name="foo" nolabel="1"/></tree>',
        });
        assert.strictEqual($(target).find("thead tr:first th:eq(1)").text(), "");
    });

    QUnit.test("field titles are not escaped", async function (assert) {
        serverData.models.foo.records[0].foo = "<div>Hello</div>";

        await makeView({
            type: "list",
            resModel: "foo",
            serverData,
            arch: '<tree><field name="foo"/></tree>',
        });

        assert.strictEqual(
            $(target).find("tbody tr:first .o_data_cell").text(),
            "<div>Hello</div>"
        );
        assert.strictEqual(
            $(target).find("tbody tr:first .o_data_cell").attr("data-tooltip"),
            "<div>Hello</div>"
        );
    });

    QUnit.test("record-depending invisible lines are correctly aligned", async function (assert) {
        await makeView({
            type: "list",
            resModel: "foo",
            serverData,
            arch: `
                <tree>
                    <field name="foo"/>
                    <field name="bar" invisible="id == 1"/>
                    <field name="int_field"/>
                </tree>`,
        });

        assert.containsN(target, ".o_data_row", 4);
        assert.containsN(target, ".o_data_row td", 16); // 4 cells per row
        assert.strictEqual(target.querySelectorAll(".o_data_row td")[2].innerHTML, "");
    });

    QUnit.test("invisble fields must not have a tooltip", async function (assert) {
        await makeView({
            type: "list",
            resModel: "foo",
            serverData,
            arch: `
                <tree>
                    <field name="foo" invisible="id == 1"/>
                </tree>`,
        });

        assert.containsN(target, ".o_data_row", 4);
        assert.containsN(target, ".o_data_row td[data-tooltip]", 3);
    });

    QUnit.test(
        "do not perform extra RPC to read invisible many2one fields",
        async function (assert) {
            serverData.models.foo.fields.m2o.default = 2;

            await makeView({
                type: "list",
                resModel: "foo",
                serverData,
                arch: `
                    <tree editable="top">
                        <field name="foo"/>
                        <field name="m2o" column_invisible="1"/>
                    </tree>`,
                mockRPC(route) {
                    assert.step(route.split("/").pop());
                },
            });

            await click($(".o_list_button_add:visible").get(0));
            assert.verifySteps(
                ["get_views", "web_search_read", "onchange"],
                "no nameget should be done"
            );
        }
    );

    QUnit.test("editable list datepicker destroy widget (edition)", async function (assert) {
        await makeView({
            type: "list",
            resModel: "foo",
            serverData,
            arch: `
                <tree editable="top">
                    <field name="date"/>
                </tree>`,
        });

        assert.containsN(target, ".o_data_row", 4);

        await click(target.querySelector(".o_data_cell"));
        assert.containsOnce(target, ".o_selected_row");

        await click(target, ".o_field_date input");
        assert.containsOnce(target, ".o_datetime_picker");

        triggerHotkey("Escape");
        await nextTick();

        assert.containsNone(target, ".o_selected_row");
        assert.containsN(target, ".o_data_row", 4);
    });

    QUnit.test("editable list datepicker destroy widget (new line)", async function (assert) {
        await makeView({
            type: "list",
            resModel: "foo",
            serverData,
            arch: `<tree editable="top"><field name="date"/></tree>`,
        });

        assert.containsN(target, ".o_data_row", 4, "There should be 4 rows");

        await click($(".o_list_button_add:visible").get(0));
        assert.containsOnce(target, ".o_selected_row");

        await click(target, ".o_field_date input");
        assert.containsOnce(target, ".o_datetime_picker", "datepicker should be opened");
        await triggerEvent(document.activeElement, null, "keydown", { key: "Escape" });

        assert.containsNone(target, ".o_selected_row", "the row is no longer in edition");
        assert.containsN(target, ".o_data_row", 4, "There should still be 4 rows");
    });

    QUnit.test("at least 4 rows are rendered, even if less data", async function (assert) {
        await makeView({
            type: "list",
            resModel: "foo",
            serverData,
            arch: '<tree><field name="bar"/></tree>',
            domain: [["bar", "=", true]],
        });

        assert.containsN(target, "tbody tr", 4, "should have 4 rows");
    });

    QUnit.test(
        'discard a new record in editable="top" list with less than 4 records',
        async function (assert) {
            await makeView({
                type: "list",
                resModel: "foo",
                serverData,
                arch: '<tree editable="top"><field name="bar"/></tree>',
                domain: [["bar", "=", true]],
            });
            assert.containsN(target, ".o_data_row", 3);
            assert.containsN(target, "tbody tr", 4);

            await click($(".o_list_button_add:visible").get(0));
            assert.containsN(target, ".o_data_row", 4);
            assert.hasClass(target.querySelector("tbody tr"), "o_selected_row");

            await click(target.querySelector(".o_list_button_discard:not(.dropdown-item)"));
            assert.containsN(target, ".o_data_row", 3);
            assert.containsN(target, "tbody tr", 4);
            assert.hasClass(target.querySelector("tbody tr"), "o_data_row");
        }
    );

    QUnit.test("basic grouped list rendering", async function (assert) {
        await makeView({
            type: "list",
            resModel: "foo",
            serverData,
            arch: '<tree><field name="foo"/><field name="bar"/></tree>',
            groupBy: ["bar"],
        });

        assert.strictEqual($(target).find("th:contains(Foo)").length, 1, "should contain Foo");
        assert.strictEqual($(target).find("th:contains(Bar)").length, 1, "should contain Bar");
        assert.containsN(target, "tr.o_group_header", 2, "should have 2 .o_group_header");
        assert.containsN(target, "th.o_group_name", 2, "should have 2 .o_group_name");
    });

    QUnit.test('basic grouped list rendering with widget="handle" col', async function (assert) {
        await makeView({
            type: "list",
            resModel: "foo",
            serverData,
            arch: `
                <tree>
                    <field name="int_field" widget="handle"/>
                    <field name="foo"/>
                    <field name="bar"/>
                </tree>`,
            groupBy: ["bar"],
        });

        assert.containsN(target, "thead th", 3); // record selector + Foo + Bar
        assert.containsOnce(target, "thead th.o_list_record_selector");
        assert.containsOnce(target, "thead th[data-name=foo]");
        assert.containsOnce(target, "thead th[data-name=bar]");
        assert.containsNone(target, "thead th[data-name=int_field]");
        assert.containsN(target, "tr.o_group_header", 2);
        assert.containsN(target, "th.o_group_name", 2);
        assert.containsN(target.querySelector(".o_group_header"), "th", 2); // group name + colspan 2
        assert.containsNone(target.querySelector(".o_group_header"), ".o_list_number");
    });

    QUnit.test(
        "basic grouped list rendering with a date field between two fields with a aggregator",
        async function (assert) {
            await makeView({
                type: "list",
                resModel: "foo",
                serverData,
                arch: `
                <tree>
                    <field name="int_field"/>
                    <field name="date"/>
                    <field name="int_field"/>
                </tree>`,
                groupBy: ["bar"],
            });

            assert.containsN(target, "thead th", 4); // record selector + Foo + Int + Date + Int
            assert.containsOnce(target, "thead th.o_list_record_selector");
            assert.deepEqual(getNodesTextContent(target.querySelectorAll("thead th")), [
                "",
                "int_field",
                "Some Date",
                "int_field",
            ]);
            assert.containsN(target, "tr.o_group_header", 2);
            assert.containsN(target, "th.o_group_name", 2);
            assert.deepEqual(
                getNodesTextContent(target.querySelector(".o_group_header").querySelectorAll("td")),
                ["-4", "", "-4"]
            );
        }
    );

    QUnit.test("basic grouped list rendering 1 col without selector", async function (assert) {
        await makeView({
            type: "list",
            resModel: "foo",
            serverData,
            arch: '<tree><field name="foo"/></tree>',
            groupBy: ["bar"],
            allowSelectors: false,
        });

        assert.containsOnce(target.querySelector(".o_group_header"), "th");
        assert.strictEqual(target.querySelector(".o_group_header th").getAttribute("colspan"), "1");
    });

    QUnit.test("basic grouped list rendering 1 col with selector", async function (assert) {
        await makeView({
            type: "list",
            resModel: "foo",
            serverData,
            arch: '<tree><field name="foo"/></tree>',
            groupBy: ["bar"],
        });

        assert.containsOnce(target.querySelector(".o_group_header"), "th");
        assert.strictEqual(target.querySelector(".o_group_header th").getAttribute("colspan"), "2");
    });

    QUnit.test("basic grouped list rendering 2 cols without selector", async function (assert) {
        await makeView({
            type: "list",
            resModel: "foo",
            serverData,
            arch: '<tree ><field name="foo"/><field name="bar"/></tree>',
            groupBy: ["bar"],
            allowSelectors: false,
        });

        assert.containsN(target.querySelector(".o_group_header"), "th", 2);
        assert.strictEqual(target.querySelector(".o_group_header th").getAttribute("colspan"), "1");
    });

    QUnit.test("basic grouped list rendering 3 cols without selector", async function (assert) {
        await makeView({
            type: "list",
            resModel: "foo",
            serverData,
            arch: '<tree ><field name="foo"/><field name="bar"/><field name="text"/></tree>',
            groupBy: ["bar"],
            allowSelectors: false,
        });

        assert.containsN(target.querySelector(".o_group_header"), "th", 2);
        assert.strictEqual(target.querySelector(".o_group_header th").getAttribute("colspan"), "2");
    });

    QUnit.test("basic grouped list rendering 2 col with selector", async function (assert) {
        await makeView({
            type: "list",
            resModel: "foo",
            serverData,
            arch: '<tree ><field name="foo"/><field name="bar"/></tree>',
            groupBy: ["bar"],
            allowSelectors: true,
        });

        assert.containsN(target.querySelector(".o_group_header"), "th", 2);
        assert.strictEqual(target.querySelector(".o_group_header th").getAttribute("colspan"), "2");
    });

    QUnit.test("basic grouped list rendering 3 cols with selector", async function (assert) {
        await makeView({
            type: "list",
            resModel: "foo",
            serverData,
            arch: '<tree><field name="foo"/><field name="bar"/><field name="text"/></tree>',
            groupBy: ["bar"],
            allowSelectors: true,
        });

        assert.containsN(target.querySelector(".o_group_header"), "th", 2);
        assert.strictEqual(target.querySelector(".o_group_header th").getAttribute("colspan"), "3");
    });

    QUnit.test(
        "basic grouped list rendering 7 cols with aggregates and selector",
        async function (assert) {
            await makeView({
                type: "list",
                resModel: "foo",
                serverData,
                arch: `
                    <tree>
                        <field name="datetime"/>
                        <field name="foo"/>
                        <field name="int_field" sum="Sum1"/>
                        <field name="bar"/>
                        <field name="qux" sum="Sum2"/>
                        <field name="date"/>
                        <field name="text"/>
                    </tree>`,
                groupBy: ["bar"],
            });

            assert.containsN(target.querySelector(".o_group_header"), "th,td", 5);
            assert.strictEqual(
                target.querySelector(".o_group_header th").getAttribute("colspan"),
                "3"
            );
            assert.containsN(
                target.querySelector(".o_group_header"),
                "td",
                3,
                "there should be 3 tds (aggregates + fields in between)"
            );
            assert.strictEqual(
                target.querySelector(".o_group_header th:last-child").getAttribute("colspan"),
                "2",
                "header last cell should span on the two last fields (to give space for the pager) (colspan 2)"
            );
        }
    );

    QUnit.test(
        "basic grouped list rendering 7 cols with aggregates, selector and optional",
        async function (assert) {
            await makeView({
                type: "list",
                resModel: "foo",
                serverData,
                arch: `
                    <tree>
                        <field name="datetime"/>
                        <field name="foo"/>
                        <field name="int_field" sum="Sum1"/>
                        <field name="bar"/>
                        <field name="qux" sum="Sum2"/>
                        <field name="date"/>
                        <field name="text" optional="show"/>
                    </tree>`,
                groupBy: ["bar"],
            });

            assert.containsN(target.querySelector(".o_group_header"), "th,td", 5);
            assert.strictEqual(
                target.querySelector(".o_group_header th").getAttribute("colspan"),
                "3"
            );
            assert.containsN(
                target.querySelector(".o_group_header"),
                "td",
                3,
                "there should be 3 tds (aggregates + fields in between)"
            );
            assert.strictEqual(
                target.querySelector(".o_group_header th:last-child").getAttribute("colspan"),
                "3",
                "header last cell should span on the two last fields (to give space for the pager) (colspan 2)"
            );
        }
    );

    QUnit.test(
        "basic grouped list rendering 4 cols with aggregates, selector and openFormView",
        async function (assert) {
            await makeView({
                type: "list",
                resModel: "foo",
                serverData,
                arch: `
                    <tree open_form_view="True">
                        <field name="datetime"/>
                        <field name="int_field" sum="Sum1"/>
                        <field name="bar"/>
                        <field name="qux" sum="Sum2" optional="hide"/>
                    </tree>`,
                groupBy: ["bar"],
            });

            assert.strictEqual(
                target.querySelector(".o_group_header th").getAttribute("colspan"), "2"
            );
            assert.strictEqual(
                target.querySelector(".o_group_header th:last-child").getAttribute("colspan"),
                "2",
            );
        }
    );

    QUnit.test(
        "basic grouped list rendering 4 cols with aggregates, selector, optional and openFormView",
        async function (assert) {
            await makeView({
                type: "list",
                resModel: "foo",
                serverData,
                arch: `
                    <tree open_form_view="True">
                        <field name="datetime"/>
                        <field name="int_field" sum="Sum1"/>
                        <field name="bar"/>
                        <field name="qux" sum="Sum2" optional="show"/>
                    </tree>`,
                groupBy: ["bar"],
            });

            assert.strictEqual(
                target.querySelector(".o_group_header th").getAttribute("colspan"), "2"
            );
            assert.strictEqual(
                target.querySelector(".o_group_header th:last-child").getAttribute("colspan"),
                "1",
            );
        }
    );

    QUnit.test("group a list view with the aggregable field 'value'", async function (assert) {
        serverData.models.foo.fields.value = {
            string: "Value",
            type: "integer",
            aggregator: "sum",
        };
        for (const record of serverData.models.foo.records) {
            record.value = 1;
        }
        await makeView({
            type: "list",
            resModel: "foo",
            serverData,
            arch: `
                    <tree>
                        <field name="bar"/>
                        <field name="value" sum="Sum1"/>
                    </tree>`,
            groupBy: ["bar"],
        });
        assert.containsN(target, ".o_group_header", 2);
        assert.deepEqual(
            [...target.querySelectorAll(".o_group_header")].map((el) => el.textContent),
            ["No (1) 1", "Yes (3) 3"]
        );
    });

    QUnit.test("basic grouped list rendering with groupby m2m field", async function (assert) {
        await makeView({
            type: "list",
            resModel: "foo",
            serverData,
            arch: `
                <tree>
                    <field name="foo"/>
                    <field name="m2m" widget="many2many_tags"/>
                </tree>`,
            groupBy: ["m2m"],
        });

        assert.containsN(target, ".o_group_header", 4, "should contain 4 open groups");
        assert.containsNone(target, ".o_group_open", "no group is open");
        assert.deepEqual(
            [...target.querySelectorAll(".o_group_header .o_group_name")].map((el) => el.innerText),
            ["None (1)", "Value 1 (3)", "Value 2 (2)", "Value 3 (1)"],
            "should have those group headers"
        );

        // Open all groups
        await click(target.querySelectorAll(".o_group_name")[0]);
        await click(target.querySelectorAll(".o_group_name")[1]);
        await click(target.querySelectorAll(".o_group_name")[2]);
        await click(target.querySelectorAll(".o_group_name")[3]);
        assert.containsN(target, ".o_group_open", 4, "all groups are open");

        const rows = target.querySelectorAll(".o_list_view tbody > tr");
        assert.deepEqual(
            [...rows].map((el) => el.innerText.replace(/\s/g, "")),
            [
                "None(1)",
                "gnap",
                "Value1(3)",
                "yopValue1Value2",
                "blipValue1Value2Value3",
                "blipValue1",
                "Value2(2)",
                "yopValue1Value2",
                "blipValue1Value2Value3",
                "Value3(1)",
                "blipValue1Value2Value3",
            ],
            "should have these row contents"
        );
    });

    QUnit.test("grouped list rendering with groupby m2o and m2m field", async function (assert) {
        await makeView({
            type: "list",
            resModel: "foo",
            serverData,
            arch: `
                <tree>
                    <field name="foo"/>
                    <field name="m2o"/>
                    <field name="m2m" widget="many2many_tags"/>
                </tree>`,
            groupBy: ["m2o", "m2m"],
        });

        let rows = target.querySelectorAll("tbody > tr");
        assert.deepEqual(
            [...rows].map((el) => el.innerText.replace(/\s/g, "")),

            ["Value1(3)", "Value2(1)"],
            "should have these row contents"
        );

        await click(target.querySelector("th.o_group_name"));

        rows = target.querySelectorAll("tbody > tr");
        assert.deepEqual(
            [...rows].map((el) => el.innerText.replace(/\s/g, "")),
            ["Value1(3)", "None(1)", "Value1(2)", "Value2(1)", "Value2(1)"],
            "should have these row contents"
        );

        await click(target.querySelectorAll("tbody th.o_group_name")[4]);
        rows = target.querySelectorAll(".o_list_view tbody > tr");

        assert.deepEqual(
            [...rows].map((el) => el.innerText.replace(/\s/g, "")),
            [
                "Value1(3)",
                "None(1)",
                "Value1(2)",
                "Value2(1)",
                "Value2(1)",
                "Value1(1)",
                "Value2(1)",
                "Value3(1)",
            ],
            "should have these row contents"
        );
    });

    QUnit.test("list view with multiple groupbys", async function (assert) {
        await makeView({
            type: "list",
            resModel: "foo",
            serverData,
            arch: '<tree><field name="foo"/><field name="bar"/></tree>',
            groupBy: ["bar", "foo"],
            noContentHelp: "<p>should not be displayed</p>",
        });

        assert.containsNone(target, ".o_view_nocontent");
        assert.containsN(target, ".o_group_has_content", 2);
        assert.deepEqual(getNodesTextContent(target.querySelectorAll(".o_group_has_content")), [
            "No (1) ",
            "Yes (3) ",
        ]);
    });

    QUnit.test("deletion of record is disabled when groupby m2m field", async function (assert) {
        patchUserWithCleanup({ hasGroup: () => Promise.resolve(false) });

        serverData.models.foo.fields.m2m.groupable = true;

        await makeView({
            type: "list",
            resModel: "foo",
            serverData,
            arch: `
                <tree>
                    <field name="foo"/>
                    <field name="m2m" widget="many2many_tags"/>
                </tree>`,
            actionMenus: {},
        });
        await groupByMenu(target, "m2m");

        await click(target.querySelector(".o_group_header:first-child")); // open first group
        await click(target.querySelector(".o_data_row .o_list_record_selector input"));
        assert.containsOnce(target, "div.o_control_panel .o_cp_action_menus");
        assert.containsNone(
            target,
            "div.o_control_panel .o_cp_action_menus .dropdown-toggle",
            "should not have dropdown as delete item is not there"
        );

        // unselect group by m2m (need to unselect record first)
        await click(target.querySelector(".o_data_row .o_list_record_selector input"));
        await click(target, ".o_searchview .o_facet_remove");

        await click(target.querySelector(".o_data_row .o_list_record_selector input"));
        assert.containsOnce(target, "div.o_control_panel .o_cp_action_menus");
        assert.containsOnce(target, "div.o_control_panel .o_cp_action_menus .dropdown-toggle");
        await click(target, "div.o_control_panel .o_cp_action_menus .dropdown-toggle");
        assert.deepEqual(
            [...target.querySelectorAll(".o-dropdown--menu .o_menu_item")].map(
                (el) => el.innerText
            ),
            ["Duplicate", "Delete"]
        );
    });

    QUnit.test("add record in list grouped by m2m", async function (assert) {
        assert.expect(7);

        await makeView({
            type: "list",
            resModel: "foo",
            serverData,
            arch: `
                <tree editable="bottom">
                    <field name="foo"/>
                    <field name="m2m" widget="many2many_tags"/>
                </tree>`,
            groupBy: ["m2m"],
            mockRPC(route, args) {
                if (args.method === "onchange") {
                    assert.deepEqual(args.kwargs.context.default_m2m, [1]);
                }
            },
        });

        assert.containsN(target, ".o_group_header", 4);
        assert.deepEqual(getNodesTextContent(target.querySelectorAll(".o_group_header")), [
            "None (1) ",
            "Value 1 (3) ",
            "Value 2 (2) ",
            "Value 3 (1) ",
        ]);

        await click(target.querySelectorAll(".o_group_header")[1]);
        assert.containsN(target, ".o_data_row", 3);

        await click(target, ".o_group_field_row_add a");
        assert.containsOnce(target, ".o_selected_row");
        assert.containsOnce(target, ".o_selected_row .o_field_tags .o_tag");
        assert.strictEqual(
            target.querySelector(".o_selected_row .o_field_tags .o_tag").innerText,
            "Value 1"
        );
    });

    QUnit.test("grouped list with (disabled) pager inside group", async function (assert) {
        let def;
        await makeView({
            type: "list",
            resModel: "foo",
            serverData,
            arch: `
                <tree limit="2">
                    <field name="foo"/>
                </tree>`,
            mockRPC(route, args) {
                if (args.method === "web_search_read") {
                    return def;
                }
            },
            groupBy: ["m2o"],
        });

        assert.containsN(target, ".o_group_header", 2);

        await click(target.querySelector(".o_group_header"));
        assert.containsN(target, ".o_data_row", 2);
        assert.containsOnce(target, ".o_group_header .o_pager");

        def = makeDeferred();
        await click(target.querySelector(".o_group_header .o_pager_next"));
        assert.strictEqual(target.querySelector(".o_group_header .o_pager_next").disabled, true);

        // simulate a second click on pager_next, which is now disabled, so the click bubbles up
        await click(target.querySelector(".o_group_header .o_pager"));
        assert.containsN(target, ".o_data_row", 2);
    });

    QUnit.test(
        "editing a record should change same record in other groups when grouped by m2m field",
        async function (assert) {
            await makeView({
                type: "list",
                resModel: "foo",
                serverData,
                arch: `
                    <tree editable="bottom">
                        <field name="foo"/>
                        <field name="m2m" widget="many2many_tags"/>
                    </tree>`,
                groupBy: ["m2m"],
            });
            await click(target.querySelectorAll(".o_group_header")[1]); // open Value 1 group
            await click(target.querySelectorAll(".o_group_header")[2]); // open Value 2 group
            const rows = target.querySelectorAll(".o_data_row");
            assert.strictEqual(rows[0].querySelector(".o_list_char").textContent, "yop");
            assert.strictEqual(rows[3].querySelector(".o_list_char").textContent, "yop");

            await click(target.querySelector(".o_data_row .o_list_record_selector input"));
            await click(target.querySelector(".o_data_row .o_data_cell"));
            await editInput(rows[0], ".o_data_row .o_list_char input", "xyz");
            await click(target, ".o_list_view");
            assert.strictEqual(rows[0].querySelector(".o_list_char").textContent, "xyz");
            assert.strictEqual(rows[3].querySelector(".o_list_char").textContent, "xyz");
        }
    );

    QUnit.test(
        "change a record field in readonly should change same record in other groups when grouped by m2m field",
        async function (assert) {
            assert.expect(6);

            serverData.models.foo.fields.priority = {
                string: "Priority",
                type: "selection",
                selection: [
                    [0, "Not Prioritary"],
                    [1, "Prioritary"],
                ],
                default: 0,
            };

            await makeView({
                type: "list",
                resModel: "foo",
                serverData,
                arch: `
                    <tree>
                        <field name="foo"/>
                        <field name="priority" widget="priority"/>
                        <field name="m2m" widget="many2many_tags"/>
                    </tree>`,
                groupBy: ["m2m"],
                domain: [["m2o", "=", 1]],
                mockRPC(route, args) {
                    if (args.method === "web_save") {
                        assert.deepEqual(args.args[0], [1], "should write on the correct record");
                        assert.deepEqual(
                            args.args[1],
                            {
                                priority: 1,
                            },
                            "should write these changes"
                        );
                    }
                },
            });

            await click(target.querySelectorAll(".o_group_header")[1]); // open Value 1 group
            await click(target.querySelectorAll(".o_group_header")[2]); // open Value 2 group
            const rows = target.querySelectorAll(".o_data_row");
            assert.strictEqual(rows[0].querySelector(".o_list_char").textContent, "yop");
            assert.strictEqual(rows[2].querySelector(".o_list_char").textContent, "yop");
            assert.containsNone(
                target,
                ".o_priority_star.fa-star",
                "should not have any starred records"
            );

            await click(rows[0].querySelector(".o_priority_star"));
            assert.containsN(
                target,
                ".o_priority_star.fa-star",
                2,
                "both 'yop' records should have been starred"
            );
        }
    );

    QUnit.test("ordered target, sort attribute in context", async function (assert) {
        serverData.models.foo.fields.foo.sortable = true;
        serverData.models.foo.fields.date.sortable = true;

        await makeView({
            type: "list",
            resModel: "foo",
            serverData,
            arch: '<tree><field name="foo"/><field name="date"/></tree>',
            mockRPC: (route, args) => {
                if (args.method === "create_or_replace") {
                    const favorite = args.args[0];
                    assert.step(favorite.sort);
                    return 7;
                }
            },
        });

        // Descending order on Foo
        await click(target, "th.o_column_sortable[data-name=foo]");
        await click(target, "th.o_column_sortable[data-name=foo]");

        // Ascending order on Date
        await click(target, "th.o_column_sortable[data-name=date]");

        await toggleSearchBarMenu(target);
        await toggleSaveFavorite(target);
        await editFavoriteName(target, "My favorite");
        await saveFavorite(target);

        assert.verifySteps(['["date","foo desc"]']);
    });

    QUnit.test("Loading a filter with a sort attribute", async function (assert) {
        assert.expect(2);

        serverData.models.foo.fields.foo.sortable = true;
        serverData.models.foo.fields.date.sortable = true;

        let searchReads = 0;
        await makeView({
            type: "list",
            resModel: "foo",
            serverData,
            arch: `
                <tree>
                    <field name="foo"/>
                    <field name="date"/>
                </tree>`,
            mockRPC(route, args) {
                if (args.method === "web_search_read") {
                    if (searchReads === 0) {
                        assert.strictEqual(
                            args.kwargs.order,
                            "date ASC, foo DESC",
                            "The sort attribute of the filter should be used by the initial search_read"
                        );
                    } else if (searchReads === 1) {
                        assert.strictEqual(
                            args.kwargs.order,
                            "date DESC, foo ASC",
                            "The sort attribute of the filter should be used by the next search_read"
                        );
                    }
                    searchReads += 1;
                }
            },
            irFilters: [
                {
                    context: "{}",
                    domain: "[]",
                    id: 7,
                    is_default: true,
                    name: "My favorite",
                    sort: '["date asc", "foo desc"]',
                    user_id: [2, "Mitchell Admin"],
                },
                {
                    context: "{}",
                    domain: "[]",
                    id: 8,
                    is_default: false,
                    name: "My second favorite",
                    sort: '["date desc", "foo asc"]',
                    user_id: [2, "Mitchell Admin"],
                },
            ],
        });

        await toggleSearchBarMenu(target);
        await toggleMenuItem(target, "My second favorite");
    });

    QUnit.test("many2one field rendering", async function (assert) {
        await makeView({
            type: "list",
            resModel: "foo",
            serverData,
            arch: '<tree><field name="m2o"/></tree>',
        });

        assert.ok(
            $(target).find("td:contains(Value 1)").length,
            "should have the display_name of the many2one"
        );
    });

    QUnit.test("many2one field rendering with many2one widget", async function (assert) {
        serverData.models.bar.records[0].display_name = false;
        await makeView({
            type: "list",
            resModel: "foo",
            serverData,
            arch: '<tree><field name="m2o" widget="many2one"/></tree>',
        });

        assert.ok(
            $(target).find("td:contains(Unnamed)").length,
            "should have a Unnamed as fallback of many2one display_name"
        );
    });

    QUnit.test("many2one field rendering when display_name is falsy", async function (assert) {
        serverData.models.bar.records[0].display_name = false;
        await makeView({
            type: "list",
            resModel: "foo",
            serverData,
            arch: '<tree><field name="m2o"/></tree>',
            mockRPC(route) {
                assert.step(route);
            },
        });

        assert.ok(
            $(target).find("td:contains(Unnamed)").length,
            "should have a Unnamed as fallback of many2one display_name"
        );
        assert.verifySteps([
            "/web/dataset/call_kw/foo/get_views",
            "/web/dataset/call_kw/foo/web_search_read",
        ]);
    });

    QUnit.test("grouped list view, with 1 open group", async function (assert) {
        await makeView({
            type: "list",
            resModel: "foo",
            serverData,
            arch: '<tree><field name="foo"/><field name="int_field"/></tree>',
            groupBy: ["foo"],
        });

        assert.containsN(target, "tr.o_group_header", 3);
        assert.containsNone(target, "tr.o_data_row");

        await click(target.querySelector("th.o_group_name"));
        await nextTick();
        assert.containsN(target, "tr.o_group_header", 3);
        assert.containsN(target, "tr.o_data_row", 2);
        assert.containsOnce(target, "td:contains(9)", "should contain 9");
        assert.containsOnce(target, "td:contains(-4)", "should contain -4");
        assert.containsOnce(target, "td:contains(10)", "should contain 10"); // FIXME: missing aggregates
        assert.containsOnce(
            target,
            "tr.o_group_header td:contains(10)",
            "but 10 should be in a header"
        );
    });

    QUnit.test("opening records when clicking on record", async function (assert) {
        assert.expect(6);

        const listView = registry.category("views").get("list");
        class CustomListController extends listView.Controller {
            openRecord(record) {
                assert.step("openRecord");
                assert.strictEqual(record.resId, 2);
            }
        }
        registry.category("views").add("custom_list", {
            ...listView,
            Controller: CustomListController,
        });

        serverData.models.foo.fields.foo.groupable = true;

        await makeView({
            type: "list",
            resModel: "foo",
            serverData,
            arch: '<tree js_class="custom_list"><field name="foo"/></tree>',
        });

        await click(target.querySelector("tr:nth-child(2) td:not(.o_list_record_selector)"));
        await groupByMenu(target, "foo");

        assert.containsN(target, "tr.o_group_header", 3, "list should be grouped");
        await click(target.querySelector("th.o_group_name"));

        await click(
            target.querySelector("tr:not(.o_group_header) td:not(.o_list_record_selector)")
        );
        assert.verifySteps(["openRecord", "openRecord"]);
    });

    QUnit.test("open invalid but unchanged record", async function (assert) {
        const listView = registry.category("views").get("list");
        class CustomListController extends listView.Controller {
            openRecord(record) {
                assert.step("openRecord");
                assert.strictEqual(record.resId, 2);
                return super.openRecord(record);
            }
        }
        registry.category("views").add("custom_list", {
            ...listView,
            Controller: CustomListController,
        });

        const list = await makeView({
            type: "list",
            resModel: "foo",
            serverData,
            arch: `
                <tree js_class="custom_list">
                    <field name="foo"/>
                    <field name="date" required="1"/>
                </tree>`,
        });

        patchWithCleanup(list.env.services.notification, {
            add: () => {
                throw new Error("should not display a notification");
            },
        });

        // second record is invalid as date is not set
        assert.strictEqual(
            target.querySelector(".o_data_row:nth-child(2) .o_data_cell[name=date]").innerText,
            ""
        );
        await click(target.querySelector(".o_data_row:nth-child(2) .o_data_cell"));
        assert.verifySteps(["openRecord"]);
    });

    QUnit.test(
        "execute an action before and after each valid save in a list view",
        async function (assert) {
            const listView = registry.category("views").get("list");
            class CustomListController extends listView.Controller {
                async onRecordSaved(record) {
                    assert.step(`onRecordSaved ${record.resId}`);
                }

                async onWillSaveRecord(record) {
                    assert.step(`onWillSaveRecord ${record.resId}`);
                }
            }
            registry.category("views").add(
                "custom_list",
                {
                    ...listView,
                    Controller: CustomListController,
                },
                { force: true }
            );

            await makeView({
                type: "list",
                resModel: "foo",
                serverData,
                arch: '<tree js_class="custom_list" editable="top"><field name="foo" required="1"/></tree>',
                mockRPC: async (route, args) => {
                    if (args.method === "web_save") {
                        assert.step(`web_save ${args.args[0]}`);
                    }
                },
            });

            await click(target.querySelector(".o_data_cell"));
            await editInput(target, "[name='foo'] input", "");
            await click(target, ".o_list_view");
            assert.verifySteps([]);

            await editInput(target, "[name='foo'] input", "YOLO");
            await click(target, ".o_list_view");
            assert.verifySteps(["onWillSaveRecord 1", "web_save 1", "onRecordSaved 1"]);
        }
    );

    QUnit.test(
        "execute an action before and after each valid save in a grouped list view",
        async function (assert) {
            const listView = registry.category("views").get("list");
            class CustomListController extends listView.Controller {
                async onRecordSaved(record) {
                    assert.step(`onRecordSaved ${record.resId}`);
                }

                async onWillSaveRecord(record) {
                    assert.step(`onWillSaveRecord ${record.resId}`);
                }
            }
            registry.category("views").add("custom_list", {
                ...listView,
                Controller: CustomListController,
            });

            await makeView({
                type: "list",
                resModel: "foo",
                serverData,
                arch: '<tree js_class="custom_list" editable="top" expand="1"><field name="foo" required="1"/></tree>',
                groupBy: ["bar"],
                mockRPC: async (route, args) => {
                    if (args.method === "web_save") {
                        assert.step(`web_save ${args.args[0]}`);
                    }
                },
            });

            await click(target.querySelector(".o_data_cell[name='foo']"));
            await editInput(target, "[name='foo'] input", "");
            await click(target, ".o_list_view");
            assert.verifySteps([]);

            await editInput(target, "[name='foo'] input", "YOLO");
            await click(target, ".o_list_view");
            assert.verifySteps(["onWillSaveRecord 4", "web_save 4", "onRecordSaved 4"]);
        }
    );

    QUnit.test(
        "don't exec a valid save with onWillSaveRecord in a list view",
        async function (assert) {
            const listView = registry.category("views").get("list");
            class ListViewCustom extends listView.Controller {
                async onRecordSaved(record) {
                    throw new Error("should not execute onRecordSaved");
                }

                async onWillSaveRecord(record) {
                    assert.step(`onWillSaveRecord ${record.resId}`);
                    return false;
                }
            }
            registry.category("views").add(
                "list",
                {
                    ...listView,
                    Controller: ListViewCustom,
                },
                { force: true }
            );

            await makeView({
                type: "list",
                resModel: "foo",
                serverData,
                arch: '<tree editable="top"><field name="foo" required="1"/></tree>',
                mockRPC: async (route, args) => {
                    if (args.method === "write") {
                        throw new Error("should not save the record");
                    }
                },
            });

            await click(target.querySelector(".o_data_cell"));
            await editInput(target, "[name='foo'] input", "");
            await click(target, ".o_list_view");
            assert.verifySteps([]);

            await click(target.querySelector(".o_data_cell"));
            await editInput(target, "[name='foo'] input", "YOLO");
            await click(target, ".o_list_view");
            assert.verifySteps(["onWillSaveRecord 1"]);
        }
    );

    QUnit.test("action/type attributes on tree arch, type='object'", async (assert) => {
        const list = await makeView({
            type: "list",
            resModel: "foo",
            serverData,
            arch: '<tree action="a1" type="object"><field name="foo"/></tree>',
            mockRPC(route, args) {
                assert.step(args.method);
            },
        });

        patchWithCleanup(list.env.services.action, {
            doActionButton(params) {
                assert.step(`doActionButton type ${params.type} name ${params.name}`);
                params.onClose();
            },
        });

        assert.verifySteps(["get_views", "web_search_read"]);
        await click(target.querySelector(".o_data_cell"));
        assert.verifySteps(["doActionButton type object name a1", "web_search_read"]);
    });

    QUnit.test("action/type attributes on tree arch, type='action'", async (assert) => {
        const list = await makeView({
            type: "list",
            resModel: "foo",
            serverData,
            arch: '<tree action="a1" type="action"><field name="foo"/></tree>',
            mockRPC(route, args) {
                assert.step(args.method);
            },
        });

        patchWithCleanup(list.env.services.action, {
            doActionButton(params) {
                assert.step(`doActionButton type ${params.type} name ${params.name}`);
                params.onClose();
            },
        });

        assert.verifySteps(["get_views", "web_search_read"]);
        await click(target.querySelector(".o_data_cell"));
        assert.verifySteps(["doActionButton type action name a1", "web_search_read"]);
    });

    QUnit.test("editable list view: readonly fields cannot be edited", async function (assert) {
        serverData.models.foo.fields.foo.readonly = true;

        await makeView({
            type: "list",
            resModel: "foo",
            serverData,
            arch: `
                <tree editable="bottom">
                    <field name="foo"/>
                    <field name="bar"/>
                    <field name="int_field" readonly="1"/>
                </tree>`,
        });
        await click(target.querySelector(".o_field_cell"));
        assert.hasClass(
            target.querySelector(".o_data_row"),
            "o_selected_row",
            "row should be in edit mode"
        );
        assert.hasClass(
            target.querySelector(".o_field_widget[name=foo]"),
            "o_readonly_modifier",
            "foo field should be readonly in edit mode"
        );
        assert.doesNotHaveClass(
            target.querySelector(".o_field_widget[name=bar]"),
            "o_readonly_modifier",
            "bar field should be editable"
        );
        assert.hasClass(
            target.querySelector(".o_field_widget[name=int_field]"),
            "o_readonly_modifier",
            "int_field field should be readonly in edit mode"
        );
        assert.hasClass(target.querySelectorAll(".o_data_cell")[0], "o_readonly_modifier");
    });

    QUnit.test("editable list view: line with no active element", async function (assert) {
        serverData.models.bar = {
            fields: {
                titi: { string: "Char", type: "char" },
                grosminet: { string: "Bool", type: "boolean" },
            },
            records: [
                { id: 1, titi: "cui", grosminet: true },
                { id: 2, titi: "cuicui", grosminet: false },
            ],
        };
        serverData.models.foo.records[0].o2m = [1, 2];

        await makeView({
            type: "form",
            resModel: "foo",
            serverData,
            resId: 1,
            arch: `
                <form>
                    <field name="o2m">
                        <tree editable="top">
                            <field name="titi" readonly="1"/>
                            <field name="grosminet" widget="boolean_toggle"/>
                        </tree>
                    </field>
                </form>`,
            mockRPC(route, args) {
                if (args.method === "web_save") {
                    assert.step("web_save");
                }
            },
        });

        assert.hasClass(target.querySelectorAll(".o_data_cell")[1], "o_boolean_toggle_cell");

        await click(target.querySelectorAll(".o_data_cell")[0]);
        assert.hasClass(target.querySelector(".o_data_row"), "o_selected_row");
        assert.containsOnce(target.querySelectorAll(".o_data_cell")[0], ".o_readonly_modifier");
        await click(target.querySelectorAll(".o_data_cell")[1], ".o_boolean_toggle input");
        assert.verifySteps([]);
    });

    QUnit.test(
        "editable list view: click on last element after creation empty new line",
        async function (assert) {
            serverData.models.bar = {
                fields: {
                    titi: { string: "Char", type: "char", required: true },
                    int_field: {
                        string: "int_field",
                        type: "integer",
                        sortable: true,
                        required: true,
                    },
                },
                records: [
                    { id: 1, titi: "cui", int_field: 2 },
                    { id: 2, titi: "cuicui", int_field: 4 },
                ],
            };
            serverData.models.foo.records[0].o2m = [1, 2];

            await makeView({
                type: "form",
                resModel: "foo",
                serverData,
                resId: 1,
                arch: `
                    <form>
                        <field name="o2m">
                            <tree editable="top">
                            <field name="int_field" widget="handle"/>
                            <field name="titi"/>
                            </tree>
                        </field>
                    </form>`,
            });
            await addRow(target);
            await click(
                [...target.querySelectorAll(".o_data_row")].pop().querySelector("td.o_list_char")
            );
            // This test ensure that they aren't traceback when clicking on the last row.
            assert.containsN(target, ".o_data_row", 2, "list should have exactly 2 rows");
        }
    );

    QUnit.test("edit field in editable field without editing the row", async function (assert) {
        // some widgets are editable in readonly (e.g. priority, boolean_toggle...) and they
        // thus don't require the row to be switched in edition to be edited
        await makeView({
            type: "list",
            resModel: "foo",
            serverData,
            arch: `
                <tree editable="top">
                    <field name="foo"/>
                    <field name="bar" widget="boolean_toggle"/>
                </tree>`,
            mockRPC(route, args) {
                if (args.method === "web_save") {
                    assert.step("web_save: " + args.args[1].bar);
                }
            },
        });

        // toggle the boolean value of the first row without editing the row
        assert.ok(target.querySelector(".o_data_row .o_boolean_toggle input").checked);
        assert.containsNone(target, ".o_selected_row");
        await click(target.querySelector(".o_data_row .o_boolean_toggle input"));
        assert.notOk(target.querySelector(".o_data_row .o_boolean_toggle input").checked);
        assert.containsNone(target, ".o_selected_row");
        assert.verifySteps(["web_save: false"]);

        // toggle the boolean value after switching the row in edition
        assert.containsNone(target, ".o_selected_row");
        await click(target.querySelector(".o_data_row .o_data_cell .o_field_boolean_toggle div"));
        assert.containsOnce(target, ".o_selected_row");
        await click(target.querySelector(".o_selected_row .o_field_boolean_toggle div"));
        assert.verifySteps(["web_save: true"]);
    });

    QUnit.test("basic operations for editable list renderer", async function (assert) {
        await makeView({
            type: "list",
            resModel: "foo",
            serverData,
            arch: '<tree editable="bottom"><field name="foo"/><field name="bar"/></tree>',
        });

        assert.containsN(target, ".o_data_row", 4);
        assert.containsNone(target, ".o_data_row .o_selected_row");
        await click(target.querySelector(".o_data_cell"));
        assert.hasClass(target.querySelector(".o_data_row"), "o_selected_row");
    });

    QUnit.test("editable list: add a line and discard", async function (assert) {
        await makeView({
            type: "list",
            resModel: "foo",
            serverData,
            arch: '<tree editable="bottom"><field name="foo"/><field name="bar"/></tree>',
            domain: [["foo", "=", "yop"]],
        });

        assert.containsN(target, "tbody tr", 4, "list should contain 4 rows");
        assert.containsOnce(
            target,
            ".o_data_row",
            "list should contain one record (and thus 3 empty rows)"
        );

        assert.strictEqual(
            target.querySelector(".o_pager_value").innerText,
            "1-1",
            "pager should be correct"
        );

        await click($(".o_list_button_add:visible").get(0));

        assert.containsN(target, "tbody tr", 4, "list should still contain 4 rows");
        assert.containsN(
            target,
            ".o_data_row",
            2,
            "list should contain two record (and thus 2 empty rows)"
        );
        assert.strictEqual(
            target.querySelector(".o_pager_value").innerText,
            "1-2",
            "pager should be correct"
        );

        await click(target.querySelector(".o_list_button_discard:not(.dropdown-item)"));

        assert.containsN(target, "tbody tr", 4, "list should still contain 4 rows");
        assert.containsOnce(
            target,
            ".o_data_row",
            "list should contain one record (and thus 3 empty rows)"
        );
        assert.strictEqual(
            target.querySelector(".o_pager_value").innerText,
            "1-1",
            "pager should be correct"
        );
    });

    QUnit.test("field changes are triggered correctly", async function (assert) {
        serverData.models.foo.onchanges = {
            foo: function () {
                assert.step("onchange");
            },
        };
        await makeView({
            type: "list",
            resModel: "foo",
            serverData,
            arch: '<tree editable="bottom"><field name="foo"/><field name="bar"/></tree>',
        });

        await click(target.querySelector(".o_data_cell"));
        assert.hasClass(target.querySelectorAll(".o_data_row")[0], "o_selected_row");
        await editInput(target, ".o_field_widget[name=foo] input", "abc");
        assert.verifySteps(["onchange"]);
        await click(target.querySelectorAll(".o_data_cell")[2]);
        assert.hasClass(target.querySelectorAll(".o_data_row")[1], "o_selected_row");
        assert.verifySteps([]);
    });

    QUnit.test("editable list view: basic char field edition", async function (assert) {
        await makeView({
            type: "list",
            resModel: "foo",
            serverData,
            arch: '<tree editable="bottom"><field name="foo"/><field name="bar"/></tree>',
        });

        await click(target.querySelector(".o_field_cell"));
        assert.hasClass(target.querySelector(".o_data_row"), "o_selected_row");
        await editInput(target, ".o_field_char input", "abc");
        assert.strictEqual(
            target.querySelector(".o_field_char input").value,
            "abc",
            "char field has been edited correctly"
        );

        await click(target.querySelectorAll(".o_data_row")[1].querySelector(".o_data_cell"));
        assert.strictEqual(
            target.querySelector(".o_field_cell").innerText,
            "abc",
            "changes should be saved correctly"
        );
        assert.hasClass(target.querySelectorAll(".o_data_row")[1], "o_selected_row");
        assert.doesNotHaveClass(
            target.querySelector(".o_data_row"),
            "o_selected_row",
            "saved row should be in readonly mode"
        );
        assert.strictEqual(
            serverData.models.foo.records[0].foo,
            "abc",
            "the edition should have been properly saved"
        );
    });

    QUnit.test(
        "editable list view: save data when list sorting in edit mode",
        async function (assert) {
            assert.expect(2);

            serverData.models.foo.fields.foo.sortable = true;

            await makeView({
                type: "list",
                resModel: "foo",
                serverData,
                arch: '<tree editable="bottom"><field name="foo"/></tree>',
                mockRPC(route, args) {
                    if (args.method === "web_save") {
                        assert.deepEqual(
                            args.args,
                            [[1], { foo: "xyz" }],
                            "should correctly save the edited record"
                        );
                    }
                },
            });

            await click(target.querySelector(".o_data_cell"));
            await editInput(target, '.o_field_widget[name="foo"] input', "xyz");
            await click(target.querySelector(".o_column_sortable"));
            assert.containsNone(target, ".o_selected_row");
        }
    );

    QUnit.test(
        "editable list view: check that controlpanel buttons are updating when groupby applied",
        async function (assert) {
            serverData.models.foo.fields.foo = { string: "Foo", type: "char", required: true };
            serverData.actions = {
                11: {
                    id: 11,
                    name: "Partners Action 11",
                    res_model: "foo",
                    type: "ir.actions.act_window",
                    views: [[3, "list"]],
                    search_view_id: [9, "search"],
                },
            };
            serverData.views = {
                "foo,3,list":
                    '<tree editable="top"><field name="display_name"/><field name="foo"/></tree>',

                "foo,9,search": `
                    <search>
                        <filter string="candle" name="itsName" context="{'group_by': 'foo'}"/>
                    </search>`,
            };

            const webClient = await createWebClient({ serverData });

            await doAction(webClient, 11);
            await click($(".o_list_button_add:visible").get(0));

            assert.containsNone(target, ".o_list_button_add");
            assert.containsN(
                target,
                ".o_list_button_save",
                2,
                "Should have 2 save button (small and xl screens)"
            );

            await toggleSearchBarMenu(target);
            await toggleMenuItem(target, "candle");

            assert.containsOnce(
                target,
                ".o_list_button_add:visible",
                "Create available as list is grouped"
            );
            assert.containsNone(
                target,
                ".o_list_button_save",
                "Save not available as no row in edition"
            );
        }
    );

    QUnit.test(
        "editable list view: check that add button is present when groupby applied",
        async function (assert) {
            assert.expect(4);

            serverData.models.foo.fields.foo = { string: "Foo", type: "char", required: true };
            serverData.actions = {
                11: {
                    id: 11,
                    name: "Partners Action 11",
                    res_model: "foo",
                    type: "ir.actions.act_window",
                    views: [
                        [3, "list"],
                        [4, "form"],
                    ],
                    search_view_id: [9, "search"],
                },
            };
            serverData.views = {
                "foo,3,list":
                    '<tree editable="top"><field name="display_name"/><field name="foo"/></tree>',
                "foo,4,form": '<form><field name="display_name"/><field name="foo"/></form>',
                "foo,9,search": `
                    <search>
                        <filter string="candle" name="itsName" context="{'group_by': 'foo'}"/>
                    </search>`,
            };

            const webClient = await createWebClient({ serverData });
            await doAction(webClient, 11);

            assert.containsOnce(target, ".o_list_button_add:visible");
            await click(target.querySelector(".o_searchview_dropdown_toggler"));
            await click($(target).find('.o_menu_item:contains("candle")')[0]);
            assert.containsOnce(target, ".o_list_button_add:visible");

            assert.containsOnce(target, ".o_list_view");
            await click($(".o_list_button_add:visible").get(0));
            assert.containsOnce(target, ".o_form_view");
        }
    );

    QUnit.test("list view not groupable", async function (assert) {
        serverData.views = {
            "foo,false,search": `
                <search>
                    <filter context="{'group_by': 'foo'}" name="foo"/>
                </search>`,
        };

        await makeView({
            type: "list",
            resModel: "foo",
            serverData,
            arch: `
                <tree editable="top">
                    <field name="display_name"/>
                    <field name="foo"/>
                </tree>`,
            mockRPC(route, args) {
                if (args.method === "read_group") {
                    throw new Error("Should not do a read_group RPC");
                }
            },
            searchMenuTypes: ["filter", "favorite"],
            context: { search_default_foo: 1 },
        });

        assert.containsNone(
            target,
            ".o_control_panel div.o_search_options div.o_group_by_menu",
            "there should not be groupby menu"
        );
        assert.deepEqual(getFacetTexts(target), []);
    });

    QUnit.test("selection changes are triggered correctly", async function (assert) {
        patchWithCleanup(ListController.prototype, {
            setup() {
                super.setup(...arguments);
                onRendered(() => {
                    assert.step("onRendered ListController");
                });
            },
        });

        const list = await makeView({
            type: "list",
            resModel: "foo",
            serverData,
            arch: '<tree><field name="foo"/><field name="bar"/></tree>',
        });
        var tbody_selector = target.querySelector("tbody .o_list_record_selector input");
        var thead_selector = target.querySelector("thead .o_list_record_selector input");

        assert.strictEqual(list.model.root.selection.length, 0, "no record should be selected");
        assert.notOk(tbody_selector.checked, "selection checkbox should be checked");
        assert.verifySteps(["onRendered ListController"]);

        // tbody checkbox click
        await click(tbody_selector);
        assert.strictEqual(list.model.root.selection.length, 1, "only 1 record should be selected");
        assert.deepEqual(
            list.model.root.selection[0].data,
            {
                bar: true,
                foo: "yop",
            },
            "the correct record should be selected"
        );
        assert.ok(tbody_selector.checked, "selection checkbox should be checked");
        assert.verifySteps(["onRendered ListController"]);

        await click(tbody_selector);
        assert.strictEqual(list.model.root.selection.length, 0, "no record should be selected");
        assert.notOk(tbody_selector.checked, "selection checkbox should be checked");
        assert.verifySteps(["onRendered ListController"]);

        // head checkbox click
        await click(thead_selector);
        assert.strictEqual(list.model.root.selection.length, 4, "all records should be selected");
        assert.containsN(
            target,
            "tbody .o_list_record_selector input:checked",
            target.querySelectorAll("tbody tr").length,
            "all selection checkboxes should be checked"
        );
        assert.verifySteps(["onRendered ListController"]);

        await click(thead_selector);
        assert.strictEqual(list.model.root.selection.length, 0, "no records should be selected");
        assert.containsNone(
            target,
            "tbody .o_list_record_selector input:checked",
            "no selection checkbox should be checked"
        );
        assert.verifySteps(["onRendered ListController"]);
    });

    QUnit.test(
        "Row selection checkbox can be toggled by clicking on the cell",
        async function (assert) {
            const list = await makeView({
                type: "list",
                resModel: "foo",
                serverData,
                arch: '<tree><field name="foo"/><field name="bar"/></tree>',
            });

            assert.strictEqual(list.model.root.selection.length, 0, "no record should be selected");

            await click(target.querySelector("tbody .o_list_record_selector"));
            assert.containsOnce(target, "tbody .o_list_record_selector input:checked");
            assert.strictEqual(
                list.model.root.selection.length,
                1,
                "only 1 record should be selected"
            );
            await click(target.querySelector("tbody .o_list_record_selector"));
            assert.containsNone(target, ".o_list_record_selector input:checked");
            assert.strictEqual(list.model.root.selection.length, 0, "no record should be selected");

            await click(target.querySelector("thead .o_list_record_selector"));
            assert.containsN(target, ".o_list_record_selector input:checked", 5);
            assert.strictEqual(
                list.model.root.selection.length,
                4,
                "all records should be selected"
            );
            await click(target.querySelector("thead .o_list_record_selector"));
            assert.containsNone(target, ".o_list_record_selector input:checked");
            assert.strictEqual(list.model.root.selection.length, 0, "no record should be selected");
        }
    );

    QUnit.test("head selector is toggled by the other selectors", async function (assert) {
        await makeView({
            type: "list",
            arch: '<tree><field name="foo"/><field name="bar"/></tree>',
            serverData,
            groupBy: ["bar"],
            resModel: "foo",
        });

        assert.notOk(
            target.querySelector("thead .o_list_record_selector input").checked,
            "Head selector should be unchecked"
        );

        await click(target.querySelector(".o_group_header:nth-child(2)"));
        await click(target.querySelector("thead .o_list_record_selector input"));
        assert.containsN(
            target,
            "tbody .o_list_record_selector input:checked",
            3,
            "All visible checkboxes should be checked"
        );

        await click(target.querySelector(".o_group_header:first-child"));
        assert.notOk(
            target.querySelector("thead .o_list_record_selector input").checked,
            "Head selector should be unchecked"
        );

        await click(target.querySelector("tbody:nth-child(2) .o_list_record_selector input"));
        assert.ok(
            target.querySelector("thead .o_list_record_selector input").checked,
            "Head selector should be checked"
        );

        await click(target.querySelector("tbody .o_list_record_selector input"));

        assert.notOk(
            target.querySelector("thead .o_list_record_selector input").checked,
            "Head selector should be unchecked"
        );

        await click(target.querySelector(".o_group_header"));

        assert.ok(
            target.querySelector("thead .o_list_record_selector input").checked,
            "Head selector should be checked"
        );
    });

    QUnit.test("selection box is properly displayed (single page)", async function (assert) {
        await makeView({
            type: "list",
            resModel: "foo",
            serverData,
            arch: '<tree><field name="foo"/><field name="bar"/></tree>',
        });

        assert.containsN(target, ".o_data_row", 4);
        assert.containsNone(
            target.querySelector(".o_control_panel_actions"),
            ".o_list_selection_box"
        );

        // select a record
        await click(target.querySelector(".o_data_row .o_list_record_selector input"));
        assert.containsOnce(
            target.querySelector(".o_control_panel_actions"),
            ".o_list_selection_box"
        );
        assert.containsNone(target.querySelector(".o_list_selection_box"), ".o_list_select_domain");
        assert.strictEqual(
            target.querySelector(".o_list_selection_box").textContent.trim(),
            "1 selected"
        );

        // select all records of first page
        await click(target.querySelector("thead .o_list_record_selector input"));
        assert.containsOnce(
            target.querySelector(".o_control_panel_actions"),
            ".o_list_selection_box"
        );
        assert.containsNone(target.querySelector(".o_list_selection_box"), ".o_list_select_domain");
        assert.strictEqual(
            target.querySelector(".o_list_selection_box").textContent.trim(),
            "4 selected"
        );

        // unselect a record
        await click(target.querySelectorAll(".o_data_row .o_list_record_selector input")[1]);
        assert.containsOnce(
            target.querySelector(".o_control_panel_actions"),
            ".o_list_selection_box"
        );
        assert.containsNone(target.querySelector(".o_list_selection_box"), ".o_list_select_domain");
        assert.strictEqual(
            target.querySelector(".o_list_selection_box").textContent.trim(),
            "3 selected"
        );
        await click(target.querySelector(".o_list_unselect_all"));
        assert.containsNone(
            target,
            ".o_list_selection_box",
            "selection options are no longer visible"
        );
        assert.containsNone(
            target,
            ".o_data_row .o_list_record_selector input:checked",
            "no records should be selected"
        );
    });

    QUnit.test("selection box is properly displayed (multi pages)", async function (assert) {
        await makeView({
            type: "list",
            resModel: "foo",
            serverData,
            arch: '<tree limit="3"><field name="foo"/><field name="bar"/></tree>',
        });

        assert.containsN(target, ".o_data_row", 3);
        assert.containsNone(
            target.querySelector(".o_control_panel_actions"),
            ".o_list_selection_box"
        );

        // select a record
        await click(target.querySelector(".o_data_row .o_list_record_selector input"));
        assert.containsOnce(
            target.querySelector(".o_control_panel_actions"),
            ".o_list_selection_box"
        );
        assert.containsNone(target.querySelector(".o_list_selection_box"), ".o_list_select_domain");
        assert.strictEqual(
            target.querySelector(".o_list_selection_box").textContent.trim(),
            "1 selected"
        );

        // select all records of first page
        await click(target.querySelector("thead .o_list_record_selector input"));
        assert.containsOnce(
            target.querySelector(".o_control_panel_actions"),
            ".o_list_selection_box"
        );
        assert.containsOnce(target.querySelector(".o_list_selection_box"), ".o_list_select_domain");
        assert.strictEqual(
            target.querySelector(".o_list_selection_box").textContent.replace(/\s+/g, " ").trim(),
            "3 selected Select all 4"
        );

        // select all domain
        await click(target.querySelector(".o_list_selection_box .o_list_select_domain"));
        assert.containsOnce(
            target.querySelector(".o_control_panel_actions"),
            ".o_list_selection_box"
        );
        assert.strictEqual(
            target.querySelector(".o_list_selection_box").textContent.trim(),
            "All 4 selected"
        );
        await click(target.querySelector(".o_list_unselect_all"));
        assert.containsNone(
            target,
            ".o_list_selection_box",
            "selection options are no longer visible"
        );
    });

    QUnit.test("selection box is properly displayed (group list)", async function (assert) {
        await makeView({
            type: "list",
            resModel: "foo",
            serverData,
            arch: '<tree><field name="foo"/><field name="bar"/></tree>',
            groupBy: ["foo"],
        });
        assert.containsN(target, ".o_group_header", 3);
        assert.containsNone(
            target.querySelector(".o_control_panel_actions"),
            ".o_list_selection_box"
        );

        // open first group
        await click(target.querySelector(".o_group_header"));

        // select a record
        await click(target.querySelector(".o_data_row .o_list_record_selector input"));
        assert.containsOnce(
            target.querySelector(".o_control_panel_actions"),
            ".o_list_selection_box"
        );
        assert.containsNone(target.querySelector(".o_list_selection_box"), ".o_list_select_domain");
        assert.strictEqual(
            target.querySelector(".o_list_selection_box").textContent.trim(),
            "1 selected"
        );

        // select all records of first page
        await click(target.querySelector("thead .o_list_record_selector input"));
        assert.containsOnce(
            target.querySelector(".o_control_panel_actions"),
            ".o_list_selection_box"
        );
        assert.containsOnce(target.querySelector(".o_list_selection_box"), ".o_list_select_domain");
        assert.strictEqual(
            target.querySelector(".o_list_selection_box").textContent.replace(/\s+/g, " ").trim(),
            "2 selected Select all 4"
        );

        // select all domain
        await click(target.querySelector(".o_list_selection_box .o_list_select_domain"));
        assert.containsOnce(
            target.querySelector(".o_control_panel_actions"),
            ".o_list_selection_box"
        );
        assert.strictEqual(
            target.querySelector(".o_list_selection_box").textContent.trim(),
            "All 4 selected"
        );
        await click(target.querySelector(".o_list_unselect_all"));
        assert.containsNone(
            target,
            ".o_list_selection_box",
            "selection options are no longer visible"
        );
    });

    QUnit.test("selection box is displayed as first action button", async function (assert) {
        await makeView({
            type: "list",
            resModel: "foo",
            serverData,
            arch: `
                <tree>
                    <header>
                         <button name="x" type="object" class="plaf" string="plaf"/>
                         <button name="y" type="object" class="plouf" string="plouf"/>
                    </header>
                    <field name="foo"/>
                    <field name="bar"/>
                </tree>`,
        });

        assert.containsN(target, ".o_data_row", 4);
        assert.containsNone($(target).find(".o_control_panel_actions"), ".o_list_selection_box");

        // select a record
        await click(target, ".o_data_row:first-child .o_list_record_selector input");
        assert.containsOnce(
            target.querySelector(".o_control_panel_actions"),
            ".o_list_selection_box"
        );
        const firstElement = target.querySelector(
            ".o_control_panel_actions > div"
        ).firstElementChild;
        assert.strictEqual(
            firstElement,
            target.querySelector(".o_control_panel_actions .o_list_selection_box"),
            "last element should selection box"
        );
        assert.strictEqual(
            target.querySelector(".o_list_selection_box").textContent.trim(),
            "1 selected"
        );
    });

    QUnit.test("selection box is not removed after multi record edition", async function (assert) {
        await makeView({
            type: "list",
            resModel: "foo",
            serverData,
            arch: '<tree multi_edit="1"><field name="foo"/><field name="bar"/></tree>',
        });

        assert.containsN(target, ".o_data_row", 4, "there should be 4 records");
        assert.containsNone(
            target.querySelector(".o_control_panel_actions"),
            ".o_list_selection_box",
            "list selection box should not be displayed"
        );

        // select all records
        await click(target.querySelector(".o_list_record_selector input"));
        assert.containsOnce(
            target.querySelector(".o_control_panel_actions"),
            ".o_list_selection_box",
            "list selection box should be displayed"
        );
        assert.containsN(
            target,
            ".o_data_row .o_list_record_selector input:checked",
            4,
            "all 4 records should be selected"
        );

        // edit selected records
        await click(target.querySelector(".o_data_row").querySelector(".o_data_cell"));
        await editInput(target, ".o_data_row [name=foo] input", "legion");
        await click(target, ".modal-dialog button.btn-primary");
        assert.containsOnce(
            target.querySelector(".o_control_panel_actions"),
            ".o_list_selection_box",
            "list selection box should still be displayed"
        );
        assert.containsN(
            target,
            ".o_data_row .o_list_record_selector input:checked",
            4,
            "same records should be selected"
        );
    });

    QUnit.test("selection box in grouped list, multi pages)", async function (assert) {
        await makeView({
            type: "list",
            resModel: "foo",
            serverData,
            arch: '<tree groups_limit="2"><field name="foo"/><field name="bar"/></tree>',
            groupBy: ["int_field"],
        });

        assert.containsN(target, ".o_group_header", 2);
        assert.containsNone(target, ".o_list_selection_box");
        assert.strictEqual(target.querySelector(".o_pager_value").innerText, "1-2");
        assert.strictEqual(target.querySelector(".o_pager_limit").innerText, "4");

        // open first group and select all records of first page
        await click(target.querySelector(".o_group_header"));
        assert.containsOnce(target, ".o_data_row");
        await click(target.querySelector("thead .o_list_record_selector input"));
        assert.containsOnce(
            target.querySelector(".o_control_panel_actions"),
            ".o_list_selection_box"
        );
        assert.containsOnce(target.querySelector(".o_list_selection_box"), ".o_list_select_domain");
        assert.strictEqual(
            target.querySelector(".o_list_selection_box").innerText.replace(/\s+/g, " ").trim(),
            "1 selected Select all"
        ); // we don't know the total count, so we don't display it

        // select all domain
        await click(target.querySelector(".o_list_selection_box .o_list_select_domain"));
        assert.containsOnce(
            target.querySelector(".o_control_panel_actions"),
            ".o_list_selection_box"
        );
        assert.strictEqual(
            target.querySelector(".o_list_selection_box").innerText.replace(/\s+/g, " ").trim(),
            "All 4 selected"
        );
    });

    QUnit.test("selection box: grouped list, select domain, open group", async function (assert) {
        await makeView({
            type: "list",
            resModel: "foo",
            serverData,
            arch: '<tree><field name="foo"/><field name="bar"/></tree>',
            groupBy: ["foo"],
        });
        assert.containsN(target, ".o_group_header", 3);
        assert.containsNone(target, ".o_data_row");
        assert.containsNone(
            target.querySelector(".o_control_panel_actions"),
            ".o_list_selection_box"
        );

        // open first group and select all domain
        await click(target.querySelector(".o_group_header"));
        await click(target.querySelector("thead .o_list_record_selector input"));
        await click(target.querySelector(".o_list_selection_box .o_list_select_domain"));
        assert.containsN(target, ".o_data_row", 2);
        assert.containsOnce(
            target.querySelector(".o_control_panel_actions"),
            ".o_list_selection_box"
        );
        assert.strictEqual(
            target.querySelector(".o_list_selection_box").textContent.trim(),
            "All 4 selected"
        );

        // open another group
        await click(target.querySelectorAll(".o_group_header")[1]);
        assert.containsN(target, ".o_data_row", 3);
        assert.containsN(target, ".o_data_row .o_list_record_selector input:checked", 3);
    });

    QUnit.test("selection box: grouped list, select domain, use pager", async function (assert) {
        await makeView({
            type: "list",
            resModel: "foo",
            serverData,
            arch: '<tree limit="2"><field name="foo"/><field name="bar"/></tree>',
            groupBy: ["bar"],
        });
        assert.containsN(target, ".o_group_header", 2);
        assert.containsNone(target, ".o_data_row");
        assert.containsNone(
            target.querySelector(".o_control_panel_actions"),
            ".o_list_selection_box"
        );

        // open second group and select all domain
        await click(target.querySelectorAll(".o_group_header")[1]);
        await click(target.querySelector("thead .o_list_record_selector input"));
        await click(target.querySelector(".o_list_selection_box .o_list_select_domain"));
        assert.containsN(target, ".o_data_row", 2);
        assert.strictEqual(target.querySelector(".o_group_header .o_pager_value").innerText, "1-2");
        assert.strictEqual(target.querySelector(".o_group_header .o_pager_limit").innerText, "3");
        assert.containsOnce(
            target.querySelector(".o_control_panel_actions"),
            ".o_list_selection_box"
        );
        assert.strictEqual(
            target.querySelector(".o_list_selection_box").textContent.trim(),
            "All 4 selected"
        );

        // click pager next in the opened group
        await click(target.querySelector(".o_group_header .o_pager_next"));
        assert.containsN(target, ".o_data_row", 1);
        assert.containsN(target, ".o_data_row .o_list_record_selector input:checked", 1);
        assert.strictEqual(
            target.querySelector(".o_list_selection_box").textContent.trim(),
            "All 4 selected"
        );
    });

    QUnit.test("selection is reset on reload", async function (assert) {
        await makeView({
            type: "list",
            resModel: "foo",
            serverData,
            arch: `
                <tree>
                    <field name="foo"/>
                    <field name="int_field" sum="Sum"/>
                </tree>`,
        });

        assert.containsNone(
            target.querySelector(".o_control_panel_actions"),
            ".o_list_selection_box"
        );
        assert.strictEqual(
            $(target).find("tfoot td:nth(2)").text(),
            "32",
            "total should be 32 (no record selected)"
        );

        // select first record
        var firstRowSelector = target.querySelector("tbody .o_list_record_selector input");
        await click(firstRowSelector);
        assert.ok(firstRowSelector.checked, "first row should be selected");
        assert.containsOnce(
            target.querySelector(".o_control_panel_actions"),
            ".o_list_selection_box"
        );
        assert.strictEqual(
            $(target).find("tfoot td:nth(2)").text(),
            "10",
            "total should be 10 (first record selected)"
        );

        await reloadListView(target);
        firstRowSelector = target.querySelector("tbody .o_list_record_selector input");
        assert.notOk(firstRowSelector.checked, "first row should no longer be selected");
        assert.containsNone(
            target.querySelector(".o_control_panel_actions"),
            ".o_list_selection_box"
        );
        assert.strictEqual(
            $(target).find("tfoot td:nth(2)").text(),
            "32",
            "total should be 32 (no more record selected)"
        );
    });

    QUnit.test("selection is kept on render without reload", async function (assert) {
        await makeView({
            type: "list",
            resModel: "foo",
            serverData,
            groupBy: ["foo"],
            actionMenus: {},
            arch: `
                <tree>
                    <field name="foo"/>
                    <field name="int_field" sum="Sum"/>
                </tree>`,
        });

        assert.containsOnce(target, "div.o_control_panel .o_cp_action_menus");
        assert.containsNone(
            target.querySelector(".o_control_panel_actions"),
            ".o_list_selection_box"
        );

        // open blip grouping and check all lines
        await click($(target).find('.o_group_header:contains("blip (2)")')[0]);
        await click(target.querySelector(".o_data_row input"));
        assert.containsOnce(target, "div.o_control_panel .o_cp_action_menus");
        assert.containsOnce(
            target.querySelector(".o_control_panel_actions"),
            ".o_list_selection_box"
        );

        // open yop grouping and verify blip are still checked
        await click($(target).find('.o_group_header:contains("yop (1)")')[0]);
        assert.containsOnce(
            target,
            ".o_data_row input:checked",
            "opening a grouping does not uncheck others"
        );
        assert.containsOnce(target, "div.o_control_panel .o_cp_action_menus");
        assert.containsOnce(
            target.querySelector(".o_control_panel_actions"),
            ".o_list_selection_box"
        );

        // close and open blip grouping and verify blip are unchecked
        await click($(target).find('.o_group_header:contains("blip (2)")')[0]);
        await click($(target).find('.o_group_header:contains("blip (2)")')[0]);
        assert.containsNone(
            target,
            ".o_data_row input:checked",
            "opening and closing a grouping uncheck its elements"
        );
        assert.containsOnce(target, "div.o_control_panel .o_cp_action_menus");
        assert.containsNone(
            target.querySelector(".o_control_panel_actions"),
            ".o_list_selection_box"
        );
    });

    QUnit.test("select a record in list grouped by date with granularity", async function (assert) {
        await makeView({
            type: "list",
            resModel: "foo",
            serverData,
            arch: '<tree><field name="foo"/><field name="bar"/></tree>',
            groupBy: ["date:year"],
            // keep the actionMenus, it is relevant as it computes isM2MGrouped which crashes if we
            // don't correctly extract the fieldName/granularity from the groupBy
            actionMenus: {},
        });

        assert.containsN(target, ".o_group_header", 2);
        assert.containsNone(
            target.querySelector(".o_control_panel_actions"),
            ".o_list_selection_box"
        );
        await click(target.querySelector(".o_group_header"));
        assert.containsOnce(target, ".o_data_row");
        await click(target.querySelector(".o_data_row .o_list_record_selector"));
        assert.containsOnce(
            target.querySelector(".o_control_panel_actions"),
            ".o_list_selection_box"
        );
    });

    QUnit.test("aggregates are computed correctly", async function (assert) {
        // map: foo record id -> qux value
        const quxVals = { 1: 1.0, 2: 2.0, 3: 3.0, 4: 0 };

        serverData.models.foo.records = serverData.models.foo.records.map((r) => ({
            ...r,
            qux: quxVals[r.id],
        }));

        await makeView({
            type: "list",
            resModel: "foo",
            serverData,
            arch: /*xml*/ `
                <tree>
                    <field name="foo"/>
                    <field name="int_field" sum="Sum"/>
                    <field name="qux" avg="Average"/>
                </tree>`,
            searchViewArch: `
                <search>
                    <filter name="my_filter" string="My Filter" domain="[('id', '=', 0)]"/>
                </search>`,
        });
        const tbodySelectors = target.querySelectorAll("tbody .o_list_record_selector input");
        const theadSelector = target.querySelector("thead .o_list_record_selector input");

        const getFooterTextArray = () => {
            return [...target.querySelectorAll("tfoot td")].map((td) => td.innerText);
        };

        assert.deepEqual(getFooterTextArray(), ["", "", "32", "1.50"]);

        await click(tbodySelectors[0]);
        await click(tbodySelectors[3]);
        assert.deepEqual(getFooterTextArray(), ["", "", "6", "0.50"]);

        await click(theadSelector);
        assert.deepEqual(getFooterTextArray(), ["", "", "32", "1.50"]);

        // Let's update the view to dislay NO records
        await click(target.querySelector(".o_list_unselect_all"));
        await toggleSearchBarMenu(target);
        await toggleMenuItem(target, "My Filter");
        assert.deepEqual(getFooterTextArray(), ["", "", "", ""]);
    });

    QUnit.test("aggregates are computed correctly in grouped lists", async function (assert) {
        await makeView({
            type: "list",
            resModel: "foo",
            serverData,
            groupBy: ["m2o"],
            arch: '<tree editable="bottom"><field name="foo" /><field name="int_field" sum="Sum"/></tree>',
        });
        const groupHeaders = target.querySelectorAll(".o_group_header");
        assert.strictEqual(
            groupHeaders[0].querySelector("td:last-child").textContent,
            "23",
            "first group total should be 23"
        );
        assert.strictEqual(
            groupHeaders[1].querySelector("td:last-child").textContent,
            "9",
            "second group total should be 9"
        );
        assert.strictEqual(
            target.querySelector("tfoot td:last-child").textContent,
            "32",
            "total should be 32"
        );
        await click(groupHeaders[0]);
        await click(target.querySelector("tbody .o_list_record_selector input:first-child"));
        assert.strictEqual(
            target.querySelector("tfoot td:last-child").textContent,
            "10",
            "total should be 10 as first record of first group is selected"
        );
    });

    QUnit.test("aggregates are formatted correctly in grouped lists", async function (assert) {
        // in this scenario, there is a widget on an aggregated field, and this widget has no
        // associated formatter, so we fallback on the formatter corresponding to the field type
        fieldRegistry.add("my_float", FloatField);
        serverData.models.foo.records[0].qux = 5.1654846456;
        await makeView({
            type: "list",
            resModel: "foo",
            serverData,
            arch: `
                <tree>
                    <field name="foo"/>
                    <field name="qux" widget="my_float" sum="Sum"/>
                </tree>`,
            groupBy: ["int_field"],
        });

        assert.deepEqual(
            getNodesTextContent(target.querySelectorAll(".o_group_header .o_list_number")),
            ["9.00", "13.00", "5.17", "-3.00"]
        );
    });

    QUnit.test("aggregates in grouped lists with buttons", async function (assert) {
        await makeView({
            type: "list",
            resModel: "foo",
            serverData,
            groupBy: ["m2o"],
            arch: `
                <tree>
                    <field name="foo"/>
                    <field name="int_field" sum="Sum"/>
                    <button name="a" type="object"/>
                    <field name="qux" sum="Sum"/>
                </tree>`,
        });

        const cellVals = ["23", "6.40", "9", "13.00", "32", "19.40"];
        assert.deepEqual(getNodesTextContent(target.querySelectorAll(".o_list_number")), cellVals);
    });

    QUnit.test("date field aggregates in grouped lists", async function (assert) {
        // this test simulates a scenario where a date field has a aggregator
        // and the web_read_group thus return a value for that field for each group
        await makeView({
            type: "list",
            resModel: "foo",
            serverData,
            groupBy: ["m2o"],
            arch: `
                <tree>
                    <field name="foo"/>
                    <field name="date"/>
                </tree>`,
            async mockRPC(route, args, performRPC) {
                if (args.method === "web_read_group") {
                    const res = await performRPC(...arguments);
                    res.groups[0].date = "2021-03-15";
                    res.groups[1].date = "2021-02-11";
                    return res;
                }
            },
        });

        assert.containsN(target, ".o_group_header", 2);
        assert.deepEqual(getNodesTextContent(target.querySelectorAll(".o_group_header")), [
            `Value 1 (3) `,
            `Value 2 (1) `,
        ]);
    });

    QUnit.test(
        "hide aggregated value in grouped lists when no data provided by RPC call",
        async function (assert) {
            await makeView({
                type: "list",
                resModel: "foo",
                serverData,
                groupBy: ["bar"],
                arch: `
                    <tree editable="bottom">
                        <field name="foo"/>
                        <field name="qux" widget="float_time" sum="Sum"/>
                    </tree>`,
                mockRPC: async function (route, args, performRPC) {
                    if (args.method === "web_read_group") {
                        const result = await performRPC(route, args);
                        result.groups.forEach((group) => {
                            delete group.qux;
                        });
                        return Promise.resolve(result);
                    }
                },
            });

            assert.strictEqual(
                target.querySelectorAll("tfoot td")[2].textContent,
                "",
                "There isn't any aggregated value"
            );
        }
    );

    QUnit.test("aggregates are updated when a line is edited", async function (assert) {
        await makeView({
            type: "list",
            resModel: "foo",
            serverData,
            arch: '<tree editable="bottom"><field name="int_field" sum="Sum"/></tree>',
        });

        assert.strictEqual(
            target.querySelector('span[data-tooltip="Sum"]').innerText,
            "32",
            "current total should be 32"
        );

        await click(target.querySelector("tr.o_data_row td.o_data_cell"));
        await editInput(target, "td.o_data_cell input", "15");

        assert.strictEqual(
            target.querySelector('span[data-tooltip="Sum"]').innerText,
            "37",
            "current total should be 37"
        );
    });

    QUnit.test("aggregates are formatted according to field widget", async function (assert) {
        await makeView({
            type: "list",
            resModel: "foo",
            serverData,
            arch: `
                <tree>
                    <field name="foo"/>
                    <field name="qux" widget="float_time" sum="Sum"/>
                </tree>`,
        });

        assert.strictEqual(
            target.querySelectorAll("tfoot td")[2].textContent,
            "19:24",
            "total should be formatted as a float_time"
        );
    });

    QUnit.test("aggregates digits can be set with digits field attribute", async function (assert) {
        await makeView({
            type: "list",
            resModel: "foo",
            serverData,
            arch: `
                <tree>
                    <field name="amount" widget="monetary" sum="Sum" digits="[69,3]"/>
                </tree>`,
        });

        assert.strictEqual(
            target.querySelectorAll(".o_data_row td")[1].textContent,
            "1200.00",
            "field should still be formatted based on currency"
        );
        assert.strictEqual(
            target.querySelectorAll("tfoot td")[1].textContent,
            "—",
            "aggregates monetary should never work if no currency field is present"
        );
    });

    QUnit.test("aggregates monetary (same currency)", async function (assert) {
        serverData.models.foo.records[0].currency_id = 1;
        await makeView({
            type: "list",
            resModel: "foo",
            serverData,
            arch: `
                <tree>
                    <field name="amount" widget="monetary" sum="Sum"/>
                    <field name="currency_id"/>
                </tree>`,
        });

        assert.deepEqual(getNodesTextContent(target.querySelectorAll("tbody .o_monetary_cell")), [
            "$\u00a01200.00",
            "$\u00a0500.00",
            "$\u00a0300.00",
            "$\u00a00.00",
        ]);

        assert.strictEqual(target.querySelectorAll("tfoot td")[1].textContent, "$\u00a02000.00");
    });

    QUnit.test("aggregates monetary (different currencies)", async function (assert) {
        await makeView({
            type: "list",
            resModel: "foo",
            serverData,
            arch: `
                <tree>
                    <field name="amount" widget="monetary" sum="Sum"/>
                    <field name="currency_id"/>
                </tree>`,
        });

        assert.deepEqual(getNodesTextContent(target.querySelectorAll("tbody .o_monetary_cell")), [
            "1200.00\u00a0€",
            "$\u00a0500.00",
            "$\u00a0300.00",
            "$\u00a00.00",
        ]);

        assert.strictEqual(target.querySelectorAll("tfoot td")[1].textContent, "—");
    });

    QUnit.test("aggregates monetary (currency field not in view)", async function (assert) {
        await makeView({
            type: "list",
            resModel: "foo",
            serverData,
            arch: `
                <tree>
                    <field name="amount" widget="monetary" sum="Sum" options="{'currency_field': 'currency_test'}"/>
                    <field name="currency_id"/>
                </tree>`,
        });

        assert.deepEqual(getNodesTextContent(target.querySelectorAll("tbody .o_monetary_cell")), [
            "1200.00",
            "500.00",
            "300.00",
            "0.00",
        ]);

        assert.strictEqual(target.querySelectorAll("tfoot td")[1].textContent, "—");
    });

    QUnit.test("aggregates monetary (currency field in view)", async function (assert) {
        serverData.models.foo.fields.amount.currency_field = "currency_test";
        await makeView({
            type: "list",
            resModel: "foo",
            serverData,
            arch: `
                <tree>
                    <field name="amount" widget="monetary" sum="Sum"/>
                    <field name="currency_test"/>
                </tree>`,
        });

        assert.deepEqual(getNodesTextContent(target.querySelectorAll("tbody .o_monetary_cell")), [
            "$\u00a01200.00",
            "$\u00a0500.00",
            "$\u00a0300.00",
            "$\u00a00.00",
        ]);

        assert.strictEqual(target.querySelectorAll("tfoot td")[1].textContent, "$\u00a02000.00");
    });

    QUnit.test("aggregates monetary with custom digits (same currency)", async function (assert) {
        serverData.models.foo.records = serverData.models.foo.records.map((record) => ({
            ...record,
            currency_id: 1,
        }));
        patchWithCleanup(currencies, {
            1: { ...currencies[1], digits: [42, 4] },
        });

        await makeView({
            type: "list",
            resModel: "foo",
            serverData,
            arch: `
                <tree>
                    <field name="amount" sum="Sum"/>
                    <field name="currency_id"/>
                </tree>`,
        });

        assert.deepEqual(getNodesTextContent(target.querySelectorAll("tbody [name='amount']")), [
            "$\u00a01200.0000",
            "$\u00a0500.0000",
            "$\u00a0300.0000",
            "$\u00a00.0000",
        ]);

        assert.strictEqual(target.querySelectorAll("tfoot td")[1].textContent, "$\u00a02000.0000");
    });

    QUnit.test(
        "aggregates float with monetary widget and custom digits (same currency)",
        async function (assert) {
            serverData.models.foo.records = serverData.models.foo.records.map((record) => ({
                ...record,
                currency_id: 1,
            }));
            patchWithCleanup(currencies, {
                1: { ...currencies[1], digits: [42, 4] },
            });

            await makeView({
                type: "list",
                resModel: "foo",
                serverData,
                arch: `
                <tree>
                    <field name="qux" widget="monetary" sum="Sum"/>
                    <field name="currency_id"/>
                </tree>`,
            });

            assert.deepEqual(
                getNodesTextContent(target.querySelectorAll("tbody .o_monetary_cell")),
                ["$\u00a00.4000", "$\u00a013.0000", "$\u00a0-3.0000", "$\u00a09.0000"]
            );

            assert.strictEqual(
                target.querySelectorAll("tfoot td")[1].textContent,
                "$\u00a019.4000"
            );
        }
    );

    QUnit.test(
        "currency_field is taken into account when formatting monetary values",
        async (assert) => {
            await makeView({
                type: "list",
                resModel: "foo",
                serverData,
                arch: `
                <tree>
                    <field name="company_currency_id" column_invisible="1"/>
                    <field name="currency_id" column_invisible="1"/>
                    <field name="amount"/>
                    <field name="amount_currency"/>
                </tree>`,
            });

            assert.strictEqual(
                target.querySelectorAll('.o_data_row td[name="amount"]')[0].textContent,
                "1200.00\u00a0€",
                "field should be formatted based on currency_id"
            );
            assert.strictEqual(
                target.querySelectorAll('.o_data_row td[name="amount_currency"]')[0].textContent,
                "$\u00a01100.00",
                "field should be formatted based on company_currency_id"
            );
            assert.strictEqual(
                target.querySelectorAll("tfoot td")[1].textContent,
                "—",
                "aggregates monetary should never work if different currencies are used"
            );
        }
    );

    QUnit.test(
        "groups can not be sorted on a different field than the first field of the groupBy - 1",
        async function (assert) {
            assert.expect(1);

            await makeView({
                type: "list",
                resModel: "foo",
                serverData,
                arch: '<tree default_order="foo"><field name="foo"/><field name="bar"/></tree>',
                mockRPC(route, args) {
                    if (args.method === "web_read_group") {
                        assert.strictEqual(args.kwargs.orderby, "", "should not have an orderBy");
                    }
                },
                groupBy: ["bar"],
            });
        }
    );

    QUnit.test(
        "groups can not be sorted on a different field than the first field of the groupBy - 2",
        async function (assert) {
            assert.expect(1);

            await makeView({
                type: "list",
                resModel: "foo",
                serverData,
                arch: '<tree default_order="foo"><field name="foo"/><field name="bar"/></tree>',
                mockRPC(route, args) {
                    if (args.method === "web_read_group") {
                        assert.strictEqual(args.kwargs.orderby, "", "should not have an orderBy");
                    }
                },
                groupBy: ["bar", "foo"],
            });
        }
    );

    QUnit.test("groups can be sorted on the first field of the groupBy", async function (assert) {
        assert.expect(3);

        await makeView({
            type: "list",
            resModel: "foo",
            serverData,
            arch: '<tree default_order="bar desc"><field name="foo"/><field name="bar"/></tree>',
            mockRPC(route, args) {
                if (args.method === "web_read_group") {
                    assert.strictEqual(args.kwargs.orderby, "bar DESC", "should have an orderBy");
                }
            },
            groupBy: ["bar"],
        });

        assert.strictEqual(
            document.querySelector(".o_group_header:first-child").textContent.trim(),
            "Yes (3)"
        );
        assert.strictEqual(
            document.querySelector(".o_group_header:last-child").textContent.trim(),
            "No (1)"
        );
    });

    QUnit.test(
        "groups can't be sorted on aggregates if there is no record",
        async function (assert) {
            serverData.models.foo.records = [];

            await makeView({
                type: "list",
                resModel: "foo",
                serverData,
                groupBy: ["foo"],
                arch: `
                <tree editable="bottom">
                    <field name="foo"/>
                    <field name="int_field" sum="Sum"/>
                </tree>`,
                mockRPC(route, args) {
                    if (args.method === "web_read_group") {
                        assert.step(args.kwargs.orderby || "default order");
                    }
                },
            });

            await click(target, ".o_column_sortable");
            assert.verifySteps(["default order"]);
        }
    );

    QUnit.test("groups can be sorted on aggregates", async function (assert) {
        await makeView({
            type: "list",
            resModel: "foo",
            serverData,
            groupBy: ["foo"],
            arch: `
                <tree editable="bottom">
                    <field name="foo"/>
                    <field name="int_field" sum="Sum"/>
                </tree>`,
            mockRPC(route, args) {
                if (args.method === "web_read_group") {
                    assert.step(args.kwargs.orderby || "default order");
                }
            },
        });

        assert.strictEqual(
            $(target).find("tbody .o_list_number").text(),
            "51710",
            "initial order should be 5, 17, 17"
        );
        assert.strictEqual($(target).find("tfoot td:last()").text(), "32", "total should be 32");

        await click(target, ".o_column_sortable");
        assert.strictEqual(
            $(target).find("tfoot td:last()").text(),
            "32",
            "total should still be 32"
        );
        assert.strictEqual(
            $(target).find("tbody .o_list_number").text(),
            "51017",
            "order should be 5, 10, 17"
        );

        await click(target, ".o_column_sortable");
        assert.strictEqual(
            $(target).find("tbody .o_list_number").text(),
            "17105",
            "initial order should be 17, 10, 5"
        );
        assert.strictEqual(
            $(target).find("tfoot td:last()").text(),
            "32",
            "total should still be 32"
        );

        assert.verifySteps(["default order", "int_field ASC", "int_field DESC"]);
    });

    QUnit.test(
        "groups cannot be sorted on non-aggregable fields if every group is folded",
        async function (assert) {
            serverData.models.foo.fields.sort_field = {
                string: "sortable_field",
                type: "sting",
                sortable: true,
                default: "value",
            };
            serverData.models.foo.records.forEach((elem) => {
                elem.sort_field = "value" + elem.id;
            });
            serverData.models.foo.fields.foo.sortable = true;
            await makeView({
                type: "list",
                resModel: "foo",
                serverData,
                groupBy: ["foo"],
                arch: `
                <tree editable="bottom">
                    <field name="foo"/>
                    <field name="int_field"/>
                    <field name="sort_field"/>
                </tree>`,
                mockRPC(route, args) {
                    if (args.method === "web_read_group") {
                        assert.step(args.kwargs.orderby || "default order");
                    }
                },
            });
            assert.verifySteps(["default order"]);

            // we cannot sort by sort_field since it doesn't have a aggregator
            await click(target.querySelector(".o_column_sortable[data-name='sort_field']"));
            assert.verifySteps([]);

            // we can sort by int_field since it has a aggregator
            await click(target.querySelector(".o_column_sortable[data-name='int_field']"));
            assert.verifySteps(["int_field ASC"]);

            // we keep previous order
            await click(target.querySelector(".o_column_sortable[data-name='sort_field']"));
            assert.verifySteps([]);

            // we can sort on foo since we are groupped by foo + previous order
            await click(target.querySelector(".o_column_sortable[data-name='foo']"));
            assert.verifySteps(["foo ASC, int_field ASC"]);
        }
    );

    QUnit.test(
        "groups can be sorted on non-aggregable fields if a group isn't folded",
        async function (assert) {
            serverData.models.foo.fields.foo.sortable = true;
            await makeView({
                type: "list",
                resModel: "foo",
                serverData,
                groupBy: ["bar"],
                arch: `
                <tree editable="bottom">
                    <field name="foo"/>
                </tree>`,
                mockRPC(route, args) {
                    const { method } = args;
                    if (method === "web_read_group") {
                        assert.step(
                            `web_read_group.orderby: ${args.kwargs.orderby || "default order"}`
                        );
                    }
                    if (method === "web_search_read") {
                        assert.step(
                            `web_search_read.order: ${args.kwargs.order || "default order"}`
                        );
                    }
                },
            });
            await click(target.querySelectorAll(".o_group_header")[1]);
            assert.deepEqual(
                getNodesTextContent(target.querySelectorAll(".o_data_cell[name='foo']")),
                ["yop", "blip", "gnap"]
            );
            assert.verifySteps([
                "web_read_group.orderby: default order",
                "web_search_read.order: default order",
            ]);

            await click(target.querySelector(".o_column_sortable[data-name='foo']"));
            assert.deepEqual(
                getNodesTextContent(target.querySelectorAll(".o_data_cell[name='foo']")),
                ["blip", "gnap", "yop"]
            );
            assert.verifySteps([
                "web_read_group.orderby: default order",
                "web_search_read.order: foo ASC",
            ]);
        }
    );

    QUnit.test(
        "groups can be sorted on non-aggregable fields if a group isn't folded with expand='1'",
        async function (assert) {
            serverData.models.foo.fields.foo.sortable = true;
            await makeView({
                type: "list",
                resModel: "foo",
                serverData,
                groupBy: ["bar"],
                arch: `
                <tree editable="bottom" expand="1">
                    <field name="foo"/>
                </tree>`,
                mockRPC(route, args) {
                    const { method } = args;
                    if (method === "web_read_group") {
                        assert.step(
                            `web_read_group.orderby: ${args.kwargs.orderby || "default order"}`
                        );
                    }
                    if (method === "web_search_read") {
                        assert.step(
                            `web_search_read.orderby: ${args.kwargs.order || "default order"}`
                        );
                    }
                },
            });
            assert.deepEqual(
                getNodesTextContent(target.querySelectorAll(".o_data_cell[name='foo']")),
                ["blip", "yop", "blip", "gnap"]
            );
            assert.verifySteps([
                "web_read_group.orderby: default order",
                "web_search_read.orderby: default order",
                "web_search_read.orderby: default order",
            ]);

            await click(target.querySelector(".o_column_sortable[data-name='foo']"));
            assert.deepEqual(
                getNodesTextContent(target.querySelectorAll(".o_data_cell[name='foo']")),
                ["blip", "blip", "gnap", "yop"]
            );
            assert.verifySteps([
                "web_read_group.orderby: default order",
                "web_search_read.orderby: foo ASC",
                "web_search_read.orderby: foo ASC",
            ]);
        }
    );

    QUnit.test("properly apply onchange in simple case", async function (assert) {
        serverData.models.foo.onchanges = {
            foo: function (obj) {
                obj.int_field = obj.foo.length + 1000;
            },
        };
        await makeView({
            type: "list",
            resModel: "foo",
            serverData,
            arch: '<tree editable="top"><field name="foo"/><field name="int_field"/></tree>',
        });

        await click(target.querySelector(".o_field_cell"));

        assert.strictEqual(
            target.querySelector(".o_field_widget[name=int_field] input").value,
            "10",
            "should contain initial value"
        );

        await editInput(target, ".o_field_widget[name=foo] input", "tralala");

        assert.strictEqual(
            target.querySelector(".o_field_widget[name=int_field] input").value,
            "1007",
            "should contain input with onchange applied"
        );
    });

    QUnit.test("column width should not change when switching mode", async function (assert) {
        // Warning: this test is css dependant
        await makeView({
            type: "list",
            resModel: "foo",
            serverData,
            arch: `
                <tree editable="top">
                    <field name="foo"/>
                    <field name="int_field" readonly="1"/>
                    <field name="m2o"/>
                    <field name="m2m" widget="many2many_tags"/>
                </tree>`,
        });

        var startWidths = [...target.querySelectorAll("thead th")].map((el) => el.offsetWidth);
        var startWidth = window.getComputedStyle(target.querySelector("table")).width;

        // start edition of first row
        await click(target.querySelector("td:not(.o_list_record_selector)"));

        var editionWidths = [...target.querySelectorAll("thead th")].map((el) => el.offsetWidth);
        var editionWidth = window.getComputedStyle(target.querySelector("table")).width;

        // leave edition
        await click($(".o_list_button_save:visible").get(0));

        var readonlyWidths = [...target.querySelectorAll("thead th")].map((el) => el.offsetWidth);
        var readonlyWidth = window.getComputedStyle(target.querySelector("table")).width;

        assert.strictEqual(
            editionWidth,
            startWidth,
            "table should have kept the same width when switching from readonly to edit mode"
        );
        assert.deepEqual(
            editionWidths,
            startWidths,
            "width of columns should remain unchanged when switching from readonly to edit mode"
        );
        assert.strictEqual(
            readonlyWidth,
            editionWidth,
            "table should have kept the same width when switching from edit to readonly mode"
        );
        assert.deepEqual(
            readonlyWidths,
            editionWidths,
            "width of columns should remain unchanged when switching from edit to readonly mode"
        );
    });

    QUnit.test(
        "column widths should depend on the content when there is data",
        async function (assert) {
            serverData.models.foo.records[0].foo = "Some very very long value for a char field";

            await makeView({
                type: "list",
                resModel: "foo",
                serverData,
                arch: `
                    <tree editable="top">
                        <field name="bar"/>
                        <field name="foo"/>
                        <field name="int_field"/>
                        <field name="qux"/>
                        <field name="date"/>
                        <field name="datetime"/>
                    </tree>`,
                limit: 2,
            });

            assert.strictEqual(
                target.querySelector("thead .o_list_record_selector").offsetWidth,
                41
            );
            const widthPage1 = target.querySelector(`th[data-name=foo]`).offsetWidth;

            await pagerNext(target);

            assert.strictEqual(
                target.querySelector("thead .o_list_record_selector").offsetWidth,
                41
            );
            const widthPage2 = target.querySelector(`th[data-name=foo]`).offsetWidth;
            assert.ok(
                widthPage1 > widthPage2,
                "column widths should be computed dynamically according to the content"
            );
        }
    );

    QUnit.test(
        "width of some of the fields should be hardcoded if no data",
        async function (assert) {
            const assertions = [
                { field: "bar", expected: 70, type: "Boolean" },
                { field: "int_field", expected: 74, type: "Integer" },
                { field: "qux", expected: 92, type: "Float" },
                { field: "date", expected: 92, type: "Date" },
                { field: "datetime", expected: 146, type: "Datetime" },
                { field: "amount", expected: 104, type: "Monetary" },
            ];
            assert.expect(9);

            serverData.models.foo.records = [];
            await makeView({
                type: "list",
                resModel: "foo",
                serverData,
                arch: `
                    <tree editable="top">
                        <field name="bar"/>
                        <field name="foo"/>
                        <field name="int_field"/>
                        <field name="qux"/>
                        <field name="date"/>
                        <field name="datetime"/>
                        <field name="amount"/>
                        <field name="currency_id" width="25px"/>
                    </tree>`,
            });

            assert.containsN(target, ".o_resize", 8);
            assertions.forEach((a) => {
                assert.strictEqual(
                    target.querySelector(`th[data-name="${a.field}"]`).offsetWidth,
                    a.expected,
                    `Field ${a.type} should have a fixed width of ${a.expected} pixels`
                );
            });
            assert.strictEqual(
                target.querySelector('th[data-name="foo"]').style.width,
                "100%",
                "Char field should occupy the remaining space"
            );
            assert.strictEqual(
                target.querySelector('th[data-name="currency_id"]').offsetWidth,
                25,
                "Currency field should have a fixed width of 25px (see arch)"
            );
        }
    );

    QUnit.test("colspan of empty lines is correct in readonly", async function (assert) {
        serverData.models.foo.fields.foo_o2m = {
            string: "Foo O2M",
            type: "one2many",
            relation: "foo",
        };
        await makeView({
            type: "form",
            resModel: "foo",
            serverData,
            resId: 1,
            arch: `
                    <form edit="0">
                        <sheet>
                            <field name="foo_o2m">
                                <tree editable="bottom">
                                    <field name="int_field"/>
                                </tree>
                            </field>
                        </sheet>
                    </form>`,
        });
        // in readonly mode, the delete action is not available
        assert.strictEqual(target.querySelector("tbody td").getAttribute("colspan"), "1");
    });

    QUnit.test("colspan of empty lines is correct in edit", async function (assert) {
        serverData.models.foo.fields.foo_o2m = {
            string: "Foo O2M",
            type: "one2many",
            relation: "foo",
        };
        await makeView({
            type: "form",
            resModel: "foo",
            serverData,
            resId: 1,
            arch: `
                    <form>
                        <sheet>
                            <field name="foo_o2m">
                                <tree editable="bottom">
                                    <field name="int_field"/>
                                </tree>
                            </field>
                        </sheet>
                    </form>`,
        });
        // in edit mode, the delete action is available and the empty lines should cover that col
        assert.strictEqual(target.querySelector("tbody td").getAttribute("colspan"), "2");
    });

    QUnit.test(
        "colspan of empty lines is correct in readonly with optional fields",
        async function (assert) {
            serverData.models.foo.fields.foo_o2m = {
                string: "Foo O2M",
                type: "one2many",
                relation: "foo",
            };
            await makeView({
                type: "form",
                resModel: "foo",
                serverData,
                resId: 1,
                arch: `
                    <form edit="0">
                        <sheet>
                            <field name="foo_o2m">
                                <tree editable="bottom">
                                    <field name="int_field"/>
                                    <field name="foo" optional="hidden"/>
                                </tree>
                            </field>
                        </sheet>
                    </form>`,
            });
            // in readonly mode, the delete action is not available but the optional fields is and the empty lines should cover that col
            assert.strictEqual(target.querySelector("tbody td").getAttribute("colspan"), "2");
        }
    );

    QUnit.test(
        "colspan of empty lines is correct in edit with optional fields",
        async function (assert) {
            serverData.models.foo.fields.foo_o2m = {
                string: "Foo O2M",
                type: "one2many",
                relation: "foo",
            };
            await makeView({
                type: "form",
                resModel: "foo",
                serverData,
                resId: 1,
                arch: `
                    <form>
                        <sheet>
                            <field name="foo_o2m">
                                <tree editable="bottom">
                                    <field name="int_field"/>
                                    <field name="foo" optional="hidden"/>
                                </tree>
                            </field>
                        </sheet>
                    </form>`,
            });
            // in edit mode, both the delete action and the optional fields are available and the empty lines should cover that col
            assert.strictEqual(target.querySelector("tbody td").getAttribute("colspan"), "2");
        }
    );

    QUnit.test(
        "width of some fields should be hardcoded if no data, and list initially invisible",
        async function (assert) {
            const assertions = [
                { field: "bar", expected: 70, type: "Boolean" },
                { field: "int_field", expected: 74, type: "Integer" },
                { field: "qux", expected: 92, type: "Float" },
                { field: "date", expected: 92, type: "Date" },
                { field: "datetime", expected: 146, type: "Datetime" },
                { field: "amount", expected: 104, type: "Monetary" },
            ];
            assert.expect(12);

            serverData.models.foo.fields.foo_o2m = {
                string: "Foo O2M",
                type: "one2many",
                relation: "foo",
            };
            await makeView({
                type: "form",
                resModel: "foo",
                serverData,
                resId: 1,
                mode: "edit",
                arch: `
                    <form>
                        <sheet>
                            <notebook>
                                <page string="Page1"></page>
                                <page string="Page2">
                                    <field name="foo_o2m">
                                        <tree editable="bottom">
                                            <field name="bar"/>
                                            <field name="foo"/>
                                            <field name="int_field"/>
                                            <field name="qux"/>
                                            <field name="date"/>
                                            <field name="datetime"/>
                                            <field name="amount"/>
                                            <field name="currency_id" width="25px"/>
                                        </tree>
                                    </field>
                                </page>
                            </notebook>
                        </sheet>
                    </form>`,
            });

            assert.containsNone(target, ".o_field_one2many");

            await click(target.querySelector(".nav-item:last-child .nav-link"));

            assert.isVisible(target.querySelector(".o_field_one2many"));

            assert.containsN(target, ".o_field_one2many .o_resize", 8);
            assertions.forEach((a) => {
                assert.strictEqual(
                    target.querySelector(`.o_field_one2many th[data-name="${a.field}"]`).style
                        .width,
                    `${a.expected}px`,
                    `Field ${a.type} should have a fixed width of ${a.expected} pixels`
                );
            });
            assert.strictEqual(
                target.querySelector('.o_field_one2many th[data-name="foo"]').style.width,
                "100%",
                "Char field should occupy the remaining space"
            );
            assert.strictEqual(
                target.querySelector('th[data-name="currency_id"]').offsetWidth,
                25,
                "Currency field should have a fixed width of 25px (see arch)"
            );
            assert.strictEqual(target.querySelector(".o_list_actions_header").offsetWidth, 32);
        }
    );

    QUnit.test(
        "empty editable list with the handle widget and no content help",
        async function (assert) {
            // no records for the foo model
            serverData.models.foo.records = [];

            await makeView({
                type: "list",
                resModel: "foo",
                serverData,
                arch: `
                    <tree editable="bottom">
                        <field name="int_field" widget="handle" />
                        <field name="foo" />
                    </tree>`,
                noContentHelp: '<p class="hello">click to add a foo</p>',
            });

            assert.containsOnce(target, ".o_view_nocontent", "should have no content help");

            // click on create button
            await click($(".o_list_button_add:visible").get(0));
            const handleWidgetWidth = "33px";
            const handleWidgetHeader = target.querySelector("thead > tr > th.o_handle_cell");

            assert.strictEqual(
                window.getComputedStyle(handleWidgetHeader).width,
                handleWidgetWidth,
                "While creating first record, width should be applied to handle widget."
            );

            // creating one record
            await editInput(target, ".o_selected_row [name='foo'] input", "test_foo");
            await clickSave(target);
            assert.strictEqual(
                window.getComputedStyle(handleWidgetHeader).width,
                handleWidgetWidth,
                "After creation of the first record, width of the handle widget should remain as it is"
            );
        }
    );

    QUnit.test("editable list: overflowing table", async function (assert) {
        serverData.models.bar = {
            fields: {
                titi: { string: "Small char", type: "char", sortable: true },
                grosminet: { string: "Beeg char", type: "char", sortable: true },
            },
            records: [
                {
                    id: 1,
                    titi: "Tiny text",
                    grosminet:
                        // Just want to make sure that the table is overflowed
                        `Lorem ipsum dolor sit amet, consectetur adipiscing elit.
                        Donec est massa, gravida eget dapibus ac, eleifend eget libero.
                        Suspendisse feugiat sed massa eleifend vestibulum. Sed tincidunt
                        velit sed lacinia lacinia. Nunc in fermentum nunc. Vestibulum ante
                        ipsum primis in faucibus orci luctus et ultrices posuere cubilia
                        Curae; Nullam ut nisi a est ornare molestie non vulputate orci.
                        Nunc pharetra porta semper. Mauris dictum eu nulla a pulvinar. Duis
                        eleifend odio id ligula congue sollicitudin. Curabitur quis aliquet
                        nunc, ut aliquet enim. Suspendisse malesuada felis non metus
                        efficitur aliquet.`,
                },
            ],
        };
        await makeView({
            type: "list",
            resModel: "bar",
            serverData,
            arch: `
                <tree editable="top">
                    <field name="titi"/>
                    <field name="grosminet" widget="char"/>
                </tree>`,
        });

        assert.strictEqual(
            target.querySelector("table").offsetWidth,
            target.querySelector(".o_list_renderer").offsetWidth,
            "Table should not be stretched by its content"
        );
    });

    QUnit.test("editable list: overflowing table (3 columns)", async function (assert) {
        const longText = `Lorem ipsum dolor sit amet, consectetur adipiscing elit.
                        Donec est massa, gravida eget dapibus ac, eleifend eget libero.
                        Suspendisse feugiat sed massa eleifend vestibulum. Sed tincidunt
                        velit sed lacinia lacinia. Nunc in fermentum nunc. Vestibulum ante
                        ipsum primis in faucibus orci luctus et ultrices posuere cubilia
                        Curae; Nullam ut nisi a est ornare molestie non vulputate orci.
                        Nunc pharetra porta semper. Mauris dictum eu nulla a pulvinar. Duis
                        eleifend odio id ligula congue sollicitudin. Curabitur quis aliquet
                        nunc, ut aliquet enim. Suspendisse malesuada felis non metus
                        efficitur aliquet.`;

        serverData.models.bar = {
            fields: {
                titi: { string: "Small char", type: "char", sortable: true },
                grosminet1: { string: "Beeg char 1", type: "char", sortable: true },
                grosminet2: { string: "Beeg char 2", type: "char", sortable: true },
                grosminet3: { string: "Beeg char 3", type: "char", sortable: true },
            },
            records: [
                {
                    id: 1,
                    titi: "Tiny text",
                    grosminet1: longText,
                    grosminet2: longText + longText,
                    grosminet3: longText + longText + longText,
                },
            ],
        };
        await makeView({
            arch: `
                <tree editable="top">
                    <field name="titi"/>
                    <field name="grosminet1" class="large"/>
                    <field name="grosminet3" class="large"/>
                    <field name="grosminet2" class="large"/>
                </tree>`,
            serverData,
            resModel: "bar",
            type: "list",
        });

        assert.strictEqual(
            target.querySelector("table").offsetWidth,
            target.querySelector(".o_list_view").offsetWidth
        );
        const largeCells = target.querySelectorAll(".o_data_cell.large");
        assert.ok(Math.abs(largeCells[0].offsetWidth - largeCells[1].offsetWidth) <= 1);
        assert.ok(Math.abs(largeCells[1].offsetWidth - largeCells[2].offsetWidth) <= 1);
        assert.ok(
            target.querySelector(".o_data_cell:not(.large)").offsetWidth < largeCells[0].offsetWidth
        );
    });

    QUnit.test(
        "editable list: list view in an initially unselected notebook page",
        async function (assert) {
            serverData.models.foo.records = [{ id: 1, o2m: [1] }];
            serverData.models.bar = {
                fields: {
                    titi: { string: "Small char", type: "char", sortable: true },
                    grosminet: { string: "Beeg char", type: "char", sortable: true },
                },
                records: [
                    {
                        id: 1,
                        titi: "Tiny text",
                        grosminet:
                            "Lorem ipsum dolor sit amet, consectetur adipiscing elit. " +
                            "Ut at nisi congue, facilisis neque nec, pulvinar nunc. " +
                            "Vivamus ac lectus velit.",
                    },
                ],
            };
            await makeView({
                type: "form",
                resModel: "foo",
                serverData,
                resId: 1,
                arch: `
                    <form>
                        <sheet>
                            <notebook>
                                <page string="Page1"></page>
                                <page string="Page2">
                                    <field name="o2m">
                                        <tree editable="bottom">
                                            <field name="titi"/>
                                            <field name="grosminet"/>
                                        </tree>
                                    </field>
                                </page>
                            </notebook>
                        </sheet>
                    </form>`,
            });
            assert.containsNone(target, ".o_field_one2many");

            await click(target.querySelector(".nav-item:last-child .nav-link"));
            assert.containsOnce(target, ".o_field_one2many");

            const [titi, grosminet] = target.querySelectorAll(".tab-pane:last-child th");
            assert.ok(
                titi.style.width.split("px")[0] > 80 && grosminet.style.width.split("px")[0] > 500,
                "list has been correctly frozen after being visible"
            );
        }
    );

    QUnit.test("editable list: list view hidden by an invisible modifier", async function (assert) {
        serverData.models.foo.records = [{ id: 1, bar: true, o2m: [1] }];
        serverData.models.bar = {
            fields: {
                titi: { string: "Small char", type: "char", sortable: true },
                grosminet: { string: "Beeg char", type: "char", sortable: true },
            },
            records: [
                {
                    id: 1,
                    titi: "Tiny text",
                    grosminet:
                        "Lorem ipsum dolor sit amet, consectetur adipiscing elit. " +
                        "Ut at nisi congue, facilisis neque nec, pulvinar nunc. " +
                        "Vivamus ac lectus velit.",
                },
            ],
        };
        await makeView({
            type: "form",
            resModel: "foo",
            serverData,
            resId: 1,
            arch: `
                <form>
                    <sheet>
                        <field name="bar"/>
                        <field name="o2m" invisible="bar">
                            <tree editable="bottom">
                                <field name="titi"/>
                                <field name="grosminet"/>
                            </tree>
                        </field>
                    </sheet>
                </form>`,
        });
        assert.containsNone(target, ".o_field_one2many");

        await click(target.querySelector(".o_field_boolean input"));
        assert.containsOnce(target, ".o_field_one2many");

        const [titi, grosminet] = target.querySelectorAll("th");
        assert.ok(
            titi.style.width.split("px")[0] > 80 && grosminet.style.width.split("px")[0] > 700,
            "list has been correctly frozen after being visible"
        );
    });

    QUnit.test("editable list: updating list state while invisible", async function (assert) {
        serverData.models.foo.onchanges = {
            bar: function (obj) {
                obj.o2m = [[5], [0, null, { display_name: "Whatever" }]];
            },
        };
        await makeView({
            type: "form",
            resModel: "foo",
            serverData,
            resId: 1,
            arch: `
                <form>
                    <sheet>
                        <field name="bar"/>
                        <notebook>
                            <page string="Page 1"></page>
                            <page string="Page 2">
                                <field name="o2m">
                                    <tree editable="bottom">
                                        <field name="display_name"/>
                                    </tree>
                                </field>
                            </page>
                        </notebook>
                    </sheet>
                </form>`,
        });
        assert.containsNone(target, ".o_field_one2many");

        await click(target.querySelector(".o_field_boolean input"));
        assert.containsNone(target, ".o_field_one2many");

        await click(target.querySelector(".nav-item:last-child .nav-link"));
        assert.containsOnce(target, ".o_field_one2many");
        assert.strictEqual(
            target.querySelector(".o_field_one2many .o_data_row").textContent,
            "Whatever"
        );
        assert.notEqual(
            target.querySelector("th").style.width,
            "",
            "Column header should have been frozen"
        );
    });

    QUnit.test("empty list: state with nameless and stringless buttons", async function (assert) {
        serverData.models.foo.records = [];
        await makeView({
            type: "list",
            arch: `
                <tree>
                    <field name="foo"/>
                    <button string="choucroute"/>
                    <button icon="fa-heart"/>
                </tree>`,
            serverData,
            resModel: "foo",
        });

        assert.strictEqual(
            [...target.querySelectorAll("th")].find((el) => el.textContent === "Foo").style.width,
            "50%",
            "Field column should be frozen"
        );
        assert.strictEqual(
            target.querySelector("th:last-child").style.width,
            "50%",
            "Buttons column should be frozen"
        );
    });

    QUnit.test("editable list: unnamed columns cannot be resized", async function (assert) {
        serverData.models.foo.records = [{ id: 1, o2m: [1] }];
        serverData.models.bar.records = [{ id: 1, display_name: "Oui" }];
        await makeView({
            type: "form",
            resModel: "foo",
            serverData,
            resId: 1,
            mode: "edit",
            arch: `
                <form>
                    <sheet>
                        <field name="o2m">
                            <tree editable="top">
                                <field name="display_name"/>
                                <button name="the_button" icon="fa-heart"/>
                            </tree>
                        </field>
                    </sheet>
                </form>`,
        });

        const [charTh, buttonTh] = target.querySelectorAll(".o_field_one2many th");
        const thRect = charTh.getBoundingClientRect();
        const resizeRect = charTh.querySelector(".o_resize").getBoundingClientRect();

        assert.ok(
            resizeRect.right - thRect.right <= 1,
            "First resize handle should be attached at the end of the first header"
        );
        assert.containsNone(
            buttonTh,
            ".o_resize",
            "Columns without name should not have a resize handle"
        );
    });

    QUnit.test(
        "editable list view, click on m2o dropdown does not close editable row",
        async function (assert) {
            await makeView({
                type: "list",
                resModel: "foo",
                serverData,
                arch: '<tree editable="top"><field name="m2o"/></tree>',
            });

            await click($(".o_list_button_add:visible").get(0));
            assert.strictEqual(
                target.querySelector(".o_selected_row .o_field_many2one input").value,
                ""
            );
            await click(target.querySelector(".o_selected_row .o_field_many2one input"));
            assert.containsOnce(target, ".o_field_many2one .o-autocomplete--dropdown-menu");

            await click(
                target.querySelector(
                    ".o_field_many2one .o-autocomplete--dropdown-menu .dropdown-item"
                )
            );
            assert.strictEqual(
                target.querySelector(".o_selected_row .o_field_many2one input").value,
                "Value 1"
            );
            assert.containsOnce(target, ".o_selected_row", "should still have editable row");
        }
    );

    QUnit.test(
        "width of some of the fields should be hardcoded if no data (grouped case)",
        async function (assert) {
            const assertions = [
                { field: "bar", expected: 70, type: "Boolean" },
                { field: "int_field", expected: 74, type: "Integer" },
                { field: "qux", expected: 92, type: "Float" },
                { field: "date", expected: 92, type: "Date" },
                { field: "datetime", expected: 146, type: "Datetime" },
                { field: "amount", expected: 104, type: "Monetary" },
            ];
            assert.expect(9);

            await makeView({
                type: "list",
                resModel: "foo",
                serverData,
                arch: `
                    <tree editable="top">
                        <field name="bar"/>
                        <field name="foo"/>
                        <field name="int_field"/>
                        <field name="qux"/>
                        <field name="date"/>
                        <field name="datetime"/>
                        <field name="amount"/>
                        <field name="currency_id" width="25px"/>
                    </tree>`,
                groupBy: ["int_field"],
            });

            assert.containsN(target, ".o_resize", 8);
            assertions.forEach((a) => {
                assert.strictEqual(
                    a.expected,
                    target.querySelectorAll(`th[data-name="${a.field}"]`)[0].offsetWidth,
                    `Field ${a.type} should have a fixed width of ${a.expected} pixels`
                );
            });
            assert.strictEqual(
                target.querySelectorAll('th[data-name="foo"]')[0].style.width,
                "100%",
                "Char field should occupy the remaining space"
            );
            assert.strictEqual(
                target.querySelectorAll('th[data-name="currency_id"]')[0].offsetWidth,
                25,
                "Currency field should have a fixed width of 25px (see arch)"
            );
        }
    );

    QUnit.test("column width should depend on the widget", async function (assert) {
        serverData.models.foo.records = []; // the width heuristic only applies when there are no records
        await makeView({
            type: "list",
            resModel: "foo",
            serverData,
            arch: `
                <tree editable="top">
                    <field name="datetime" widget="date"/>
                    <field name="text"/>
                </tree>`,
        });
        assert.strictEqual(
            target.querySelector('th[data-name="datetime"]').offsetWidth,
            92,
            "should be the optimal width to display a date, not a datetime"
        );
    });

    QUnit.test("column widths are kept when adding first record", async function (assert) {
        serverData.models.foo.records = []; // in this scenario, we start with no records
        await makeView({
            type: "list",
            resModel: "foo",
            serverData,
            arch: `
                <tree editable="top">
                    <field name="datetime"/>
                    <field name="text"/>
                </tree>`,
        });

        var width = target.querySelectorAll('th[data-name="datetime"]')[0].offsetWidth;

        await click($(".o_list_button_add:visible").get(0));

        assert.containsOnce(target, ".o_data_row");
        assert.strictEqual(
            target.querySelectorAll('th[data-name="datetime"]')[0].offsetWidth,
            width
        );
    });

    QUnit.test("column widths are kept when editing a record", async function (assert) {
        await makeView({
            type: "list",
            resModel: "foo",
            serverData,
            arch: `
                <tree editable="bottom">
                    <field name="datetime"/>
                    <field name="text"/>
                </tree>`,
        });

        var width = target.querySelectorAll('th[data-name="datetime"]')[0].offsetWidth;

        await click(target.querySelector(".o_data_row:nth-child(1) > .o_data_cell:nth-child(2)"));
        assert.containsOnce(target, ".o_selected_row");

        var longVal =
            "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed blandit, " +
            "justo nec tincidunt feugiat, mi justo suscipit libero, sit amet tempus ipsum purus " +
            "bibendum est.";
        await editInput(target.querySelector(".o_field_widget[name=text] .o_input"), null, longVal);
        await clickSave(target);

        assert.containsNone(target, ".o_selected_row");
        assert.strictEqual(
            target.querySelectorAll('th[data-name="datetime"]')[0].offsetWidth,
            width
        );
    });

    QUnit.test("column widths are kept when switching records in edition", async function (assert) {
        await makeView({
            type: "list",
            resModel: "foo",
            serverData,
            arch: `
                <tree editable="bottom">
                    <field name="m2o"/>
                    <field name="text"/>
                </tree>`,
        });

        const width = target.querySelectorAll('th[data-name="m2o"]')[0].offsetWidth;

        await click(target.querySelector(".o_data_row:nth-child(1) > .o_data_cell:nth-child(2)"));

        assert.hasClass(target.querySelector(".o_data_row:nth-child(1)"), "o_selected_row");
        assert.strictEqual(target.querySelectorAll('th[data-name="m2o"]')[0].offsetWidth, width);

        await click(target.querySelector(".o_data_row:nth-child(2) > .o_data_cell:nth-child(2)"));

        assert.hasClass(target.querySelector(".o_data_row:nth-child(2)"), "o_selected_row");
        assert.strictEqual(target.querySelectorAll('th[data-name="m2o"]')[0].offsetWidth, width);
    });

=======
    QUnit.test(
        "multi_edit: clicking on a readonly field switches the focus to the next editable field",
        async function (assert) {
            await makeView({
                type: "list",
                resModel: "foo",
                serverData,
                arch: `
                <tree multi_edit="1">
                    <field name="int_field" readonly="1"/>
                    <field name="foo" />
                </tree>`,
            });

            const firstRow = target.querySelector(".o_data_row");
            await click(firstRow, ".o_list_record_selector input");

            let intField = firstRow.querySelector("[name='int_field']");
            intField.focus();
            await click(intField);
            assert.strictEqual(
                document.activeElement.closest(".o_field_widget").getAttribute("name"),
                "foo"
            );

            intField = firstRow.querySelector("[name='int_field']");
            intField.focus();
            await click(intField);
            assert.strictEqual(
                document.activeElement.closest(".o_field_widget").getAttribute("name"),
                "foo"
            );
        }
    );

    QUnit.test("save a record with an required field computed by another", async function (assert) {
        serverData.models.foo.onchanges = {
            foo(record) {
                if (record.foo) {
                    record.text = "plop";
                }
            },
        };
        await makeView({
            type: "list",
            resModel: "foo",
            serverData,
            arch: `
                <tree editable="top">
                    <field name="foo"/>
                    <field name="int_field"/>
                    <field name="text" required="1"/>
                </tree>`,
        });
        assert.containsN(target, ".o_data_row", 4);
        assert.containsNone(target, ".o_selected_row");

        await click($(".o_list_button_add:visible").get(0));
        await editInput(target, "[name='int_field'] input", 1);
        await click(target, ".o_list_view");
        assert.containsN(target, ".o_data_row", 5);
        assert.containsOnce(target, ".o_field_invalid");
        assert.containsOnce(target, ".o_selected_row");

        await editInput(target, "[name='foo'] input", "hello");
        assert.containsNone(target, ".o_field_invalid");
        assert.containsOnce(target, ".o_selected_row");

        await click(target, ".o_list_view");
        assert.containsN(target, ".o_data_row", 5);
        assert.containsNone(target, ".o_selected_row");
    });

    QUnit.test("field with nolabel has no title", async function (assert) {
        await makeView({
            type: "list",
            resModel: "foo",
            serverData,
            arch: '<tree><field name="foo" nolabel="1"/></tree>',
        });
        assert.strictEqual($(target).find("thead tr:first th:eq(1)").text(), "");
    });

    QUnit.test("field titles are not escaped", async function (assert) {
        serverData.models.foo.records[0].foo = "<div>Hello</div>";

        await makeView({
            type: "list",
            resModel: "foo",
            serverData,
            arch: '<tree><field name="foo"/></tree>',
        });

        assert.strictEqual(
            $(target).find("tbody tr:first .o_data_cell").text(),
            "<div>Hello</div>"
        );
        assert.strictEqual(
            $(target).find("tbody tr:first .o_data_cell").attr("data-tooltip"),
            "<div>Hello</div>"
        );
    });

    QUnit.test("record-depending invisible lines are correctly aligned", async function (assert) {
        await makeView({
            type: "list",
            resModel: "foo",
            serverData,
            arch: `
                <tree>
                    <field name="foo"/>
                    <field name="bar" invisible="id == 1"/>
                    <field name="int_field"/>
                </tree>`,
        });

        assert.containsN(target, ".o_data_row", 4);
        assert.containsN(target, ".o_data_row td", 16); // 4 cells per row
        assert.strictEqual(target.querySelectorAll(".o_data_row td")[2].innerHTML, "");
    });

    QUnit.test("invisble fields must not have a tooltip", async function (assert) {
        await makeView({
            type: "list",
            resModel: "foo",
            serverData,
            arch: `
                <tree>
                    <field name="foo" invisible="id == 1"/>
                </tree>`,
        });

        assert.containsN(target, ".o_data_row", 4);
        assert.containsN(target, ".o_data_row td[data-tooltip]", 3);
    });

    QUnit.test(
        "do not perform extra RPC to read invisible many2one fields",
        async function (assert) {
            serverData.models.foo.fields.m2o.default = 2;

            await makeView({
                type: "list",
                resModel: "foo",
                serverData,
                arch: `
                    <tree editable="top">
                        <field name="foo"/>
                        <field name="m2o" column_invisible="1"/>
                    </tree>`,
                mockRPC(route) {
                    assert.step(route.split("/").pop());
                },
            });

            await click($(".o_list_button_add:visible").get(0));
            assert.verifySteps(
                ["get_views", "web_search_read", "onchange"],
                "no nameget should be done"
            );
        }
    );

    QUnit.test("editable list datepicker destroy widget (edition)", async function (assert) {
        await makeView({
            type: "list",
            resModel: "foo",
            serverData,
            arch: `
                <tree editable="top">
                    <field name="date"/>
                </tree>`,
        });

        assert.containsN(target, ".o_data_row", 4);

        await click(target.querySelector(".o_data_cell"));
        assert.containsOnce(target, ".o_selected_row");

        await click(target, ".o_field_date input");
        assert.containsOnce(target, ".o_datetime_picker");

        triggerHotkey("Escape");
        await nextTick();

        assert.containsNone(target, ".o_selected_row");
        assert.containsN(target, ".o_data_row", 4);
    });

    QUnit.test("editable list datepicker destroy widget (new line)", async function (assert) {
        await makeView({
            type: "list",
            resModel: "foo",
            serverData,
            arch: `<tree editable="top"><field name="date"/></tree>`,
        });

        assert.containsN(target, ".o_data_row", 4, "There should be 4 rows");

        await click($(".o_list_button_add:visible").get(0));
        assert.containsOnce(target, ".o_selected_row");

        await click(target, ".o_field_date input");
        assert.containsOnce(target, ".o_datetime_picker", "datepicker should be opened");
        await triggerEvent(document.activeElement, null, "keydown", { key: "Escape" });

        assert.containsNone(target, ".o_selected_row", "the row is no longer in edition");
        assert.containsN(target, ".o_data_row", 4, "There should still be 4 rows");
    });

    QUnit.test("at least 4 rows are rendered, even if less data", async function (assert) {
        await makeView({
            type: "list",
            resModel: "foo",
            serverData,
            arch: '<tree><field name="bar"/></tree>',
            domain: [["bar", "=", true]],
        });

        assert.containsN(target, "tbody tr", 4, "should have 4 rows");
    });

    QUnit.test(
        'discard a new record in editable="top" list with less than 4 records',
        async function (assert) {
            await makeView({
                type: "list",
                resModel: "foo",
                serverData,
                arch: '<tree editable="top"><field name="bar"/></tree>',
                domain: [["bar", "=", true]],
            });
            assert.containsN(target, ".o_data_row", 3);
            assert.containsN(target, "tbody tr", 4);

            await click($(".o_list_button_add:visible").get(0));
            assert.containsN(target, ".o_data_row", 4);
            assert.hasClass(target.querySelector("tbody tr"), "o_selected_row");

            await click(target.querySelector(".o_list_button_discard:not(.dropdown-item)"));
            assert.containsN(target, ".o_data_row", 3);
            assert.containsN(target, "tbody tr", 4);
            assert.hasClass(target.querySelector("tbody tr"), "o_data_row");
        }
    );

    QUnit.test("basic grouped list rendering", async function (assert) {
        await makeView({
            type: "list",
            resModel: "foo",
            serverData,
            arch: '<tree><field name="foo"/><field name="bar"/></tree>',
            groupBy: ["bar"],
        });

        assert.strictEqual($(target).find("th:contains(Foo)").length, 1, "should contain Foo");
        assert.strictEqual($(target).find("th:contains(Bar)").length, 1, "should contain Bar");
        assert.containsN(target, "tr.o_group_header", 2, "should have 2 .o_group_header");
        assert.containsN(target, "th.o_group_name", 2, "should have 2 .o_group_name");
    });

    QUnit.test('basic grouped list rendering with widget="handle" col', async function (assert) {
        await makeView({
            type: "list",
            resModel: "foo",
            serverData,
            arch: `
                <tree>
                    <field name="int_field" widget="handle"/>
                    <field name="foo"/>
                    <field name="bar"/>
                </tree>`,
            groupBy: ["bar"],
        });

        assert.containsN(target, "thead th", 3); // record selector + Foo + Bar
        assert.containsOnce(target, "thead th.o_list_record_selector");
        assert.containsOnce(target, "thead th[data-name=foo]");
        assert.containsOnce(target, "thead th[data-name=bar]");
        assert.containsNone(target, "thead th[data-name=int_field]");
        assert.containsN(target, "tr.o_group_header", 2);
        assert.containsN(target, "th.o_group_name", 2);
        assert.containsN(target.querySelector(".o_group_header"), "th", 2); // group name + colspan 2
        assert.containsNone(target.querySelector(".o_group_header"), ".o_list_number");
    });

    QUnit.test(
        "basic grouped list rendering with a date field between two fields with a aggregator",
        async function (assert) {
            await makeView({
                type: "list",
                resModel: "foo",
                serverData,
                arch: `
                <tree>
                    <field name="int_field"/>
                    <field name="date"/>
                    <field name="int_field"/>
                </tree>`,
                groupBy: ["bar"],
            });

            assert.containsN(target, "thead th", 4); // record selector + Foo + Int + Date + Int
            assert.containsOnce(target, "thead th.o_list_record_selector");
            assert.deepEqual(getNodesTextContent(target.querySelectorAll("thead th")), [
                "",
                "int_field",
                "Some Date",
                "int_field",
            ]);
            assert.containsN(target, "tr.o_group_header", 2);
            assert.containsN(target, "th.o_group_name", 2);
            assert.deepEqual(
                getNodesTextContent(target.querySelector(".o_group_header").querySelectorAll("td")),
                ["-4", "", "-4"]
            );
        }
    );

    QUnit.test("basic grouped list rendering 1 col without selector", async function (assert) {
        await makeView({
            type: "list",
            resModel: "foo",
            serverData,
            arch: '<tree><field name="foo"/></tree>',
            groupBy: ["bar"],
            allowSelectors: false,
        });

        assert.containsOnce(target.querySelector(".o_group_header"), "th");
        assert.strictEqual(target.querySelector(".o_group_header th").getAttribute("colspan"), "1");
    });

    QUnit.test("basic grouped list rendering 1 col with selector", async function (assert) {
        await makeView({
            type: "list",
            resModel: "foo",
            serverData,
            arch: '<tree><field name="foo"/></tree>',
            groupBy: ["bar"],
        });

        assert.containsOnce(target.querySelector(".o_group_header"), "th");
        assert.strictEqual(target.querySelector(".o_group_header th").getAttribute("colspan"), "2");
    });

    QUnit.test("basic grouped list rendering 2 cols without selector", async function (assert) {
        await makeView({
            type: "list",
            resModel: "foo",
            serverData,
            arch: '<tree ><field name="foo"/><field name="bar"/></tree>',
            groupBy: ["bar"],
            allowSelectors: false,
        });

        assert.containsN(target.querySelector(".o_group_header"), "th", 2);
        assert.strictEqual(target.querySelector(".o_group_header th").getAttribute("colspan"), "1");
    });

    QUnit.test("basic grouped list rendering 3 cols without selector", async function (assert) {
        await makeView({
            type: "list",
            resModel: "foo",
            serverData,
            arch: '<tree ><field name="foo"/><field name="bar"/><field name="text"/></tree>',
            groupBy: ["bar"],
            allowSelectors: false,
        });

        assert.containsN(target.querySelector(".o_group_header"), "th", 2);
        assert.strictEqual(target.querySelector(".o_group_header th").getAttribute("colspan"), "2");
    });

    QUnit.test("basic grouped list rendering 2 col with selector", async function (assert) {
        await makeView({
            type: "list",
            resModel: "foo",
            serverData,
            arch: '<tree ><field name="foo"/><field name="bar"/></tree>',
            groupBy: ["bar"],
            allowSelectors: true,
        });

        assert.containsN(target.querySelector(".o_group_header"), "th", 2);
        assert.strictEqual(target.querySelector(".o_group_header th").getAttribute("colspan"), "2");
    });

    QUnit.test("basic grouped list rendering 3 cols with selector", async function (assert) {
        await makeView({
            type: "list",
            resModel: "foo",
            serverData,
            arch: '<tree><field name="foo"/><field name="bar"/><field name="text"/></tree>',
            groupBy: ["bar"],
            allowSelectors: true,
        });

        assert.containsN(target.querySelector(".o_group_header"), "th", 2);
        assert.strictEqual(target.querySelector(".o_group_header th").getAttribute("colspan"), "3");
    });

    QUnit.test(
        "basic grouped list rendering 7 cols with aggregates and selector",
        async function (assert) {
            await makeView({
                type: "list",
                resModel: "foo",
                serverData,
                arch: `
                    <tree>
                        <field name="datetime"/>
                        <field name="foo"/>
                        <field name="int_field" sum="Sum1"/>
                        <field name="bar"/>
                        <field name="qux" sum="Sum2"/>
                        <field name="date"/>
                        <field name="text"/>
                    </tree>`,
                groupBy: ["bar"],
            });

            assert.containsN(target.querySelector(".o_group_header"), "th,td", 5);
            assert.strictEqual(
                target.querySelector(".o_group_header th").getAttribute("colspan"),
                "3"
            );
            assert.containsN(
                target.querySelector(".o_group_header"),
                "td",
                3,
                "there should be 3 tds (aggregates + fields in between)"
            );
            assert.strictEqual(
                target.querySelector(".o_group_header th:last-child").getAttribute("colspan"),
                "2",
                "header last cell should span on the two last fields (to give space for the pager) (colspan 2)"
            );
        }
    );

    QUnit.test(
        "basic grouped list rendering 7 cols with aggregates, selector and optional",
        async function (assert) {
            await makeView({
                type: "list",
                resModel: "foo",
                serverData,
                arch: `
                    <tree>
                        <field name="datetime"/>
                        <field name="foo"/>
                        <field name="int_field" sum="Sum1"/>
                        <field name="bar"/>
                        <field name="qux" sum="Sum2"/>
                        <field name="date"/>
                        <field name="text" optional="show"/>
                    </tree>`,
                groupBy: ["bar"],
            });

            assert.containsN(target.querySelector(".o_group_header"), "th,td", 5);
            assert.strictEqual(
                target.querySelector(".o_group_header th").getAttribute("colspan"),
                "3"
            );
            assert.containsN(
                target.querySelector(".o_group_header"),
                "td",
                3,
                "there should be 3 tds (aggregates + fields in between)"
            );
            assert.strictEqual(
                target.querySelector(".o_group_header th:last-child").getAttribute("colspan"),
                "3",
                "header last cell should span on the two last fields (to give space for the pager) (colspan 2)"
            );
        }
    );

    QUnit.test(
        "basic grouped list rendering 4 cols with aggregates, selector and openFormView",
        async function (assert) {
            await makeView({
                type: "list",
                resModel: "foo",
                serverData,
                arch: `
                    <tree open_form_view="True">
                        <field name="datetime"/>
                        <field name="int_field" sum="Sum1"/>
                        <field name="bar"/>
                        <field name="qux" sum="Sum2" optional="hide"/>
                    </tree>`,
                groupBy: ["bar"],
            });

            assert.strictEqual(
                target.querySelector(".o_group_header th").getAttribute("colspan"), "2"
            );
            assert.strictEqual(
                target.querySelector(".o_group_header th:last-child").getAttribute("colspan"),
                "2",
            );
        }
    );

    QUnit.test(
        "basic grouped list rendering 4 cols with aggregates, selector, optional and openFormView",
        async function (assert) {
            await makeView({
                type: "list",
                resModel: "foo",
                serverData,
                arch: `
                    <tree open_form_view="True">
                        <field name="datetime"/>
                        <field name="int_field" sum="Sum1"/>
                        <field name="bar"/>
                        <field name="qux" sum="Sum2" optional="show"/>
                    </tree>`,
                groupBy: ["bar"],
            });

            assert.strictEqual(
                target.querySelector(".o_group_header th").getAttribute("colspan"), "2"
            );
            assert.strictEqual(
                target.querySelector(".o_group_header th:last-child").getAttribute("colspan"),
                "1",
            );
        }
    );

    QUnit.test("group a list view with the aggregable field 'value'", async function (assert) {
        serverData.models.foo.fields.value = {
            string: "Value",
            type: "integer",
            aggregator: "sum",
        };
        for (const record of serverData.models.foo.records) {
            record.value = 1;
        }
        await makeView({
            type: "list",
            resModel: "foo",
            serverData,
            arch: `
                    <tree>
                        <field name="bar"/>
                        <field name="value" sum="Sum1"/>
                    </tree>`,
            groupBy: ["bar"],
        });
        assert.containsN(target, ".o_group_header", 2);
        assert.deepEqual(
            [...target.querySelectorAll(".o_group_header")].map((el) => el.textContent),
            ["No (1) 1", "Yes (3) 3"]
        );
    });

    QUnit.test("basic grouped list rendering with groupby m2m field", async function (assert) {
        await makeView({
            type: "list",
            resModel: "foo",
            serverData,
            arch: `
                <tree>
                    <field name="foo"/>
                    <field name="m2m" widget="many2many_tags"/>
                </tree>`,
            groupBy: ["m2m"],
        });

        assert.containsN(target, ".o_group_header", 4, "should contain 4 open groups");
        assert.containsNone(target, ".o_group_open", "no group is open");
        assert.deepEqual(
            [...target.querySelectorAll(".o_group_header .o_group_name")].map((el) => el.innerText),
            ["None (1)", "Value 1 (3)", "Value 2 (2)", "Value 3 (1)"],
            "should have those group headers"
        );

        // Open all groups
        await click(target.querySelectorAll(".o_group_name")[0]);
        await click(target.querySelectorAll(".o_group_name")[1]);
        await click(target.querySelectorAll(".o_group_name")[2]);
        await click(target.querySelectorAll(".o_group_name")[3]);
        assert.containsN(target, ".o_group_open", 4, "all groups are open");

        const rows = target.querySelectorAll(".o_list_view tbody > tr");
        assert.deepEqual(
            [...rows].map((el) => el.innerText.replace(/\s/g, "")),
            [
                "None(1)",
                "gnap",
                "Value1(3)",
                "yopValue1Value2",
                "blipValue1Value2Value3",
                "blipValue1",
                "Value2(2)",
                "yopValue1Value2",
                "blipValue1Value2Value3",
                "Value3(1)",
                "blipValue1Value2Value3",
            ],
            "should have these row contents"
        );
    });

    QUnit.test("grouped list rendering with groupby m2o and m2m field", async function (assert) {
        await makeView({
            type: "list",
            resModel: "foo",
            serverData,
            arch: `
                <tree>
                    <field name="foo"/>
                    <field name="m2o"/>
                    <field name="m2m" widget="many2many_tags"/>
                </tree>`,
            groupBy: ["m2o", "m2m"],
        });

        let rows = target.querySelectorAll("tbody > tr");
        assert.deepEqual(
            [...rows].map((el) => el.innerText.replace(/\s/g, "")),

            ["Value1(3)", "Value2(1)"],
            "should have these row contents"
        );

        await click(target.querySelector("th.o_group_name"));

        rows = target.querySelectorAll("tbody > tr");
        assert.deepEqual(
            [...rows].map((el) => el.innerText.replace(/\s/g, "")),
            ["Value1(3)", "None(1)", "Value1(2)", "Value2(1)", "Value2(1)"],
            "should have these row contents"
        );

        await click(target.querySelectorAll("tbody th.o_group_name")[4]);
        rows = target.querySelectorAll(".o_list_view tbody > tr");

        assert.deepEqual(
            [...rows].map((el) => el.innerText.replace(/\s/g, "")),
            [
                "Value1(3)",
                "None(1)",
                "Value1(2)",
                "Value2(1)",
                "Value2(1)",
                "Value1(1)",
                "Value2(1)",
                "Value3(1)",
            ],
            "should have these row contents"
        );
    });

    QUnit.test("list view with multiple groupbys", async function (assert) {
        await makeView({
            type: "list",
            resModel: "foo",
            serverData,
            arch: '<tree><field name="foo"/><field name="bar"/></tree>',
            groupBy: ["bar", "foo"],
            noContentHelp: "<p>should not be displayed</p>",
        });

        assert.containsNone(target, ".o_view_nocontent");
        assert.containsN(target, ".o_group_has_content", 2);
        assert.deepEqual(getNodesTextContent(target.querySelectorAll(".o_group_has_content")), [
            "No (1) ",
            "Yes (3) ",
        ]);
    });

    QUnit.test("deletion of record is disabled when groupby m2m field", async function (assert) {
        patchUserWithCleanup({ hasGroup: () => Promise.resolve(false) });

        serverData.models.foo.fields.m2m.groupable = true;

        await makeView({
            type: "list",
            resModel: "foo",
            serverData,
            arch: `
                <tree>
                    <field name="foo"/>
                    <field name="m2m" widget="many2many_tags"/>
                </tree>`,
            actionMenus: {},
        });
        await groupByMenu(target, "m2m");

        await click(target.querySelector(".o_group_header:first-child")); // open first group
        await click(target.querySelector(".o_data_row .o_list_record_selector input"));
        assert.containsOnce(target, "div.o_control_panel .o_cp_action_menus");
        assert.containsNone(
            target,
            "div.o_control_panel .o_cp_action_menus .dropdown-toggle",
            "should not have dropdown as delete item is not there"
        );

        // unselect group by m2m (need to unselect record first)
        await click(target.querySelector(".o_data_row .o_list_record_selector input"));
        await click(target, ".o_searchview .o_facet_remove");

        await click(target.querySelector(".o_data_row .o_list_record_selector input"));
        assert.containsOnce(target, "div.o_control_panel .o_cp_action_menus");
        assert.containsOnce(target, "div.o_control_panel .o_cp_action_menus .dropdown-toggle");
        await click(target, "div.o_control_panel .o_cp_action_menus .dropdown-toggle");
        assert.deepEqual(
            [...target.querySelectorAll(".o-dropdown--menu .o_menu_item")].map(
                (el) => el.innerText
            ),
            ["Duplicate", "Delete"]
        );
    });

    QUnit.test("add record in list grouped by m2m", async function (assert) {
        assert.expect(7);

        await makeView({
            type: "list",
            resModel: "foo",
            serverData,
            arch: `
                <tree editable="bottom">
                    <field name="foo"/>
                    <field name="m2m" widget="many2many_tags"/>
                </tree>`,
            groupBy: ["m2m"],
            mockRPC(route, args) {
                if (args.method === "onchange") {
                    assert.deepEqual(args.kwargs.context.default_m2m, [1]);
                }
            },
        });

        assert.containsN(target, ".o_group_header", 4);
        assert.deepEqual(getNodesTextContent(target.querySelectorAll(".o_group_header")), [
            "None (1) ",
            "Value 1 (3) ",
            "Value 2 (2) ",
            "Value 3 (1) ",
        ]);

        await click(target.querySelectorAll(".o_group_header")[1]);
        assert.containsN(target, ".o_data_row", 3);

        await click(target, ".o_group_field_row_add a");
        assert.containsOnce(target, ".o_selected_row");
        assert.containsOnce(target, ".o_selected_row .o_field_tags .o_tag");
        assert.strictEqual(
            target.querySelector(".o_selected_row .o_field_tags .o_tag").innerText,
            "Value 1"
        );
    });

    QUnit.test("grouped list with (disabled) pager inside group", async function (assert) {
        let def;
        await makeView({
            type: "list",
            resModel: "foo",
            serverData,
            arch: `
                <tree limit="2">
                    <field name="foo"/>
                </tree>`,
            mockRPC(route, args) {
                if (args.method === "web_search_read") {
                    return def;
                }
            },
            groupBy: ["m2o"],
        });

        assert.containsN(target, ".o_group_header", 2);

        await click(target.querySelector(".o_group_header"));
        assert.containsN(target, ".o_data_row", 2);
        assert.containsOnce(target, ".o_group_header .o_pager");

        def = makeDeferred();
        await click(target.querySelector(".o_group_header .o_pager_next"));
        assert.strictEqual(target.querySelector(".o_group_header .o_pager_next").disabled, true);

        // simulate a second click on pager_next, which is now disabled, so the click bubbles up
        await click(target.querySelector(".o_group_header .o_pager"));
        assert.containsN(target, ".o_data_row", 2);
    });

    QUnit.test(
        "editing a record should change same record in other groups when grouped by m2m field",
        async function (assert) {
            await makeView({
                type: "list",
                resModel: "foo",
                serverData,
                arch: `
                    <tree editable="bottom">
                        <field name="foo"/>
                        <field name="m2m" widget="many2many_tags"/>
                    </tree>`,
                groupBy: ["m2m"],
            });
            await click(target.querySelectorAll(".o_group_header")[1]); // open Value 1 group
            await click(target.querySelectorAll(".o_group_header")[2]); // open Value 2 group
            const rows = target.querySelectorAll(".o_data_row");
            assert.strictEqual(rows[0].querySelector(".o_list_char").textContent, "yop");
            assert.strictEqual(rows[3].querySelector(".o_list_char").textContent, "yop");

            await click(target.querySelector(".o_data_row .o_list_record_selector input"));
            await click(target.querySelector(".o_data_row .o_data_cell"));
            await editInput(rows[0], ".o_data_row .o_list_char input", "xyz");
            await click(target, ".o_list_view");
            assert.strictEqual(rows[0].querySelector(".o_list_char").textContent, "xyz");
            assert.strictEqual(rows[3].querySelector(".o_list_char").textContent, "xyz");
        }
    );

    QUnit.test(
        "change a record field in readonly should change same record in other groups when grouped by m2m field",
        async function (assert) {
            assert.expect(6);

            serverData.models.foo.fields.priority = {
                string: "Priority",
                type: "selection",
                selection: [
                    [0, "Not Prioritary"],
                    [1, "Prioritary"],
                ],
                default: 0,
            };

            await makeView({
                type: "list",
                resModel: "foo",
                serverData,
                arch: `
                    <tree>
                        <field name="foo"/>
                        <field name="priority" widget="priority"/>
                        <field name="m2m" widget="many2many_tags"/>
                    </tree>`,
                groupBy: ["m2m"],
                domain: [["m2o", "=", 1]],
                mockRPC(route, args) {
                    if (args.method === "web_save") {
                        assert.deepEqual(args.args[0], [1], "should write on the correct record");
                        assert.deepEqual(
                            args.args[1],
                            {
                                priority: 1,
                            },
                            "should write these changes"
                        );
                    }
                },
            });

            await click(target.querySelectorAll(".o_group_header")[1]); // open Value 1 group
            await click(target.querySelectorAll(".o_group_header")[2]); // open Value 2 group
            const rows = target.querySelectorAll(".o_data_row");
            assert.strictEqual(rows[0].querySelector(".o_list_char").textContent, "yop");
            assert.strictEqual(rows[2].querySelector(".o_list_char").textContent, "yop");
            assert.containsNone(
                target,
                ".o_priority_star.fa-star",
                "should not have any starred records"
            );

            await click(rows[0].querySelector(".o_priority_star"));
            assert.containsN(
                target,
                ".o_priority_star.fa-star",
                2,
                "both 'yop' records should have been starred"
            );
        }
    );

    QUnit.test("ordered target, sort attribute in context", async function (assert) {
        serverData.models.foo.fields.foo.sortable = true;
        serverData.models.foo.fields.date.sortable = true;

        await makeView({
            type: "list",
            resModel: "foo",
            serverData,
            arch: '<tree><field name="foo"/><field name="date"/></tree>',
            mockRPC: (route, args) => {
                if (args.method === "create_or_replace") {
                    const favorite = args.args[0];
                    assert.step(favorite.sort);
                    return 7;
                }
            },
        });

        // Descending order on Foo
        await click(target, "th.o_column_sortable[data-name=foo]");
        await click(target, "th.o_column_sortable[data-name=foo]");

        // Ascending order on Date
        await click(target, "th.o_column_sortable[data-name=date]");

        await toggleSearchBarMenu(target);
        await toggleSaveFavorite(target);
        await editFavoriteName(target, "My favorite");
        await saveFavorite(target);

        assert.verifySteps(['["date","foo desc"]']);
    });

    QUnit.test("Loading a filter with a sort attribute", async function (assert) {
        assert.expect(2);

        serverData.models.foo.fields.foo.sortable = true;
        serverData.models.foo.fields.date.sortable = true;

        let searchReads = 0;
        await makeView({
            type: "list",
            resModel: "foo",
            serverData,
            arch: `
                <tree>
                    <field name="foo"/>
                    <field name="date"/>
                </tree>`,
            mockRPC(route, args) {
                if (args.method === "web_search_read") {
                    if (searchReads === 0) {
                        assert.strictEqual(
                            args.kwargs.order,
                            "date ASC, foo DESC",
                            "The sort attribute of the filter should be used by the initial search_read"
                        );
                    } else if (searchReads === 1) {
                        assert.strictEqual(
                            args.kwargs.order,
                            "date DESC, foo ASC",
                            "The sort attribute of the filter should be used by the next search_read"
                        );
                    }
                    searchReads += 1;
                }
            },
            irFilters: [
                {
                    context: "{}",
                    domain: "[]",
                    id: 7,
                    is_default: true,
                    name: "My favorite",
                    sort: '["date asc", "foo desc"]',
                    user_id: [2, "Mitchell Admin"],
                },
                {
                    context: "{}",
                    domain: "[]",
                    id: 8,
                    is_default: false,
                    name: "My second favorite",
                    sort: '["date desc", "foo asc"]',
                    user_id: [2, "Mitchell Admin"],
                },
            ],
        });

        await toggleSearchBarMenu(target);
        await toggleMenuItem(target, "My second favorite");
    });

    QUnit.test("many2one field rendering", async function (assert) {
        await makeView({
            type: "list",
            resModel: "foo",
            serverData,
            arch: '<tree><field name="m2o"/></tree>',
        });

        assert.ok(
            $(target).find("td:contains(Value 1)").length,
            "should have the display_name of the many2one"
        );
    });

    QUnit.test("many2one field rendering with many2one widget", async function (assert) {
        serverData.models.bar.records[0].display_name = false;
        await makeView({
            type: "list",
            resModel: "foo",
            serverData,
            arch: '<tree><field name="m2o" widget="many2one"/></tree>',
        });

        assert.ok(
            $(target).find("td:contains(Unnamed)").length,
            "should have a Unnamed as fallback of many2one display_name"
        );
    });

    QUnit.test("many2one field rendering when display_name is falsy", async function (assert) {
        serverData.models.bar.records[0].display_name = false;
        await makeView({
            type: "list",
            resModel: "foo",
            serverData,
            arch: '<tree><field name="m2o"/></tree>',
            mockRPC(route) {
                assert.step(route);
            },
        });

        assert.ok(
            $(target).find("td:contains(Unnamed)").length,
            "should have a Unnamed as fallback of many2one display_name"
        );
        assert.verifySteps([
            "/web/dataset/call_kw/foo/get_views",
            "/web/dataset/call_kw/foo/web_search_read",
        ]);
    });

    QUnit.test("grouped list view, with 1 open group", async function (assert) {
        await makeView({
            type: "list",
            resModel: "foo",
            serverData,
            arch: '<tree><field name="foo"/><field name="int_field"/></tree>',
            groupBy: ["foo"],
        });

        assert.containsN(target, "tr.o_group_header", 3);
        assert.containsNone(target, "tr.o_data_row");

        await click(target.querySelector("th.o_group_name"));
        await nextTick();
        assert.containsN(target, "tr.o_group_header", 3);
        assert.containsN(target, "tr.o_data_row", 2);
        assert.containsOnce(target, "td:contains(9)", "should contain 9");
        assert.containsOnce(target, "td:contains(-4)", "should contain -4");
        assert.containsOnce(target, "td:contains(10)", "should contain 10"); // FIXME: missing aggregates
        assert.containsOnce(
            target,
            "tr.o_group_header td:contains(10)",
            "but 10 should be in a header"
        );
    });

    QUnit.test("opening records when clicking on record", async function (assert) {
        assert.expect(6);

        const listView = registry.category("views").get("list");
        class CustomListController extends listView.Controller {
            openRecord(record) {
                assert.step("openRecord");
                assert.strictEqual(record.resId, 2);
            }
        }
        registry.category("views").add("custom_list", {
            ...listView,
            Controller: CustomListController,
        });

        serverData.models.foo.fields.foo.groupable = true;

        await makeView({
            type: "list",
            resModel: "foo",
            serverData,
            arch: '<tree js_class="custom_list"><field name="foo"/></tree>',
        });

        await click(target.querySelector("tr:nth-child(2) td:not(.o_list_record_selector)"));
        await groupByMenu(target, "foo");

        assert.containsN(target, "tr.o_group_header", 3, "list should be grouped");
        await click(target.querySelector("th.o_group_name"));

        await click(
            target.querySelector("tr:not(.o_group_header) td:not(.o_list_record_selector)")
        );
        assert.verifySteps(["openRecord", "openRecord"]);
    });

    QUnit.test("open invalid but unchanged record", async function (assert) {
        const listView = registry.category("views").get("list");
        class CustomListController extends listView.Controller {
            openRecord(record) {
                assert.step("openRecord");
                assert.strictEqual(record.resId, 2);
                return super.openRecord(record);
            }
        }
        registry.category("views").add("custom_list", {
            ...listView,
            Controller: CustomListController,
        });

        const list = await makeView({
            type: "list",
            resModel: "foo",
            serverData,
            arch: `
                <tree js_class="custom_list">
                    <field name="foo"/>
                    <field name="date" required="1"/>
                </tree>`,
        });

        patchWithCleanup(list.env.services.notification, {
            add: () => {
                throw new Error("should not display a notification");
            },
        });

        // second record is invalid as date is not set
        assert.strictEqual(
            target.querySelector(".o_data_row:nth-child(2) .o_data_cell[name=date]").innerText,
            ""
        );
        await click(target.querySelector(".o_data_row:nth-child(2) .o_data_cell"));
        assert.verifySteps(["openRecord"]);
    });

    QUnit.test(
        "execute an action before and after each valid save in a list view",
        async function (assert) {
            const listView = registry.category("views").get("list");
            class CustomListController extends listView.Controller {
                async onRecordSaved(record) {
                    assert.step(`onRecordSaved ${record.resId}`);
                }

                async onWillSaveRecord(record) {
                    assert.step(`onWillSaveRecord ${record.resId}`);
                }
            }
            registry.category("views").add(
                "custom_list",
                {
                    ...listView,
                    Controller: CustomListController,
                },
                { force: true }
            );

            await makeView({
                type: "list",
                resModel: "foo",
                serverData,
                arch: '<tree js_class="custom_list" editable="top"><field name="foo" required="1"/></tree>',
                mockRPC: async (route, args) => {
                    if (args.method === "web_save") {
                        assert.step(`web_save ${args.args[0]}`);
                    }
                },
            });

            await click(target.querySelector(".o_data_cell"));
            await editInput(target, "[name='foo'] input", "");
            await click(target, ".o_list_view");
            assert.verifySteps([]);

            await editInput(target, "[name='foo'] input", "YOLO");
            await click(target, ".o_list_view");
            assert.verifySteps(["onWillSaveRecord 1", "web_save 1", "onRecordSaved 1"]);
        }
    );

    QUnit.test(
        "execute an action before and after each valid save in a grouped list view",
        async function (assert) {
            const listView = registry.category("views").get("list");
            class CustomListController extends listView.Controller {
                async onRecordSaved(record) {
                    assert.step(`onRecordSaved ${record.resId}`);
                }

                async onWillSaveRecord(record) {
                    assert.step(`onWillSaveRecord ${record.resId}`);
                }
            }
            registry.category("views").add("custom_list", {
                ...listView,
                Controller: CustomListController,
            });

            await makeView({
                type: "list",
                resModel: "foo",
                serverData,
                arch: '<tree js_class="custom_list" editable="top" expand="1"><field name="foo" required="1"/></tree>',
                groupBy: ["bar"],
                mockRPC: async (route, args) => {
                    if (args.method === "web_save") {
                        assert.step(`web_save ${args.args[0]}`);
                    }
                },
            });

            await click(target.querySelector(".o_data_cell[name='foo']"));
            await editInput(target, "[name='foo'] input", "");
            await click(target, ".o_list_view");
            assert.verifySteps([]);

            await editInput(target, "[name='foo'] input", "YOLO");
            await click(target, ".o_list_view");
            assert.verifySteps(["onWillSaveRecord 4", "web_save 4", "onRecordSaved 4"]);
        }
    );

    QUnit.test(
        "don't exec a valid save with onWillSaveRecord in a list view",
        async function (assert) {
            const listView = registry.category("views").get("list");
            class ListViewCustom extends listView.Controller {
                async onRecordSaved(record) {
                    throw new Error("should not execute onRecordSaved");
                }

                async onWillSaveRecord(record) {
                    assert.step(`onWillSaveRecord ${record.resId}`);
                    return false;
                }
            }
            registry.category("views").add(
                "list",
                {
                    ...listView,
                    Controller: ListViewCustom,
                },
                { force: true }
            );

            await makeView({
                type: "list",
                resModel: "foo",
                serverData,
                arch: '<tree editable="top"><field name="foo" required="1"/></tree>',
                mockRPC: async (route, args) => {
                    if (args.method === "write") {
                        throw new Error("should not save the record");
                    }
                },
            });

            await click(target.querySelector(".o_data_cell"));
            await editInput(target, "[name='foo'] input", "");
            await click(target, ".o_list_view");
            assert.verifySteps([]);

            await click(target.querySelector(".o_data_cell"));
            await editInput(target, "[name='foo'] input", "YOLO");
            await click(target, ".o_list_view");
            assert.verifySteps(["onWillSaveRecord 1"]);
        }
    );

    QUnit.test("action/type attributes on tree arch, type='object'", async (assert) => {
        const list = await makeView({
            type: "list",
            resModel: "foo",
            serverData,
            arch: '<tree action="a1" type="object"><field name="foo"/></tree>',
            mockRPC(route, args) {
                assert.step(args.method);
            },
        });

        patchWithCleanup(list.env.services.action, {
            doActionButton(params) {
                assert.step(`doActionButton type ${params.type} name ${params.name}`);
                params.onClose();
            },
        });

        assert.verifySteps(["get_views", "web_search_read"]);
        await click(target.querySelector(".o_data_cell"));
        assert.verifySteps(["doActionButton type object name a1", "web_search_read"]);
    });

    QUnit.test("action/type attributes on tree arch, type='action'", async (assert) => {
        const list = await makeView({
            type: "list",
            resModel: "foo",
            serverData,
            arch: '<tree action="a1" type="action"><field name="foo"/></tree>',
            mockRPC(route, args) {
                assert.step(args.method);
            },
        });

        patchWithCleanup(list.env.services.action, {
            doActionButton(params) {
                assert.step(`doActionButton type ${params.type} name ${params.name}`);
                params.onClose();
            },
        });

        assert.verifySteps(["get_views", "web_search_read"]);
        await click(target.querySelector(".o_data_cell"));
        assert.verifySteps(["doActionButton type action name a1", "web_search_read"]);
    });

    QUnit.test("editable list view: readonly fields cannot be edited", async function (assert) {
        serverData.models.foo.fields.foo.readonly = true;

        await makeView({
            type: "list",
            resModel: "foo",
            serverData,
            arch: `
                <tree editable="bottom">
                    <field name="foo"/>
                    <field name="bar"/>
                    <field name="int_field" readonly="1"/>
                </tree>`,
        });
        await click(target.querySelector(".o_field_cell"));
        assert.hasClass(
            target.querySelector(".o_data_row"),
            "o_selected_row",
            "row should be in edit mode"
        );
        assert.hasClass(
            target.querySelector(".o_field_widget[name=foo]"),
            "o_readonly_modifier",
            "foo field should be readonly in edit mode"
        );
        assert.doesNotHaveClass(
            target.querySelector(".o_field_widget[name=bar]"),
            "o_readonly_modifier",
            "bar field should be editable"
        );
        assert.hasClass(
            target.querySelector(".o_field_widget[name=int_field]"),
            "o_readonly_modifier",
            "int_field field should be readonly in edit mode"
        );
        assert.hasClass(target.querySelectorAll(".o_data_cell")[0], "o_readonly_modifier");
    });

    QUnit.test("editable list view: line with no active element", async function (assert) {
        serverData.models.bar = {
            fields: {
                titi: { string: "Char", type: "char" },
                grosminet: { string: "Bool", type: "boolean" },
            },
            records: [
                { id: 1, titi: "cui", grosminet: true },
                { id: 2, titi: "cuicui", grosminet: false },
            ],
        };
        serverData.models.foo.records[0].o2m = [1, 2];

        await makeView({
            type: "form",
            resModel: "foo",
            serverData,
            resId: 1,
            arch: `
                <form>
                    <field name="o2m">
                        <tree editable="top">
                            <field name="titi" readonly="1"/>
                            <field name="grosminet" widget="boolean_toggle"/>
                        </tree>
                    </field>
                </form>`,
            mockRPC(route, args) {
                if (args.method === "web_save") {
                    assert.step("web_save");
                }
            },
        });

        assert.hasClass(target.querySelectorAll(".o_data_cell")[1], "o_boolean_toggle_cell");

        await click(target.querySelectorAll(".o_data_cell")[0]);
        assert.hasClass(target.querySelector(".o_data_row"), "o_selected_row");
        assert.containsOnce(target.querySelectorAll(".o_data_cell")[0], ".o_readonly_modifier");
        await click(target.querySelectorAll(".o_data_cell")[1], ".o_boolean_toggle input");
        assert.verifySteps([]);
    });

    QUnit.test(
        "editable list view: click on last element after creation empty new line",
        async function (assert) {
            serverData.models.bar = {
                fields: {
                    titi: { string: "Char", type: "char", required: true },
                    int_field: {
                        string: "int_field",
                        type: "integer",
                        sortable: true,
                        required: true,
                    },
                },
                records: [
                    { id: 1, titi: "cui", int_field: 2 },
                    { id: 2, titi: "cuicui", int_field: 4 },
                ],
            };
            serverData.models.foo.records[0].o2m = [1, 2];

            await makeView({
                type: "form",
                resModel: "foo",
                serverData,
                resId: 1,
                arch: `
                    <form>
                        <field name="o2m">
                            <tree editable="top">
                            <field name="int_field" widget="handle"/>
                            <field name="titi"/>
                            </tree>
                        </field>
                    </form>`,
            });
            await addRow(target);
            await click(
                [...target.querySelectorAll(".o_data_row")].pop().querySelector("td.o_list_char")
            );
            // This test ensure that they aren't traceback when clicking on the last row.
            assert.containsN(target, ".o_data_row", 2, "list should have exactly 2 rows");
        }
    );

    QUnit.test("edit field in editable field without editing the row", async function (assert) {
        // some widgets are editable in readonly (e.g. priority, boolean_toggle...) and they
        // thus don't require the row to be switched in edition to be edited
        await makeView({
            type: "list",
            resModel: "foo",
            serverData,
            arch: `
                <tree editable="top">
                    <field name="foo"/>
                    <field name="bar" widget="boolean_toggle"/>
                </tree>`,
            mockRPC(route, args) {
                if (args.method === "web_save") {
                    assert.step("web_save: " + args.args[1].bar);
                }
            },
        });

        // toggle the boolean value of the first row without editing the row
        assert.ok(target.querySelector(".o_data_row .o_boolean_toggle input").checked);
        assert.containsNone(target, ".o_selected_row");
        await click(target.querySelector(".o_data_row .o_boolean_toggle input"));
        assert.notOk(target.querySelector(".o_data_row .o_boolean_toggle input").checked);
        assert.containsNone(target, ".o_selected_row");
        assert.verifySteps(["web_save: false"]);

        // toggle the boolean value after switching the row in edition
        assert.containsNone(target, ".o_selected_row");
        await click(target.querySelector(".o_data_row .o_data_cell .o_field_boolean_toggle div"));
        assert.containsOnce(target, ".o_selected_row");
        await click(target.querySelector(".o_selected_row .o_field_boolean_toggle div"));
        assert.verifySteps(["web_save: true"]);
    });

    QUnit.test("basic operations for editable list renderer", async function (assert) {
        await makeView({
            type: "list",
            resModel: "foo",
            serverData,
            arch: '<tree editable="bottom"><field name="foo"/><field name="bar"/></tree>',
        });

        assert.containsN(target, ".o_data_row", 4);
        assert.containsNone(target, ".o_data_row .o_selected_row");
        await click(target.querySelector(".o_data_cell"));
        assert.hasClass(target.querySelector(".o_data_row"), "o_selected_row");
    });

    QUnit.test("editable list: add a line and discard", async function (assert) {
        await makeView({
            type: "list",
            resModel: "foo",
            serverData,
            arch: '<tree editable="bottom"><field name="foo"/><field name="bar"/></tree>',
            domain: [["foo", "=", "yop"]],
        });

        assert.containsN(target, "tbody tr", 4, "list should contain 4 rows");
        assert.containsOnce(
            target,
            ".o_data_row",
            "list should contain one record (and thus 3 empty rows)"
        );

        assert.strictEqual(
            target.querySelector(".o_pager_value").innerText,
            "1-1",
            "pager should be correct"
        );

        await click($(".o_list_button_add:visible").get(0));

        assert.containsN(target, "tbody tr", 4, "list should still contain 4 rows");
        assert.containsN(
            target,
            ".o_data_row",
            2,
            "list should contain two record (and thus 2 empty rows)"
        );
        assert.strictEqual(
            target.querySelector(".o_pager_value").innerText,
            "1-2",
            "pager should be correct"
        );

        await click(target.querySelector(".o_list_button_discard:not(.dropdown-item)"));

        assert.containsN(target, "tbody tr", 4, "list should still contain 4 rows");
        assert.containsOnce(
            target,
            ".o_data_row",
            "list should contain one record (and thus 3 empty rows)"
        );
        assert.strictEqual(
            target.querySelector(".o_pager_value").innerText,
            "1-1",
            "pager should be correct"
        );
    });

    QUnit.test("field changes are triggered correctly", async function (assert) {
        serverData.models.foo.onchanges = {
            foo: function () {
                assert.step("onchange");
            },
        };
        await makeView({
            type: "list",
            resModel: "foo",
            serverData,
            arch: '<tree editable="bottom"><field name="foo"/><field name="bar"/></tree>',
        });

        await click(target.querySelector(".o_data_cell"));
        assert.hasClass(target.querySelectorAll(".o_data_row")[0], "o_selected_row");
        await editInput(target, ".o_field_widget[name=foo] input", "abc");
        assert.verifySteps(["onchange"]);
        await click(target.querySelectorAll(".o_data_cell")[2]);
        assert.hasClass(target.querySelectorAll(".o_data_row")[1], "o_selected_row");
        assert.verifySteps([]);
    });

    QUnit.test("editable list view: basic char field edition", async function (assert) {
        await makeView({
            type: "list",
            resModel: "foo",
            serverData,
            arch: '<tree editable="bottom"><field name="foo"/><field name="bar"/></tree>',
        });

        await click(target.querySelector(".o_field_cell"));
        assert.hasClass(target.querySelector(".o_data_row"), "o_selected_row");
        await editInput(target, ".o_field_char input", "abc");
        assert.strictEqual(
            target.querySelector(".o_field_char input").value,
            "abc",
            "char field has been edited correctly"
        );

        await click(target.querySelectorAll(".o_data_row")[1].querySelector(".o_data_cell"));
        assert.strictEqual(
            target.querySelector(".o_field_cell").innerText,
            "abc",
            "changes should be saved correctly"
        );
        assert.hasClass(target.querySelectorAll(".o_data_row")[1], "o_selected_row");
        assert.doesNotHaveClass(
            target.querySelector(".o_data_row"),
            "o_selected_row",
            "saved row should be in readonly mode"
        );
        assert.strictEqual(
            serverData.models.foo.records[0].foo,
            "abc",
            "the edition should have been properly saved"
        );
    });

    QUnit.test(
        "editable list view: save data when list sorting in edit mode",
        async function (assert) {
            assert.expect(2);

            serverData.models.foo.fields.foo.sortable = true;

            await makeView({
                type: "list",
                resModel: "foo",
                serverData,
                arch: '<tree editable="bottom"><field name="foo"/></tree>',
                mockRPC(route, args) {
                    if (args.method === "web_save") {
                        assert.deepEqual(
                            args.args,
                            [[1], { foo: "xyz" }],
                            "should correctly save the edited record"
                        );
                    }
                },
            });

            await click(target.querySelector(".o_data_cell"));
            await editInput(target, '.o_field_widget[name="foo"] input', "xyz");
            await click(target.querySelector(".o_column_sortable"));
            assert.containsNone(target, ".o_selected_row");
        }
    );

    QUnit.test(
        "editable list view: check that controlpanel buttons are updating when groupby applied",
        async function (assert) {
            serverData.models.foo.fields.foo = { string: "Foo", type: "char", required: true };
            serverData.actions = {
                11: {
                    id: 11,
                    name: "Partners Action 11",
                    res_model: "foo",
                    type: "ir.actions.act_window",
                    views: [[3, "list"]],
                    search_view_id: [9, "search"],
                },
            };
            serverData.views = {
                "foo,3,list":
                    '<tree editable="top"><field name="display_name"/><field name="foo"/></tree>',

                "foo,9,search": `
                    <search>
                        <filter string="candle" name="itsName" context="{'group_by': 'foo'}"/>
                    </search>`,
            };

            const webClient = await createWebClient({ serverData });

            await doAction(webClient, 11);
            await click($(".o_list_button_add:visible").get(0));

            assert.containsNone(target, ".o_list_button_add");
            assert.containsN(
                target,
                ".o_list_button_save",
                2,
                "Should have 2 save button (small and xl screens)"
            );

            await toggleSearchBarMenu(target);
            await toggleMenuItem(target, "candle");

            assert.containsOnce(
                target,
                ".o_list_button_add:visible",
                "Create available as list is grouped"
            );
            assert.containsNone(
                target,
                ".o_list_button_save",
                "Save not available as no row in edition"
            );
        }
    );

    QUnit.test(
        "editable list view: check that add button is present when groupby applied",
        async function (assert) {
            assert.expect(4);

            serverData.models.foo.fields.foo = { string: "Foo", type: "char", required: true };
            serverData.actions = {
                11: {
                    id: 11,
                    name: "Partners Action 11",
                    res_model: "foo",
                    type: "ir.actions.act_window",
                    views: [
                        [3, "list"],
                        [4, "form"],
                    ],
                    search_view_id: [9, "search"],
                },
            };
            serverData.views = {
                "foo,3,list":
                    '<tree editable="top"><field name="display_name"/><field name="foo"/></tree>',
                "foo,4,form": '<form><field name="display_name"/><field name="foo"/></form>',
                "foo,9,search": `
                    <search>
                        <filter string="candle" name="itsName" context="{'group_by': 'foo'}"/>
                    </search>`,
            };

            const webClient = await createWebClient({ serverData });
            await doAction(webClient, 11);

            assert.containsOnce(target, ".o_list_button_add:visible");
            await click(target.querySelector(".o_searchview_dropdown_toggler"));
            await click($(target).find('.o_menu_item:contains("candle")')[0]);
            assert.containsOnce(target, ".o_list_button_add:visible");

            assert.containsOnce(target, ".o_list_view");
            await click($(".o_list_button_add:visible").get(0));
            assert.containsOnce(target, ".o_form_view");
        }
    );

    QUnit.test("list view not groupable", async function (assert) {
        serverData.views = {
            "foo,false,search": `
                <search>
                    <filter context="{'group_by': 'foo'}" name="foo"/>
                </search>`,
        };

        await makeView({
            type: "list",
            resModel: "foo",
            serverData,
            arch: `
                <tree editable="top">
                    <field name="display_name"/>
                    <field name="foo"/>
                </tree>`,
            mockRPC(route, args) {
                if (args.method === "read_group") {
                    throw new Error("Should not do a read_group RPC");
                }
            },
            searchMenuTypes: ["filter", "favorite"],
            context: { search_default_foo: 1 },
        });

        assert.containsNone(
            target,
            ".o_control_panel div.o_search_options div.o_group_by_menu",
            "there should not be groupby menu"
        );
        assert.deepEqual(getFacetTexts(target), []);
    });

    QUnit.test("selection changes are triggered correctly", async function (assert) {
        patchWithCleanup(ListController.prototype, {
            setup() {
                super.setup(...arguments);
                onRendered(() => {
                    assert.step("onRendered ListController");
                });
            },
        });

        const list = await makeView({
            type: "list",
            resModel: "foo",
            serverData,
            arch: '<tree><field name="foo"/><field name="bar"/></tree>',
        });
        var tbody_selector = target.querySelector("tbody .o_list_record_selector input");
        var thead_selector = target.querySelector("thead .o_list_record_selector input");

        assert.strictEqual(list.model.root.selection.length, 0, "no record should be selected");
        assert.notOk(tbody_selector.checked, "selection checkbox should be checked");
        assert.verifySteps(["onRendered ListController"]);

        // tbody checkbox click
        await click(tbody_selector);
        assert.strictEqual(list.model.root.selection.length, 1, "only 1 record should be selected");
        assert.deepEqual(
            list.model.root.selection[0].data,
            {
                bar: true,
                foo: "yop",
            },
            "the correct record should be selected"
        );
        assert.ok(tbody_selector.checked, "selection checkbox should be checked");
        assert.verifySteps(["onRendered ListController"]);

        await click(tbody_selector);
        assert.strictEqual(list.model.root.selection.length, 0, "no record should be selected");
        assert.notOk(tbody_selector.checked, "selection checkbox should be checked");
        assert.verifySteps(["onRendered ListController"]);

        // head checkbox click
        await click(thead_selector);
        assert.strictEqual(list.model.root.selection.length, 4, "all records should be selected");
        assert.containsN(
            target,
            "tbody .o_list_record_selector input:checked",
            target.querySelectorAll("tbody tr").length,
            "all selection checkboxes should be checked"
        );
        assert.verifySteps(["onRendered ListController"]);

        await click(thead_selector);
        assert.strictEqual(list.model.root.selection.length, 0, "no records should be selected");
        assert.containsNone(
            target,
            "tbody .o_list_record_selector input:checked",
            "no selection checkbox should be checked"
        );
        assert.verifySteps(["onRendered ListController"]);
    });

    QUnit.test(
        "Row selection checkbox can be toggled by clicking on the cell",
        async function (assert) {
            const list = await makeView({
                type: "list",
                resModel: "foo",
                serverData,
                arch: '<tree><field name="foo"/><field name="bar"/></tree>',
            });

            assert.strictEqual(list.model.root.selection.length, 0, "no record should be selected");

            await click(target.querySelector("tbody .o_list_record_selector"));
            assert.containsOnce(target, "tbody .o_list_record_selector input:checked");
            assert.strictEqual(
                list.model.root.selection.length,
                1,
                "only 1 record should be selected"
            );
            await click(target.querySelector("tbody .o_list_record_selector"));
            assert.containsNone(target, ".o_list_record_selector input:checked");
            assert.strictEqual(list.model.root.selection.length, 0, "no record should be selected");

            await click(target.querySelector("thead .o_list_record_selector"));
            assert.containsN(target, ".o_list_record_selector input:checked", 5);
            assert.strictEqual(
                list.model.root.selection.length,
                4,
                "all records should be selected"
            );
            await click(target.querySelector("thead .o_list_record_selector"));
            assert.containsNone(target, ".o_list_record_selector input:checked");
            assert.strictEqual(list.model.root.selection.length, 0, "no record should be selected");
        }
    );

    QUnit.test("head selector is toggled by the other selectors", async function (assert) {
        await makeView({
            type: "list",
            arch: '<tree><field name="foo"/><field name="bar"/></tree>',
            serverData,
            groupBy: ["bar"],
            resModel: "foo",
        });

        assert.notOk(
            target.querySelector("thead .o_list_record_selector input").checked,
            "Head selector should be unchecked"
        );

        await click(target.querySelector(".o_group_header:nth-child(2)"));
        await click(target.querySelector("thead .o_list_record_selector input"));
        assert.containsN(
            target,
            "tbody .o_list_record_selector input:checked",
            3,
            "All visible checkboxes should be checked"
        );

        await click(target.querySelector(".o_group_header:first-child"));
        assert.notOk(
            target.querySelector("thead .o_list_record_selector input").checked,
            "Head selector should be unchecked"
        );

        await click(target.querySelector("tbody:nth-child(2) .o_list_record_selector input"));
        assert.ok(
            target.querySelector("thead .o_list_record_selector input").checked,
            "Head selector should be checked"
        );

        await click(target.querySelector("tbody .o_list_record_selector input"));

        assert.notOk(
            target.querySelector("thead .o_list_record_selector input").checked,
            "Head selector should be unchecked"
        );

        await click(target.querySelector(".o_group_header"));

        assert.ok(
            target.querySelector("thead .o_list_record_selector input").checked,
            "Head selector should be checked"
        );
    });

    QUnit.test("selection box is properly displayed (single page)", async function (assert) {
        await makeView({
            type: "list",
            resModel: "foo",
            serverData,
            arch: '<tree><field name="foo"/><field name="bar"/></tree>',
        });

        assert.containsN(target, ".o_data_row", 4);
        assert.containsNone(
            target.querySelector(".o_control_panel_actions"),
            ".o_list_selection_box"
        );

        // select a record
        await click(target.querySelector(".o_data_row .o_list_record_selector input"));
        assert.containsOnce(
            target.querySelector(".o_control_panel_actions"),
            ".o_list_selection_box"
        );
        assert.containsNone(target.querySelector(".o_list_selection_box"), ".o_list_select_domain");
        assert.strictEqual(
            target.querySelector(".o_list_selection_box").textContent.trim(),
            "1 selected"
        );

        // select all records of first page
        await click(target.querySelector("thead .o_list_record_selector input"));
        assert.containsOnce(
            target.querySelector(".o_control_panel_actions"),
            ".o_list_selection_box"
        );
        assert.containsNone(target.querySelector(".o_list_selection_box"), ".o_list_select_domain");
        assert.strictEqual(
            target.querySelector(".o_list_selection_box").textContent.trim(),
            "4 selected"
        );

        // unselect a record
        await click(target.querySelectorAll(".o_data_row .o_list_record_selector input")[1]);
        assert.containsOnce(
            target.querySelector(".o_control_panel_actions"),
            ".o_list_selection_box"
        );
        assert.containsNone(target.querySelector(".o_list_selection_box"), ".o_list_select_domain");
        assert.strictEqual(
            target.querySelector(".o_list_selection_box").textContent.trim(),
            "3 selected"
        );
        await click(target.querySelector(".o_list_unselect_all"));
        assert.containsNone(
            target,
            ".o_list_selection_box",
            "selection options are no longer visible"
        );
        assert.containsNone(
            target,
            ".o_data_row .o_list_record_selector input:checked",
            "no records should be selected"
        );
    });

    QUnit.test("selection box is properly displayed (multi pages)", async function (assert) {
        await makeView({
            type: "list",
            resModel: "foo",
            serverData,
            arch: '<tree limit="3"><field name="foo"/><field name="bar"/></tree>',
        });

        assert.containsN(target, ".o_data_row", 3);
        assert.containsNone(
            target.querySelector(".o_control_panel_actions"),
            ".o_list_selection_box"
        );

        // select a record
        await click(target.querySelector(".o_data_row .o_list_record_selector input"));
        assert.containsOnce(
            target.querySelector(".o_control_panel_actions"),
            ".o_list_selection_box"
        );
        assert.containsNone(target.querySelector(".o_list_selection_box"), ".o_list_select_domain");
        assert.strictEqual(
            target.querySelector(".o_list_selection_box").textContent.trim(),
            "1 selected"
        );

        // select all records of first page
        await click(target.querySelector("thead .o_list_record_selector input"));
        assert.containsOnce(
            target.querySelector(".o_control_panel_actions"),
            ".o_list_selection_box"
        );
        assert.containsOnce(target.querySelector(".o_list_selection_box"), ".o_list_select_domain");
        assert.strictEqual(
            target.querySelector(".o_list_selection_box").textContent.replace(/\s+/g, " ").trim(),
            "3 selected Select all 4"
        );

        // select all domain
        await click(target.querySelector(".o_list_selection_box .o_list_select_domain"));
        assert.containsOnce(
            target.querySelector(".o_control_panel_actions"),
            ".o_list_selection_box"
        );
        assert.strictEqual(
            target.querySelector(".o_list_selection_box").textContent.trim(),
            "All 4 selected"
        );
        await click(target.querySelector(".o_list_unselect_all"));
        assert.containsNone(
            target,
            ".o_list_selection_box",
            "selection options are no longer visible"
        );
    });

    QUnit.test("selection box is properly displayed (group list)", async function (assert) {
        await makeView({
            type: "list",
            resModel: "foo",
            serverData,
            arch: '<tree><field name="foo"/><field name="bar"/></tree>',
            groupBy: ["foo"],
        });
        assert.containsN(target, ".o_group_header", 3);
        assert.containsNone(
            target.querySelector(".o_control_panel_actions"),
            ".o_list_selection_box"
        );

        // open first group
        await click(target.querySelector(".o_group_header"));

        // select a record
        await click(target.querySelector(".o_data_row .o_list_record_selector input"));
        assert.containsOnce(
            target.querySelector(".o_control_panel_actions"),
            ".o_list_selection_box"
        );
        assert.containsNone(target.querySelector(".o_list_selection_box"), ".o_list_select_domain");
        assert.strictEqual(
            target.querySelector(".o_list_selection_box").textContent.trim(),
            "1 selected"
        );

        // select all records of first page
        await click(target.querySelector("thead .o_list_record_selector input"));
        assert.containsOnce(
            target.querySelector(".o_control_panel_actions"),
            ".o_list_selection_box"
        );
        assert.containsOnce(target.querySelector(".o_list_selection_box"), ".o_list_select_domain");
        assert.strictEqual(
            target.querySelector(".o_list_selection_box").textContent.replace(/\s+/g, " ").trim(),
            "2 selected Select all 4"
        );

        // select all domain
        await click(target.querySelector(".o_list_selection_box .o_list_select_domain"));
        assert.containsOnce(
            target.querySelector(".o_control_panel_actions"),
            ".o_list_selection_box"
        );
        assert.strictEqual(
            target.querySelector(".o_list_selection_box").textContent.trim(),
            "All 4 selected"
        );
        await click(target.querySelector(".o_list_unselect_all"));
        assert.containsNone(
            target,
            ".o_list_selection_box",
            "selection options are no longer visible"
        );
    });

    QUnit.test("selection box is displayed as first action button", async function (assert) {
        await makeView({
            type: "list",
            resModel: "foo",
            serverData,
            arch: `
                <tree>
                    <header>
                         <button name="x" type="object" class="plaf" string="plaf"/>
                         <button name="y" type="object" class="plouf" string="plouf"/>
                    </header>
                    <field name="foo"/>
                    <field name="bar"/>
                </tree>`,
        });

        assert.containsN(target, ".o_data_row", 4);
        assert.containsNone($(target).find(".o_control_panel_actions"), ".o_list_selection_box");

        // select a record
        await click(target, ".o_data_row:first-child .o_list_record_selector input");
        assert.containsOnce(
            target.querySelector(".o_control_panel_actions"),
            ".o_list_selection_box"
        );
        const firstElement = target.querySelector(
            ".o_control_panel_actions > div"
        ).firstElementChild;
        assert.strictEqual(
            firstElement,
            target.querySelector(".o_control_panel_actions .o_list_selection_box"),
            "last element should selection box"
        );
        assert.strictEqual(
            target.querySelector(".o_list_selection_box").textContent.trim(),
            "1 selected"
        );
    });

    QUnit.test("selection box is not removed after multi record edition", async function (assert) {
        await makeView({
            type: "list",
            resModel: "foo",
            serverData,
            arch: '<tree multi_edit="1"><field name="foo"/><field name="bar"/></tree>',
        });

        assert.containsN(target, ".o_data_row", 4, "there should be 4 records");
        assert.containsNone(
            target.querySelector(".o_control_panel_actions"),
            ".o_list_selection_box",
            "list selection box should not be displayed"
        );

        // select all records
        await click(target.querySelector(".o_list_record_selector input"));
        assert.containsOnce(
            target.querySelector(".o_control_panel_actions"),
            ".o_list_selection_box",
            "list selection box should be displayed"
        );
        assert.containsN(
            target,
            ".o_data_row .o_list_record_selector input:checked",
            4,
            "all 4 records should be selected"
        );

        // edit selected records
        await click(target.querySelector(".o_data_row").querySelector(".o_data_cell"));
        await editInput(target, ".o_data_row [name=foo] input", "legion");
        await click(target, ".modal-dialog button.btn-primary");
        assert.containsOnce(
            target.querySelector(".o_control_panel_actions"),
            ".o_list_selection_box",
            "list selection box should still be displayed"
        );
        assert.containsN(
            target,
            ".o_data_row .o_list_record_selector input:checked",
            4,
            "same records should be selected"
        );
    });

    QUnit.test("selection box in grouped list, multi pages)", async function (assert) {
        await makeView({
            type: "list",
            resModel: "foo",
            serverData,
            arch: '<tree groups_limit="2"><field name="foo"/><field name="bar"/></tree>',
            groupBy: ["int_field"],
        });

        assert.containsN(target, ".o_group_header", 2);
        assert.containsNone(target, ".o_list_selection_box");
        assert.strictEqual(target.querySelector(".o_pager_value").innerText, "1-2");
        assert.strictEqual(target.querySelector(".o_pager_limit").innerText, "4");

        // open first group and select all records of first page
        await click(target.querySelector(".o_group_header"));
        assert.containsOnce(target, ".o_data_row");
        await click(target.querySelector("thead .o_list_record_selector input"));
        assert.containsOnce(
            target.querySelector(".o_control_panel_actions"),
            ".o_list_selection_box"
        );
        assert.containsOnce(target.querySelector(".o_list_selection_box"), ".o_list_select_domain");
        assert.strictEqual(
            target.querySelector(".o_list_selection_box").innerText.replace(/\s+/g, " ").trim(),
            "1 selected Select all"
        ); // we don't know the total count, so we don't display it

        // select all domain
        await click(target.querySelector(".o_list_selection_box .o_list_select_domain"));
        assert.containsOnce(
            target.querySelector(".o_control_panel_actions"),
            ".o_list_selection_box"
        );
        assert.strictEqual(
            target.querySelector(".o_list_selection_box").innerText.replace(/\s+/g, " ").trim(),
            "All 4 selected"
        );
    });

    QUnit.test("selection box: grouped list, select domain, open group", async function (assert) {
        await makeView({
            type: "list",
            resModel: "foo",
            serverData,
            arch: '<tree><field name="foo"/><field name="bar"/></tree>',
            groupBy: ["foo"],
        });
        assert.containsN(target, ".o_group_header", 3);
        assert.containsNone(target, ".o_data_row");
        assert.containsNone(
            target.querySelector(".o_control_panel_actions"),
            ".o_list_selection_box"
        );

        // open first group and select all domain
        await click(target.querySelector(".o_group_header"));
        await click(target.querySelector("thead .o_list_record_selector input"));
        await click(target.querySelector(".o_list_selection_box .o_list_select_domain"));
        assert.containsN(target, ".o_data_row", 2);
        assert.containsOnce(
            target.querySelector(".o_control_panel_actions"),
            ".o_list_selection_box"
        );
        assert.strictEqual(
            target.querySelector(".o_list_selection_box").textContent.trim(),
            "All 4 selected"
        );

        // open another group
        await click(target.querySelectorAll(".o_group_header")[1]);
        assert.containsN(target, ".o_data_row", 3);
        assert.containsN(target, ".o_data_row .o_list_record_selector input:checked", 3);
    });

    QUnit.test("selection box: grouped list, select domain, use pager", async function (assert) {
        await makeView({
            type: "list",
            resModel: "foo",
            serverData,
            arch: '<tree limit="2"><field name="foo"/><field name="bar"/></tree>',
            groupBy: ["bar"],
        });
        assert.containsN(target, ".o_group_header", 2);
        assert.containsNone(target, ".o_data_row");
        assert.containsNone(
            target.querySelector(".o_control_panel_actions"),
            ".o_list_selection_box"
        );

        // open second group and select all domain
        await click(target.querySelectorAll(".o_group_header")[1]);
        await click(target.querySelector("thead .o_list_record_selector input"));
        await click(target.querySelector(".o_list_selection_box .o_list_select_domain"));
        assert.containsN(target, ".o_data_row", 2);
        assert.strictEqual(target.querySelector(".o_group_header .o_pager_value").innerText, "1-2");
        assert.strictEqual(target.querySelector(".o_group_header .o_pager_limit").innerText, "3");
        assert.containsOnce(
            target.querySelector(".o_control_panel_actions"),
            ".o_list_selection_box"
        );
        assert.strictEqual(
            target.querySelector(".o_list_selection_box").textContent.trim(),
            "All 4 selected"
        );

        // click pager next in the opened group
        await click(target.querySelector(".o_group_header .o_pager_next"));
        assert.containsN(target, ".o_data_row", 1);
        assert.containsN(target, ".o_data_row .o_list_record_selector input:checked", 1);
        assert.strictEqual(
            target.querySelector(".o_list_selection_box").textContent.trim(),
            "All 4 selected"
        );
    });

    QUnit.test("selection is reset on reload", async function (assert) {
        await makeView({
            type: "list",
            resModel: "foo",
            serverData,
            arch: `
                <tree>
                    <field name="foo"/>
                    <field name="int_field" sum="Sum"/>
                </tree>`,
        });

        assert.containsNone(
            target.querySelector(".o_control_panel_actions"),
            ".o_list_selection_box"
        );
        assert.strictEqual(
            $(target).find("tfoot td:nth(2)").text(),
            "32",
            "total should be 32 (no record selected)"
        );

        // select first record
        var firstRowSelector = target.querySelector("tbody .o_list_record_selector input");
        await click(firstRowSelector);
        assert.ok(firstRowSelector.checked, "first row should be selected");
        assert.containsOnce(
            target.querySelector(".o_control_panel_actions"),
            ".o_list_selection_box"
        );
        assert.strictEqual(
            $(target).find("tfoot td:nth(2)").text(),
            "10",
            "total should be 10 (first record selected)"
        );

        await reloadListView(target);
        firstRowSelector = target.querySelector("tbody .o_list_record_selector input");
        assert.notOk(firstRowSelector.checked, "first row should no longer be selected");
        assert.containsNone(
            target.querySelector(".o_control_panel_actions"),
            ".o_list_selection_box"
        );
        assert.strictEqual(
            $(target).find("tfoot td:nth(2)").text(),
            "32",
            "total should be 32 (no more record selected)"
        );
    });

    QUnit.test("selection is kept on render without reload", async function (assert) {
        await makeView({
            type: "list",
            resModel: "foo",
            serverData,
            groupBy: ["foo"],
            actionMenus: {},
            arch: `
                <tree>
                    <field name="foo"/>
                    <field name="int_field" sum="Sum"/>
                </tree>`,
        });

        assert.containsOnce(target, "div.o_control_panel .o_cp_action_menus");
        assert.containsNone(
            target.querySelector(".o_control_panel_actions"),
            ".o_list_selection_box"
        );

        // open blip grouping and check all lines
        await click($(target).find('.o_group_header:contains("blip (2)")')[0]);
        await click(target.querySelector(".o_data_row input"));
        assert.containsOnce(target, "div.o_control_panel .o_cp_action_menus");
        assert.containsOnce(
            target.querySelector(".o_control_panel_actions"),
            ".o_list_selection_box"
        );

        // open yop grouping and verify blip are still checked
        await click($(target).find('.o_group_header:contains("yop (1)")')[0]);
        assert.containsOnce(
            target,
            ".o_data_row input:checked",
            "opening a grouping does not uncheck others"
        );
        assert.containsOnce(target, "div.o_control_panel .o_cp_action_menus");
        assert.containsOnce(
            target.querySelector(".o_control_panel_actions"),
            ".o_list_selection_box"
        );

        // close and open blip grouping and verify blip are unchecked
        await click($(target).find('.o_group_header:contains("blip (2)")')[0]);
        await click($(target).find('.o_group_header:contains("blip (2)")')[0]);
        assert.containsNone(
            target,
            ".o_data_row input:checked",
            "opening and closing a grouping uncheck its elements"
        );
        assert.containsOnce(target, "div.o_control_panel .o_cp_action_menus");
        assert.containsNone(
            target.querySelector(".o_control_panel_actions"),
            ".o_list_selection_box"
        );
    });

    QUnit.test("select a record in list grouped by date with granularity", async function (assert) {
        await makeView({
            type: "list",
            resModel: "foo",
            serverData,
            arch: '<tree><field name="foo"/><field name="bar"/></tree>',
            groupBy: ["date:year"],
            // keep the actionMenus, it is relevant as it computes isM2MGrouped which crashes if we
            // don't correctly extract the fieldName/granularity from the groupBy
            actionMenus: {},
        });

        assert.containsN(target, ".o_group_header", 2);
        assert.containsNone(
            target.querySelector(".o_control_panel_actions"),
            ".o_list_selection_box"
        );
        await click(target.querySelector(".o_group_header"));
        assert.containsOnce(target, ".o_data_row");
        await click(target.querySelector(".o_data_row .o_list_record_selector"));
        assert.containsOnce(
            target.querySelector(".o_control_panel_actions"),
            ".o_list_selection_box"
        );
    });

    QUnit.test("aggregates are computed correctly", async function (assert) {
        // map: foo record id -> qux value
        const quxVals = { 1: 1.0, 2: 2.0, 3: 3.0, 4: 0 };

        serverData.models.foo.records = serverData.models.foo.records.map((r) => ({
            ...r,
            qux: quxVals[r.id],
        }));

        await makeView({
            type: "list",
            resModel: "foo",
            serverData,
            arch: /*xml*/ `
                <tree>
                    <field name="foo"/>
                    <field name="int_field" sum="Sum"/>
                    <field name="qux" avg="Average"/>
                </tree>`,
            searchViewArch: `
                <search>
                    <filter name="my_filter" string="My Filter" domain="[('id', '=', 0)]"/>
                </search>`,
        });
        const tbodySelectors = target.querySelectorAll("tbody .o_list_record_selector input");
        const theadSelector = target.querySelector("thead .o_list_record_selector input");

        const getFooterTextArray = () => {
            return [...target.querySelectorAll("tfoot td")].map((td) => td.innerText);
        };

        assert.deepEqual(getFooterTextArray(), ["", "", "32", "1.50"]);

        await click(tbodySelectors[0]);
        await click(tbodySelectors[3]);
        assert.deepEqual(getFooterTextArray(), ["", "", "6", "0.50"]);

        await click(theadSelector);
        assert.deepEqual(getFooterTextArray(), ["", "", "32", "1.50"]);

        // Let's update the view to dislay NO records
        await click(target.querySelector(".o_list_unselect_all"));
        await toggleSearchBarMenu(target);
        await toggleMenuItem(target, "My Filter");
        assert.deepEqual(getFooterTextArray(), ["", "", "", ""]);
    });

    QUnit.test("aggregates are computed correctly in grouped lists", async function (assert) {
        await makeView({
            type: "list",
            resModel: "foo",
            serverData,
            groupBy: ["m2o"],
            arch: '<tree editable="bottom"><field name="foo" /><field name="int_field" sum="Sum"/></tree>',
        });
        const groupHeaders = target.querySelectorAll(".o_group_header");
        assert.strictEqual(
            groupHeaders[0].querySelector("td:last-child").textContent,
            "23",
            "first group total should be 23"
        );
        assert.strictEqual(
            groupHeaders[1].querySelector("td:last-child").textContent,
            "9",
            "second group total should be 9"
        );
        assert.strictEqual(
            target.querySelector("tfoot td:last-child").textContent,
            "32",
            "total should be 32"
        );
        await click(groupHeaders[0]);
        await click(target.querySelector("tbody .o_list_record_selector input:first-child"));
        assert.strictEqual(
            target.querySelector("tfoot td:last-child").textContent,
            "10",
            "total should be 10 as first record of first group is selected"
        );
    });

    QUnit.test("aggregates are formatted correctly in grouped lists", async function (assert) {
        // in this scenario, there is a widget on an aggregated field, and this widget has no
        // associated formatter, so we fallback on the formatter corresponding to the field type
        fieldRegistry.add("my_float", FloatField);
        serverData.models.foo.records[0].qux = 5.1654846456;
        await makeView({
            type: "list",
            resModel: "foo",
            serverData,
            arch: `
                <tree>
                    <field name="foo"/>
                    <field name="qux" widget="my_float" sum="Sum"/>
                </tree>`,
            groupBy: ["int_field"],
        });

        assert.deepEqual(
            getNodesTextContent(target.querySelectorAll(".o_group_header .o_list_number")),
            ["9.00", "13.00", "5.17", "-3.00"]
        );
    });

    QUnit.test("aggregates in grouped lists with buttons", async function (assert) {
        await makeView({
            type: "list",
            resModel: "foo",
            serverData,
            groupBy: ["m2o"],
            arch: `
                <tree>
                    <field name="foo"/>
                    <field name="int_field" sum="Sum"/>
                    <button name="a" type="object"/>
                    <field name="qux" sum="Sum"/>
                </tree>`,
        });

        const cellVals = ["23", "6.40", "9", "13.00", "32", "19.40"];
        assert.deepEqual(getNodesTextContent(target.querySelectorAll(".o_list_number")), cellVals);
    });

    QUnit.test("date field aggregates in grouped lists", async function (assert) {
        // this test simulates a scenario where a date field has a aggregator
        // and the web_read_group thus return a value for that field for each group
        await makeView({
            type: "list",
            resModel: "foo",
            serverData,
            groupBy: ["m2o"],
            arch: `
                <tree>
                    <field name="foo"/>
                    <field name="date"/>
                </tree>`,
            async mockRPC(route, args, performRPC) {
                if (args.method === "web_read_group") {
                    const res = await performRPC(...arguments);
                    res.groups[0].date = "2021-03-15";
                    res.groups[1].date = "2021-02-11";
                    return res;
                }
            },
        });

        assert.containsN(target, ".o_group_header", 2);
        assert.deepEqual(getNodesTextContent(target.querySelectorAll(".o_group_header")), [
            `Value 1 (3) `,
            `Value 2 (1) `,
        ]);
    });

    QUnit.test(
        "hide aggregated value in grouped lists when no data provided by RPC call",
        async function (assert) {
            await makeView({
                type: "list",
                resModel: "foo",
                serverData,
                groupBy: ["bar"],
                arch: `
                    <tree editable="bottom">
                        <field name="foo"/>
                        <field name="qux" widget="float_time" sum="Sum"/>
                    </tree>`,
                mockRPC: async function (route, args, performRPC) {
                    if (args.method === "web_read_group") {
                        const result = await performRPC(route, args);
                        result.groups.forEach((group) => {
                            delete group.qux;
                        });
                        return Promise.resolve(result);
                    }
                },
            });

            assert.strictEqual(
                target.querySelectorAll("tfoot td")[2].textContent,
                "",
                "There isn't any aggregated value"
            );
        }
    );

    QUnit.test("aggregates are updated when a line is edited", async function (assert) {
        await makeView({
            type: "list",
            resModel: "foo",
            serverData,
            arch: '<tree editable="bottom"><field name="int_field" sum="Sum"/></tree>',
        });

        assert.strictEqual(
            target.querySelector('span[data-tooltip="Sum"]').innerText,
            "32",
            "current total should be 32"
        );

        await click(target.querySelector("tr.o_data_row td.o_data_cell"));
        await editInput(target, "td.o_data_cell input", "15");

        assert.strictEqual(
            target.querySelector('span[data-tooltip="Sum"]').innerText,
            "37",
            "current total should be 37"
        );
    });

    QUnit.test("aggregates are formatted according to field widget", async function (assert) {
        await makeView({
            type: "list",
            resModel: "foo",
            serverData,
            arch: `
                <tree>
                    <field name="foo"/>
                    <field name="qux" widget="float_time" sum="Sum"/>
                </tree>`,
        });

        assert.strictEqual(
            target.querySelectorAll("tfoot td")[2].textContent,
            "19:24",
            "total should be formatted as a float_time"
        );
    });

    QUnit.test("aggregates digits can be set with digits field attribute", async function (assert) {
        await makeView({
            type: "list",
            resModel: "foo",
            serverData,
            arch: `
                <tree>
                    <field name="amount" widget="monetary" sum="Sum" digits="[69,3]"/>
                </tree>`,
        });

        assert.strictEqual(
            target.querySelectorAll(".o_data_row td")[1].textContent,
            "1200.00",
            "field should still be formatted based on currency"
        );
        assert.strictEqual(
            target.querySelectorAll("tfoot td")[1].textContent,
            "—",
            "aggregates monetary should never work if no currency field is present"
        );
    });

    QUnit.test("aggregates monetary (same currency)", async function (assert) {
        serverData.models.foo.records[0].currency_id = 1;
        await makeView({
            type: "list",
            resModel: "foo",
            serverData,
            arch: `
                <tree>
                    <field name="amount" widget="monetary" sum="Sum"/>
                    <field name="currency_id"/>
                </tree>`,
        });

        assert.deepEqual(getNodesTextContent(target.querySelectorAll("tbody .o_monetary_cell")), [
            "$\u00a01200.00",
            "$\u00a0500.00",
            "$\u00a0300.00",
            "$\u00a00.00",
        ]);

        assert.strictEqual(target.querySelectorAll("tfoot td")[1].textContent, "$\u00a02000.00");
    });

    QUnit.test("aggregates monetary (different currencies)", async function (assert) {
        await makeView({
            type: "list",
            resModel: "foo",
            serverData,
            arch: `
                <tree>
                    <field name="amount" widget="monetary" sum="Sum"/>
                    <field name="currency_id"/>
                </tree>`,
        });

        assert.deepEqual(getNodesTextContent(target.querySelectorAll("tbody .o_monetary_cell")), [
            "1200.00\u00a0€",
            "$\u00a0500.00",
            "$\u00a0300.00",
            "$\u00a00.00",
        ]);

        assert.strictEqual(target.querySelectorAll("tfoot td")[1].textContent, "—");
    });

    QUnit.test("aggregates monetary (currency field not in view)", async function (assert) {
        await makeView({
            type: "list",
            resModel: "foo",
            serverData,
            arch: `
                <tree>
                    <field name="amount" widget="monetary" sum="Sum" options="{'currency_field': 'currency_test'}"/>
                    <field name="currency_id"/>
                </tree>`,
        });

        assert.deepEqual(getNodesTextContent(target.querySelectorAll("tbody .o_monetary_cell")), [
            "1200.00",
            "500.00",
            "300.00",
            "0.00",
        ]);

        assert.strictEqual(target.querySelectorAll("tfoot td")[1].textContent, "—");
    });

    QUnit.test("aggregates monetary (currency field in view)", async function (assert) {
        serverData.models.foo.fields.amount.currency_field = "currency_test";
        await makeView({
            type: "list",
            resModel: "foo",
            serverData,
            arch: `
                <tree>
                    <field name="amount" widget="monetary" sum="Sum"/>
                    <field name="currency_test"/>
                </tree>`,
        });

        assert.deepEqual(getNodesTextContent(target.querySelectorAll("tbody .o_monetary_cell")), [
            "$\u00a01200.00",
            "$\u00a0500.00",
            "$\u00a0300.00",
            "$\u00a00.00",
        ]);

        assert.strictEqual(target.querySelectorAll("tfoot td")[1].textContent, "$\u00a02000.00");
    });

    QUnit.test("aggregates monetary with custom digits (same currency)", async function (assert) {
        serverData.models.foo.records = serverData.models.foo.records.map((record) => ({
            ...record,
            currency_id: 1,
        }));
        patchWithCleanup(currencies, {
            1: { ...currencies[1], digits: [42, 4] },
        });

        await makeView({
            type: "list",
            resModel: "foo",
            serverData,
            arch: `
                <tree>
                    <field name="amount" sum="Sum"/>
                    <field name="currency_id"/>
                </tree>`,
        });

        assert.deepEqual(getNodesTextContent(target.querySelectorAll("tbody [name='amount']")), [
            "$\u00a01200.0000",
            "$\u00a0500.0000",
            "$\u00a0300.0000",
            "$\u00a00.0000",
        ]);

        assert.strictEqual(target.querySelectorAll("tfoot td")[1].textContent, "$\u00a02000.0000");
    });

    QUnit.test(
        "aggregates float with monetary widget and custom digits (same currency)",
        async function (assert) {
            serverData.models.foo.records = serverData.models.foo.records.map((record) => ({
                ...record,
                currency_id: 1,
            }));
            patchWithCleanup(currencies, {
                1: { ...currencies[1], digits: [42, 4] },
            });

            await makeView({
                type: "list",
                resModel: "foo",
                serverData,
                arch: `
                <tree>
                    <field name="qux" widget="monetary" sum="Sum"/>
                    <field name="currency_id"/>
                </tree>`,
            });

            assert.deepEqual(
                getNodesTextContent(target.querySelectorAll("tbody .o_monetary_cell")),
                ["$\u00a00.4000", "$\u00a013.0000", "$\u00a0-3.0000", "$\u00a09.0000"]
            );

            assert.strictEqual(
                target.querySelectorAll("tfoot td")[1].textContent,
                "$\u00a019.4000"
            );
        }
    );

    QUnit.test(
        "currency_field is taken into account when formatting monetary values",
        async (assert) => {
            await makeView({
                type: "list",
                resModel: "foo",
                serverData,
                arch: `
                <tree>
                    <field name="company_currency_id" column_invisible="1"/>
                    <field name="currency_id" column_invisible="1"/>
                    <field name="amount" sum="Sum"/>
                    <field name="amount_currency"/>
                </tree>`,
            });

            assert.strictEqual(
                target.querySelectorAll('.o_data_row td[name="amount"]')[0].textContent,
                "1200.00\u00a0€",
                "field should be formatted based on currency_id"
            );
            assert.strictEqual(
                target.querySelectorAll('.o_data_row td[name="amount_currency"]')[0].textContent,
                "$\u00a01100.00",
                "field should be formatted based on company_currency_id"
            );
            assert.strictEqual(
                target.querySelectorAll("tfoot td")[1].textContent,
                "—",
                "aggregates monetary should never work if different currencies are used"
            );
            assert.strictEqual(
                target.querySelectorAll("tfoot td")[2].textContent,
                "",
                "monetary aggregation should only be attempted with an active aggregation function" +
                    " when using different currencies"
            );
        }
    );

    QUnit.test(
        "groups can not be sorted on a different field than the first field of the groupBy - 1",
        async function (assert) {
            assert.expect(1);

            await makeView({
                type: "list",
                resModel: "foo",
                serverData,
                arch: '<tree default_order="foo"><field name="foo"/><field name="bar"/></tree>',
                mockRPC(route, args) {
                    if (args.method === "web_read_group") {
                        assert.strictEqual(args.kwargs.orderby, "", "should not have an orderBy");
                    }
                },
                groupBy: ["bar"],
            });
        }
    );

    QUnit.test(
        "groups can not be sorted on a different field than the first field of the groupBy - 2",
        async function (assert) {
            assert.expect(1);

            await makeView({
                type: "list",
                resModel: "foo",
                serverData,
                arch: '<tree default_order="foo"><field name="foo"/><field name="bar"/></tree>',
                mockRPC(route, args) {
                    if (args.method === "web_read_group") {
                        assert.strictEqual(args.kwargs.orderby, "", "should not have an orderBy");
                    }
                },
                groupBy: ["bar", "foo"],
            });
        }
    );

    QUnit.test("groups can be sorted on the first field of the groupBy", async function (assert) {
        assert.expect(3);

        await makeView({
            type: "list",
            resModel: "foo",
            serverData,
            arch: '<tree default_order="bar desc"><field name="foo"/><field name="bar"/></tree>',
            mockRPC(route, args) {
                if (args.method === "web_read_group") {
                    assert.strictEqual(args.kwargs.orderby, "bar DESC", "should have an orderBy");
                }
            },
            groupBy: ["bar"],
        });

        assert.strictEqual(
            document.querySelector(".o_group_header:first-child").textContent.trim(),
            "Yes (3)"
        );
        assert.strictEqual(
            document.querySelector(".o_group_header:last-child").textContent.trim(),
            "No (1)"
        );
    });

    QUnit.test(
        "groups can't be sorted on aggregates if there is no record",
        async function (assert) {
            serverData.models.foo.records = [];

            await makeView({
                type: "list",
                resModel: "foo",
                serverData,
                groupBy: ["foo"],
                arch: `
                <tree editable="bottom">
                    <field name="foo"/>
                    <field name="int_field" sum="Sum"/>
                </tree>`,
                mockRPC(route, args) {
                    if (args.method === "web_read_group") {
                        assert.step(args.kwargs.orderby || "default order");
                    }
                },
            });

            await click(target, ".o_column_sortable");
            assert.verifySteps(["default order"]);
        }
    );

    QUnit.test("groups can be sorted on aggregates", async function (assert) {
        await makeView({
            type: "list",
            resModel: "foo",
            serverData,
            groupBy: ["foo"],
            arch: `
                <tree editable="bottom">
                    <field name="foo"/>
                    <field name="int_field" sum="Sum"/>
                </tree>`,
            mockRPC(route, args) {
                if (args.method === "web_read_group") {
                    assert.step(args.kwargs.orderby || "default order");
                }
            },
        });

        assert.strictEqual(
            $(target).find("tbody .o_list_number").text(),
            "51710",
            "initial order should be 5, 17, 17"
        );
        assert.strictEqual($(target).find("tfoot td:last()").text(), "32", "total should be 32");

        await click(target, ".o_column_sortable");
        assert.strictEqual(
            $(target).find("tfoot td:last()").text(),
            "32",
            "total should still be 32"
        );
        assert.strictEqual(
            $(target).find("tbody .o_list_number").text(),
            "51017",
            "order should be 5, 10, 17"
        );

        await click(target, ".o_column_sortable");
        assert.strictEqual(
            $(target).find("tbody .o_list_number").text(),
            "17105",
            "initial order should be 17, 10, 5"
        );
        assert.strictEqual(
            $(target).find("tfoot td:last()").text(),
            "32",
            "total should still be 32"
        );

        assert.verifySteps(["default order", "int_field ASC", "int_field DESC"]);
    });

    QUnit.test(
        "groups cannot be sorted on non-aggregable fields if every group is folded",
        async function (assert) {
            serverData.models.foo.fields.sort_field = {
                string: "sortable_field",
                type: "sting",
                sortable: true,
                default: "value",
            };
            serverData.models.foo.records.forEach((elem) => {
                elem.sort_field = "value" + elem.id;
            });
            serverData.models.foo.fields.foo.sortable = true;
            await makeView({
                type: "list",
                resModel: "foo",
                serverData,
                groupBy: ["foo"],
                arch: `
                <tree editable="bottom">
                    <field name="foo"/>
                    <field name="int_field"/>
                    <field name="sort_field"/>
                </tree>`,
                mockRPC(route, args) {
                    if (args.method === "web_read_group") {
                        assert.step(args.kwargs.orderby || "default order");
                    }
                },
            });
            assert.verifySteps(["default order"]);

            // we cannot sort by sort_field since it doesn't have a aggregator
            await click(target.querySelector(".o_column_sortable[data-name='sort_field']"));
            assert.verifySteps([]);

            // we can sort by int_field since it has a aggregator
            await click(target.querySelector(".o_column_sortable[data-name='int_field']"));
            assert.verifySteps(["int_field ASC"]);

            // we keep previous order
            await click(target.querySelector(".o_column_sortable[data-name='sort_field']"));
            assert.verifySteps([]);

            // we can sort on foo since we are groupped by foo + previous order
            await click(target.querySelector(".o_column_sortable[data-name='foo']"));
            assert.verifySteps(["foo ASC, int_field ASC"]);
        }
    );

    QUnit.test(
        "groups can be sorted on non-aggregable fields if a group isn't folded",
        async function (assert) {
            serverData.models.foo.fields.foo.sortable = true;
            await makeView({
                type: "list",
                resModel: "foo",
                serverData,
                groupBy: ["bar"],
                arch: `
                <tree editable="bottom">
                    <field name="foo"/>
                </tree>`,
                mockRPC(route, args) {
                    const { method } = args;
                    if (method === "web_read_group") {
                        assert.step(
                            `web_read_group.orderby: ${args.kwargs.orderby || "default order"}`
                        );
                    }
                    if (method === "web_search_read") {
                        assert.step(
                            `web_search_read.order: ${args.kwargs.order || "default order"}`
                        );
                    }
                },
            });
            await click(target.querySelectorAll(".o_group_header")[1]);
            assert.deepEqual(
                getNodesTextContent(target.querySelectorAll(".o_data_cell[name='foo']")),
                ["yop", "blip", "gnap"]
            );
            assert.verifySteps([
                "web_read_group.orderby: default order",
                "web_search_read.order: default order",
            ]);

            await click(target.querySelector(".o_column_sortable[data-name='foo']"));
            assert.deepEqual(
                getNodesTextContent(target.querySelectorAll(".o_data_cell[name='foo']")),
                ["blip", "gnap", "yop"]
            );
            assert.verifySteps([
                "web_read_group.orderby: default order",
                "web_search_read.order: foo ASC",
            ]);
        }
    );

    QUnit.test(
        "groups can be sorted on non-aggregable fields if a group isn't folded with expand='1'",
        async function (assert) {
            serverData.models.foo.fields.foo.sortable = true;
            await makeView({
                type: "list",
                resModel: "foo",
                serverData,
                groupBy: ["bar"],
                arch: `
                <tree editable="bottom" expand="1">
                    <field name="foo"/>
                </tree>`,
                mockRPC(route, args) {
                    const { method } = args;
                    if (method === "web_read_group") {
                        assert.step(
                            `web_read_group.orderby: ${args.kwargs.orderby || "default order"}`
                        );
                    }
                    if (method === "web_search_read") {
                        assert.step(
                            `web_search_read.orderby: ${args.kwargs.order || "default order"}`
                        );
                    }
                },
            });
            assert.deepEqual(
                getNodesTextContent(target.querySelectorAll(".o_data_cell[name='foo']")),
                ["blip", "yop", "blip", "gnap"]
            );
            assert.verifySteps([
                "web_read_group.orderby: default order",
                "web_search_read.orderby: default order",
                "web_search_read.orderby: default order",
            ]);

            await click(target.querySelector(".o_column_sortable[data-name='foo']"));
            assert.deepEqual(
                getNodesTextContent(target.querySelectorAll(".o_data_cell[name='foo']")),
                ["blip", "blip", "gnap", "yop"]
            );
            assert.verifySteps([
                "web_read_group.orderby: default order",
                "web_search_read.orderby: foo ASC",
                "web_search_read.orderby: foo ASC",
            ]);
        }
    );

    QUnit.test("properly apply onchange in simple case", async function (assert) {
        serverData.models.foo.onchanges = {
            foo: function (obj) {
                obj.int_field = obj.foo.length + 1000;
            },
        };
        await makeView({
            type: "list",
            resModel: "foo",
            serverData,
            arch: '<tree editable="top"><field name="foo"/><field name="int_field"/></tree>',
        });

        await click(target.querySelector(".o_field_cell"));

        assert.strictEqual(
            target.querySelector(".o_field_widget[name=int_field] input").value,
            "10",
            "should contain initial value"
        );

        await editInput(target, ".o_field_widget[name=foo] input", "tralala");

        assert.strictEqual(
            target.querySelector(".o_field_widget[name=int_field] input").value,
            "1007",
            "should contain input with onchange applied"
        );
    });

    QUnit.test("column width should not change when switching mode", async function (assert) {
        // Warning: this test is css dependant
        await makeView({
            type: "list",
            resModel: "foo",
            serverData,
            arch: `
                <tree editable="top">
                    <field name="foo"/>
                    <field name="int_field" readonly="1"/>
                    <field name="m2o"/>
                    <field name="m2m" widget="many2many_tags"/>
                </tree>`,
        });

        var startWidths = [...target.querySelectorAll("thead th")].map((el) => el.offsetWidth);
        var startWidth = window.getComputedStyle(target.querySelector("table")).width;

        // start edition of first row
        await click(target.querySelector("td:not(.o_list_record_selector)"));

        var editionWidths = [...target.querySelectorAll("thead th")].map((el) => el.offsetWidth);
        var editionWidth = window.getComputedStyle(target.querySelector("table")).width;

        // leave edition
        await click($(".o_list_button_save:visible").get(0));

        var readonlyWidths = [...target.querySelectorAll("thead th")].map((el) => el.offsetWidth);
        var readonlyWidth = window.getComputedStyle(target.querySelector("table")).width;

        assert.strictEqual(
            editionWidth,
            startWidth,
            "table should have kept the same width when switching from readonly to edit mode"
        );
        assert.deepEqual(
            editionWidths,
            startWidths,
            "width of columns should remain unchanged when switching from readonly to edit mode"
        );
        assert.strictEqual(
            readonlyWidth,
            editionWidth,
            "table should have kept the same width when switching from edit to readonly mode"
        );
        assert.deepEqual(
            readonlyWidths,
            editionWidths,
            "width of columns should remain unchanged when switching from edit to readonly mode"
        );
    });

    QUnit.test(
        "column widths should depend on the content when there is data",
        async function (assert) {
            serverData.models.foo.records[0].foo = "Some very very long value for a char field";

            await makeView({
                type: "list",
                resModel: "foo",
                serverData,
                arch: `
                    <tree editable="top">
                        <field name="bar"/>
                        <field name="foo"/>
                        <field name="int_field"/>
                        <field name="qux"/>
                        <field name="date"/>
                        <field name="datetime"/>
                    </tree>`,
                limit: 2,
            });

            assert.strictEqual(
                target.querySelector("thead .o_list_record_selector").offsetWidth,
                41
            );
            const widthPage1 = target.querySelector(`th[data-name=foo]`).offsetWidth;

            await pagerNext(target);

            assert.strictEqual(
                target.querySelector("thead .o_list_record_selector").offsetWidth,
                41
            );
            const widthPage2 = target.querySelector(`th[data-name=foo]`).offsetWidth;
            assert.ok(
                widthPage1 > widthPage2,
                "column widths should be computed dynamically according to the content"
            );
        }
    );

    QUnit.test(
        "width of some of the fields should be hardcoded if no data",
        async function (assert) {
            const assertions = [
                { field: "bar", expected: 70, type: "Boolean" },
                { field: "int_field", expected: 74, type: "Integer" },
                { field: "qux", expected: 92, type: "Float" },
                { field: "date", expected: 92, type: "Date" },
                { field: "datetime", expected: 146, type: "Datetime" },
                { field: "amount", expected: 104, type: "Monetary" },
            ];
            assert.expect(9);

            serverData.models.foo.records = [];
            await makeView({
                type: "list",
                resModel: "foo",
                serverData,
                arch: `
                    <tree editable="top">
                        <field name="bar"/>
                        <field name="foo"/>
                        <field name="int_field"/>
                        <field name="qux"/>
                        <field name="date"/>
                        <field name="datetime"/>
                        <field name="amount"/>
                        <field name="currency_id" width="25px"/>
                    </tree>`,
            });

            assert.containsN(target, ".o_resize", 8);
            assertions.forEach((a) => {
                assert.strictEqual(
                    target.querySelector(`th[data-name="${a.field}"]`).offsetWidth,
                    a.expected,
                    `Field ${a.type} should have a fixed width of ${a.expected} pixels`
                );
            });
            assert.strictEqual(
                target.querySelector('th[data-name="foo"]').style.width,
                "100%",
                "Char field should occupy the remaining space"
            );
            assert.strictEqual(
                target.querySelector('th[data-name="currency_id"]').offsetWidth,
                25,
                "Currency field should have a fixed width of 25px (see arch)"
            );
        }
    );

    QUnit.test("colspan of empty lines is correct in readonly", async function (assert) {
        serverData.models.foo.fields.foo_o2m = {
            string: "Foo O2M",
            type: "one2many",
            relation: "foo",
        };
        await makeView({
            type: "form",
            resModel: "foo",
            serverData,
            resId: 1,
            arch: `
                    <form edit="0">
                        <sheet>
                            <field name="foo_o2m">
                                <tree editable="bottom">
                                    <field name="int_field"/>
                                </tree>
                            </field>
                        </sheet>
                    </form>`,
        });
        // in readonly mode, the delete action is not available
        assert.strictEqual(target.querySelector("tbody td").getAttribute("colspan"), "1");
    });

    QUnit.test("colspan of empty lines is correct in edit", async function (assert) {
        serverData.models.foo.fields.foo_o2m = {
            string: "Foo O2M",
            type: "one2many",
            relation: "foo",
        };
        await makeView({
            type: "form",
            resModel: "foo",
            serverData,
            resId: 1,
            arch: `
                    <form>
                        <sheet>
                            <field name="foo_o2m">
                                <tree editable="bottom">
                                    <field name="int_field"/>
                                </tree>
                            </field>
                        </sheet>
                    </form>`,
        });
        // in edit mode, the delete action is available and the empty lines should cover that col
        assert.strictEqual(target.querySelector("tbody td").getAttribute("colspan"), "2");
    });

    QUnit.test(
        "colspan of empty lines is correct in readonly with optional fields",
        async function (assert) {
            serverData.models.foo.fields.foo_o2m = {
                string: "Foo O2M",
                type: "one2many",
                relation: "foo",
            };
            await makeView({
                type: "form",
                resModel: "foo",
                serverData,
                resId: 1,
                arch: `
                    <form edit="0">
                        <sheet>
                            <field name="foo_o2m">
                                <tree editable="bottom">
                                    <field name="int_field"/>
                                    <field name="foo" optional="hidden"/>
                                </tree>
                            </field>
                        </sheet>
                    </form>`,
            });
            // in readonly mode, the delete action is not available but the optional fields is and the empty lines should cover that col
            assert.strictEqual(target.querySelector("tbody td").getAttribute("colspan"), "2");
        }
    );

    QUnit.test(
        "colspan of empty lines is correct in edit with optional fields",
        async function (assert) {
            serverData.models.foo.fields.foo_o2m = {
                string: "Foo O2M",
                type: "one2many",
                relation: "foo",
            };
            await makeView({
                type: "form",
                resModel: "foo",
                serverData,
                resId: 1,
                arch: `
                    <form>
                        <sheet>
                            <field name="foo_o2m">
                                <tree editable="bottom">
                                    <field name="int_field"/>
                                    <field name="foo" optional="hidden"/>
                                </tree>
                            </field>
                        </sheet>
                    </form>`,
            });
            // in edit mode, both the delete action and the optional fields are available and the empty lines should cover that col
            assert.strictEqual(target.querySelector("tbody td").getAttribute("colspan"), "2");
        }
    );

    QUnit.test(
        "width of some fields should be hardcoded if no data, and list initially invisible",
        async function (assert) {
            const assertions = [
                { field: "bar", expected: 70, type: "Boolean" },
                { field: "int_field", expected: 74, type: "Integer" },
                { field: "qux", expected: 92, type: "Float" },
                { field: "date", expected: 92, type: "Date" },
                { field: "datetime", expected: 146, type: "Datetime" },
                { field: "amount", expected: 104, type: "Monetary" },
            ];
            assert.expect(12);

            serverData.models.foo.fields.foo_o2m = {
                string: "Foo O2M",
                type: "one2many",
                relation: "foo",
            };
            await makeView({
                type: "form",
                resModel: "foo",
                serverData,
                resId: 1,
                mode: "edit",
                arch: `
                    <form>
                        <sheet>
                            <notebook>
                                <page string="Page1"></page>
                                <page string="Page2">
                                    <field name="foo_o2m">
                                        <tree editable="bottom">
                                            <field name="bar"/>
                                            <field name="foo"/>
                                            <field name="int_field"/>
                                            <field name="qux"/>
                                            <field name="date"/>
                                            <field name="datetime"/>
                                            <field name="amount"/>
                                            <field name="currency_id" width="25px"/>
                                        </tree>
                                    </field>
                                </page>
                            </notebook>
                        </sheet>
                    </form>`,
            });

            assert.containsNone(target, ".o_field_one2many");

            await click(target.querySelector(".nav-item:last-child .nav-link"));

            assert.isVisible(target.querySelector(".o_field_one2many"));

            assert.containsN(target, ".o_field_one2many .o_resize", 8);
            assertions.forEach((a) => {
                assert.strictEqual(
                    target.querySelector(`.o_field_one2many th[data-name="${a.field}"]`).style
                        .width,
                    `${a.expected}px`,
                    `Field ${a.type} should have a fixed width of ${a.expected} pixels`
                );
            });
            assert.strictEqual(
                target.querySelector('.o_field_one2many th[data-name="foo"]').style.width,
                "100%",
                "Char field should occupy the remaining space"
            );
            assert.strictEqual(
                target.querySelector('th[data-name="currency_id"]').offsetWidth,
                25,
                "Currency field should have a fixed width of 25px (see arch)"
            );
            assert.strictEqual(target.querySelector(".o_list_actions_header").offsetWidth, 32);
        }
    );

    QUnit.test(
        "empty editable list with the handle widget and no content help",
        async function (assert) {
            // no records for the foo model
            serverData.models.foo.records = [];

            await makeView({
                type: "list",
                resModel: "foo",
                serverData,
                arch: `
                    <tree editable="bottom">
                        <field name="int_field" widget="handle" />
                        <field name="foo" />
                    </tree>`,
                noContentHelp: '<p class="hello">click to add a foo</p>',
            });

            assert.containsOnce(target, ".o_view_nocontent", "should have no content help");

            // click on create button
            await click($(".o_list_button_add:visible").get(0));
            const handleWidgetWidth = "33px";
            const handleWidgetHeader = target.querySelector("thead > tr > th.o_handle_cell");

            assert.strictEqual(
                window.getComputedStyle(handleWidgetHeader).width,
                handleWidgetWidth,
                "While creating first record, width should be applied to handle widget."
            );

            // creating one record
            await editInput(target, ".o_selected_row [name='foo'] input", "test_foo");
            await clickSave(target);
            assert.strictEqual(
                window.getComputedStyle(handleWidgetHeader).width,
                handleWidgetWidth,
                "After creation of the first record, width of the handle widget should remain as it is"
            );
        }
    );

    QUnit.test("editable list: overflowing table", async function (assert) {
        serverData.models.bar = {
            fields: {
                titi: { string: "Small char", type: "char", sortable: true },
                grosminet: { string: "Beeg char", type: "char", sortable: true },
            },
            records: [
                {
                    id: 1,
                    titi: "Tiny text",
                    grosminet:
                        // Just want to make sure that the table is overflowed
                        `Lorem ipsum dolor sit amet, consectetur adipiscing elit.
                        Donec est massa, gravida eget dapibus ac, eleifend eget libero.
                        Suspendisse feugiat sed massa eleifend vestibulum. Sed tincidunt
                        velit sed lacinia lacinia. Nunc in fermentum nunc. Vestibulum ante
                        ipsum primis in faucibus orci luctus et ultrices posuere cubilia
                        Curae; Nullam ut nisi a est ornare molestie non vulputate orci.
                        Nunc pharetra porta semper. Mauris dictum eu nulla a pulvinar. Duis
                        eleifend odio id ligula congue sollicitudin. Curabitur quis aliquet
                        nunc, ut aliquet enim. Suspendisse malesuada felis non metus
                        efficitur aliquet.`,
                },
            ],
        };
        await makeView({
            type: "list",
            resModel: "bar",
            serverData,
            arch: `
                <tree editable="top">
                    <field name="titi"/>
                    <field name="grosminet" widget="char"/>
                </tree>`,
        });

        assert.strictEqual(
            target.querySelector("table").offsetWidth,
            target.querySelector(".o_list_renderer").offsetWidth,
            "Table should not be stretched by its content"
        );
    });

    QUnit.test("editable list: overflowing table (3 columns)", async function (assert) {
        const longText = `Lorem ipsum dolor sit amet, consectetur adipiscing elit.
                        Donec est massa, gravida eget dapibus ac, eleifend eget libero.
                        Suspendisse feugiat sed massa eleifend vestibulum. Sed tincidunt
                        velit sed lacinia lacinia. Nunc in fermentum nunc. Vestibulum ante
                        ipsum primis in faucibus orci luctus et ultrices posuere cubilia
                        Curae; Nullam ut nisi a est ornare molestie non vulputate orci.
                        Nunc pharetra porta semper. Mauris dictum eu nulla a pulvinar. Duis
                        eleifend odio id ligula congue sollicitudin. Curabitur quis aliquet
                        nunc, ut aliquet enim. Suspendisse malesuada felis non metus
                        efficitur aliquet.`;

        serverData.models.bar = {
            fields: {
                titi: { string: "Small char", type: "char", sortable: true },
                grosminet1: { string: "Beeg char 1", type: "char", sortable: true },
                grosminet2: { string: "Beeg char 2", type: "char", sortable: true },
                grosminet3: { string: "Beeg char 3", type: "char", sortable: true },
            },
            records: [
                {
                    id: 1,
                    titi: "Tiny text",
                    grosminet1: longText,
                    grosminet2: longText + longText,
                    grosminet3: longText + longText + longText,
                },
            ],
        };
        await makeView({
            arch: `
                <tree editable="top">
                    <field name="titi"/>
                    <field name="grosminet1" class="large"/>
                    <field name="grosminet3" class="large"/>
                    <field name="grosminet2" class="large"/>
                </tree>`,
            serverData,
            resModel: "bar",
            type: "list",
        });

        assert.strictEqual(
            target.querySelector("table").offsetWidth,
            target.querySelector(".o_list_view").offsetWidth
        );
        const largeCells = target.querySelectorAll(".o_data_cell.large");
        assert.ok(Math.abs(largeCells[0].offsetWidth - largeCells[1].offsetWidth) <= 1);
        assert.ok(Math.abs(largeCells[1].offsetWidth - largeCells[2].offsetWidth) <= 1);
        assert.ok(
            target.querySelector(".o_data_cell:not(.large)").offsetWidth < largeCells[0].offsetWidth
        );
    });

    QUnit.test(
        "editable list: list view in an initially unselected notebook page",
        async function (assert) {
            serverData.models.foo.records = [{ id: 1, o2m: [1] }];
            serverData.models.bar = {
                fields: {
                    titi: { string: "Small char", type: "char", sortable: true },
                    grosminet: { string: "Beeg char", type: "char", sortable: true },
                },
                records: [
                    {
                        id: 1,
                        titi: "Tiny text",
                        grosminet:
                            "Lorem ipsum dolor sit amet, consectetur adipiscing elit. " +
                            "Ut at nisi congue, facilisis neque nec, pulvinar nunc. " +
                            "Vivamus ac lectus velit.",
                    },
                ],
            };
            await makeView({
                type: "form",
                resModel: "foo",
                serverData,
                resId: 1,
                arch: `
                    <form>
                        <sheet>
                            <notebook>
                                <page string="Page1"></page>
                                <page string="Page2">
                                    <field name="o2m">
                                        <tree editable="bottom">
                                            <field name="titi"/>
                                            <field name="grosminet"/>
                                        </tree>
                                    </field>
                                </page>
                            </notebook>
                        </sheet>
                    </form>`,
            });
            assert.containsNone(target, ".o_field_one2many");

            await click(target.querySelector(".nav-item:last-child .nav-link"));
            assert.containsOnce(target, ".o_field_one2many");

            const [titi, grosminet] = target.querySelectorAll(".tab-pane:last-child th");
            assert.ok(
                titi.style.width.split("px")[0] > 80 && grosminet.style.width.split("px")[0] > 500,
                "list has been correctly frozen after being visible"
            );
        }
    );

    QUnit.test("editable list: list view hidden by an invisible modifier", async function (assert) {
        serverData.models.foo.records = [{ id: 1, bar: true, o2m: [1] }];
        serverData.models.bar = {
            fields: {
                titi: { string: "Small char", type: "char", sortable: true },
                grosminet: { string: "Beeg char", type: "char", sortable: true },
            },
            records: [
                {
                    id: 1,
                    titi: "Tiny text",
                    grosminet:
                        "Lorem ipsum dolor sit amet, consectetur adipiscing elit. " +
                        "Ut at nisi congue, facilisis neque nec, pulvinar nunc. " +
                        "Vivamus ac lectus velit.",
                },
            ],
        };
        await makeView({
            type: "form",
            resModel: "foo",
            serverData,
            resId: 1,
            arch: `
                <form>
                    <sheet>
                        <field name="bar"/>
                        <field name="o2m" invisible="bar">
                            <tree editable="bottom">
                                <field name="titi"/>
                                <field name="grosminet"/>
                            </tree>
                        </field>
                    </sheet>
                </form>`,
        });
        assert.containsNone(target, ".o_field_one2many");

        await click(target.querySelector(".o_field_boolean input"));
        assert.containsOnce(target, ".o_field_one2many");

        const [titi, grosminet] = target.querySelectorAll("th");
        assert.ok(
            titi.style.width.split("px")[0] > 80 && grosminet.style.width.split("px")[0] > 700,
            "list has been correctly frozen after being visible"
        );
    });

    QUnit.test("editable list: updating list state while invisible", async function (assert) {
        serverData.models.foo.onchanges = {
            bar: function (obj) {
                obj.o2m = [[5], [0, null, { display_name: "Whatever" }]];
            },
        };
        await makeView({
            type: "form",
            resModel: "foo",
            serverData,
            resId: 1,
            arch: `
                <form>
                    <sheet>
                        <field name="bar"/>
                        <notebook>
                            <page string="Page 1"></page>
                            <page string="Page 2">
                                <field name="o2m">
                                    <tree editable="bottom">
                                        <field name="display_name"/>
                                    </tree>
                                </field>
                            </page>
                        </notebook>
                    </sheet>
                </form>`,
        });
        assert.containsNone(target, ".o_field_one2many");

        await click(target.querySelector(".o_field_boolean input"));
        assert.containsNone(target, ".o_field_one2many");

        await click(target.querySelector(".nav-item:last-child .nav-link"));
        assert.containsOnce(target, ".o_field_one2many");
        assert.strictEqual(
            target.querySelector(".o_field_one2many .o_data_row").textContent,
            "Whatever"
        );
        assert.notEqual(
            target.querySelector("th").style.width,
            "",
            "Column header should have been frozen"
        );
    });

    QUnit.test("empty list: state with nameless and stringless buttons", async function (assert) {
        serverData.models.foo.records = [];
        await makeView({
            type: "list",
            arch: `
                <tree>
                    <field name="foo"/>
                    <button string="choucroute"/>
                    <button icon="fa-heart"/>
                </tree>`,
            serverData,
            resModel: "foo",
        });

        assert.strictEqual(
            [...target.querySelectorAll("th")].find((el) => el.textContent === "Foo").style.width,
            "50%",
            "Field column should be frozen"
        );
        assert.strictEqual(
            target.querySelector("th:last-child").style.width,
            "50%",
            "Buttons column should be frozen"
        );
    });

    QUnit.test("editable list: unnamed columns cannot be resized", async function (assert) {
        serverData.models.foo.records = [{ id: 1, o2m: [1] }];
        serverData.models.bar.records = [{ id: 1, display_name: "Oui" }];
        await makeView({
            type: "form",
            resModel: "foo",
            serverData,
            resId: 1,
            mode: "edit",
            arch: `
                <form>
                    <sheet>
                        <field name="o2m">
                            <tree editable="top">
                                <field name="display_name"/>
                                <button name="the_button" icon="fa-heart"/>
                            </tree>
                        </field>
                    </sheet>
                </form>`,
        });

        const [charTh, buttonTh] = target.querySelectorAll(".o_field_one2many th");
        const thRect = charTh.getBoundingClientRect();
        const resizeRect = charTh.querySelector(".o_resize").getBoundingClientRect();

        assert.ok(
            resizeRect.right - thRect.right <= 1,
            "First resize handle should be attached at the end of the first header"
        );
        assert.containsNone(
            buttonTh,
            ".o_resize",
            "Columns without name should not have a resize handle"
        );
    });

    QUnit.test(
        "editable list view, click on m2o dropdown does not close editable row",
        async function (assert) {
            await makeView({
                type: "list",
                resModel: "foo",
                serverData,
                arch: '<tree editable="top"><field name="m2o"/></tree>',
            });

            await click($(".o_list_button_add:visible").get(0));
            assert.strictEqual(
                target.querySelector(".o_selected_row .o_field_many2one input").value,
                ""
            );
            await click(target.querySelector(".o_selected_row .o_field_many2one input"));
            assert.containsOnce(target, ".o_field_many2one .o-autocomplete--dropdown-menu");

            await click(
                target.querySelector(
                    ".o_field_many2one .o-autocomplete--dropdown-menu .dropdown-item"
                )
            );
            assert.strictEqual(
                target.querySelector(".o_selected_row .o_field_many2one input").value,
                "Value 1"
            );
            assert.containsOnce(target, ".o_selected_row", "should still have editable row");
        }
    );

    QUnit.test(
        "width of some of the fields should be hardcoded if no data (grouped case)",
        async function (assert) {
            const assertions = [
                { field: "bar", expected: 70, type: "Boolean" },
                { field: "int_field", expected: 74, type: "Integer" },
                { field: "qux", expected: 92, type: "Float" },
                { field: "date", expected: 92, type: "Date" },
                { field: "datetime", expected: 146, type: "Datetime" },
                { field: "amount", expected: 104, type: "Monetary" },
            ];
            assert.expect(9);

            await makeView({
                type: "list",
                resModel: "foo",
                serverData,
                arch: `
                    <tree editable="top">
                        <field name="bar"/>
                        <field name="foo"/>
                        <field name="int_field"/>
                        <field name="qux"/>
                        <field name="date"/>
                        <field name="datetime"/>
                        <field name="amount"/>
                        <field name="currency_id" width="25px"/>
                    </tree>`,
                groupBy: ["int_field"],
            });

            assert.containsN(target, ".o_resize", 8);
            assertions.forEach((a) => {
                assert.strictEqual(
                    a.expected,
                    target.querySelectorAll(`th[data-name="${a.field}"]`)[0].offsetWidth,
                    `Field ${a.type} should have a fixed width of ${a.expected} pixels`
                );
            });
            assert.strictEqual(
                target.querySelectorAll('th[data-name="foo"]')[0].style.width,
                "100%",
                "Char field should occupy the remaining space"
            );
            assert.strictEqual(
                target.querySelectorAll('th[data-name="currency_id"]')[0].offsetWidth,
                25,
                "Currency field should have a fixed width of 25px (see arch)"
            );
        }
    );

    QUnit.test("column width should depend on the widget", async function (assert) {
        serverData.models.foo.records = []; // the width heuristic only applies when there are no records
        await makeView({
            type: "list",
            resModel: "foo",
            serverData,
            arch: `
                <tree editable="top">
                    <field name="datetime" widget="date"/>
                    <field name="text"/>
                </tree>`,
        });
        assert.strictEqual(
            target.querySelector('th[data-name="datetime"]').offsetWidth,
            92,
            "should be the optimal width to display a date, not a datetime"
        );
    });

    QUnit.test("column widths are kept when adding first record", async function (assert) {
        serverData.models.foo.records = []; // in this scenario, we start with no records
        await makeView({
            type: "list",
            resModel: "foo",
            serverData,
            arch: `
                <tree editable="top">
                    <field name="datetime"/>
                    <field name="text"/>
                </tree>`,
        });

        var width = target.querySelectorAll('th[data-name="datetime"]')[0].offsetWidth;

        await click($(".o_list_button_add:visible").get(0));

        assert.containsOnce(target, ".o_data_row");
        assert.strictEqual(
            target.querySelectorAll('th[data-name="datetime"]')[0].offsetWidth,
            width
        );
    });

    QUnit.test("column widths are kept when editing a record", async function (assert) {
        await makeView({
            type: "list",
            resModel: "foo",
            serverData,
            arch: `
                <tree editable="bottom">
                    <field name="datetime"/>
                    <field name="text"/>
                </tree>`,
        });

        var width = target.querySelectorAll('th[data-name="datetime"]')[0].offsetWidth;

        await click(target.querySelector(".o_data_row:nth-child(1) > .o_data_cell:nth-child(2)"));
        assert.containsOnce(target, ".o_selected_row");

        var longVal =
            "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed blandit, " +
            "justo nec tincidunt feugiat, mi justo suscipit libero, sit amet tempus ipsum purus " +
            "bibendum est.";
        await editInput(target.querySelector(".o_field_widget[name=text] .o_input"), null, longVal);
        await clickSave(target);

        assert.containsNone(target, ".o_selected_row");
        assert.strictEqual(
            target.querySelectorAll('th[data-name="datetime"]')[0].offsetWidth,
            width
        );
    });

    QUnit.test("column widths are kept when switching records in edition", async function (assert) {
        await makeView({
            type: "list",
            resModel: "foo",
            serverData,
            arch: `
                <tree editable="bottom">
                    <field name="m2o"/>
                    <field name="text"/>
                </tree>`,
        });

        const width = target.querySelectorAll('th[data-name="m2o"]')[0].offsetWidth;

        await click(target.querySelector(".o_data_row:nth-child(1) > .o_data_cell:nth-child(2)"));

        assert.hasClass(target.querySelector(".o_data_row:nth-child(1)"), "o_selected_row");
        assert.strictEqual(target.querySelectorAll('th[data-name="m2o"]')[0].offsetWidth, width);

        await click(target.querySelector(".o_data_row:nth-child(2) > .o_data_cell:nth-child(2)"));

        assert.hasClass(target.querySelector(".o_data_row:nth-child(2)"), "o_selected_row");
        assert.strictEqual(target.querySelectorAll('th[data-name="m2o"]')[0].offsetWidth, width);
    });

>>>>>>> df8fd141d10ef9c520871d815f5f490130a62998
    QUnit.test("column widths are re-computed on window resize", async function (assert) {
        serverData.models.foo.records[0].text =
            "Lorem ipsum dolor sit amet, consectetur adipiscing elit. " +
            "Sed blandit, justo nec tincidunt feugiat, mi justo suscipit libero, sit amet tempus " +
            "ipsum purus bibendum est.";

        await makeView({
            type: "list",
            resModel: "foo",
            serverData,
            arch: `
                <tree editable="bottom">
                    <field name="datetime"/>
                    <field name="text"/>
                </tree>`,
        });

        const initialTextWidth = target.querySelectorAll('th[data-name="text"]')[0].offsetWidth;
        const selectorWidth = target.querySelectorAll("th.o_list_record_selector")[0].offsetWidth;

        // simulate a window resize
        target.style.width = target.getBoundingClientRect().width / 2 + "px";
        window.dispatchEvent(new Event("resize"));

        const postResizeTextWidth = target.querySelectorAll('th[data-name="text"]')[0].offsetWidth;
        const postResizeSelectorWidth = target.querySelectorAll("th.o_list_record_selector")[0]
            .offsetWidth;
        assert.ok(postResizeTextWidth < initialTextWidth);
        assert.strictEqual(selectorWidth, postResizeSelectorWidth);
    });

    QUnit.test(
        "editable list view: multi edition error and cancellation handling",
        async function (assert) {
            await makeView({
                type: "list",
                resModel: "foo",
                serverData,
                arch: `
                    <tree multi_edit="1">
                        <field name="foo" required="1"/>
                        <field name="int_field"/>
                    </tree>`,
            });

            assert.containsN(target, ".o_list_record_selector input:enabled", 5);

            // select two records
            const rows = target.querySelectorAll(".o_data_row");
            await click(rows[0], ".o_list_record_selector input");
            await click(rows[1], ".o_list_record_selector input");

            // edit a line and cancel
            await click(rows[0].querySelector(".o_data_cell"));
            assert.containsNone(target, ".o_list_record_selector input:enabled");
            await editInput(target, ".o_selected_row [name=foo] input", "abc");
            await click(target, ".modal .btn.btn-secondary");
            assert.strictEqual(
                $(target).find(".o_data_row:eq(0) .o_data_cell").text(),
                "yop10",
                "first cell should have discarded any change"
            );
            assert.containsN(target, ".o_list_record_selector input:enabled", 5);

            // edit a line with an invalid format type
            await click(rows[0].querySelectorAll(".o_data_cell")[1]);
            assert.containsNone(target, ".o_list_record_selector input:enabled");

            await editInput(target, ".o_selected_row [name=int_field] input", "hahaha");
            assert.containsOnce(target, ".modal", "there should be an opened modal");

            await click(target, ".modal .btn-primary");
            assert.strictEqual(
                $(target).find(".o_data_row:eq(0) .o_data_cell").text(),
                "yop10",
                "changes should be discarded"
            );
            assert.containsN(target, ".o_list_record_selector input:enabled", 5);

            // edit a line with an invalid value
            await click(rows[0].querySelector(".o_data_cell"));
            assert.containsNone(target, ".o_list_record_selector input:enabled");

            await editInput(target, ".o_selected_row [name=foo] input", "");
            assert.containsOnce(target, ".modal", "there should be an opened modal");
            await click(target, ".modal .btn-primary");
            assert.strictEqual(
                $(target).find(".o_data_row:eq(0) .o_data_cell").text(),
                "yop10",
                "changes should be discarded"
            );
            assert.containsN(target, ".o_list_record_selector input:enabled", 5);
        }
    );

    QUnit.test(
        'editable list view: mousedown on "Discard", mouseup somewhere else (no multi-edit)',
        async function (assert) {
            await makeView({
                type: "list",
                arch: `
                    <tree editable="top">
                        <field name="foo"/>
                    </tree>`,
                mockRPC(route, args) {
                    assert.step(args.method);
                },
                serverData,
                resModel: "foo",
            });

            // select two records
            const rows = target.querySelectorAll(".o_data_row");
            await click(rows[0], ".o_list_record_selector input");
            await click(rows[1], ".o_list_record_selector input");
            await click(rows[0].querySelector(".o_data_cell"));
            target.querySelector(".o_data_row .o_data_cell input").value = "oof";

            await triggerEvents($(".o_list_button_discard:visible").get(0), null, ["mousedown"]);
            await triggerEvents(target, ".o_data_row .o_data_cell input", [
                "change",
                "blur",
                "focusout",
            ]);
            await triggerEvents(target, null, ["focus"]);
            await triggerEvents(target, null, ["mouseup"]);
            await click(target);

            assert.containsNone(document.body, ".modal", "should not open modal");
            assert.deepEqual(getNodesTextContent(target.querySelectorAll(".o_data_cell")), [
                "oof",
                "blip",
                "gnap",
                "blip",
            ]);
            assert.verifySteps(["get_views", "web_search_read", "web_save"]);
        }
    );

    QUnit.test(
        "editable readonly list view: single edition does not behave like a multi-edition",
        async function (assert) {
            await makeView({
                type: "list",
                arch: `
                    <tree multi_edit="1">
                        <field name="foo" required="1"/>
                    </tree>`,
                serverData,
                resModel: "foo",
            });

            // select a record
            const rows = target.querySelectorAll(".o_data_row");
            await click(rows[0], ".o_list_record_selector input");

            // edit a field (invalid input)
            await click(rows[0].querySelector(".o_data_cell"));
            await editInput(target, ".o_data_row [name=foo] input", "");
            assert.containsOnce(target, ".modal", "should have a modal (invalid fields)");

            await click(target, ".modal button.btn");

            // edit a field
            await click(rows[0].querySelector(".o_data_cell"));
            await editInput(target, ".o_data_row [name=foo] input", "bar");
            assert.containsNone(target, ".modal", "should not have a modal");
            assert.strictEqual(
                $(target).find(".o_data_row:eq(0) .o_data_cell").text(),
                "bar",
                "the first row should be updated"
            );
        }
    );

    QUnit.test(
        "pressing ESC in editable grouped list should discard the current line changes",
        async function (assert) {
            await makeView({
                type: "list",
                resModel: "foo",
                serverData,
                arch: '<tree editable="top"><field name="foo"/><field name="bar"/></tree>',
                groupBy: ["bar"],
            });

            await click(target.querySelectorAll(".o_group_header")[1]); // open second group
            assert.containsN(target, "tr.o_data_row", 3);

            await click(target.querySelector(".o_data_cell"));

            // update foo field of edited row
            await editInput(target, ".o_data_cell [name=foo] input", "new_value");
            assert.strictEqual(
                document.activeElement,
                target.querySelector(".o_data_cell [name=foo] input")
            );
            // discard by pressing ESC
            triggerHotkey("Escape");
            await nextTick();
            assert.containsNone(target, ".modal");

            assert.containsOnce(target, "tbody tr td:contains(yop)");
            assert.containsN(target, "tr.o_data_row", 3);
            assert.containsNone(target, "tr.o_data_row.o_selected_row");
            assert.isNotVisible(target.querySelector(".o_list_button_save"));
        }
    );

    QUnit.test("editing then pressing TAB in editable grouped list", async function (assert) {
        await makeView({
            type: "list",
            resModel: "foo",
            serverData,
            arch: '<tree editable="bottom"><field name="foo"/></tree>',
            mockRPC(route, args) {
                assert.step(args.method || route);
            },
            groupBy: ["bar"],
        });

        // open two groups
        await click(getGroup(1));
        assert.containsN(target, ".o_data_row", 1, "first group contains 1 rows");
        await click(getGroup(2));
        assert.containsN(target, ".o_data_row", 4, "first group contains 3 row");

        // select and edit last row of first group
        await click(target.querySelector(".o_data_row").querySelector(".o_data_cell"));
        assert.hasClass($(target).find(".o_data_row:nth(0)"), "o_selected_row");
        await editInput(target, '.o_selected_row [name="foo"] input', "new value");

        // Press 'Tab' -> should create a new record as we edited the previous one
        triggerHotkey("Tab");
        await nextTick();
        assert.containsN(target, ".o_data_row", 5);
        assert.hasClass($(target).find(".o_data_row:nth(1)"), "o_selected_row");

        // fill foo field for the new record and press 'tab' -> should create another record
        await editInput(target, '.o_selected_row [name="foo"] input', "new record");
        triggerHotkey("Tab");
        await nextTick();

        assert.containsN(target, ".o_data_row", 6);
        assert.hasClass($(target).find(".o_data_row:nth(2)"), "o_selected_row");

        // leave this new row empty and press tab -> should discard the new record and move to the
        // next group
        triggerHotkey("Tab");
        await nextTick();
        assert.containsN(target, ".o_data_row", 5);
        assert.hasClass($(target).find(".o_data_row:nth(2)"), "o_selected_row");

        assert.verifySteps([
            "get_views",
            "web_read_group",
            "web_search_read",
            "web_search_read",
            "web_save",
            "onchange",
            "web_save",
            "onchange",
        ]);
    });

    QUnit.test("cell-level keyboard navigation in editable grouped list", async function (assert) {
        serverData.models.foo.records[0].bar = false;
        serverData.models.foo.records[1].bar = false;
        serverData.models.foo.records[2].bar = false;
        serverData.models.foo.records[3].bar = true;

        await makeView({
            type: "list",
            resModel: "foo",
            serverData,
            arch: `
                <tree editable="bottom">
                    <field name="foo" required="1"/>
                </tree>`,
            groupBy: ["bar"],
        });

        await click(target.querySelector(".o_group_name"));
        const secondDataRow = target.querySelectorAll(".o_data_row")[1];
        await click(secondDataRow, "[name=foo]");
        assert.hasClass(secondDataRow, "o_selected_row");

        await editInput(secondDataRow, "[name=foo] input", "blipbloup");

        triggerHotkey("Escape");
        await nextTick();

        assert.containsNone(document.body, ".modal");

        assert.doesNotHaveClass(secondDataRow, "o_selected_row");

        assert.strictEqual(document.activeElement, secondDataRow.querySelector("[name=foo]"));

        assert.strictEqual(document.activeElement.textContent, "blip");

        triggerHotkey("ArrowLeft");

        assert.strictEqual(
            document.activeElement,
            secondDataRow.querySelector("input[type=checkbox]")
        );

        triggerHotkey("ArrowUp");
        triggerHotkey("ArrowRight");

        const firstDataRow = target.querySelector(".o_data_row");
        assert.strictEqual(document.activeElement, firstDataRow.querySelector("[name=foo]"));

        triggerHotkey("Enter");
        await nextTick();

        assert.hasClass(firstDataRow, "o_selected_row");
        await editInput(firstDataRow, "[name=foo] input", "Zipadeedoodah");

        triggerHotkey("Enter");
        await nextTick();

        assert.strictEqual(firstDataRow.querySelector("[name=foo]").innerText, "Zipadeedoodah");
        assert.doesNotHaveClass(firstDataRow, "o_selected_row");
        assert.hasClass(secondDataRow, "o_selected_row");
        assert.strictEqual(document.activeElement, secondDataRow.querySelector("[name=foo] input"));
        assert.strictEqual(document.activeElement.value, "blip");

        triggerHotkey("ArrowUp");
        triggerHotkey("ArrowRight");
        await nextTick();

        assert.strictEqual(document.activeElement, secondDataRow.querySelector("[name=foo] input"));
        assert.strictEqual(document.activeElement.value, "blip");

        triggerHotkey("ArrowDown");
        triggerHotkey("ArrowLeft");
        await nextTick();

        assert.strictEqual(
            document.activeElement,
            secondDataRow.querySelector("td[name=foo] input")
        );
        assert.strictEqual(document.activeElement.value, "blip");

        triggerHotkey("Escape");
        await nextTick();

        assert.doesNotHaveClass(secondDataRow, "o_selected_row");

        assert.strictEqual(document.activeElement, secondDataRow.querySelector("td[name=foo]"));

        triggerHotkey("ArrowDown");
        triggerHotkey("ArrowDown");

        assert.strictEqual(
            document.activeElement,
            target.querySelector(".o_group_field_row_add a")
        );

        triggerHotkey("ArrowDown");

        const secondGroupHeader = target.querySelectorAll(".o_group_name")[1];
        assert.strictEqual(document.activeElement, secondGroupHeader);

        assert.containsN(target, ".o_data_row", 3);

        triggerHotkey("Enter");
        await nextTick();

        assert.containsN(target, ".o_data_row", 4);

        assert.strictEqual(document.activeElement, secondGroupHeader);

        triggerHotkey("ArrowDown");

        const fourthDataRow = target.querySelectorAll(".o_data_row")[3];
        assert.strictEqual(document.activeElement, fourthDataRow.querySelector("[name=foo]"));

        triggerHotkey("ArrowDown");

        assert.strictEqual(
            document.activeElement,
            target.querySelectorAll(".o_group_field_row_add a")[1]
        );

        triggerHotkey("ArrowDown");

        assert.strictEqual(
            document.activeElement,
            target.querySelectorAll(".o_group_field_row_add a")[1]
        );

        // default Enter on a A tag
        const event = await triggerEvent(document.activeElement, null, "keydown", { key: "Enter" });
        assert.ok(!event.defaultPrevented);
        await click(target.querySelectorAll(".o_group_field_row_add a")[1]);

        const fifthDataRow = target.querySelectorAll(".o_data_row")[4];
        assert.strictEqual(document.activeElement, fifthDataRow.querySelector("[name=foo] input"));

        await editInput(
            fifthDataRow.querySelector("[name=foo] input"),
            null,
            "cheateur arrete de cheater"
        );

        triggerHotkey("Enter");
        await nextTick();

        assert.containsN(target, ".o_data_row", 6);

        triggerHotkey("Escape");
        await nextTick();

        assert.strictEqual(
            document.activeElement,
            target.querySelectorAll(".o_group_field_row_add a")[1]
        );

        // come back to the top
        for (let i = 0; i < 9; i++) {
            triggerHotkey("ArrowUp");
        }

        assert.strictEqual(document.activeElement, target.querySelector("thead th:nth-child(2)"));

        triggerHotkey("ArrowLeft");

        assert.strictEqual(
            document.activeElement,
            target.querySelector("thead th.o_list_record_selector input")
        );

        triggerHotkey("ArrowDown");
        triggerHotkey("ArrowDown");
        triggerHotkey("ArrowRight");

        assert.strictEqual(document.activeElement, firstDataRow.querySelector("td[name=foo]"));

        triggerHotkey("ArrowUp");

        assert.strictEqual(
            document.activeElement,
            target.querySelector(".o_group_header:nth-child(1) .o_group_name")
        );

        assert.containsN(target, ".o_data_row", 5);

        triggerHotkey("Enter");
        await nextTick();

        assert.containsN(target, ".o_data_row", 2);

        assert.strictEqual(
            document.activeElement,
            target.querySelector(".o_group_header:nth-child(1) .o_group_name")
        );

        triggerHotkey("ArrowRight");
        await nextTick();

        assert.containsN(target, ".o_data_row", 5);

        assert.strictEqual(
            document.activeElement,
            target.querySelector(".o_group_header:nth-child(1) .o_group_name")
        );

        triggerHotkey("ArrowRight");
        await nextTick();

        assert.containsN(target, ".o_data_row", 5);

        assert.strictEqual(
            document.activeElement,
            target.querySelector(".o_group_header:nth-child(1) .o_group_name")
        );

        triggerHotkey("ArrowLeft");
        await nextTick();

        assert.containsN(target, ".o_data_row", 2);

        assert.strictEqual(
            document.activeElement,
            target.querySelector(".o_group_header:nth-child(1) .o_group_name")
        );

        triggerHotkey("ArrowLeft");
        await nextTick();

        assert.containsN(target, ".o_data_row", 2);
        assert.strictEqual(
            document.activeElement,
            target.querySelector(".o_group_header:nth-child(1) .o_group_name")
        );

        triggerHotkey("ArrowDown");

        assert.strictEqual(
            document.activeElement,
            target.querySelector(".o_group_header:nth-child(2) .o_group_name")
        );

        triggerHotkey("ArrowDown");

        const firstVisibleDataRow = target.querySelector(".o_data_row");
        assert.strictEqual(document.activeElement, firstVisibleDataRow.querySelector("[name=foo]"));

        triggerHotkey("ArrowDown");

        const secondVisibleDataRow = target.querySelectorAll(".o_data_row")[1];
        assert.strictEqual(
            document.activeElement,
            secondVisibleDataRow.querySelector("[name=foo]")
        );

        triggerHotkey("ArrowDown");

        assert.strictEqual(
            document.activeElement,
            target.querySelector(".o_group_field_row_add a")
        );

        triggerHotkey("ArrowUp");

        assert.strictEqual(
            document.activeElement,
            secondVisibleDataRow.querySelector("[name=foo]")
        );

        triggerHotkey("ArrowUp");
        assert.strictEqual(document.activeElement, firstVisibleDataRow.querySelector("[name=foo]"));
    });

    QUnit.test("editable list: resize column headers", async function (assert) {
        // This test will ensure that, on resize list header,
        // the resized element have the correct size and other elements are not resized
        serverData.models.foo.records[0].foo = "a".repeat(200);

        await makeView({
            type: "list",
            resModel: "foo",
            serverData,
            arch: `
                <tree editable="top">
                    <field name="foo"/>
                    <field name="bar"/>
                    <field name="reference" optional="hide"/>
                </tree>`,
        });

        // Target handle
        const th = target.querySelector("th:nth-child(2)");
        const thNext = target.querySelector("th:nth-child(3)");
        const resizeHandle = th.querySelector(".o_resize");
        const nextResizeHandle = thNext.querySelector(".o_resize");
        const thOriginalWidth = th.getBoundingClientRect().width;
        const thNextOriginalWidth = thNext.getBoundingClientRect().width;
        const thExpectedWidth = thOriginalWidth + thNextOriginalWidth;

        await dragAndDrop(resizeHandle, nextResizeHandle);

        const thFinalWidth = th.getBoundingClientRect().width;
        const thNextFinalWidth = thNext.getBoundingClientRect().width;

        assert.ok(
            Math.abs(Math.floor(thFinalWidth) - Math.floor(thExpectedWidth)) <= 1,
            `Wrong width on resize (final: ${thFinalWidth}, expected: ${thExpectedWidth})`
        );
        assert.strictEqual(
            Math.floor(thNextOriginalWidth),
            Math.floor(thNextFinalWidth),
            "Width must not have been changed"
        );
    });

    QUnit.test(
        "continue creating new lines in editable=top on keyboard nav",
        async function (assert) {
            await makeView({
                type: "list",
                resModel: "foo",
                serverData,
                arch: `
                <tree editable="top">
                    <field name="int_field"/>
                </tree>`,
            });

            const initialRowCount = $(".o_data_cell[name=int_field]").length;

            // click on int_field cell of first row
            await click($(".o_list_button_add:visible").get(0));

            await editInput(target, ".o_data_cell[name=int_field] input", "1");
            triggerHotkey("Tab");
            await nextTick();

            await editInput(target, ".o_data_cell[name=int_field] input", "2");
            triggerHotkey("Enter");
            await nextTick();

            // 3 new rows: the two created ("1" and "2", and a new still in edit mode)
            assert.strictEqual($(".o_data_cell[name=int_field]").length, initialRowCount + 3);
        }
    );
});
