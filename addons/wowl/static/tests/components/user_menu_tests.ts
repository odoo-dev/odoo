import * as QUnit from "qunit";
import { UserMenu } from "../../src/components/user_menu/user_menu";
import {
  click,
  getFixture,
  makeFakeUserService,
  makeTestEnv,
  mount,
  OdooEnv,
} from "../helpers/index";
import { Registry } from "./../../src/core/registry";
import { OdooBrowser, Service } from "./../../src/types";

let target: HTMLElement;
let env: OdooEnv;
let services: Registry<Service>;
let userMenu: UserMenu;

QUnit.module("UserMenu", {
  async beforeEach() {
    services = new Registry();
    services.add("user", makeFakeUserService({ name: "Sauron" }));
    target = getFixture();
    const browser = {
      location: {
        origin: "http://lordofthering",
      },
    } as OdooBrowser;
    env = await makeTestEnv({ browser, services });
  },
  afterEach() {
    userMenu.unmount();
  },
});

QUnit.test("can be rendered", async (assert) => {
  env.registries.userMenu.add("bad_item", {
    description: "Bad",
    callback: () => {
      assert.step("callback bad_item");
    },
    sequence: 10,
  });
  env.registries.userMenu.add("ring_item", {
    description: "Ring",
    callback: () => {
      assert.step("callback ring_item");
    },
    sequence: 5,
  });
  env.registries.userMenu.add("invisible_item", {
    description: "Hidden Power",
    callback: () => {},
    sequence: 5,
    isVisible: (env: OdooEnv) => false,
  });
  env.registries.userMenu.add("eye_item", {
    description: "Eye",
    callback: () => {
      assert.step("callback eye_item");
    },
  });

  userMenu = await mount(UserMenu, { env, target });
  let userMenuEl = userMenu.el as HTMLElement;
  assert.containsOnce(userMenuEl, "img.o_user_avatar");
  assert.strictEqual(
    (userMenuEl.querySelector("img.o_user_avatar") as HTMLMediaElement).src,
    "http://lordofthering/web/image?model=res.users&field=image_128&id=7"
  );
  assert.containsOnce(userMenuEl, "span.o_user_name");
  assert.strictEqual(userMenuEl.querySelector(".o_user_name")?.textContent, "Sauron");
  assert.containsNone(userMenuEl, "ul.o_dropdown_menu li.o_dropdown_item");
  await click(userMenu.el?.querySelector("button.o_dropdown_toggler") as HTMLElement);
  userMenuEl = userMenu.el as HTMLElement;
  assert.containsN(userMenuEl, "ul.o_dropdown_menu li.o_dropdown_item", 3);
  assert.containsOnce(userMenuEl, "div.dropdown-divider");
  const children = [...(userMenuEl.querySelector("ul.o_dropdown_menu")?.children || [])];
  assert.deepEqual(
    children.map((el) => el.tagName),
    ["LI", "LI", "DIV", "LI"]
  );
  const items =
    [...userMenuEl.querySelectorAll("ul.o_dropdown_menu li.o_dropdown_item span")] || [];
  assert.deepEqual(
    items.map((el) => el.textContent),
    ["Ring", "Bad", "Eye"]
  );
  for (const item of items) {
    click(item as HTMLElement);
  }
  assert.verifySteps(["callback ring_item", "callback bad_item", "callback eye_item"]);
});
