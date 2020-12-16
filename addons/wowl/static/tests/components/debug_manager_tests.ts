import * as QUnit from "qunit";
import { Registry } from "../../src/core/registry";
import { DebugManager } from "../../src/debug_manager/debug_manager";
import { debugManagerService } from "../../src/debug_manager/debug_manager_service";
import { modelService } from "../../src/services/model";
import { Registries } from "../../src/types";
import { click, getFixture, makeTestEnv, mount, OdooEnv } from "../helpers/index";

let target: HTMLElement;
let env: OdooEnv;
let debugManager: DebugManager;
let serviceRegistry: Registries["serviceRegistry"];

QUnit.module("DebugManager", {
  async beforeEach() {
    target = getFixture();
    serviceRegistry = new Registry();
    serviceRegistry.add(modelService.name, modelService);
    serviceRegistry.add(debugManagerService.name, debugManagerService);

    env = await makeTestEnv({
      serviceRegistry,
      mockRPC(...args) {
        if (args[1]!.method === "check_access_rights") {
          return Promise.resolve(true);
        }
      },
    });
  },
  afterEach() {
    debugManager.unmount();
  },
});

QUnit.test("can be rendered", async (assert) => {
  odoo.debugManagerRegistry.add("item_1", () => {
    return {
      type: "item",
      description: "Item 1",
      callback: () => {
        assert.step("callback item_1");
      },
      sequence: 10,
    };
  });
  odoo.debugManagerRegistry.add("item_2", () => {
    return {
      type: "item",
      description: "Item 2",
      callback: () => {
        assert.step("callback item_2");
      },
      sequence: 5,
    };
  });
  odoo.debugManagerRegistry.add("item_3", () => {
    return {
      type: "item",
      description: "Item 3",
      callback: () => {
        assert.step("callback item_3");
      },
    };
  });
  odoo.debugManagerRegistry.add("separator", () => {
    return {
      type: "separator",
      sequence: 20,
    };
  });
  odoo.debugManagerRegistry.add("separator_2", () => {
    return {
      type: "separator",
      sequence: 7,
      hide: true,
    };
  });
  odoo.debugManagerRegistry.add("item_4", () => {
    return {
      type: "item",
      description: "Item 4",
      callback: () => {
        assert.step("callback item_4");
      },
      hide: true,
      sequence: 10,
    };
  });
  debugManager = await mount(DebugManager, { env, target });
  let debugManagerEl = debugManager.el as HTMLElement;
  await click(debugManager.el?.querySelector("button.o_dropdown_toggler") as HTMLElement);
  debugManagerEl = debugManager.el as HTMLElement;
  assert.containsN(debugManagerEl, "ul.o_dropdown_menu li.o_dropdown_item", 3);
  assert.containsOnce(debugManagerEl, "div.dropdown-divider");

  const children = [...(debugManagerEl.querySelector("ul.o_dropdown_menu")?.children || [])];
  assert.deepEqual(
    children.map((el) => el.tagName),
    ["LI", "LI", "DIV", "LI"]
  );
  const items =
    [...debugManagerEl.querySelectorAll("ul.o_dropdown_menu li.o_dropdown_item span")] || [];
  assert.deepEqual(
    items.map((el) => el.textContent),
    ["Item 2", "Item 1", "Item 3"]
  );
  for (const item of items) {
    click(item as HTMLElement);
  }
  assert.verifySteps(["callback item_2", "callback item_1", "callback item_3"]);
});
