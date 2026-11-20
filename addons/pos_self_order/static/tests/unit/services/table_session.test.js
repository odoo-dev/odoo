import { describe, expect, test } from "@odoo/hoot";
import { advanceTime, animationFrame } from "@odoo/hoot-dom";
import { onRpc } from "@web/../tests/web_test_helpers";
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

    test("takeaway orders are not restricted", async () => {
        const { store } = await setupSecureTableEnv();
        const order = await getFilledSelfOrder(store);
        store.config.use_presets = true;
        order.preset_id = store.models["pos.preset"].find((p) => p.service_at !== "table");
        store.tableSession = null;
        expect(store._checkOrderPermission()).toBe(true);
    });
});
