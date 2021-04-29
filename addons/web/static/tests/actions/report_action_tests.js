/** @odoo-module **/

import { getLegacy } from "web.test_legacy";
import { uiService } from "@web/services/ui_service";
import { serviceRegistry } from "@web/webclient/service_registry";
import { mainComponentRegistry } from "@web/webclient/main_component_registry";
import { makeFakeNotificationService, makeFakeUserService } from "../helpers/mock_services";
import { createWebClient, doAction, getActionManagerTestConfig } from "./helpers";
import { clearRegistryWithCleanup } from "../helpers/mock_env";
import { download } from "../../src/utils/download";
import { patchWithCleanup } from "../helpers/utils";

let testConfig;

// legacy stuff
let testUtils;
let ReportClientAction;

function mockDownload(cb) {
  patchWithCleanup(download, { _download: cb });
}

QUnit.module("ActionManager", (hooks) => {
  hooks.before(() => {
    const legacy = getLegacy();
    testUtils = legacy.testUtils;
    ReportClientAction = legacy.ReportClientAction;
  });

  hooks.beforeEach(() => {
    testConfig = getActionManagerTestConfig();
    clearRegistryWithCleanup(mainComponentRegistry);
  });

  QUnit.module("Report actions");

  QUnit.test("can execute report actions from db ID", async function (assert) {
    assert.expect(6);
    mockDownload((options) => {
      assert.step(options.url);
      return Promise.resolve();
    });
    const mockRPC = async (route, args) => {
      assert.step((args && args.method) || route);
      if (route === "/report/check_wkhtmltopdf") {
        return Promise.resolve("ok");
      }
    };
    const webClient = await createWebClient({ testConfig, mockRPC });
    await doAction(webClient, 7, { onClose: () => assert.step("on_close") });
    assert.verifySteps([
      "/web/webclient/load_menus",
      "/web/action/load",
      "/report/check_wkhtmltopdf",
      "/report/download",
      "on_close",
    ]);
  });

  QUnit.test("report actions can close modals and reload views", async function (assert) {
    assert.expect(8);
    mockDownload((options) => {
      assert.step(options.url);
      return Promise.resolve();
    });
    const mockRPC = async (route) => {
      if (route === "/report/check_wkhtmltopdf") {
        return Promise.resolve("ok");
      }
    };
    const webClient = await createWebClient({ testConfig, mockRPC });
    await doAction(webClient, 5, { onClose: () => assert.step("on_close") });
    assert.containsOnce(
      document.body,
      ".o_technical_modal .o_form_view",
      "should have rendered a form view in a modal"
    );
    await doAction(webClient, 7, { onClose: () => assert.step("on_printed") });
    assert.containsOnce(
      document.body,
      ".o_technical_modal .o_form_view",
      "The modal should still exist"
    );
    await doAction(webClient, 11);
    assert.containsNone(
      document.body,
      ".o_technical_modal .o_form_view",
      "the modal should have been closed after the action report"
    );
    assert.verifySteps(["/report/download", "on_printed", "/report/download", "on_close"]);
  });

  QUnit.test("should trigger a notification if wkhtmltopdf is to upgrade", async function (assert) {
    serviceRegistry.add(
      "notification",
      makeFakeNotificationService(
        () => {
          assert.step("notify");
        },
        () => {}
      ),
      { force: true }
    );
    mockDownload((options) => {
      assert.step(options.url);
      return Promise.resolve();
    });
    const mockRPC = async (route, args) => {
      assert.step((args && args.method) || route);
      if (route === "/report/check_wkhtmltopdf") {
        return Promise.resolve("upgrade");
      }
    };
    const webClient = await createWebClient({ testConfig, mockRPC });
    await doAction(webClient, 7);
    assert.verifySteps([
      "/web/webclient/load_menus",
      "/web/action/load",
      "/report/check_wkhtmltopdf",
      "notify",
      "/report/download",
    ]);
  });

  QUnit.test(
    "should open the report client action if wkhtmltopdf is broken",
    async function (assert) {
      mockDownload(() => {
        assert.step("download"); // should not be called
        return Promise.resolve();
      });
      serviceRegistry.add(
        "notification",
        makeFakeNotificationService(
          () => {
            assert.step("notify");
          },
          () => {}
        ),
        { force: true }
      );
      const mockRPC = async (route, args) => {
        assert.step(args.method || route);
        if (route === "/report/check_wkhtmltopdf") {
          return Promise.resolve("broken");
        }
        if (route.includes("/report/html/some_report")) {
          return Promise.resolve(true);
        }
      };
      // patch the report client action to override its iframe's url so that
      // it doesn't trigger an RPC when it is appended to the DOM (for this
      // usecase, using removeSRCAttribute doesn't work as the RPC is
      // triggered as soon as the iframe is in the DOM, even if its src
      // attribute is removed right after)
      testUtils.mock.patch(ReportClientAction, {
        async start() {
          await this._super(...arguments);
          this._rpc({ route: this.iframe.getAttribute("src") });
          this.iframe.setAttribute("src", "about:blank");
        },
      });
      const webClient = await createWebClient({ testConfig, mockRPC });
      await doAction(webClient, 7);
      assert.containsOnce(
        webClient,
        ".o_report_iframe",
        "should have opened the report client action"
      );
      assert.containsOnce(webClient, ".o_cp_buttons .o_report_buttons .o_report_print");
      assert.verifySteps([
        "/web/webclient/load_menus",
        "/web/action/load",
        "/report/check_wkhtmltopdf",
        "notify",
        // context={"lang":'en',"uid":7,"tz":'taht', allowed_company_ids: [1]}
        "/report/html/some_report?context=%7B%22lang%22%3A%22en%22%2C%22uid%22%3A7%2C%22tz%22%3A%22taht%22%2C%22allowed_company_ids%22%3A%5B1%5D%7D",
      ]);
      testUtils.mock.unpatch(ReportClientAction);
    }
  );

  QUnit.test("send context in case of html report", async function (assert) {
    assert.expect(5);
    mockDownload(() => {
      assert.step("download"); // should not be called
      return Promise.resolve();
    });
    serviceRegistry.add(
      "notification",
      makeFakeNotificationService(
        (message, options) => {
          assert.step(options.type || "notification");
        },
        () => {}
      ),
      { force: true }
    );
    serviceRegistry.add("user", makeFakeUserService({ context: { some_key: 2 } }), {
      force: true,
    });
    const mockRPC = async (route, args) => {
      assert.step(args.method || route);
      if (route.includes("/report/html/some_report")) {
        return Promise.resolve(true);
      }
    };
    // patch the report client action to override its iframe's url so that
    // it doesn't trigger an RPC when it is appended to the DOM (for this
    // usecase, using removeSRCAttribute doesn't work as the RPC is
    // triggered as soon as the iframe is in the DOM, even if its src
    // attribute is removed right after)
    testUtils.mock.patch(ReportClientAction, {
      async start() {
        await this._super(...arguments);
        this._rpc({ route: this.iframe.getAttribute("src") });
        this.iframe.setAttribute("src", "about:blank");
      },
    });
    const webClient = await createWebClient({ testConfig, mockRPC });
    await doAction(webClient, 12);
    assert.containsOnce(webClient, ".o_report_iframe", "should have opened the client action");
    assert.verifySteps([
      "/web/webclient/load_menus",
      "/web/action/load",
      // context={"some_key":2}
      "/report/html/some_report?context=%7B%22some_key%22%3A2%7D",
    ]);
    testUtils.mock.unpatch(ReportClientAction);
  });

  QUnit.test(
    "UI unblocks after downloading the report even if it threw an error",
    async function (assert) {
      assert.expect(8);
      let timesDownloasServiceHasBeenCalled = 0;
      mockDownload(() => {
        if (timesDownloasServiceHasBeenCalled === 0) {
          assert.step("successful download");
          timesDownloasServiceHasBeenCalled++;
          return Promise.resolve();
        }
        if (timesDownloasServiceHasBeenCalled === 1) {
          assert.step("failed download");
          return Promise.reject();
        }
      });
      serviceRegistry.add("ui", uiService, { force: true });
      const mockRPC = async (route) => {
        if (route === "/report/check_wkhtmltopdf") {
          return Promise.resolve("ok");
        }
      };
      const webClient = await createWebClient({ testConfig, mockRPC });
      const ui = webClient.env.services.ui;
      ui.bus.on("BLOCK", webClient, () => {
        assert.step("block");
      });
      ui.bus.on("UNBLOCK", webClient, () => {
        assert.step("unblock");
      });
      await doAction(webClient, 7);
      try {
        await doAction(webClient, 7);
      } catch (e) {
        assert.step("error caught");
      }
      assert.verifySteps([
        "block",
        "successful download",
        "unblock",
        "block",
        "failed download",
        "unblock",
        "error caught",
      ]);
      ui.bus.off("BLOCK", webClient);
      ui.bus.off("UNBLOCK", webClient);
    }
  );
});
