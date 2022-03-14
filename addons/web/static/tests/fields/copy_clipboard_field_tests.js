/** @odoo-module **/

import { makeView, setupViewRegistries } from "../views/helpers";

let serverData;

QUnit.module("Fields", (hooks) => {
    hooks.beforeEach(() => {
        serverData = {
            models: {
                partner: {
                    fields: {
                        display_name: { string: "Displayed name", type: "char", searchable: true },
                        foo: {
                            string: "Foo",
                            type: "char",
                            default: "My little Foo Value",
                            searchable: true,
                            trim: true,
                        },
                        txt: {
                            string: "txt",
                            type: "text",
                            default: "My little txt Value\nHo-ho-hoooo Merry Christmas",
                        },
                    },
                    records: [
                        {
                            id: 1,
                            foo: "yop",
                        },
                    ],
                },
            },
        };

        setupViewRegistries();
    });

    QUnit.module("CopyClipboardField");

    QUnit.test("Char & Text Fields: Copy to clipboard button", async function (assert) {
        const form = await makeView({
            serverData,
            type: "form",
            resModel: "partner",
            arch:
                '<form string="Partners">' +
                "<sheet>" +
                "<div>" +
                '<field name="txt" widget="CopyClipboardText"/>' +
                '<field name="foo" widget="CopyClipboardChar"/>' +
                "</div>" +
                "</sheet>" +
                "</form>",
            resId: 1,
        });

        assert.containsOnce(
            form,
            ".o_clipboard_button.o_btn_text_copy",
            "Should have copy button on text type field"
        );
        assert.containsOnce(
            form,
            ".o_clipboard_button.o_btn_char_copy",
            "Should have copy button on char type field"
        );
    });

    QUnit.test("CopyClipboardField on unset field", async function (assert) {
        serverData.models.partner.records[0].foo = false;

        const form = await makeView({
            serverData,
            type: "form",
            resModel: "partner",
            arch:
                "<form>" +
                "<sheet>" +
                "<group>" +
                '<field name="foo" widget="CopyClipboardChar" />' +
                "</group>" +
                "</sheet>" +
                "</form>",
            resId: 1,
        });

        assert.containsNone(
            form,
            '.o_field_copy[name="foo"] .o_clipboard_button',
            "foo (unset) should not contain a button"
        );
    });

    QUnit.test(
        "CopyClipboardField on readonly unset fields in create mode",
        async function (assert) {
            serverData.models.partner.fields.display_name.readonly = true;

            const form = await makeView({
                serverData,
                type: "form",
                resModel: "partner",
                arch:
                    "<form>" +
                    "<sheet>" +
                    "<group>" +
                    '<field name="display_name" widget="CopyClipboardChar" />' +
                    "</group>" +
                    "</sheet>" +
                    "</form>",
            });

            assert.containsNone(
                form,
                '.o_field_copy[name="display_name"] .o_clipboard_button',
                "the readonly unset field should not contain a button"
            );
        }
    );
});
