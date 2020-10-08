import { Action } from "../../src/components/action/action";
import * as QUnit from "qunit";
import { mount, makeTestEnv, getFixture, OdooEnv } from "../helpers/index";

let target: HTMLElement;
let env: OdooEnv;

QUnit.module("Action", {
  async beforeEach() {
    target = getFixture();
    env = await makeTestEnv();
  },
});

QUnit.test("can be rendered", async (assert) => {
  assert.expect(1);
  await mount(Action, { env, target });
  assert.strictEqual(target.innerText, "Hello Action");
});
