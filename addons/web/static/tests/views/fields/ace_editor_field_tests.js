/** @odoo-module **/
/* global ace */

import { registry } from "@web/core/registry";
import {
    click,
    clickSave,
    editInput,
    getFixture,
    nextTick,
    triggerEvent,
    triggerEvents,
} from "@web/../tests/helpers/utils";
import { pagerNext } from "@web/../tests/search/helpers";
import { makeView, setupViewRegistries } from "@web/../tests/views/helpers";
import { fakeCookieService } from "@web/../tests/helpers/mock_services";

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
                            type: "text",
                            default: "My little Foo Value",
                            searchable: true,
                            trim: true,
                        },
                    },
                    records: [
                        { id: 1, foo: `yop` },
                        { id: 2, foo: `blip` },
                    ],
                },
            },
        };

        setupViewRegistries();
        registry.category("services").add("cookie", fakeCookieService);
    });

    QUnit.module("AceEditorField");

    QUnit.test("AceEditorField on text fields works", async function (assert) {
        await makeView({
            type: "form",
            resModel: "partner",
            resId: 1,
            serverData,
            arch: `
                <form>
                    <field name="foo" widget="code" />
                </form>`,
        });

        assert.ok("ace" in window, "the ace library should be loaded");
        assert.containsOnce(
            target,
            "div.ace_content",
            "should have rendered something with ace editor"
        );

        assert.ok(target.querySelector(".o_field_code").textContent.includes("yop"));
    });

    QUnit.test("AceEditorField mark as dirty as soon at onchange", async function (assert) {
        await makeView({
            type: "form",
            resModel: "partner",
            resId: 1,
            serverData,
            arch: `
                <form>
                    <field name="foo" widget="code" />
                </form>`,
        });

        assert.ok("ace" in window, "the ace library should be loaded");
        assert.containsOnce(
            target,
            "div.ace_content",
            "should have rendered something with ace editor"
        );

        assert.ok(target.querySelector(".o_field_code").textContent.includes("yop"));
        // edit the foo field
        const aceEditor = target.querySelector(".ace_editor");
        ace.edit(aceEditor).setValue("blip");
        await nextTick();
        assert.containsOnce(target, ".o_form_status_indicator_buttons");
        assert.doesNotHaveClass(
            target.querySelector(".o_form_status_indicator_buttons"),
            "invisible"
        );

        // revert edition
        ace.edit(aceEditor).setValue("yop");
        await nextTick();
        assert.containsOnce(target, ".o_form_status_indicator_buttons");
        assert.hasClass(target.querySelector(".o_form_status_indicator_buttons"), "invisible");
    });

    QUnit.test("AceEditorField on html fields works", async function (assert) {
        serverData.models.partner.fields.htmlField = {
            string: "HTML Field",
            type: "html",
        };
        serverData.models.partner.records.push({
            id: 3,
            htmlField: "<p>My little HTML Test</p>",
        });
        serverData.models.partner.onchanges = { htmlField: function () {} };
        await makeView({
            type: "form",
            resModel: "partner",
            resId: 3,
            serverData,
            arch: `
                <form>
                    <field name="foo"/>
                    <field name="htmlField" widget="code" />
                </form>`,
            mockRPC(route, args) {
                if (args.method) {
                    assert.step(args.method);
                    if (args.method === "write") {
                        assert.deepEqual(args.args[1], { foo: "DEF" });
                    }
                    if (args.method === "onchange") {
                        throw new Error("Should not call onchange, htmlField wasn't changed");
                    }
                } else if (route.includes("web.ace_lib")) {
                    assert.step("web.ace_lib");
                }
            },
        });

        assert.ok("ace" in window, "the ace library should be loaded");
        assert.containsOnce(
            target,
            "div.ace_content",
            "should have rendered something with ace editor"
        );

        assert.ok(
            target.querySelector(".o_field_code").textContent.includes("My little HTML Test")
        );

        // Modify foo and save
        await editInput(target, ".o_field_widget[name=foo] textarea", "DEF");
        await clickSave(target);

        assert.verifySteps(["get_views", "read", "web.ace_lib", "write", "read"]);
    });

    QUnit.test("AceEditorField doesn't crash when editing", async (assert) => {
        await makeView({
            type: "form",
            resModel: "partner",
            resId: 1,
            serverData,
            arch: `
                <form>
                    <field name="display_name" />
                    <field name="foo" widget="code" />
                </form>`,
        });

        await triggerEvents(target, ".ace-view-editor textarea", ["focus", "click"]);
        assert.hasClass(target.querySelector(".ace-view-editor"), "ace_focus");
    });

    QUnit.test("AceEditorField is updated on value change", async (assert) => {
        await makeView({
            type: "form",
            resModel: "partner",
            resId: 1,
            resIds: [1, 2],
            serverData,
            arch: /* xml */ `
                <form>
                    <field name="foo" widget="code" />
                </form>`,
        });

        assert.ok(target.querySelector(".o_field_code").textContent.includes("yop"));

        await pagerNext(target);
        await nextTick();

        assert.ok(target.querySelector(".o_field_code").textContent.includes("blip"));
    });

    QUnit.test(
        "leaving an untouched record with an unset ace field should not write",
        async (assert) => {
            serverData.models.partner.records.forEach((rec) => {
                rec.foo = false;
            });
            await makeView({
                type: "form",
                resModel: "partner",
                resId: 1,
                resIds: [1, 2],
                serverData,
                arch: /* xml */ `
                <form>
                    <field name="foo" widget="ace" />
                </form>`,
                mockRPC(route, args) {
                    if (args.method) {
                        assert.step(`${args.method}: ${JSON.stringify(args.args)}`);
                    }
                },
            });

            assert.verifySteps(["get_views: []", 'read: [[1],["foo","display_name"]]']);
            await pagerNext(target);
            assert.verifySteps(['read: [[2],["foo","display_name"]]']);
        }
    );

    QUnit.test("AceEditorField only trigger onchanges when blurred", async (assert) => {
        serverData.models.partner.onchanges = {
            foo: (obj) => {},
        };

        serverData.models.partner.records.forEach((rec) => {
            rec.foo = false;
        });
        await makeView({
            type: "form",
            resModel: "partner",
            resId: 1,
            resIds: [1, 2],
            serverData,
            arch: `<form>
                <field name="display_name" />
                <field name="foo" widget="code" />
            </form>`,
            mockRPC(route, args) {
                if (args.method) {
                    assert.step(`${args.method}: ${JSON.stringify(args.args)}`);
                }
            },
        });

        assert.verifySteps(["get_views: []", 'read: [[1],["display_name","foo"]]']);
        const textArea = target.querySelector(".ace_editor textarea");
        await click(textArea);
        textArea.focus();
        textArea.value = "a";
        await triggerEvent(textArea, null, "input", {});
        await triggerEvents(textArea, null, ["blur"]);
        assert.verifySteps([
            'onchange: [[1],{"id":1,"display_name":false,"foo":"a"},"foo",{"display_name":"","foo":"1"}]',
        ]);
        await click(target, ".o_form_button_save");
        assert.verifySteps(['write: [[1],{"foo":"a"}]', 'read: [[1],["display_name","foo"]]']);
    });
});
