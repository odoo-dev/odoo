import * as QUnit from "qunit";
import { makeFakeUserService } from "../helpers/index";
import type { TestConfig } from "../helpers/utility";
import { notificationService } from "../../src/notifications/notification_service";
import {
  makeFakeDownloadService,
  makeFakeNotificationService,
  makeFakeUIService,
} from "../helpers/mocks";

import { RPC } from "../../src/services/rpc";
import { getLegacy } from "../helpers/legacy";
import { actionRegistry } from "../../src/action_manager/action_registry";
import { viewRegistry } from "../../src/views/view_registry";
import { DowloadFileOptionsFromParams } from "../../src/services/download";
import { createWebClient, doAction, getActionManagerTestConfig } from "./helpers";

let testConfig: TestConfig;
// legacy stuff
let testUtils: any;
let ReportClientAction: any;

QUnit.module("ActionManager", (hooks) => {
  hooks.before(() => {
    const legacy = getLegacy() as any;
    testUtils = legacy.testUtils;
    ReportClientAction = legacy.ReportClientAction;
  });

  // Remove this as soon as we drop the legacy support.
  // This is necessary as some tests add actions/views in the legacy registries,
  // which are in turned wrapped and added into the real wowl registries. We
  // add those actions/views in the test registries, and remove them from the
  // real ones (directly, as we don't need them in the test).
  const owner = Symbol("owner");
  hooks.beforeEach(() => {
    actionRegistry.on("UPDATE", owner, (payload) => {
      if (payload.operation === "add" && testConfig.actionRegistry) {
        testConfig.actionRegistry.add(payload.key, payload.value);
        actionRegistry.remove(payload.key);
      }
    });
    viewRegistry.on("UPDATE", owner, (payload) => {
      if (payload.operation === "add" && testConfig.viewRegistry) {
        testConfig.viewRegistry.add(payload.key, payload.value);
        viewRegistry.remove(payload.key);
      }
    });
  });
  hooks.afterEach(() => {
    actionRegistry.off("UPDATE", owner);
    viewRegistry.off("UPDATE", owner);
  });

  hooks.beforeEach(() => {
    testConfig = getActionManagerTestConfig();
  });

  QUnit.module("Report actions");

  QUnit.test("can execute report actions from db ID", async function (assert) {
    assert.expect(6);

    testConfig.serviceRegistry!.add(
      "download",
      makeFakeDownloadService((options: DowloadFileOptionsFromParams) => {
        assert.step(options.url);
        return Promise.resolve();
      })
    );

    const mockRPC: RPC = async (route, args) => {
      assert.step(args?.method || route);
      if (route === "/report/check_wkhtmltopdf") {
        return Promise.resolve("ok");
      }
    };
    const webClient = await createWebClient({ testConfig, mockRPC });

    await doAction(webClient, 7, { onClose: () => assert.step("on_close") });

    assert.verifySteps([
      "/wowl/load_menus",
      "/web/action/load",
      "/report/check_wkhtmltopdf",
      "/report/download",
      "on_close",
    ]);

    webClient.destroy();
  });

  QUnit.test("report actions can close modals and reload views", async function (assert) {
    assert.expect(8);

    testConfig.serviceRegistry!.add(
      "download",
      makeFakeDownloadService((options: DowloadFileOptionsFromParams) => {
        assert.step(options.url);
        return Promise.resolve();
      })
    );
    const mockRPC: RPC = async (route) => {
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

    webClient.destroy();
  });

  QUnit.test("should trigger a notification if wkhtmltopdf is to upgrade", async function (assert) {
    testConfig.serviceRegistry!.add(
      notificationService.name,
      makeFakeNotificationService(
        () => {
          assert.step("notify");
        },
        () => {}
      ),
      true
    );
    testConfig.serviceRegistry!.add(
      "download",
      makeFakeDownloadService((options: DowloadFileOptionsFromParams) => {
        assert.step(options.url);
        return Promise.resolve();
      })
    );

    const mockRPC: RPC = async (route, args) => {
      assert.step(args?.method || route);
      if (route === "/report/check_wkhtmltopdf") {
        return Promise.resolve("upgrade");
      }
    };
    const webClient = await createWebClient({ testConfig, mockRPC });

    await doAction(webClient, 7);
    assert.verifySteps([
      "/wowl/load_menus",
      "/web/action/load",
      "/report/check_wkhtmltopdf",
      "notify",
      "/report/download",
    ]);

    webClient.destroy();
  });

  QUnit.test(
    "should open the report client action if wkhtmltopdf is broken",
    async function (assert) {
      testConfig.serviceRegistry!.add(
        "download",
        makeFakeDownloadService((options: DowloadFileOptionsFromParams) => {
          assert.step("download"); // should not be called
          return Promise.resolve();
        })
      );
      testConfig.serviceRegistry!.add(
        notificationService.name,
        makeFakeNotificationService(
          () => {
            assert.step("notify");
          },
          () => {}
        ),
        true
      );

      const mockRPC: RPC = async (route, args) => {
        assert.step(args!.method || route);
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
        "/wowl/load_menus",
        "/web/action/load",
        "/report/check_wkhtmltopdf",
        "notify",
        // context={"lang":'en',"uid":7,"tz":'taht'}
        "/report/html/some_report?context=%7B%22lang%22%3A%22en%22%2C%22uid%22%3A7%2C%22tz%22%3A%22taht%22%7D",
      ]);

      webClient.destroy();
      testUtils.mock.unpatch(ReportClientAction);
    }
  );

  QUnit.test("send context in case of html report", async function (assert) {
    assert.expect(5);

    testConfig.serviceRegistry!.add(
      "download",
      makeFakeDownloadService((options: DowloadFileOptionsFromParams) => {
        assert.step("download"); // should not be called
        return Promise.resolve();
      })
    );
    testConfig.serviceRegistry!.add(
      notificationService.name,
      makeFakeNotificationService(
        (message: string, options: any) => {
          assert.step(options.type || "notification");
        },
        () => {}
      ),
      true
    );
    testConfig.serviceRegistry!.add(
      "user",
      makeFakeUserService({ context: { some_key: 2 } } as any),
      true
    );

    const mockRPC: RPC = async (route, args) => {
      assert.step(args!.method || route);
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
      "/wowl/load_menus",
      "/web/action/load",
      // context={"some_key":2}
      "/report/html/some_report?context=%7B%22some_key%22%3A2%7D", // report client action's iframe
    ]);

    webClient.destroy();
    testUtils.mock.unpatch(ReportClientAction);
  });

  QUnit.test(
    "UI unblocks after downloading the report even if it threw an error",
    async function (assert) {
      assert.expect(8);

      let timesDownloasServiceHasBeenCalled = 0;
      testConfig.serviceRegistry!.add(
        "download",
        makeFakeDownloadService((options: DowloadFileOptionsFromParams) => {
          if (timesDownloasServiceHasBeenCalled === 0) {
            assert.step("successful download");
            timesDownloasServiceHasBeenCalled++;
            return Promise.resolve();
          }
          if (timesDownloasServiceHasBeenCalled === 1) {
            assert.step("failed download");
            return Promise.reject();
          }
        })
      );

      testConfig.serviceRegistry!.add(
        "ui",
        makeFakeUIService(
          () => {
            assert.step("block");
          },
          () => {
            assert.step("unblock");
          }
        ),
        true
      );

      const mockRPC: RPC = async (route, args) => {
        if (route === "/report/check_wkhtmltopdf") {
          return Promise.resolve("ok");
        }
      };

      const webClient = await createWebClient({ testConfig, mockRPC });

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

      webClient.destroy();
    }
  );
});
