/** @odoo-module **/
import { Registry } from "../../src/core/registry";
import { makeFakeUserService, makeFakeUIService } from "../helpers/mocks";
import { makeTestEnv, getFixture } from "../helpers/index";
import { click } from "../helpers/utility";
import { SwitchCompanyMenu } from "../../src/webclient/switch_company_menu/switch_company_menu";
import { hotkeyService } from "../../src/hotkey/hotkey_service";
import { registerCleanup } from "../helpers/cleanup";

const { mount } = owl;

QUnit.module("SwitchCompanyMenu", (hooks) => {
  let testConfig;

  hooks.beforeEach(() => {
    const serviceRegistry = new Registry();

    const session_info = {
      user_companies: {
        allowed_companies: {
          1: { id: 1, name: "Hermit" },
          2: { id: 2, name: "Herman's" },
        },
        current_company: 1,
      },
    };
    serviceRegistry.add("ui", makeFakeUIService());
    serviceRegistry.add("user", makeFakeUserService({ session_info }));
    serviceRegistry.add("hotkey", hotkeyService);
    testConfig = { serviceRegistry };
  });

  QUnit.test("basic rendering", async (assert) => {
    assert.expect(10);

    const env = await makeTestEnv(testConfig);
    const target = getFixture();
    const scMenu = await mount(SwitchCompanyMenu, { env, target });
    registerCleanup(() => scMenu.destroy());

    assert.strictEqual(scMenu.el.tagName.toUpperCase(), "LI");
    assert.hasClass(scMenu.el, "o_switch_company_menu");
    assert.strictEqual(scMenu.el.textContent, "Hermit");

    await click(scMenu.el.querySelector(".o_dropdown_toggler"));
    assert.containsN(scMenu, ".toggle_company", 2);
    assert.containsN(scMenu, ".log_into", 2);
    assert.containsOnce(scMenu.el, ".fa-check-square");
    assert.containsOnce(scMenu.el, ".fa-square-o");
    assert.strictEqual(
      scMenu.el.querySelector(".fa-check-square").closest(".o_dropdown_item").textContent,
      "Hermit"
    );
    assert.strictEqual(
      scMenu.el.querySelector(".fa-square-o").closest(".o_dropdown_item").textContent,
      "Herman's"
    );
    assert.strictEqual(scMenu.el.querySelector(".o_dropdown_menu").textContent, "HermitHerman's");
  });

  QUnit.test("toggle company", async (assert) => {
    assert.expect(3);

    const env = await makeTestEnv(testConfig);
    const target = getFixture();
    const scMenu = await mount(SwitchCompanyMenu, { env, target });
    registerCleanup(() => scMenu.destroy());

    assert.deepEqual(scMenu.env.services.user.context.allowed_company_ids, [1]);

    await click(scMenu.el.querySelector(".o_dropdown_toggler"));
    const secondCompanyToggler = scMenu.el.querySelectorAll(".toggle_company")[1];
    await click(secondCompanyToggler);
    assert.deepEqual(scMenu.env.services.user.context.allowed_company_ids, [1, 2]);

    await click(scMenu.el.querySelector(".o_dropdown_toggler"));
    await click(scMenu.el.querySelectorAll(".toggle_company")[0]);
    assert.deepEqual(scMenu.env.services.user.context.allowed_company_ids, [2]);
  });

  QUnit.test("log into company", async (assert) => {
    assert.expect(3);

    const env = await makeTestEnv(testConfig);
    const target = getFixture();
    const scMenu = await mount(SwitchCompanyMenu, { env, target });
    registerCleanup(() => scMenu.destroy());

    assert.deepEqual(scMenu.env.services.user.context.allowed_company_ids, [1]);

    await click(scMenu.el.querySelector(".o_dropdown_toggler"));
    const secondCompanyLoginto = scMenu.el.querySelectorAll(".log_into")[1];
    await click(secondCompanyLoginto);
    assert.deepEqual(scMenu.env.services.user.context.allowed_company_ids, [2, 1]);

    await click(scMenu.el.querySelector(".o_dropdown_toggler"));
    await click(scMenu.el.querySelectorAll(".log_into")[0]);
    assert.deepEqual(scMenu.env.services.user.context.allowed_company_ids, [1, 2]);
  });
});
