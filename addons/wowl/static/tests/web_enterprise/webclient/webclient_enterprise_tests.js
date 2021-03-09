/** @odoo-module **/
import { WebClientEnterprise } from "../../../src/web_enterprise/webclient/webclient";
import { click, legacyExtraNextTick } from "../../helpers/utility";
import { getLegacy } from "wowl.test_legacy";
import { nextTick } from "../../helpers/index";
import {
  createWebClient,
  doAction,
  getActionManagerTestConfig,
  loadState,
} from "../../actions/helpers";
import { homeMenuService } from "../../../src/web_enterprise/webclient/home_menu/home_menu_service";
import { debugService } from "../../../src/debug/debug_service";
import { Registry } from "../../../src/core/registry";
import { DebugManager } from "@wowl/debug/debug_manager";
import { makeFakeUIService } from '../../helpers/mocks';
import { BurgerMenu } from '../../../src/web_enterprise/webclient/burger_menu/burger_menu';

import { makeFakeEnterpriseService } from '../mocks';

function createEnterpriseWebClient(params) {
  params.WebClientClass = WebClientEnterprise;
  return createWebClient(params);
}
let testUtils;
let testConfig;
// Should test ONLY the webClient and features present in Enterprise
// Those tests rely on hidden view to be in CSS: display: none
QUnit.module("WebClient Enterprise", (hooks) => {
  hooks.before(() => {
    const legacy = getLegacy();
    testUtils = legacy.testUtils;
  });
  hooks.beforeEach(() => {
    testConfig = getActionManagerTestConfig();
    testConfig.serviceRegistry.add(homeMenuService.name, homeMenuService);
    const fakeEnterpriseService = makeFakeEnterpriseService();
    testConfig.serviceRegistry.add(fakeEnterpriseService.name, fakeEnterpriseService);
  });
  QUnit.module("basic flow with home menu", (hooks) => {
    let mockRPC;
    hooks.beforeEach((assert) => {
      testConfig.serverData.menus[1].actionID = 4;
      testConfig.serverData.menus["root"].children = [1];
      testConfig.serverData.views["partner,false,form"] = `<form>
          <field name="display_name"/>
          <field name="m2o"/>'
      </form>`;
      mockRPC = async (route, args) => {
        assert.step(route);
        if (route === "/web/dataset/call_kw/partner/get_formview_action") {
          return {
            type: "ir.actions.act_window",
            res_model: "partner",
            view_type: "form",
            view_mode: "form",
            views: [[false, "form"]],
            target: "current",
            res_id: 2,
          };
        }
      };
    });
    QUnit.test("1 -- start up", async function (assert) {
      assert.expect(7);
      const webClient = await createEnterpriseWebClient({ testConfig, mockRPC });
      assert.verifySteps(["/wowl/load_menus"]);
      assert.ok(webClient.el.classList.contains("o_home_menu_background"));
      assert.ok(webClient.el.classList.contains("o_has_home_menu"));
      assert.containsOnce(webClient, ".o_home_menu");
      assert.isNotVisible(webClient.el.querySelector(".o_menu_toggle"));
      assert.containsOnce(webClient, ".o_app.o_menuitem");
      webClient.destroy();
    });
    QUnit.test("2 -- navbar updates on displaying an action", async function (assert) {
      assert.expect(12);
      const webClient = await createEnterpriseWebClient({ testConfig, mockRPC });
      assert.verifySteps(["/wowl/load_menus"]);
      await click(webClient.el.querySelector(".o_app.o_menuitem"));
      await nextTick(); // there is another tick to update navar and destroy HomeMenu
      await legacyExtraNextTick();
      assert.verifySteps([
        "/web/action/load",
        "/web/dataset/call_kw/partner/load_views",
        "/web/dataset/search_read",
      ]);
      assert.notOk(webClient.el.classList.contains("o_home_menu_background"));
      //assert.containsNone(webClient, ".o_home_menu");
      assert.isNotVisible(webClient.el.querySelector(".o_home_menu"));
      //assert.containsOnce(webClient, ".o_kanban_view");
      assert.isVisible(webClient.el.querySelector(".o_kanban_view"));
      const menuToggle = webClient.el.querySelector(".o_menu_toggle");
      assert.isVisible(menuToggle);
      assert.ok(menuToggle.classList.contains("fa-th"));
      assert.notOk(menuToggle.classList.contains("fa-chevron-left"));
      webClient.destroy();
    });
    QUnit.test("3 -- push another action in the breadcrumb", async function (assert) {
      assert.expect(11);
      const webClient = await createEnterpriseWebClient({ testConfig, mockRPC });
      assert.verifySteps(["/wowl/load_menus"]);
      await click(webClient.el.querySelector(".o_app.o_menuitem"));
      await nextTick();
      await legacyExtraNextTick();
      assert.verifySteps([
        "/web/action/load",
        "/web/dataset/call_kw/partner/load_views",
        "/web/dataset/search_read",
      ]);
      await click(webClient.el.querySelector(".o_kanban_record"));
      await nextTick(); // there is another tick to update navbar and destroy HomeMenu
      await legacyExtraNextTick();
      assert.verifySteps(["/web/dataset/call_kw/partner/read"]);
      assert.isVisible(webClient.el.querySelector(".o_menu_toggle"));
      assert.containsOnce(webClient, ".o_form_view");
      assert.strictEqual(
        webClient.el.querySelector(".breadcrumb-item.active").textContent,
        "First record"
      );
      webClient.destroy();
    });
    QUnit.test("4 -- push a third action in the breadcrumb", async function (assert) {
      assert.expect(15);
      const webClient = await createEnterpriseWebClient({ testConfig, mockRPC });
      assert.verifySteps(["/wowl/load_menus"]);
      await click(webClient.el.querySelector(".o_app.o_menuitem"));
      await nextTick();
      await legacyExtraNextTick();
      assert.verifySteps([
        "/web/action/load",
        "/web/dataset/call_kw/partner/load_views",
        "/web/dataset/search_read",
      ]);
      await click(webClient.el.querySelector(".o_kanban_record"));
      await nextTick();
      await legacyExtraNextTick();
      assert.verifySteps(["/web/dataset/call_kw/partner/read"]);
      await click(webClient.el.querySelector('.o_field_widget[name="m2o"]'));
      await nextTick();
      await legacyExtraNextTick();
      assert.verifySteps([
        "/web/dataset/call_kw/partner/get_formview_action",
        "/web/dataset/call_kw/partner/load_views",
        "/web/dataset/call_kw/partner/read",
      ]);
      assert.containsOnce(webClient, ".o_form_view");
      assert.strictEqual(
        webClient.el.querySelector(".breadcrumb-item.active").textContent,
        "Second record"
      );
      assert.containsN(webClient, ".breadcrumb-item", 3);
      webClient.destroy();
    });
    QUnit.test(
      "5 -- switch to HomeMenu from an action with 2 breadcrumbs",
      async function (assert) {
        assert.expect(17);
        const webClient = await createEnterpriseWebClient({ testConfig, mockRPC });
        assert.verifySteps(["/wowl/load_menus"]);
        await click(webClient.el.querySelector(".o_app.o_menuitem"));
        await nextTick();
        await legacyExtraNextTick();
        assert.verifySteps([
          "/web/action/load",
          "/web/dataset/call_kw/partner/load_views",
          "/web/dataset/search_read",
        ]);
        await click(webClient.el.querySelector(".o_kanban_record"));
        await nextTick();
        await legacyExtraNextTick();
        assert.verifySteps(["/web/dataset/call_kw/partner/read"]);
        await click(webClient.el.querySelector('.o_field_widget[name="m2o"]'));
        await nextTick();
        await legacyExtraNextTick();
        assert.verifySteps([
          "/web/dataset/call_kw/partner/get_formview_action",
          "/web/dataset/call_kw/partner/load_views",
          "/web/dataset/call_kw/partner/read",
        ]);
        const menuToggle = webClient.el.querySelector(".o_menu_toggle");
        await click(menuToggle);
        await nextTick();
        assert.verifySteps([]);
        assert.notOk(menuToggle.classList.contains("fa-th"));
        assert.ok(menuToggle.classList.contains("fa-chevron-left"));
        assert.containsOnce(webClient, ".o_home_menu");
        assert.isNotVisible(webClient.el.querySelector(".o_form_view"));
        webClient.destroy();
      }
    );
    QUnit.test("6 -- back to underlying action with many breadcrumbs", async function (assert) {
      assert.expect(20);
      const webClient = await createEnterpriseWebClient({ testConfig, mockRPC });
      assert.verifySteps(["/wowl/load_menus"]);
      await click(webClient.el.querySelector(".o_app.o_menuitem"));
      await nextTick();
      await legacyExtraNextTick();
      assert.verifySteps([
        "/web/action/load",
        "/web/dataset/call_kw/partner/load_views",
        "/web/dataset/search_read",
      ]);
      await click(webClient.el.querySelector(".o_kanban_record"));
      await nextTick();
      await legacyExtraNextTick();
      assert.verifySteps(["/web/dataset/call_kw/partner/read"]);
      await click(webClient.el.querySelector('.o_field_widget[name="m2o"]'));
      await nextTick();
      await legacyExtraNextTick();
      assert.verifySteps([
        "/web/dataset/call_kw/partner/get_formview_action",
        "/web/dataset/call_kw/partner/load_views",
        "/web/dataset/call_kw/partner/read",
      ]);
      const menuToggle = webClient.el.querySelector(".o_menu_toggle");
      await click(menuToggle);
      await click(menuToggle);
      // if we don't reload on going back to underlying action
      // assert.verifySteps(
      //   [],
      //   "the underlying view should not reload when toggling the HomeMenu to off"
      // );
      // endif
      // if we reload on going back to underlying action
      await nextTick();
      await legacyExtraNextTick();
      assert.verifySteps(
        ["/web/dataset/call_kw/partner/read"],
        "the underlying view should reload when toggling the HomeMenu to off"
      );
      // endif
      assert.containsNone(webClient, ".o_home_menu");
      assert.containsOnce(webClient, ".o_form_view");
      assert.ok(menuToggle.classList.contains("fa-th"));
      assert.notOk(menuToggle.classList.contains("fa-chevron-left"));
      assert.strictEqual(
        webClient.el.querySelector(".breadcrumb-item.active").textContent,
        "Second record"
      );
      assert.containsN(webClient, ".breadcrumb-item", 3);
      webClient.destroy();
    });
    QUnit.test("restore the newly created record in form view (legacy)", async (assert) => {
      assert.expect(7);
      const action = testConfig.serverData.actions[6];
      delete action.res_id;
      action.target = "current";
      const webClient = await createEnterpriseWebClient({ testConfig });

      await doAction(webClient, 6);
      let formEl = webClient.el.querySelector(".o_form_view");
      assert.isVisible(formEl);
      assert.ok(formEl.classList.contains("o_form_editable"));
      const input = webClient.el.querySelector("input.o_input");
      await testUtils.fields.editInput(input, "red right hand");
      await click(webClient.el.querySelector(".o_form_button_save"));
      assert.strictEqual(
        webClient.el.querySelector(".breadcrumb-item.active").textContent,
        "red right hand"
      );
      await click(webClient.el.querySelector(".o_menu_toggle"));
      assert.isNotVisible(webClient.el.querySelector(".o_form_view"));

      await click(webClient.el.querySelector(".o_menu_toggle"));
      await nextTick();
      await legacyExtraNextTick();
      formEl = webClient.el.querySelector(".o_form_view");
      assert.isVisible(formEl);
      assert.notOk(formEl.classList.contains("o_form_editable"));
      assert.strictEqual(
        webClient.el.querySelector(".breadcrumb-item.active").textContent,
        "red right hand"
      );
      webClient.destroy();
    });
    // QUnit.debug('fast clicking on restore (implementation detail)', async (assert) => {
    //   let _resolve;
    //   const prom = new Promise((resolve) => {
    //     _resolve = resolve;
    //   });
    //   let doVeryFastClick = false;
    //   class DelayedClientAction extends Component {
    //     static template = owl.tags.xml`<div class='delayed_client_action'>
    //       <button t-on-click="resolve">RESOLVE</button>
    //     </div>`;
    //     mounted() {
    //       //console.log('patched');
    //       if (doVeryFastClick) {
    //         doVeryFastClick = false;
    //         click(webClient.el.querySelector(".o_menu_toggle"));
    //       }
    //     }
    //   }
    //   testConfig.actionRegistry.add('DelayedClientAction', DelayedClientAction);
    //   const webClient = await createEnterpriseWebClient({testConfig});
    //   await doAction(webClient, 'DelayedClientAction');
    //   await nextTick();
    //   await click(webClient.el.querySelector(".o_menu_toggle"));
    //   assert.isVisible(webClient.el.querySelector('.o_home_menu'));
    //   assert.isNotVisible(webClient.el.querySelector('.delayed_client_action'));

    //   doVeryFastClick = true;
    //   await click(webClient.el.querySelector(".o_menu_toggle"));
    //   await nextTick();
    //   // off homemenu
    //   assert.isVisible(webClient.el.querySelector('.o_home_menu'));
    //   assert.isNotVisible(webClient.el.querySelector('.delayed_client_action'));

    //   await click(webClient.el.querySelector(".o_menu_toggle"));
    //   await nextTick();
    //   assert.isNotVisible(webClient.el.querySelector('.o_home_menu'));
    //   assert.isVisible(webClient.el.querySelector('.delayed_client_action'));

    //   //await prom;
    //   webClient.destroy();
    // });
  });
  QUnit.test("clear unCommittedChanges when toggling home menu", async function (assert) {
    assert.expect(7);
    // Edit a form view, don't save, toggle home menu
    // the autosave feature of the Form view is activated
    // and relied upon by this test

    const mockRPC = (route, args) => {
      if (args.method === 'create') {
        assert.strictEqual(args.model, 'partner');
        assert.deepEqual(args.args, [{
          display_name: "red right hand",
          foo: false,
        }]);
      }
    };

    const webClient = await createEnterpriseWebClient({ testConfig , mockRPC });
    await doAction(webClient, 3, { viewType: "form" });
    await legacyExtraNextTick();
    assert.containsOnce(webClient, ".o_form_view.o_form_editable");
    const input = webClient.el.querySelector("input.o_input");
    await testUtils.fields.editInput(input, "red right hand");

    await click(webClient.el.querySelector(".o_menu_toggle"));
    await nextTick();
    assert.isNotVisible(webClient.el.querySelector(".o_form_view"));
    assert.containsNone(document.body, ".modal");
    assert.containsOnce(webClient, ".o_home_menu");
    assert.isVisible(webClient.el.querySelector(".o_home_menu"));
    webClient.destroy();
  });
  QUnit.test("can have HomeMenu and dialog action", async function (assert) {
    assert.expect(6);
    const webClient = await createEnterpriseWebClient({ testConfig });
    await nextTick();
    assert.containsOnce(webClient, ".o_home_menu");
    assert.containsNone(webClient, ".modal .o_form_view");
    await doAction(webClient, 5);
    await legacyExtraNextTick();
    assert.containsOnce(webClient, ".modal .o_form_view");
    assert.isVisible(webClient.el.querySelector(".modal .o_form_view"));
    assert.containsOnce(webClient, ".o_home_menu");
    assert.isVisible(webClient.el.querySelector(".o_home_menu"));
    webClient.destroy();
  });
  QUnit.test("supports attachments of apps deleted", async function (assert) {
    assert.expect(1);
    // When doing a pg_restore without the filestore
    // LPE fixme: may not be necessary anymore since menus are not HomeMenu props anymore
    testConfig.serverData.menus = {
      root: { id: "root", children: [1], name: "root", appID: "root" },
      1: {
        id: 1,
        appID: 1,
        actionID: 1,
        xmlid: "",
        name: "Partners",
        children: [],
        webIconData: "",
        webIcon: "bloop,bloop",
      },
    };
    testConfig.debug = "1";
    const webClient = await createEnterpriseWebClient({ testConfig });
    assert.containsOnce(webClient, ".o_home_menu");
    webClient.destroy();
  });
  QUnit.test(
    "debug manager resets to global items when home menu is displayed",
    async function (assert) {
      assert.expect(9);
      testConfig.serviceRegistry.add("debug", debugService);
      testConfig.systrayRegistry = new Registry();
      testConfig.systrayRegistry.add("debug", DebugManager);
      testConfig.debugRegistry = new Registry();
      testConfig.debugRegistry.add("item_1", () => {
        return {
          type: "item",
          description: "globalItem",
          callback: () => {},
          sequence: 10,
        };
      });
      const mockRPC = async (route) => {
        if (route.includes("check_access_rights")) {
          return true;
        }
      };
      testConfig.debug = "1";
      const webClient = await createEnterpriseWebClient({ testConfig, mockRPC });
      await click(webClient.el.querySelector(".o_debug_manager .o_dropdown_toggler"));
      assert.containsOnce(webClient.el, ".o_debug_manager .o_dropdown_item:contains('globalItem')");
      assert.containsNone(
        webClient.el,
        ".o_debug_manager .o_dropdown_item:contains('Edit View: Kanban')"
      );
      await click(webClient.el.querySelector(".o_debug_manager .o_dropdown_toggler"));
      await doAction(webClient, 1);
      await click(webClient.el.querySelector(".o_debug_manager .o_dropdown_toggler"));
      assert.containsOnce(webClient.el, ".o_debug_manager .o_dropdown_item:contains('globalItem')");
      assert.containsOnce(
        webClient.el,
        ".o_debug_manager .o_dropdown_item:contains('Edit View: Kanban')"
      );
      await click(webClient.el.querySelector(".o_menu_toggle"));
      await click(webClient.el.querySelector(".o_debug_manager .o_dropdown_toggler"));
      assert.containsOnce(webClient.el, ".o_debug_manager .o_dropdown_item:contains('globalItem')");
      assert.containsNone(
        webClient.el,
        ".o_debug_manager .o_dropdown_item:contains('Edit View: Kanban')"
      );
      await click(webClient.el.querySelector(".o_debug_manager .o_dropdown_toggler"));
      await doAction(webClient, 3);
      await click(webClient.el.querySelector(".o_debug_manager .o_dropdown_toggler"));
      assert.containsOnce(webClient.el, ".o_debug_manager .o_dropdown_item:contains('globalItem')");
      assert.containsOnce(
        webClient.el,
        ".o_debug_manager .o_dropdown_item:contains('Edit View: List')"
      );
      assert.containsNone(
        webClient.el,
        ".o_debug_manager .o_dropdown_item:contains('Edit View: Kanban')"
      );
      webClient.destroy();
    }
  );
  QUnit.test(
    "url state is well handled when going in and out of the HomeMenu",
    async function (assert) {
      assert.expect(4);

      const webClient = await createEnterpriseWebClient({ testConfig });
      await nextTick();
      assert.deepEqual(webClient.env.services.router.current.hash, { action: "menu" });

      await click(webClient.el.querySelector(".o_app.o_menuitem:nth-child(2)"));
      await legacyExtraNextTick();
      assert.deepEqual(webClient.env.services.router.current.hash, {
        action: "1002",
        menu_id: "2",
      });

      await click(webClient.el.querySelector(".o_menu_toggle"));
      await nextTick();
      assert.deepEqual(webClient.env.services.router.current.hash, { action: "menu" });

      await click(webClient.el.querySelector(".o_menu_toggle"));
      // if we reload on going back to underlying action
      await legacyExtraNextTick();
      // end if
      assert.deepEqual(webClient.env.services.router.current.hash, {
        action: "1002",
        menu_id: "2",
      });

      webClient.destroy();
    }
  );
  QUnit.test(
    "underlying action's menu items are invisible when HomeMenu is displayed",
    async function (assert) {
      assert.expect(12);
      testConfig.serverData.menus[1].children = [99];
      testConfig.serverData.menus[99] = {
        id: 99,
        children: [],
        name: "SubMenu",
        appID: 1,
        actionID: 1002,
        xmlid: "",
        webIconData: undefined,
        webIcon: false,
      };
      const webClient = await createEnterpriseWebClient({ testConfig });
      assert.containsOnce(webClient.el, "nav .o_menu_sections");
      assert.containsNone(webClient.el, "nav .o_menu_brand");
      assert.isNotVisible(webClient.el.querySelector(".o_menu_sections"));
      assert.isNotVisible(webClient.el.querySelector(".o_menu_brand"));
      await click(webClient.el.querySelector(".o_app.o_menuitem:nth-child(2)"));
      await nextTick();
      assert.containsOnce(webClient.el, "nav .o_menu_sections");
      assert.containsOnce(webClient.el, "nav .o_menu_brand");
      assert.isVisible(webClient.el.querySelector(".o_menu_sections"));
      assert.isVisible(webClient.el.querySelector(".o_menu_brand"));
      await click(webClient.el.querySelector(".o_menu_toggle"));
      assert.containsOnce(webClient.el, "nav .o_menu_sections");
      assert.containsOnce(webClient.el, "nav .o_menu_brand");
      assert.isNotVisible(webClient.el.querySelector(".o_menu_sections"));
      assert.isNotVisible(webClient.el.querySelector(".o_menu_brand"));
      webClient.destroy();
    }
  );
  QUnit.test("loadState back and forth keeps relevant keys in state", async function (assert) {
    assert.expect(9);

    const webClient = await createEnterpriseWebClient({ testConfig });

    await click(webClient.el.querySelector(".o_app.o_menuitem:nth-child(2)"));
    await legacyExtraNextTick();
    assert.containsOnce(webClient, ".test_client_action");
    assert.containsNone(webClient, ".o_home_menu");
    const state = webClient.env.services.router.current.hash;
    assert.deepEqual(state, {
      action: "1002",
      menu_id: "2",
    });

    await loadState(webClient, {});
    assert.containsNone(webClient, ".test_client_action");
    assert.containsOnce(webClient, ".o_home_menu");
    assert.deepEqual(webClient.env.services.router.current.hash, {
      action: "menu",
    });

    await loadState(webClient, state);
    assert.containsOnce(webClient, ".test_client_action");
    assert.containsNone(webClient, ".o_home_menu");
    assert.deepEqual(webClient.env.services.router.current.hash, state);

    webClient.destroy();
  });

  QUnit.test(
    "go back to home menu using browser back button (i.e. loadState)",
    async function (assert) {
      assert.expect(7);

      const webClient = await createEnterpriseWebClient({ testConfig });
      assert.containsOnce(webClient, ".o_home_menu");
      assert.isNotVisible(webClient.el.querySelector(".o_main_navbar .o_menu_toggle"));

      await click(webClient.el.querySelector(".o_app.o_menuitem:nth-child(2)"));
      await legacyExtraNextTick();
      assert.containsOnce(webClient, ".test_client_action");
      assert.containsNone(webClient, ".o_home_menu");

      await loadState(webClient, { action: "menu" }); // FIXME: this might need to be changed
      assert.containsNone(webClient, ".test_client_action");
      assert.containsOnce(webClient, ".o_home_menu");
      assert.isNotVisible(webClient.el.querySelector(".o_main_navbar .o_menu_toggle"));

      webClient.destroy();
    }
  );

  QUnit.module('Burger Menu', hooks => {

    hooks.beforeEach(() => {
      testConfig.browser.location = {
        origin: 'sweetwater'
      };
      testConfig.systrayRegistry = new Registry();
      testConfig.systrayRegistry.add('burgerMenu', BurgerMenu);
      testConfig.serviceRegistry.add('ui', makeFakeUIService({ isSmall: true }), { force: true });
    });

    QUnit.test('Burger menu can be opened and closed', async function (assert) {
      assert.expect(2);

      const webClient = await createEnterpriseWebClient({ testConfig });

      await testUtils.dom.click(webClient.el.querySelector('.o_mobile_menu_toggle'));
      assert.containsOnce(webClient, ".o_burger_menu");

      await testUtils.dom.click(webClient.el.querySelector('.o_burger_menu_close'));
      assert.containsNone(webClient, ".o_burger_menu");

      webClient.destroy();
    });

    QUnit.test('Burger Menu on home menu', async function (assert) {
      assert.expect(7);

      const webClient = await createEnterpriseWebClient({ testConfig });
      assert.containsNone(webClient, ".o_burger_menu");
      assert.isVisible(webClient.el.querySelector('.o_home_menu'));

      await testUtils.dom.click(webClient.el.querySelector('.o_mobile_menu_toggle'));
      assert.containsOnce(webClient, ".o_burger_menu");
      assert.containsOnce(webClient, ".o_user_menu_mobile");
      assert.containsOnce(webClient, ".o_burger_menu_user");
      assert.containsNone(webClient, ".o_burger_menu_app");
      await testUtils.dom.click(webClient.el.querySelector('.o_burger_menu_close'));
      assert.containsNone(webClient, ".o_burger_menu");

      webClient.destroy();
    });

    QUnit.test('Burger Menu on an App', async function (assert) {
      assert.expect(8);

      testConfig.serverData.menus[1].children = [99];
      testConfig.serverData.menus[99] = {
        id: 99,
        children: [],
        name: "SubMenu",
        appID: 1,
        actionID: 1002,
        xmlid: "",
        webIconData: undefined,
        webIcon: false,
      };

      const webClient = await createEnterpriseWebClient({ testConfig });
      await click(webClient.el.querySelector('.o_app'));
      await legacyExtraNextTick();

      assert.containsNone(webClient, ".o_burger_menu");
      assert.isNotVisible(webClient.el.querySelector('.o_home_menu'));

      await testUtils.dom.click(webClient.el.querySelector('.o_mobile_menu_toggle'));
      assert.containsOnce(webClient, ".o_burger_menu");
      assert.containsN(webClient, ".o_burger_menu .o_burger_menu_app .o_menu_sections .o_dropdown_item", 1);
      assert.strictEqual(
        webClient.el.querySelector(".o_burger_menu .o_burger_menu_app .o_menu_sections .o_dropdown_item").textContent,
        "SubMenu"
      );
      assert.hasClass(webClient.el.querySelector(".o_burger_menu_content"), 'o_burger_menu_dark');

      await testUtils.dom.click(webClient.el.querySelector('.o_burger_menu_topbar'));
      assert.doesNotHaveClass(webClient.el.querySelector(".o_burger_menu_content"), 'o_burger_menu_dark');

      await testUtils.dom.click(webClient.el.querySelector('.o_burger_menu_topbar'));
      assert.hasClass(webClient.el.querySelector(".o_burger_menu_content"), 'o_burger_menu_dark');

      webClient.destroy();
    });

    QUnit.test('Burger menu closes when an action is requested', async function (assert) {
      assert.expect(3);

      const webClient = await createEnterpriseWebClient({ testConfig });

      await testUtils.dom.click(webClient.el.querySelector('.o_mobile_menu_toggle'));
      assert.containsOnce(webClient, ".o_burger_menu");

      await doAction(webClient, 1);
      await legacyExtraNextTick();
      assert.containsNone(webClient, ".o_burger_menu");
      assert.containsOnce(webClient, ".o_kanban_view");

      webClient.destroy();
    });
  });
});
