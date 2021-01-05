/** @odoo-module **/

import { CheckBox } from "../../src/components/checkbox/checkbox";
import { getFixture, makeTestEnv } from "../helpers/utility";

const { mount } = owl;

let env;
let target;

QUnit.module("CheckBox", {
  async beforeEach() {
    env = await makeTestEnv();
    target = getFixture();
  },
});

QUnit.test("can be rendered", async (assert) => {
  await mount(CheckBox, {env, target, props: {}});
  assert.containsOnce(target, "div.custom-checkbox");
});
