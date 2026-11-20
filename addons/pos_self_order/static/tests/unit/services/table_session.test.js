import { describe, expect, test } from "@odoo/hoot";
import { advanceTime, animationFrame } from "@odoo/hoot-dom";
import { contains, onRpc } from "@web/../tests/web_test_helpers";
import { location } from "@web/core/browser/browser";
import { getTableSessionStorageKey } from "@pos_self_order/app/utils";
import { definePosSelfModels } from "../data/generate_model_definitions";
import { getFilledSelfOrder, setupSelfPosEnv } from "../utils";

definePosSelfModels();

const TIMEOUT_MS = 10 * 60 * 1000;

async function setupSecureTableEnv() {
    const store = await setupSelfPosEnv("mobile", "table", "meal", {
        self_order_secure_session: true,
        self_order_session_timeout_minutes: 10,
        use_presets: false,
    });
    const table = store.models["restaurant.table"].getFirst();
    store.router.addTableIdentifier(table);
    return { store, table };
}

function storeSession(store, table, session) {
    localStorage.setItem(
        getTableSessionStorageKey(store.config.id, table.identifier),
        JSON.stringify(session)
    );
}

function onGuestAction(callback) {
    onRpc("/pos-self-order/table/guest-action", async (request) => {
        const { params } = await request.json();
        expect.step(params.action);
        return callback(params);
    });
}

describe("table session", () => {
    test("is only enabled for mobile, pay after meal, table service with a timeout", async () => {
        const { store } = await setupSecureTableEnv();
        expect(store._isSessionTimeoutEnabled()).toBe(true);

        store.config.self_order_session_timeout_minutes = 0;
        expect(store._isSessionTimeoutEnabled()).toBe(false);
        store.config.self_order_session_timeout_minutes = 10;

        store.config.self_ordering_pay_after = "each";
        expect(store._isSessionTimeoutEnabled()).toBe(false);
        store.config.self_ordering_pay_after = "meal";

        store.config.self_ordering_mode = "kiosk";
        expect(store._isSessionTimeoutEnabled()).toBe(false);
    });

    test("a fresh QR scan starts a session which expires locally", async () => {
        const { store, table } = await setupSecureTableEnv();
        onRpc("/pos-self/session/create", async (request) => {
            const { params } = await request.json();
            expect.step("session/create");
            expect(params).toEqual({
                access_token: store.access_token,
                table_identifier: table.identifier,
            });
            return {
                status: "open",
                token: "signed-token",
                expires_at_ms: Date.now() + TIMEOUT_MS,
            };
        });
        const url = new URL(location.href);
        url.searchParams.set("qr", "1");
        history.replaceState({}, "", url);

        await store._initTableSession();
        expect.verifySteps(["session/create"]);
        expect(new URL(location.href).searchParams.has("qr")).toBe(false);
        expect(store._getTableSessionToken()).toBe("signed-token");
        expect(
            JSON.parse(
                localStorage.getItem(getTableSessionStorageKey(store.config.id, table.identifier))
            ).token
        ).toBe("signed-token");
        expect(store.isSessionExpired()).toBe(false);

        await advanceTime(TIMEOUT_MS);
        expect(store.isSessionExpired()).toBe(true);
    });

    test("a page reload reuses the stored session without server call", async () => {
        const { store, table } = await setupSecureTableEnv();
        onRpc("/pos-self/session/create", () => expect.step("session/create"));

        await store._initTableSession();
        expect(store.isSessionExpired()).toBe(true, { message: "no stored session" });

        storeSession(store, table, { token: "old", expiresAt: Date.now() - 1 });
        await store._initTableSession();
        expect(store.isSessionExpired()).toBe(true, { message: "stored session expired" });

        storeSession(store, table, { token: "valid", expiresAt: Date.now() + TIMEOUT_MS });
        await store._initTableSession();
        expect(store.isSessionExpired()).toBe(false);
        expect(store._getTableSessionToken()).toBe("valid");
        expect.verifySteps([]);
    });
});

describe("order permission", () => {
    test("expired session blocks dine-in orders", async () => {
        const { store } = await setupSecureTableEnv();
        await getFilledSelfOrder(store);
        store.tableSession = { token: "old", expiresAt: Date.now() - 1 };

        expect(store._checkOrderPermission()).toBe(false);
        expect(store._isSessionExpired).toBe(true);
        await animationFrame();
        expect(".o_notification:contains('Your session has expired')").toHaveCount(1);
    });

    test("guests not approved by the table lead must ask to join", async () => {
        const { store } = await setupSecureTableEnv();
        await getFilledSelfOrder(store);
        store.tableSession = { token: "valid", expiresAt: Date.now() + TIMEOUT_MS };

        store.isApproved = false;
        expect(store._checkOrderPermission()).toBe(false);
        await animationFrame();
        expect(".self_order_table_join_popup.o_table_join_join").toHaveCount(1);

        store.isApproved = true;
        expect(store._checkOrderPermission()).toBe(true);
    });

    test("takeaway orders sent from a scanned table are restricted too", async () => {
        // The server puts them on the table, merged into the table order
        const { store } = await setupSecureTableEnv();
        const order = await getFilledSelfOrder(store);
        store.config.use_presets = true;
        order.preset_id = store.models["pos.preset"].find((p) => p.service_at !== "table");
        store.tableSession = { token: "old", expiresAt: Date.now() - 1 };
        expect(store._checkOrderPermission()).toBe(false);
        expect(store.isSessionExpired()).toBe(true);
    });

    test("orders without a scanned table are not restricted", async () => {
        const { store } = await setupSecureTableEnv();
        await getFilledSelfOrder(store);
        const url = new URL(location.href);
        url.searchParams.delete("table_identifier");
        history.replaceState({}, "", url);
        store.isApproved = false;
        expect(store._checkOrderPermission()).toBe(true);
    });

    test("only the guest token and table session token are added to the payloads", async () => {
        const { store } = await setupSecureTableEnv();
        const order = await getFilledSelfOrder(store);
        expect(order.serializeForORM().guest_token).toBe(store.guestToken);

        store.config.self_order_secure_session = false;
        expect(order.serializeForORM()).not.toInclude("guest_token");
    });
});

describe("table join flow", () => {
    test("the guest status of the table order drives the UI", async () => {
        const { store } = await setupSecureTableEnv();
        const order = await getFilledSelfOrder(store);
        const status = { is_lead: false, is_approved: false, pending_request_id: false };

        store._updateTableGuestStatus({ id: order.id, _table_guest_status: status });
        await animationFrame();
        expect(store.isApproved).toBe(false);
        expect(".o_table_join_join").toHaveCount(1);
        await contains(".o_table_join_join .btn-secondary").click();

        store._updateTableGuestStatus({
            id: order.id,
            _table_guest_status: { ...status, pending_request_id: "req1" },
        });
        await animationFrame();
        expect(store.isWaitingApproval).toBe(true);
        expect(".self_order_table_join_popup").toHaveCount(0, {
            message: "a pending guest is not prompted again",
        });
    });

    test("requests missed by the lead are shown again", async () => {
        const { store } = await setupSecureTableEnv();
        const order = await getFilledSelfOrder(store);
        store._updateTableGuestStatus({
            id: order.id,
            _table_guest_status: {
                is_lead: true,
                is_approved: true,
                pending_request_id: false,
                pending_request_ids: ["req1", "req2"],
            },
        });
        await animationFrame();
        expect(store.isLead).toBe(true);
        expect(".o_table_join_approve").toHaveCount(2);

        // Same request received again through the bus: not shown twice
        store.onTableJoinRequest({ request_id: "req1", order_id: order.id });
        // Request of another table order: ignored
        store.onTableJoinRequest({ request_id: "req3", order_id: "other" });
        await animationFrame();
        expect(".o_table_join_approve").toHaveCount(2);
    });

    test("asking to join, then being approved", async () => {
        const { store } = await setupSecureTableEnv();
        await getFilledSelfOrder(store);
        store.tableSession = { token: "valid", expiresAt: Date.now() + TIMEOUT_MS };
        store.isApproved = false;
        onGuestAction((params) => {
            expect(params).toEqual({
                access_token: store.access_token,
                table_identifier: store.currentTableIdentifier,
                table_session_token: "valid",
                action: "request",
                guest_token: store.guestToken,
            });
            return { status: "pending", request_id: "req1" };
        });

        store.promptJoinRequest();
        await contains(".o_table_join_join .btn-primary:contains('Request to Join')").click();
        expect.verifySteps(["request"]);
        expect(store.pendingJoinRequestId).toBe("req1");
        expect(".o_table_join_waiting").toHaveCount(1);

        // Answer to another guest's request
        await store.onTableJoinStatus({ request_id: "req2", status: "approved" });
        await animationFrame();
        expect(store.isApproved).toBe(false);
        expect(".o_table_join_waiting").toHaveCount(1);

        await store.onTableJoinStatus({ request_id: "req1", status: "approved" });
        await animationFrame();
        expect(store.isApproved).toBe(true);
        expect(store.isWaitingApproval).toBe(false);
        expect(".self_order_table_join_popup").toHaveCount(0);
        expect(".o_notification:contains('You have been approved')").toHaveCount(1);
    });

    test("asking to join, then being declined", async () => {
        const { store } = await setupSecureTableEnv();
        await getFilledSelfOrder(store);
        store.isApproved = false;
        store.pendingJoinRequestId = "req1";
        store.isWaitingApproval = true;

        await store.onTableJoinStatus({ request_id: "req1", status: "rejected" });
        await animationFrame();
        expect(store.isApproved).toBe(false);
        expect(store.isWaitingApproval).toBe(false);
        expect(".o_notification:contains('declined')").toHaveCount(1);
    });

    test("the request is unlocked when the table order is closed", async () => {
        const { store } = await setupSecureTableEnv();
        await getFilledSelfOrder(store);
        store.isApproved = false;
        store.pendingJoinRequestId = "req1";
        store.isWaitingApproval = true;

        await store.onTableJoinStatus({ request_id: "req1", status: "closed" });
        await animationFrame();
        expect(store.isApproved).toBe(true);
        expect(store.isWaitingApproval).toBe(false);
        expect(".o_notification:contains('The table order is closed')").toHaveCount(1);
    });

    test("guests outside the dining party only get their status, not the table order", async () => {
        const { store } = await setupSecureTableEnv();
        store.tableSession = { token: "valid", expiresAt: Date.now() + TIMEOUT_MS };
        onRpc("/pos-self-order/get-user-data/", async (request) => {
            const { params } = await request.json();
            expect.step(params.table_session_token);
            return {
                table_guest_status: {
                    is_lead: false,
                    is_approved: false,
                    pending_request_id: false,
                    pending_request_ids: [],
                },
            };
        });

        await store.getUserDataFromServer();
        await animationFrame();
        expect.verifySteps(["valid"]);
        expect(store.isApproved).toBe(false);
        expect(".self_order_table_join_popup.o_table_join_join").toHaveCount(1);
    });

    test("the lead allows or declines a guest", async () => {
        const { store } = await setupSecureTableEnv();
        const order = await getFilledSelfOrder(store);
        store.isLead = true;
        onGuestAction((params) => {
            expect(params.guest_token).toBe(store.guestToken);
            expect.step(params.request_id);
            return { status: params.action === "approve" ? "approved" : "rejected" };
        });

        store.onTableJoinRequest({ request_id: "req1", order_id: order.id });
        await contains(".o_table_join_approve .btn-primary:contains('Allow')").click();
        expect.verifySteps(["approve", "req1"]);

        store.onTableJoinRequest({ request_id: "req2", order_id: order.id });
        await contains(".o_table_join_approve .btn-secondary:contains('Decline')").click();
        expect.verifySteps(["reject", "req2"]);
    });

    test("the lead popup closes when staff answered the request", async () => {
        const { store } = await setupSecureTableEnv();
        const order = await getFilledSelfOrder(store);
        store.isLead = true;
        store.onTableJoinRequest({ request_id: "req1", order_id: order.id });
        await animationFrame();
        expect(".o_table_join_approve").toHaveCount(1);

        await store.onTableJoinStatus({ request_id: "req1", status: "approved" });
        await animationFrame();
        expect(".o_table_join_approve").toHaveCount(0);
    });
});
