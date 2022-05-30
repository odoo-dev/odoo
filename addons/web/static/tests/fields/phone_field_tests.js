/** @odoo-module **/

import { click, editInput, getFixture, triggerEvent } from "../helpers/utils";
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
                    },
                    records: [
                        {
                            foo: "yop",
                        },
                        {
                            foo: "blip",
                        },
                    ],
                },
            },
        };

        setupViewRegistries();
    });

    QUnit.module("PhoneField");

    QUnit.test("PhoneField in form view on normal screens", async function (assert) {
        assert.expect(6);

        await makeView({
            serverData,
            type: "form",
            resModel: "partner",
            arch:
                '<form string="Partners">' +
                "<sheet>" +
                "<group>" +
                '<field name="foo" widget="phone"/>' +
                "</group>" +
                "</sheet>" +
                "</form>",
            resId: 1,
            // config: {
            //     device: {
            //         size_class: config.device.SIZES.LG,
            //     },
            // },
        });

        const phone = target.querySelector(".o_field_phone a");
        assert.containsOnce(
            target,
            phone,
            "should have rendered the phone number as a link with correct classes"
        );
        assert.strictEqual(phone.textContent, "yop", "value should be displayed properly");
        assert.hasAttrValue(phone, "href", "tel:yop", "should have proper tel prefix");

        // switch to edit mode and check the result
        await click(target.querySelector(".o_form_button_edit"));
        assert.containsOnce(
            target,
            'input[type="phone"]',
            "should have an input for the phone field"
        );
        assert.strictEqual(
            target.querySelector('input[type="phone"]').value,
            "yop",
            "input should contain field value in edit mode"
        );

        // change value in edit mode
        await editInput(target, "input[type='phone']", "new");

        // save
        await click(target.querySelector(".o_form_button_save"));
        assert.strictEqual(
            target.querySelector(".o_field_phone a").textContent,
            "new",
            "new value should be displayed properly"
        );
    });

    QUnit.test("PhoneField in editable list view on normal screens", async function (assert) {
        assert.expect(8);

        await makeView({
            serverData,
            type: "list",
            resModel: "partner",
            arch: '<tree editable="bottom"><field name="foo" widget="phone"/></tree>',
            // config: {
            //     device: {
            //         size_class: config.device.SIZES.LG,
            //     },
            // },
        });

        assert.containsN(target, "tbody td:not(.o_list_record_selector).o_data_cell", 2);
        assert.strictEqual(
            target.querySelector("tbody td:not(.o_list_record_selector) a").textContent,
            "yop",
            "value should be displayed properly with a link to send SMS"
        );

        assert.containsN(
            target,
            ".o_field_widget a.o_form_uri.o_phone_link",
            2,
            "should have the correct classnames"
        );

        // Edit a line and check the result
        let cell = target.querySelector("tbody td:not(.o_list_record_selector)");
        await click(cell);
        assert.hasClass(cell.parentElement, "o_selected_row", "should be set as edit mode");
        assert.strictEqual(
            cell.querySelector("input").value,
            "yop",
            "should have the corect value in internal input"
        );
        await editInput(cell, "input", "new");

        // save
        await click(target.querySelector(".o_list_button_save"));
        cell = target.querySelector("tbody td:not(.o_list_record_selector)");
        assert.doesNotHaveClass(
            cell.parentElement,
            "o_selected_row",
            "should not be in edit mode anymore"
        );
        assert.strictEqual(
            target.querySelector("tbody td:not(.o_list_record_selector) a").textContent,
            "new",
            "value should be properly updated"
        );
        assert.containsN(
            target,
            ".o_field_widget a.o_form_uri.o_phone_link",
            2,
            "should still have links with correct classes"
        );
    });

    QUnit.skipWOWL("use TAB to navigate to a PhoneField", async function (assert) {
        assert.expect(2);

        await makeView({
            serverData,
            type: "form",
            resModel: "partner",
            arch:
                '<form string="Partners">' +
                "<sheet>" +
                "<group>" +
                '<field name="display_name"/>' +
                '<field name="foo" widget="phone"/>' +
                "</group>" +
                "</sheet>" +
                "</form>",
        });
        await click(target.querySelector(".o_field_widget[name=display_name]"));
        assert.strictEqual(
            document.activeElement,
            target.querySelector('.o_field_widget[name="display_name"]'),
            "display_name should be focused"
        );
        await triggerEvent(target, '.o_field_widget[name="display_name"]', "keydown", {
            key: "Tab",
        });
        assert.strictEqual(
            document.activeElement,
            target.querySelector('input[name="foo"]'),
            "foo should be focused"
        );
    });
});
