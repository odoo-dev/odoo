import {
    addBusServiceListeners,
    defineBusModels,
    lockWebsocketConnect,
} from "@bus/../tests/bus_test_helpers";
import { WEBSOCKET_CLOSE_CODES } from "@bus/workers/websocket_worker";
import { describe, expect, test } from "@odoo/hoot";
import { manuallyDispatchProgrammaticEvent, runAllTimers } from "@odoo/hoot-dom";
import {
    getService,
    makeMockEnv,
    MockServer,
    mockService,
    patchWithCleanup,
} from "@web/../tests/web_test_helpers";

defineBusModels();
describe.current.tags("desktop");

function stepConnectionStateChanges() {
    mockService("bus.monitoring_service", {
        get isConnectionLost() {
            return this._isConnectionLost;
        },
        set isConnectionLost(value) {
            if (value !== this._isConnectionLost) {
                expect.step(`isConnectionLost - ${value}`);
            }
            this._isConnectionLost = value;
        },
    });
}

test("connection considered as lost after failed reconnect attempt", async () => {
    stepConnectionStateChanges();
    addBusServiceListeners(
        ["CONNECT", () => expect.step("CONNECT")],
        ["DISCONNECT", () => expect.step("DISCONNECT")]
    );
    await makeMockEnv();
    await expect.waitForSteps(["isConnectionLost - false", "CONNECT"]);
    const unlockWebsocket = lockWebsocketConnect();
    MockServer.env["bus.bus"]._simulateDisconnection(WEBSOCKET_CLOSE_CODES.ABNORMAL_CLOSURE);
    await expect.waitForSteps(["DISCONNECT"]);
    await runAllTimers();
    await expect.waitForSteps(["isConnectionLost - true"]);
    unlockWebsocket();
    await runAllTimers();
    await expect.waitForSteps(["isConnectionLost - false"]);
});

test("brief disconect not considered lost", async () => {
    stepConnectionStateChanges();
    addBusServiceListeners(
        ["CONNECT", () => expect.step("CONNECT")],
        ["DISCONNECT", () => expect.step("DISCONNECT")],
        ["RECONNECT", () => expect.step("RECONNECT")]
    );
    await makeMockEnv();
    await expect.waitForSteps(["isConnectionLost - false", "CONNECT"]);
    MockServer.env["bus.bus"]._simulateDisconnection(WEBSOCKET_CLOSE_CODES.SESSION_EXPIRED);
    await expect.waitForSteps(["DISCONNECT"]);
    await runAllTimers();
    await expect.waitForSteps(["RECONNECT"]); // Only reconnect step, which means the monitoring state didn't change.
});

test("computer sleep doesn't mark connection as lost", async () => {
    stepConnectionStateChanges();
    addBusServiceListeners(
        ["CONNECT", () => expect.step("CONNECT")],
        ["DISCONNECT", () => expect.step("DISCONNECT")],
        ["RECONNECT", () => expect.step("RECONNECT")]
    );
    await makeMockEnv();
    await expect.waitForSteps(["isConnectionLost - false", "CONNECT"]);
    const unlockWebsocket = lockWebsocketConnect();
    patchWithCleanup(navigator, { onLine: false });
    await manuallyDispatchProgrammaticEvent(window, "offline"); // Offline event is triggered when the computer goes to sleep.
    await expect.waitForSteps(["DISCONNECT"]);
    patchWithCleanup(navigator, { onLine: true });
    await manuallyDispatchProgrammaticEvent(window, "online"); // Online event is triggered when the computer wakes up.
    unlockWebsocket();
    await runAllTimers();
    await expect.waitForSteps(["CONNECT"]);
    expect(getService("bus.monitoring_service").isConnectionLost).toBe(false);
});
