import * as QUnit from "qunit";
import { UserMenu } from "../../src/components/user_menu/user_menu";
import { getFixture, makeFakeUserService, makeTestEnv, mount, OdooEnv } from "../helpers/index";
import { Registry } from "./../../src/core/registry";
import { Service } from "./../../src/types";

let target: HTMLElement;
let env: OdooEnv;
let services: Registry<Service>;
let browser: Partial<OdooEnv["browser"]>;

QUnit.module("UserMenu", {
  async beforeEach() {
    services = new Registry();
    services.add("user", makeFakeUserService({ name: "Sauron" }));
    target = getFixture();
    env = await makeTestEnv({ browser, services });
  },
});

QUnit.test("can be rendered", async (assert) => {
  const userMenu = await mount(UserMenu, { env, target });
  assert.strictEqual(
    userMenu.el!.innerHTML,
    '<button class="o_dropdown_toggler "><span>Sauron</span></button>'
  );
});
