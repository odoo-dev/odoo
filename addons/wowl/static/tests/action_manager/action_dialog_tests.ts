import { Component, hooks, tags } from "@odoo/owl";
import * as QUnit from "qunit";
import { ActionDialog } from "../../src/action_manager/action_dialog";
import { Registry } from "../../src/core/registry";
import { useDebugManager } from "../../src/debug_manager/debug_manager";
import { debugManagerService } from "../../src/debug_manager/debug_manager_service";
import { modelService } from "../../src/services/model";
import { MenuElement, Registries } from "../../src/types";
import {
  click,
  getFixture,
  makeFakeUserService,
  makeTestEnv,
  mount,
  OdooEnv,
} from "../helpers/index";
import { TestConfig } from "../helpers/utility";

let baseConfig: TestConfig;
let target: HTMLElement;
let env: OdooEnv;
let serviceRegistry: Registries["serviceRegistry"];

QUnit.module("ActionDialog", {
  async beforeEach() {
    target = getFixture();
    const dialogContainer = document.createElement("div");
    dialogContainer.classList.add("o_dialog_container");
    target.append(dialogContainer);

    serviceRegistry = new Registry();
    serviceRegistry.add("user", makeFakeUserService());
    serviceRegistry.add(modelService.name, modelService);
    serviceRegistry.add(debugManagerService.name, debugManagerService);
    baseConfig = {
      serviceRegistry,
      mockRPC(...args) {
        if (args[1]!.method === "check_access_rights") {
          return Promise.resolve(true);
        }
      },
    };
  },
  afterEach() {
    target.querySelector(".o_dialog_container")?.remove();
  },
});

QUnit.test("Don't display the DebugManager if debug mode is disabled", async (assert) => {
  env = await makeTestEnv(baseConfig);
  const actionDialog = await mount(ActionDialog, { env, target });
  assert.containsOnce(target, "div.o_dialog_container .o_dialog");
  assert.containsNone(target, ".o_dialog .o_debug_manager .fa-bug");

  actionDialog.unmount();
});

QUnit.test(
  "Display the DebugManager correctly in a ActionDialog if debug mode is enabled",
  async (assert) => {
    env = await makeTestEnv(Object.assign(baseConfig, { debug: "1" }));
    odoo.debugManagerRegistry.add("global", () => {
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
        hooks.useSubEnv({ inDialog: true });
        useDebugManager(() => [item1, item2]);
      }
    }

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

    actionDialog.unmount();
  }
);
