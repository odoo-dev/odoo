/** @odoo-module **/

import { DialogContainer } from "@web/core/dialog/dialog_service";
import { mainComponentRegistry } from "@web/core/main_component_registry";
import { NotificationContainer } from "@web/core/notifications/notification_container";
import { getLegacy } from "web.test_legacy";
import { legacyExtraNextTick, patchWithCleanup } from "../../helpers/utils";
import { clearRegistryWithCleanup } from "../../helpers/mock_env";
import { createWebClient, doAction, getActionManagerTestConfig } from "./helpers";

let testConfig;
// legacy stuff
let ListController;
let testUtils;

QUnit.module("ActionManager", (hooks) => {
    hooks.before(() => {
        const legacy = getLegacy();
        ListController = legacy.ListController;
        testUtils = legacy.testUtils;
    });
    hooks.beforeEach(() => {
        testConfig = getActionManagerTestConfig();
    });

    QUnit.module("Legacy tests (to eventually drop)");

    QUnit.test("display warning as notification", async function (assert) {
        // this test can be removed as soon as the legacy layer is dropped
        assert.expect(5);
        let list;
        patchWithCleanup(ListController.prototype, {
            init() {
                this._super(...arguments);
                list = this;
            },
        });

        clearRegistryWithCleanup(mainComponentRegistry);
        mainComponentRegistry.add("NotificationContainer", NotificationContainer);
        const webClient = await createWebClient({ testConfig });
        await doAction(webClient, 3);
        assert.containsOnce(webClient, ".o_list_view");
        list.trigger_up("warning", {
            title: "Warning!!!",
            message: "This is a warning...",
        });
        await testUtils.nextTick();
        await legacyExtraNextTick();
        assert.containsOnce(webClient, ".o_list_view");
        assert.containsOnce(document.body, ".o_notification.bg-warning");
        assert.strictEqual($(".o_notification_title").text(), "Warning!!!");
        assert.strictEqual($(".o_notification_content").text(), "This is a warning...");
    });

    QUnit.test("display warning as modal", async function (assert) {
        // this test can be removed as soon as the legacy layer is dropped
        assert.expect(5);
        let list;
        patchWithCleanup(ListController.prototype, {
            init() {
                this._super(...arguments);
                list = this;
            },
        });
        clearRegistryWithCleanup(mainComponentRegistry);
        mainComponentRegistry.add("DialogContainer", DialogContainer);

        const webClient = await createWebClient({ testConfig });
        await doAction(webClient, 3);
        assert.containsOnce(webClient, ".o_list_view");
        list.trigger_up("warning", {
            title: "Warning!!!",
            message: "This is a warning...",
            type: "dialog",
        });
        await testUtils.nextTick();
        await legacyExtraNextTick();
        assert.containsOnce(webClient, ".o_list_view");
        assert.containsOnce(document.body, ".modal");
        assert.strictEqual($(".modal-title").text(), "Warning!!!");
        assert.strictEqual($(".modal-body").text(), "This is a warning...");
    });
});
