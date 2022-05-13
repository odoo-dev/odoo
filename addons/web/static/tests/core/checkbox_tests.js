/** @odoo-module **/

import { CheckBox } from "@web/core/checkbox/checkbox";
import { translatedTerms } from "@web/core/l10n/translation";
import { registry } from "@web/core/registry";
import { makeTestEnv } from "@web/../tests/helpers/mock_env";
import { makeFakeLocalizationService } from "@web/../tests/helpers/mock_services";
import { click, getFixture, patchWithCleanup, mount } from "@web/../tests/helpers/utils";

const { Component, xml } = owl;
const serviceRegistry = registry.category("services");

let target;

QUnit.module("Components", (hooks) => {
    hooks.beforeEach(async () => {
        target = getFixture();
    });

    QUnit.module("CheckBox");

    QUnit.test("can be rendered", async (assert) => {
        const env = await makeTestEnv();
        await mount(CheckBox, target, { env, props: {} });
        assert.containsOnce(target, "div.custom-checkbox");
    });

    QUnit.test("has a slot for translatable text", async (assert) => {
        patchWithCleanup(translatedTerms, { ragabadabadaba: "rugubudubudubu" });
        serviceRegistry.add("localization", makeFakeLocalizationService());
        const env = await makeTestEnv();

        class Parent extends Component {}
        Parent.template = xml`<CheckBox>ragabadabadaba</CheckBox>`;
        Parent.components = { CheckBox };

        await mount(Parent, target, { env });
        assert.containsOnce(target, "div.custom-checkbox");
        assert.strictEqual(
            target.querySelector("div.custom-checkbox").textContent,
            "rugubudubudubu"
        );
    });

    QUnit.test("call onChange prop when some change occurs", async (assert) => {
        const env = await makeTestEnv();

        let value = false;
        class Parent extends Component {
            onChange(checked) {
                value = checked;
            }
        }
        Parent.template = xml`<CheckBox onChange="onChange"/>`;
        Parent.components = { CheckBox };

        await mount(Parent, target, { env });
        assert.containsOnce(target, "div.custom-checkbox");
        await click(target.querySelector("input"));
        assert.strictEqual(value, true);
        await click(target.querySelector("input"));
        assert.strictEqual(value, false);
    });

    QUnit.test("triggering a click event on a disabled checkbox", async (assert) => {
        const env = await makeTestEnv();
        class Parent extends Component {
            onChange() {
                assert.step("a click triggered on the disabled checkbox changed its value");
            }
        }
        Parent.template = xml`<CheckBox onChange="onChange" disabled="true" />`;
        Parent.components = { CheckBox };

        await mount(Parent, target, { env });
        assert.containsOnce(target, "div.custom-checkbox");
        assert.ok(
            !target.querySelector(".custom-checkbox input").checked,
            "the input is not checked"
        );

        // the CheckBox component should prevent the input to be checked by a click
        // event triggered in JS as the input is not supposed to be interactive
        await click(target.querySelector(".custom-checkbox input"));
        assert.ok(
            !target.querySelector(".custom-checkbox input").checked,
            "the input is still not checked"
        );
        assert.verifySteps([]);
    });
});
