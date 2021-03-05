/** @odoo-module **/
import { Registry } from "../../src/core/registry";
import { makeFakeUserService } from "../helpers/mocks";
import { makeTestEnv } from "../helpers/index";
import { click, mount } from "../helpers/utility";
import { SwitchCompanyMenu } from '../../src/switch_company_menu/switch_company_menu';

QUnit.module("SwitchCompanyMenu", (hooks) => {
  let testConfig;
  async function createParent() {
    const env = await makeTestEnv(testConfig);
    return mount(Parent, { env });
  }
  class Parent extends owl.Component {
    get systrayItems() {
      return odoo.systrayRegistry.getAll();
    }
  }
  Parent.components = { SwitchCompanyMenu };
  Parent.template = owl.tags.xml`
    <div>
      <SwitchCompanyMenu/>
    </div>`;

  hooks.beforeEach(() => {
    const serviceRegistry = new Registry();

    const session_info = {
      user_companies: {
        allowed_companies: {
          1: {id: 1, name: 'Hermit'},
          2: {id: 2, name: "Herman's"}
        },
        current_company: 1,
      },
    };
    serviceRegistry.add("user", makeFakeUserService({ session_info }));
    testConfig = { serviceRegistry };
  });

  QUnit.test("renders", async (assert) => {
    assert.expect(9);
    const parent = await createParent();
    assert.containsOnce(parent, "li.o_switch_company_menu");
    assert.strictEqual(parent.el.querySelector(".o_switch_company_menu").textContent, "Hermit");

    await click(parent.el.querySelector(".o_dropdown_toggler"));
    assert.containsN(parent, ".toggle_company", 2);
    assert.containsN(parent, ".log_into", 2);
    assert.containsOnce(parent.el, ".fa-check-square");
    assert.containsOnce(parent.el, ".fa-square-o");
    assert.strictEqual(
      parent.el.querySelector(".fa-check-square").closest(".o_dropdown_item").textContent,
      "Hermit"
    );
    assert.strictEqual(
      parent.el.querySelector(".fa-square-o").closest(".o_dropdown_item").textContent,
      "Herman's"
    );
    assert.strictEqual(parent.el.querySelector(".o_dropdown_menu").textContent, "HermitHerman's");
    parent.destroy();
  });

  QUnit.test("toggle company", async (assert) => {
    assert.expect(3);

    const parent = await createParent();
    assert.deepEqual(parent.env.services.user.context.allowed_company_ids, [1]);

    await click(parent.el.querySelector(".o_dropdown_toggler"));
    const secondCompanyToggler = parent.el.querySelectorAll(".toggle_company")[1];
    await click(secondCompanyToggler);
    assert.deepEqual(parent.env.services.user.context.allowed_company_ids, [1, 2]);

    await click(parent.el.querySelector(".o_dropdown_toggler"));
    await click(parent.el.querySelectorAll(".toggle_company")[0]);
    assert.deepEqual(parent.env.services.user.context.allowed_company_ids, [2]);
    parent.destroy();
  });

  QUnit.test("log into company", async (assert) => {
    assert.expect(3);

    const parent = await createParent();
    assert.deepEqual(parent.env.services.user.context.allowed_company_ids, [1]);

    await click(parent.el.querySelector(".o_dropdown_toggler"));
    const secondCompanyLoginto = parent.el.querySelectorAll(".log_into")[1];
    await click(secondCompanyLoginto);
    assert.deepEqual(parent.env.services.user.context.allowed_company_ids, [2, 1]);

    await click(parent.el.querySelector(".o_dropdown_toggler"));
    await click(parent.el.querySelectorAll(".log_into")[0]);
    assert.deepEqual(parent.env.services.user.context.allowed_company_ids, [1, 2]);
    parent.destroy();
  });
});
