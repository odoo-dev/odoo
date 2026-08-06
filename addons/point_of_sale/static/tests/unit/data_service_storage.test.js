import { test, expect, describe } from "@odoo/hoot";
import { setupPosEnv, getFilledOrder } from "./utils";
import { definePosModels } from "./data/generate_model_definitions";

const { DateTime } = luxon;

definePosModels();

describe("pending sync state", () => {
    test("counts queued ORM operations and unsynced paid orders", async () => {
        const store = await setupPosEnv();
        const data = store.data;

        const baseline = data.getPendingSyncCount();

        const order = await getFilledOrder(store);
        order.state = "paid";
        expect(order.isUnsyncedPaid).toBe(true);

        data.network.unsyncData.push({ date: DateTime.now(), uuid: "op-1", try: 1, args: [{}] });

        expect(data.getPendingSyncCount()).toBe(baseline + 2);
    });

    test("refreshPendingSyncState exposes the count reactively", async () => {
        const store = await setupPosEnv();
        const data = store.data;

        data.refreshPendingSyncState();
        const baseline = data.network.pendingCount;

        const order = await getFilledOrder(store);
        order.state = "paid";

        data.refreshPendingSyncState();
        expect(data.network.pendingCount).toBe(baseline + 1);
    });

    test("draft orders are not counted as pending paid work", async () => {
        const store = await setupPosEnv();
        const data = store.data;

        const baseline = data.getPendingSyncCount();

        const order = await getFilledOrder(store);
        expect(order.state).toBe("draft");
        expect(order.isUnsyncedPaid).toBe(false);
        expect(data.getPendingSyncCount()).toBe(baseline);
    });
});

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
