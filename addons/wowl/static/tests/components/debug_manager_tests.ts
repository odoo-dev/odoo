import * as QUnit from "qunit";
import { Component, hooks, tags } from "@odoo/owl";
import { ActionDialog } from "../../src/action_manager/action_dialog";
import { Registry } from "../../src/core/registry";
import { DebugManager } from "../../src/debug_manager/debug_manager";
import { debugManagerService } from "../../src/debug_manager/debug_manager_service";
import { MenuElement } from "../../src/types";
import { modelService } from "../../src/services/model";
import { RPC } from "../../src/services/rpc";
import { useDebugManager } from "../../src/debug_manager/debug_manager";
import { click, getFixture, makeTestEnv, mount } from "../helpers/index";
import { TestConfig } from "../helpers/utility";

const { useSubEnv } = hooks;

let target: HTMLElement;
let testConfig: TestConfig;

QUnit.module("DebugManager", (hooks) => {
  hooks.beforeEach(async () => {
    target = getFixture();
    const serviceRegistry: any = new Registry();
    serviceRegistry.add(modelService.name, modelService);
    serviceRegistry.add(debugManagerService.name, debugManagerService);

    const mockRPC: RPC = async (route, args) => {
      if (args!.method === "check_access_rights") {
        return Promise.resolve(true);
      }
    };
    testConfig = { serviceRegistry, mockRPC };
  });

  QUnit.test("can be rendered", async (assert) => {
    testConfig.debugManagerRegistry = new Registry();
    testConfig.debugManagerRegistry!.add("item_1", () => {
      return {
        type: "item",
        description: "Item 1",
        callback: () => {
          assert.step("callback item_1");
        },
        sequence: 10,
      };
    });
    testConfig.debugManagerRegistry!.add("item_2", () => {
      return {
        type: "item",
        description: "Item 2",
        callback: () => {
          assert.step("callback item_2");
        },
        sequence: 5,
      };
    });
    testConfig.debugManagerRegistry!.add("item_3", () => {
      return {
        type: "item",
        description: "Item 3",
        callback: () => {
          assert.step("callback item_3");
        },
      };
    });
    testConfig.debugManagerRegistry!.add("separator", () => {
      return {
        type: "separator",
        sequence: 20,
      };
    });
    testConfig.debugManagerRegistry!.add("separator_2", () => {
      return {
        type: "separator",
        sequence: 7,
        hide: true,
      };
    });
    testConfig.debugManagerRegistry!.add("item_4", () => {
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
    const env = await makeTestEnv(testConfig);
    const debugManager = await mount(DebugManager, { env, target });
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

    debugManager.destroy();
  });

  QUnit.test("Don't display the DebugManager if debug mode is disabled", async (assert) => {
    const dialogContainer = document.createElement("div");
    dialogContainer.classList.add("o_dialog_container");
    target.append(dialogContainer);

    const env = await makeTestEnv(testConfig);
    const actionDialog = await mount(ActionDialog, { env, target });
    assert.containsOnce(target, "div.o_dialog_container .o_dialog");
    assert.containsNone(target, ".o_dialog .o_debug_manager .fa-bug");

    actionDialog.destroy();
    target.querySelector(".o_dialog_container")?.remove();
  });

  QUnit.test(
    "Display the DebugManager correctly in a ActionDialog if debug mode is enabled",
    async (assert) => {
      const dialogContainer = document.createElement("div");
      dialogContainer.classList.add("o_dialog_container");
      target.append(dialogContainer);

      testConfig.debugManagerRegistry = new Registry();
      testConfig.debugManagerRegistry!.add("global", () => {
        return {
          type: "item",
          description: "Global 1",
          callback: () => {
            assert.step("callback global_1");
          },
          sequence: 0,
        };
      });
      const item1: MenuElement = {
        type: "item",
        description: "Item 1",
        callback: () => {
          assert.step("callback item_1");
        },
        sequence: 10,
      };
      const item2: MenuElement = {
        type: "item",
        description: "Item 2",
        callback: () => {
          assert.step("callback item_2");
        },
        sequence: 20,
      };
      class Parent extends Component {
        static components = { ActionDialog };
        static template = tags.xml`<ActionDialog/>`;

        constructor(...args: any[]) {
          super(...args);
          useSubEnv({ inDialog: true });
          useDebugManager(() => [item1, item2]);
        }
      }

      testConfig.debug = "1";
      const env = await makeTestEnv(testConfig);
      const actionDialog = await mount(Parent, { env, target });
      assert.containsOnce(target, "div.o_dialog_container .o_dialog");
      assert.containsOnce(target, ".o_dialog .o_debug_manager .fa-bug");

      await click(target as HTMLElement, ".o_dialog .o_debug_manager button");
      const debugManagerEl = target.querySelector(
        ".o_dialog_container .o_debug_manager"
      ) as HTMLElement;
      assert.containsN(debugManagerEl, "ul.o_dropdown_menu li.o_dropdown_item", 2);

      // Check that global debugManager elements are not displayed (global_1)
      const items =
        [...debugManagerEl.querySelectorAll("ul.o_dropdown_menu li.o_dropdown_item span")] || [];
      assert.deepEqual(
        items.map((el) => el.textContent),
        ["Item 1", "Item 2"]
      );

      for (const item of items) {
        click(item as HTMLElement);
      }
      assert.verifySteps(["callback item_1", "callback item_2"]);

      actionDialog.destroy();
      target.querySelector(".o_dialog_container")?.remove();
    }
  );
});
