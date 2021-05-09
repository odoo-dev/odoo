/** @odoo-module **/

import { translatedTerms } from "@web/core/l10n/translation";
import { serviceRegistry } from "@web/core/service_registry";
import { patch, unpatch } from "@web/core/utils/patch";
import { makeTestEnv } from "../../helpers/mock_env";
import { makeFakeLocalizationService } from "../../helpers/mock_services";
import { getFixture } from "../../helpers/utils";

const { mount } = owl;

const terms = { Hello: "Bonjour" };

class TestComponent extends owl.Component {}

QUnit.module("Translations");

QUnit.test("can translate a text node", async (assert) => {
    assert.expect(1);
    TestComponent.template = owl.tags.xml`<div>Hello</div>`;
    serviceRegistry.add("localization", makeFakeLocalizationService());
    const env = await makeTestEnv();
    patch(translatedTerms, "add translations", terms);
    const target = getFixture();
    await mount(TestComponent, { env, target });
    assert.strictEqual(target.innerText, "Bonjour");
    unpatch(translatedTerms, "add translations");
});

QUnit.test("_t is in env", async (assert) => {
    assert.expect(1);
    TestComponent.template = owl.tags.xml`<div><t t-esc="env._t('Hello')"/></div>`;
    serviceRegistry.add("localization", makeFakeLocalizationService());
    const env = await makeTestEnv();
    patch(translatedTerms, "add translations", terms);
    const target = getFixture();
    await mount(TestComponent, { env, target });
    assert.strictEqual(target.innerText, "Bonjour");
    unpatch(translatedTerms, "add translations");
});
