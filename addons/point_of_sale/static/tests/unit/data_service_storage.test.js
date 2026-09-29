import { test, expect, describe } from "@odoo/hoot";
import { setupPosEnv, getFilledOrder } from "./utils";
import { definePosModels } from "./data/generate_model_definitions";

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
