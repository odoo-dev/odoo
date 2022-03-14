/** @odoo-module **/

import {
    makeFakeNotificationService,
    makeFakeLocalizationService,
} from "@web/../tests/helpers/mock_services";
import { registry } from "@web/core/registry";
import { click, editInput, getFixture } from "../helpers/utils";
import { makeView, setupViewRegistries } from "../views/helpers";

let serverData;
let target;

QUnit.module("Fields", (hooks) => {
    hooks.beforeEach(() => {
        target = getFixture();
        serverData = {
            models: {
                partner: {
                    fields: {
                        foo: {
                            string: "Foo",
                            type: "char",
                            default: "My little Foo Value",
                            trim: true,
                        },
                        int_field: {
                            string: "int_field",
                            type: "integer",
                            sortable: true,
                            searchable: true,
                        },
                        float_field: {
                            string: "Float_field",
                            type: "float",
                            digits: [16, 1],
                            searchable: true,
                        },
                    },
                    records: [
                        {
                            int_field: 10,
                            float_field: 0.44444,
                        },
                    ],
                },
            },
        };

        setupViewRegistries();
    });

    QUnit.module("ProgressBarField");

    QUnit.test("ProgressBarField: max_value should update", async function (assert) {
        assert.expect(3);

        serverData.models.partner.records = serverData.models.partner.records.slice(0, 1);
        serverData.models.partner.records[0].float_field = 2;

        serverData.models.partner.onchanges = {
            display_name(obj) {
                obj.int_field = 999;
                obj.float_field = 5;
            },
        };

        await makeView({
            serverData,
            type: "form",
            resModel: "partner",
            arch:
                "<form>" +
                '<field name="display_name" />' +
                '<field name="float_field" invisible="1" />' +
                "<field name=\"int_field\" widget=\"progressbar\" options=\"{'current_value': 'int_field', 'max_value': 'float_field'}\" />" +
                "</form>",
            resId: 1,
            mockRPC(route, { method, args }) {
                if (method === "write") {
                    assert.deepEqual(
                        args[1],
                        { int_field: 999, float_field: 5, display_name: "new name" },
                        "New value of progress bar saved"
                    );
                }
            },
        });

        assert.strictEqual(
            target.querySelector(".o_progressbar_value").innerText,
            "10 / 2",
            "The initial value of the progress bar should be correct"
        );
        // The view should be in edit mode
        await click(target.querySelector(".o_form_button_edit"));

        await editInput(target, ".o_field_widget[name=display_name] input", "new name");
        await click(target.querySelector(".o_form_button_save"));

        assert.strictEqual(
            target.querySelector(".o_progressbar_value").innerText,
            "999 / 5",
            "The value of the progress bar should be correct after the update"
        );
    });

    QUnit.test(
        "ProgressBarField: value should update in edit mode when typing in input",
        async function (assert) {
            assert.expect(5);
            serverData.models.partner.records[0].int_field = 99;

            await makeView({
                serverData,
                type: "form",
                resModel: "partner",
                arch:
                    "<form>" +
                    '<field name="int_field" widget="progressbar" options="{\'editable\': true}" />' +
                    "</form>",
                resId: 1,
                mockRPC(route, { method, args }) {
                    if (method === "write") {
                        assert.strictEqual(
                            args[1].int_field,
                            69,
                            "New value of progress bar saved"
                        );
                    }
                },
            });

            // The view should be in edit mode by default
            await click(target.querySelector(".o_form_button_edit"));

            assert.ok(target.querySelector(".o_form_view .o_form_editable"), "Form in edit mode");

            const input = target.querySelector(".o_progressbar_value.o_input");

            assert.strictEqual(input.value, "99", "Initial value should be correct");

            // Clicking on the progress bar should not change the value
            await click(target.querySelector(".o_progress"));

            assert.strictEqual(input.value, "99", "Initial value in input is still correct");

            await editInput(target, ".o_progressbar_value.o_input", "69");

            await click(target.querySelector(".o_form_button_save"));

            assert.strictEqual(
                target.querySelector(".o_progressbar_value").innerText,
                "69%",
                "New value should be different than initial after click"
            );
        }
    );

    QUnit.test(
        "ProgressBarField: value should update in edit mode when typing in input with field max value",
        async function (assert) {
            assert.expect(5);
            serverData.models.partner.records[0].int_field = 99;

            await makeView({
                serverData,
                type: "form",
                resModel: "partner",
                arch:
                    "<form>" +
                    '<field name="float_field" invisible="1" />' +
                    "<field name=\"int_field\" widget=\"progressbar\" options=\"{'editable': true, 'max_value': 'float_field'}\" />" +
                    "</form>",
                resId: 1,
                mockRPC(route, { method, args }) {
                    if (method === "write") {
                        assert.strictEqual(
                            args[1].int_field,
                            69,
                            "New value of progress bar saved"
                        );
                    }
                },
            });
            // The view should be in edit mode by default
            await click(target.querySelector(".o_form_button_edit"));

            assert.ok(target.querySelector(".o_form_view .o_form_editable"), "Form in edit mode");
            assert.ok(
                target.querySelector(".o_progressbar_value").value === "99" &&
                    target.querySelectorAll(".o_progressbar_value")[1].innerText === "0.44444",
                "Initial value should be correct"
            );

            await click(target.querySelector(".o_progress"));

            const input = target.querySelector(".o_progressbar_value.o_input");
            assert.strictEqual(input.value, "99", "Initial value in input is still correct");

            await editInput(target, ".o_progressbar_value.o_input", "69");

            await click(target.querySelector(".o_form_button_save"));

            assert.strictEqual(
                target.querySelector(".o_progressbar_value").innerText,
                "69 / 0.44444",
                "New value should be different than initial after click"
            );
        }
    );

    QUnit.test(
        "ProgressBarField: max value should update in edit mode when typing in input with field max value",
        async function (assert) {
            assert.expect(5);
            serverData.models.partner.records[0].int_field = 99;

            await makeView({
                serverData,
                type: "form",
                resModel: "partner",
                arch:
                    "<form>" +
                    '<field name="float_field" invisible="1" />' +
                    "<field name=\"int_field\" widget=\"progressbar\" options=\"{'editable': true, 'max_value': 'float_field', 'edit_max_value': true}\" />" +
                    "</form>",
                resId: 1,
                mockRPC(route, { method, args }) {
                    if (method === "write") {
                        assert.strictEqual(
                            args[1].float_field,
                            69,
                            "New value of progress bar saved"
                        );
                    }
                },
            });

            assert.strictEqual(
                target.querySelector(".o_progressbar_value").innerText,
                "99 / 0.44444",
                "Initial value should be correct"
            );
            // The view should be in edit mode by default
            await click(target.querySelector(".o_form_button_edit"));

            assert.ok(target.querySelector(".o_form_view .o_form_editable"), "Form in edit mode");

            await click(target.querySelector(".o_progress"));

            const input = target.querySelector(".o_progressbar_value.o_input");
            assert.strictEqual(input.value, "0.44444", "Initial value in input is correct");

            await editInput(target, ".o_progressbar_value.o_input", "69");

            await click(target.querySelector(".o_form_button_save"));

            assert.strictEqual(
                target.querySelector(".o_progressbar_value").innerText,
                "99 / 69",
                "New value should be different than initial after click"
            );
        }
    );

    QUnit.test(
        "ProgressBarField: update both max value and current value in edit mode when both options are given",
        async function (assert) {
            assert.expect(7);
            serverData.models.partner.records[0].int_field = 99;

            await makeView({
                serverData,
                type: "form",
                resModel: "partner",
                arch:
                    "<form>" +
                    '<field name="float_field" invisible="1" />' +
                    "<field name=\"int_field\" widget=\"progressbar\" options=\"{'editable': true, 'max_value': 'float_field', 'edit_max_value': true, 'edit_current_value': true}\" />" +
                    "</form>",
                resId: 1,
                mockRPC(route, { method, args }) {
                    if (method === "write") {
                        assert.strictEqual(
                            args[1].int_field,
                            2000,
                            "New value of current value saved"
                        );
                        assert.strictEqual(args[1].float_field, 69, "New value of max value saved");
                    }
                },
            });

            assert.strictEqual(
                target.querySelector(".o_progressbar_value").innerText,
                "99 / 0.44444",
                "Initial value should be correct"
            );
            // The view should be in edit mode by default
            await click(target.querySelector(".o_form_button_edit"));

            assert.ok(target.querySelector(".o_form_view .o_form_editable"), "Form in edit mode");

            await click(target.querySelector(".o_progress"));

            const currentVal = target.querySelectorAll(".o_progressbar_value.o_input")[0];
            const maxVal = target.querySelectorAll(".o_progressbar_value.o_input")[1];
            assert.strictEqual(currentVal.value, "99", "Initial value in input is correct");
            assert.strictEqual(maxVal.value, "0.44444", "Initial value in input is correct");

            await editInput(target, ".o_progressbar input:nth-of-type(1)", "2000");
            await editInput(target, ".o_progressbar input:nth-of-type(2)", "69");

            await click(target.querySelector(".o_form_button_save"));

            assert.strictEqual(
                target.querySelector(".o_progressbar_value").innerText,
                "2000 / 69",
                "New value should be different than initial after click"
            );
        }
    );

    QUnit.test("ProgressBarField: Standard readonly mode is readonly", async function (assert) {
        assert.expect(5);
        serverData.models.partner.records[0].int_field = 99;

        await makeView({
            serverData,
            type: "form",
            resModel: "partner",
            arch:
                "<form>" +
                '<field name="float_field" invisible="1" />' +
                "<field name=\"int_field\" widget=\"progressbar\" options=\"{'editable': true, 'max_value': 'float_field', 'edit_max_value': true}\" />" +
                "</form>",
            resId: 1,
            mockRPC(route) {
                assert.step(route);
            },
        });

        assert.ok(target.querySelector(".o_form_view .o_form_readonly"), "Form in readonly mode");

        assert.strictEqual(
            target.querySelector(".o_progressbar_value").innerText,
            "99 / 0.44444",
            "Initial value should be correct"
        );

        await click(target.querySelector(".o_progress"));

        assert.containsNone(target, ".o_progressbar_value.o_input", "no input in readonly mode");

        assert.verifySteps(["/web/dataset/call_kw/partner/read"]);
    });

    QUnit.test(
        "ProgressBarField: write float instead of int works, in locale",
        async function (assert) {
            assert.expect(5);
            serverData.models.partner.records[0].int_field = 99;

            await makeView({
                serverData,
                type: "form",
                resModel: "partner",
                arch:
                    "<form>" +
                    '<field name="int_field" widget="progressbar" options="{\'editable\': true}" />' +
                    "</form>",
                resId: 1,
                mockRPC: function (route, { method, args }) {
                    if (method === "write") {
                        assert.strictEqual(
                            args[1].int_field,
                            1037,
                            "New value of progress bar saved"
                        );
                    }
                },
            });

            registry.category("services").remove("localization");
            registry
                .category("services")
                .add(
                    "localization",
                    makeFakeLocalizationService({ thousandsSep: "#", decimalPoint: ":" })
                );

            assert.strictEqual(
                target.querySelector(".o_progressbar_value").innerText,
                "99%",
                "Initial value should be correct"
            );

            await click(target.querySelector(".o_form_button_edit"));
            assert.ok(target.querySelector(".o_form_view .o_form_editable"), "Form in edit mode");

            await click(target.querySelector(".o_progress"));

            const input = target.querySelector(".o_progressbar_value.o_input");
            assert.strictEqual(input.value, "99", "Initial value in input is correct");

            await editInput(target, "input", "1#037:9");

            await click(target.querySelector(".o_form_button_save"));

            assert.strictEqual(
                target.querySelector(".o_progressbar_value").innerText,
                "1037%",
                "New value should be different than initial after click"
            );
        }
    );

    QUnit.test(
        "ProgressBarField: write gibbrish instead of int throws warning",
        async function (assert) {
            assert.expect(6);

            serverData.models.partner.records[0].int_field = 99;
            const mock = () => {
                assert.step("Show error message");
                return () => {};
            };
            registry.category("services").add("notification", makeFakeNotificationService(mock), {
                force: true,
            });

            await makeView({
                serverData,
                type: "form",
                resModel: "partner",
                arch:
                    "<form>" +
                    '<field name="int_field" widget="progressbar" options="{\'editable\': true}" />' +
                    "</form>",
                resId: 1,
            });
            // The view should be in edit mode by default
            await click(target.querySelector(".o_form_button_edit"));

            assert.ok(target.querySelector(".o_form_view .o_form_editable"), "Form in edit mode");

            assert.strictEqual(
                target.querySelector(".o_progressbar_value").value,
                "99",
                "Initial value should be correct"
            );

            const input = target.querySelector(".o_progressbar_value.o_input");

            assert.strictEqual(input.value, "99", "Initial value in input is correct");

            await editInput(target, ".o_progressbar_value.o_input", "trente sept virgule neuf");

            await click(target.querySelector(".o_form_button_save"));

            assert.containsOnce(target, ".o_form_button_save", "The form has not been saved");
            assert.verifySteps(["Show error message"], "The error message was shown correctly");
        }
    );
});
