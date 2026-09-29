import { test, expect, describe } from "@odoo/hoot";
import { setupPosEnv, getFilledOrder } from "./utils";
import { definePosModels } from "./data/generate_model_definitions";

const { DateTime } = luxon;

definePosModels();

describe("local persistence failures", () => {
    test("a failed local write is reported and never silent", async () => {
        const store = await setupPosEnv();
        const data = store.data;

        expect(data.network.storage.writeFailed).toBe(false);

        data.handleLocalPersistenceFailure(["pos.order"]);

        expect(data.network.storage.writeFailed).toBe(true);
        expect(data.network.storage.failureDialogShown).toBe(true);
    });

    test("_synchronizeLocalDataInIndexedDB returns the order data it persisted", async () => {
        const store = await setupPosEnv();
        const data = store.data;

        const order = await getFilledOrder(store);
        order.state = "paid";

        const result = await data._synchronizeLocalDataInIndexedDB();

        expect(result["pos.order"].map((o) => o.uuid)).toInclude(order.uuid);

        const exportedLineUuids = result["pos.order.line"].map((l) => l.uuid);
        for (const line of order.lines) {
            expect(exportedLineUuids).toInclude(line.uuid);
        }
    });

    test("a failing write aborts the destructive pruning pass", async () => {
        const store = await setupPosEnv();
        const data = store.data;

        const order = await getFilledOrder(store);
        order.state = "paid";

        let readAllCalled = false;
        data.indexedDB.create = async () => ({
            ok: false,
            failures: [{ status: "rejected", reason: new Error("QuotaExceededError") }],
        });
        data.indexedDB.readAll = async () => {
            readAllCalled = true;
            return {};
        };

        await data._synchronizeLocalDataInIndexedDB();

        expect(data.network.storage.writeFailed).toBe(true);
        expect(readAllCalled).toBe(false);
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

        expect(deletedKeys).toInclude("orphan-synced-uuid");
        expect(deletedKeys.includes("orphan-local-uuid")).toBe(false);
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

describe("pending sync state", () => {
    test("counts what the next sync has to send", async () => {
        const store = await setupPosEnv();
        store.clearPendingOrder();
        const baseline = store.getPendingSyncCount();

        // Drafts outside the queue are local work, not pending sync
        const draft = store.addNewOrder();
        await store.addLineToOrder(
            { product_tmpl_id: store.models["product.template"].get(5) },
            draft
        );
        expect(store.getPendingSyncCount()).toBe(baseline);

        const queued = await getFilledOrder(store);
        const paid = await getFilledOrder(store);
        paid.state = "paid";
        store.addPendingOrder([999], true);
        store.data.network.unsyncData.push({
            date: DateTime.now(),
            uuid: "op-1",
            try: 1,
            args: [{}],
        });
        expect(store.getPendingSyncCount()).toBe(baseline + 4);

        queued.unmarkDirty();
        expect(store.getPendingSyncCount()).toBe(baseline + 3);
    });
});
