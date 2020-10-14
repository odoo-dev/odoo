import { NavBar } from "../../src/components/navbar/navbar";
import * as QUnit from "qunit";
import { click } from "../helpers/index";
import { MenuData, menusService } from "./../../src/services/menus";
import { actionManagerService } from "./../../src/services/action_manager/action_manager";
import { notificationService } from "./../../src/services/notifications";
import { Registry } from "./../../src/core/registry";
import { Service } from "./../../src/types";
import { Component, tags } from "@odoo/owl";
import { createComponent } from "../helpers/utility";
import { SystrayItem } from "../../src/types";

const { xml } = tags;

class MySystrayItem extends Component {
  static template = xml`<li class="my-item">my item</li>`;
}

let menus: MenuData;
let services: Registry<Service>;
let systray: Registry<SystrayItem>;
let serverData: any;

QUnit.module("Navbar", {
  async beforeEach() {
    services = new Registry();
    services.add("menus", menusService);
    services.add(actionManagerService.name, actionManagerService);
    services.add(notificationService.name, notificationService);
    menus = {
      root: { id: "root", children: [1], name: "root", appID: "root" },
      1: { id: 1, children: [], name: "App0", appID: 1 },
    };
    serverData = { menus };
    systray = new Registry();
    const item = {
      name: "addon.myitem",
      Component: MySystrayItem,
    };
    systray.add(item.name, item);
  },
});

QUnit.test("can be rendered", async (assert) => {
  const navbar = await createComponent(NavBar, { config: { services }, serverData });
  assert.containsOnce(navbar.el!, '.o_menu_apps a[role="menuitem"]', "1 app present");
});

QUnit.test("dropdown menu can be toggled", async (assert) => {
  const navbar = await createComponent(NavBar, { config: { services }, serverData });

  const dropdown = navbar.el!.querySelector<HTMLElement>(".dropdown-menu")!;
  await click(navbar.el!, 'a[data-toggle="dropdown"]');
  assert.hasClass(dropdown, "show");
  await click(navbar.el!, 'a[data-toggle="dropdown"]');
  assert.doesNotHaveClass(dropdown, "show");
});

QUnit.test("navbar can display systray items", async (assert) => {
  const navbar = await createComponent(NavBar, { config: { services, systray }, serverData });
  assert.containsOnce(navbar.el!, "li.my-item");
});
