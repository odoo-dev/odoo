import { test, expect, describe } from "@odoo/hoot";
import { tick } from "@odoo/hoot-dom";
import { patchWithCleanup } from "@web/../tests/web_test_helpers";
import { setupPosEnv, getFilledOrder } from "./utils";
import { definePosModels } from "./data/generate_model_definitions";

definePosModels();

describe("dirty flag persistence", () => {
    test("the dirty flag is serialized with the UI state", async () => {
        const store = await setupPosEnv();
        const order = await getFilledOrder(store);

        expect(order.isDirty()).toBe(true);
        expect(order.serializeState()._recordDirty).toBe(true);

        order.unmarkDirty();
        expect(order.serializeState()._recordDirty).toBe(false);
    });

    test("a locally edited record stays dirty after being restored", async () => {
        const store = await setupPosEnv();
        const order = await getFilledOrder(store);

        const state = order.serializeState();

        order.unmarkDirty();
        expect(order.isDirty()).toBe(false);

        order.restoreState(state);
        expect(order.isDirty()).toBe(true);
    });

    test("restoring a clean record does not mark it dirty", async () => {
        const store = await setupPosEnv();
        const order = await getFilledOrder(store);

        order.unmarkDirty();
        const cleanState = order.serializeState();

        order.restoreState(cleanState);
        expect(order.isDirty()).toBe(false);
    });

    test("_recordDirty does not leak into uiState", async () => {
        const store = await setupPosEnv();
        const order = await getFilledOrder(store);

        order.restoreState(order.serializeState());
        expect("_recordDirty" in order.uiState).toBe(false);
    });
});

describe("pending order recovery", () => {
    test("local drafts and dirty orders are re-queued after a reload", async () => {
        const store = await setupPosEnv();
        patchWithCleanup(store.deviceSync, { readDataFromServer: async () => ({}) });
        store.data.network.offline = true;

        const order = await getFilledOrder(store);
        expect(order.state).toBe("draft");
        expect(order.isSynced).toBe(false);

        store.clearPendingOrder();
        expect(store.getPendingOrder().orderToCreate.length).toBe(0);

        await store.afterProcessServerData();

        expect(store.getPendingOrder().orderToCreate.map((o) => o.uuid)).toInclude(order.uuid);
    });
});

describe("IndexedDB pruning safety", () => {
    test("unsynced rows that failed to load are kept, synced ones are pruned", async () => {
        const store = await setupPosEnv();
        const data = store.data;

        const deletedKeys = [];
        data.indexedDB.delete = async (_model, keys) => {
            deletedKeys.push(...keys);
            return { ok: true, failures: [] };
        };
        data.indexedDB.readAll = async () => ({
            "pos.order": [
                { id: "orphan-local-uuid", uuid: "orphan-local-uuid", state: "paid" },
                { id: 987654, uuid: "orphan-synced-uuid", state: "paid" },
            ],
        });

        await data._synchronizeLocalDataInIndexedDB();
        await tick();
        await tick();

        expect(deletedKeys).toInclude("orphan-synced-uuid");
        expect(deletedKeys.includes("orphan-local-uuid")).toBe(false);
    });
});

describe("sync robustness", () => {
    test("a failing preSyncAllOrders no longer aborts the whole batch", async () => {
        const store = await setupPosEnv();
        const first = await getFilledOrder(store);
        const second = await getFilledOrder(store);

        const attempted = [];
        const originalPreSync = store.preSyncAllOrders.bind(store);
        patchWithCleanup(store.deviceSync, { readDataFromServer: async () => ({}) });
        patchWithCleanup(store, {
            async preSyncAllOrders(orders) {
                attempted.push(orders[0].uuid);
                if (orders[0].uuid === first.uuid) {
                    throw new Error("fiscal module unreachable");
                }
                return originalPreSync(orders);
            },
        });

        await store.syncAllOrders({ orders: [first, second] });

        expect(attempted).toInclude(first.uuid);
        expect(attempted).toInclude(second.uuid);
    });
});

describe("IndexedDB key selection", () => {
    test("getIndexedDBKey follows the store key of each model", async () => {
        const store = await setupPosEnv();
        const data = store.data;
        const order = await getFilledOrder(store);

        expect(data.getIndexedDBKey(order)).toBe(order.uuid);

        const product = store.models["product.product"].getAll()[0];
        expect(data.getIndexedDBKey(product)).toBe(product.id);
    });
});

describe("offline order cancellation", () => {
    test("cancelling a server-side order offline queues it instead of failing", async () => {
        const store = await setupPosEnv();
        store.clearPendingOrder();
        store.data.network.offline = true;

        const deleted = await store.deleteOrders([], [999]);

        expect(deleted).toBe(true);
        expect(store.pendingOrder.delete.has(999)).toBe(true);
    });

    test("cancelling several orders offline queues every id, not just the first", async () => {
        const store = await setupPosEnv();

        store.clearPendingOrder();
        store.addPendingOrder([101, 102, 103], true);

        expect([...store.pendingOrder.delete].sort((a, b) => a - b)).toEqual([101, 102, 103]);
    });
});
