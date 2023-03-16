/** @odoo-module */

import { makeFakeNotificationService } from "@web/../tests/helpers/mock_services";
import { nextTick } from "@web/../tests/helpers/utils";
import { makeTestEnv } from "@web/../tests/helpers/mock_env";
import { startServer } from "./helpers/mock_python_environment";
import { registry } from "@web/core/registry";
import { busService } from "@bus/services/bus_service";
import { busParametersService } from "@bus/bus_parameters_service";
import { multiTabService } from "@bus/multi_tab_service";
import { notificationService } from "@bus/notification_service";

const serviceRegistry = registry.category("services");

QUnit.module("notification handler", {
    beforeEach() {
        serviceRegistry
            .add("bus_service", busService)
            .add("bus.parameters", busParametersService)
            .add("multi_tab", multiTabService)
            .add("bus.notification", notificationService);
    },
});

QUnit.test("Simple notification", async (assert) => {
    serviceRegistry.add(
        "notification",
        makeFakeNotificationService((message, options) => {
            assert.step("notification");
            assert.strictEqual(message, notificationPayload.message);
            assert.strictEqual(options.title, notificationPayload.title);
            assert.strictEqual(options.type, "warning");
            assert.ok(options.sticky);
        })
    );
    const pyEnv = await startServer();
    const notificationPayload = {
        message: "This is the way",
        sticky: true,
        title: "Din Djarin",
        warning: true,
    };
    await makeTestEnv({ activateMockServer: true });
    pyEnv["bus.bus"]._sendone(
        pyEnv.currentPartnerId,
        "bus.simple_notification",
        notificationPayload
    );
    await nextTick();
    assert.verifySteps(["notification"]);
});
