import * as owl from "@odoo/owl";
import * as QUnit from "qunit";
import { getFixture, makeTestEnv, mount } from "../helpers";
import { OdooEnv } from "../../src/env";
import { Service, useService } from "../../src/services";
import { Registry } from "../../src/core/registry";
import { userService } from "../../src/services/user";

let target: HTMLElement;
let env: OdooEnv;
let _t = function (str: string): string {
  return str === "Hello" ? "Bonjour" : "Silence";
};
class TestComponent extends owl.Component {}

QUnit.module("Localization", {
  async beforeEach() {
    target = getFixture();
  },
});

QUnit.test("can translate a text node", async (assert) => {
  assert.expect(1);
  TestComponent.template = owl.tags.xml`<div>Hello</div>`;
  env = await makeTestEnv({ _t });
  await mount(TestComponent, { env, target });
  assert.strictEqual(target.innerText, "Bonjour");
});

QUnit.test("_t can be found in component env", async (assert) => {
  assert.expect(1);
  TestComponent.template = owl.tags.xml`<span t-esc="env._t('Hello')"/>`;
  env = await makeTestEnv({ _t });
  await mount(TestComponent, { env, target });
  assert.strictEqual(target.innerText, "Bonjour");
});

QUnit.test("components can access lang parameters via user service", async (assert) => {
  assert.expect(1);
  class TestComponent extends owl.Component {
    static template = owl.tags.xml`<span t-esc="decimalPoint"/>`;
    userService = useService("user");
    decimalPoint: string = this.userService.decimalPoint;
  }
  const decimalPoint = ",";
  const services: Registry<Service> = new Registry();
  services.add("user", userService);
  env = await makeTestEnv({ localizationParameters: { decimalPoint }, services });
  await mount(TestComponent, { env, target });
  assert.strictEqual(target.innerText, decimalPoint);
});
