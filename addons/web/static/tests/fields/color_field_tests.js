/** @odoo-module **/

import { dialogService } from "@web/core/dialog/dialog_service";
import { registry } from "@web/core/registry";
import { makeFakeLocalizationService, makeFakeUserService } from "../helpers/mock_services";
import { click, makeDeferred, nextTick, triggerEvent, triggerEvents } from "../helpers/utils";
import {
    setupControlPanelFavoriteMenuRegistry,
    setupControlPanelServiceRegistry,
} from "../search/helpers";
import { makeView } from "../views/helpers";

const serviceRegistry = registry.category("services");

let serverData;

function hasGroup(group) {
    return group === "base.group_allow_export";
}

QUnit.module("Fields", (hooks) => {
    hooks.beforeEach(() => {
        serverData = {
            models: {
                partner: {
                    fields: {
                        date: { string: "A date", type: "date", searchable: true },
                        datetime: { string: "A datetime", type: "datetime", searchable: true },
                        display_name: { string: "Displayed name", type: "char", searchable: true },
                        foo: {
                            string: "Foo",
                            type: "char",
                            default: "My little Foo Value",
                            searchable: true,
                            trim: true,
                        },
                        bar: { string: "Bar", type: "boolean", default: true, searchable: true },
                        empty_string: {
                            string: "Empty string",
                            type: "char",
                            default: false,
                            searchable: true,
                            trim: true,
                        },
                        txt: {
                            string: "txt",
                            type: "text",
                            default: "My little txt Value\nHo-ho-hoooo Merry Christmas",
                        },
                        int_field: {
                            string: "int_field",
                            type: "integer",
                            sortable: true,
                            searchable: true,
                        },
                        qux: { string: "Qux", type: "float", digits: [16, 1], searchable: true },
                        p: {
                            string: "one2many field",
                            type: "one2many",
                            relation: "partner",
                            searchable: true,
                        },
                        trululu: {
                            string: "Trululu",
                            type: "many2one",
                            relation: "partner",
                            searchable: true,
                        },
                        timmy: {
                            string: "pokemon",
                            type: "many2many",
                            relation: "partner_type",
                            searchable: true,
                        },
                        product_id: {
                            string: "Product",
                            type: "many2one",
                            relation: "product",
                            searchable: true,
                        },
                        sequence: { type: "integer", string: "Sequence", searchable: true },
                        currency_id: {
                            string: "Currency",
                            type: "many2one",
                            relation: "currency",
                            searchable: true,
                        },
                        selection: {
                            string: "Selection",
                            type: "selection",
                            searchable: true,
                            selection: [
                                ["normal", "Normal"],
                                ["blocked", "Blocked"],
                                ["done", "Done"],
                            ],
                        },
                        document: { string: "Binary", type: "binary" },
                        hex_color: { string: "hexadecimal color", type: "char" },
                    },
                    records: [
                        {
                            id: 1,
                            date: "2017-02-03",
                            datetime: "2017-02-08 10:00:00",
                            display_name: "first record",
                            bar: true,
                            foo: "yop",
                            int_field: 10,
                            qux: 0.44444,
                            p: [],
                            timmy: [],
                            trululu: 4,
                            selection: "blocked",
                            document: "coucou==\n",
                            hex_color: "#ff0000",
                        },
                        {
                            id: 2,
                            display_name: "second record",
                            bar: true,
                            foo: "blip",
                            int_field: 0,
                            qux: 0,
                            p: [],
                            timmy: [],
                            trululu: 1,
                            sequence: 4,
                            currency_id: 2,
                            selection: "normal",
                        },
                        {
                            id: 4,
                            display_name: "aaa",
                            foo: "abc",
                            sequence: 9,
                            int_field: false,
                            qux: false,
                            selection: "done",
                        },
                        { id: 3, bar: true, foo: "gnap", int_field: 80, qux: -3.89859 },
                        { id: 5, bar: false, foo: "blop", int_field: -4, qux: 9.1, currency_id: 1 },
                    ],
                    onchanges: {},
                },
                product: {
                    fields: {
                        name: { string: "Product Name", type: "char", searchable: true },
                    },
                    records: [
                        {
                            id: 37,
                            display_name: "xphone",
                        },
                        {
                            id: 41,
                            display_name: "xpad",
                        },
                    ],
                },
                partner_type: {
                    fields: {
                        name: { string: "Partner Type", type: "char", searchable: true },
                        color: { string: "Color index", type: "integer", searchable: true },
                    },
                    records: [
                        { id: 12, display_name: "gold", color: 2 },
                        { id: 14, display_name: "silver", color: 5 },
                    ],
                },
                currency: {
                    fields: {
                        digits: { string: "Digits" },
                        symbol: { string: "Currency Sumbol", type: "char", searchable: true },
                        position: { string: "Currency Position", type: "char", searchable: true },
                    },
                    records: [
                        {
                            id: 1,
                            display_name: "$",
                            symbol: "$",
                            position: "before",
                        },
                        {
                            id: 2,
                            display_name: "€",
                            symbol: "€",
                            position: "after",
                        },
                    ],
                },
                "ir.translation": {
                    fields: {
                        lang: { type: "char" },
                        value: { type: "char" },
                        res_id: { type: "integer" },
                    },
                    records: [
                        {
                            id: 99,
                            res_id: 37,
                            value: "",
                            lang: "en_US",
                        },
                    ],
                },
            },
        };

        setupControlPanelFavoriteMenuRegistry();
        setupControlPanelServiceRegistry();
        serviceRegistry.add("dialog", dialogService);
        serviceRegistry.add("user", makeFakeUserService(hasGroup), { force: true });
    });

    QUnit.module("ColorField", {
        before: function () {
            return ajax.loadXML("/web/static/src/legacy/xml/colorpicker.xml", core.qweb);
        },
    });

    QUnit.skip("ColorField: default widget state", async function (assert) {
        assert.expect(4);

        var form = await createView({
            View: FormView,
            model: "partner",
            data: this.data,
            arch: "<form>" + '<field name="hex_color" widget="color" />' + "</form>",
            res_id: 1,
            viewOptions: {
                mode: "edit",
            },
        });

        await testUtils.dom.click(form.$(".o_field_color"));
        assert.containsOnce($, ".modal");
        assert.containsNone(
            $(".modal"),
            ".o_opacity_slider",
            "Opacity slider should not be present"
        );
        assert.containsNone($(".modal"), ".o_opacity_input", "Opacity input should not be present");

        await testUtils.dom.click($('.modal .btn:contains("Discard")'));

        assert.strictEqual(
            document.activeElement,
            form.$(".o_field_color")[0],
            "Focus should go back to the color field"
        );

        form.destroy();
    });

    QUnit.skip("ColorField: behaviour in different views", async function (assert) {
        assert.expect(2);

        this.data.partner.records[0].p = [4, 2];
        this.data.partner.records[1].hex_color = "#ff0080";

        const form = await createView({
            arch:
                "<form>" +
                '<field name="hex_color" widget="color"/>' +
                '<field name="p">' +
                '<tree editable="top">' +
                '<field name="display_name"/>' +
                '<field name="hex_color" widget="color"/>' +
                "</tree>" +
                "</field>" +
                "</form>",
            data: this.data,
            model: "partner",
            res_id: 1,
            View: FormView,
        });

        await testUtils.dom.click(form.$(".o_field_color:first()"));
        assert.containsNone(
            $(document.body),
            ".modal",
            "Color field in readonly shouldn't be editable"
        );

        const rowInitialHeight = form.$(".o_data_row:first()").height();

        await testUtils.form.clickEdit(form);
        await testUtils.dom.click(form.$(".o_data_row:first() .o_data_cell:first()"));

        assert.strictEqual(
            rowInitialHeight,
            form.$(".o_data_row:first()").height(),
            "Color field shouldn't change the color height when edited"
        );

        form.destroy();
    });

    QUnit.skip("ColorField: pick and reset colors", async function (assert) {
        assert.expect(2);

        var form = await createView({
            View: FormView,
            model: "partner",
            data: this.data,
            arch: "<form>" + '<field name="hex_color" widget="color" />' + "</form>",
            res_id: 1,
            viewOptions: {
                mode: "edit",
            },
        });

        assert.strictEqual(
            $(".o_field_color").css("backgroundColor"),
            "rgb(255, 0, 0)",
            "Background of the color field should be initially red"
        );

        await testUtils.dom.click(form.$(".o_field_color"));
        await testUtils.fields.editAndTrigger($(".modal .o_hex_input"), "#00ff00", ["change"]);
        await testUtils.dom.click($('.modal .btn:contains("Choose")'));

        assert.strictEqual(
            $(".o_field_color").css("backgroundColor"),
            "rgb(0, 255, 0)",
            "Background of the color field should be updated to green"
        );

        form.destroy();
    });
});
