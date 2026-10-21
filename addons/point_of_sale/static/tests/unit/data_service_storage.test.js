import { describe, expect, test } from "@odoo/hoot";
import IndexedDB from "@point_of_sale/app/models/utils/indexed_db";
import { definePosModels } from "./data/generate_model_definitions";
import { getFilledOrder, setupPosEnv } from "./utils";

definePosModels();

describe("local order storage", () => {
    test("a failed write skips pruning", async () => {
        const store = await setupPosEnv();
        const order = await getFilledOrder(store);
        order.state = "paid";

        let readAllCalled = false;
        store.data.indexedDB.create = async () => ({ ok: false });
        store.data.indexedDB.readAll = async () => {
            readAllCalled = true;
            return {};
        };

        await store.data._synchronizeLocalDataInIndexedDB();

        expect(readAllCalled).toBe(false);
    });

    test("pruning waits for reads and deletes before releasing its pass", async () => {
        const store = await setupPosEnv();
        const data = store.data;
        let releaseRead;
        let releaseDelete;
        let readStarted;
        let deleteStarted;
        const reading = new Promise((resolve) => (readStarted = resolve));
        const deleting = new Promise((resolve) => (deleteStarted = resolve));

        data.indexedDB.readAll = () => {
            readStarted();
            return new Promise((resolve) => (releaseRead = resolve));
        };
        data.indexedDB.delete = () => {
            deleteStarted();
            return new Promise((resolve) => (releaseDelete = resolve));
        };

        let finished = false;
        const pass = data._synchronizeLocalDataInIndexedDB().then(() => (finished = true));
        await reading;
        expect(finished).toBe(false);

        releaseRead({ "pos.order": [{ id: 987654, uuid: "synced-order" }] });
        await deleting;
        expect(finished).toBe(false);

        releaseDelete();
        await pass;
        expect(finished).toBe(true);
    });

    test("local records missing from memory survive pruning", async () => {
        const store = await setupPosEnv();
        const deletedKeys = [];
        store.data.indexedDB.readAll = async () => ({
            "pos.order.line": [
                { id: "missing-local-line", uuid: "missing-local-line" },
                { id: 987654, uuid: "synced-line" },
            ],
        });
        store.data.indexedDB.delete = async (_model, keys) => deletedKeys.push(...keys);

        await store.data._synchronizeLocalDataInIndexedDB();

        expect(deletedKeys).toInclude("synced-line");
        expect(deletedKeys.includes("missing-local-line")).toBe(false);
    });

    test("create reports a write only after its transaction commits", async () => {
        const db = Object.create(IndexedDB.prototype);
        db.activeTransactions = new Set();
        let transaction;
        db.getNewTransaction = () => {
            transaction = { objectStore: () => ({ put: () => ({}) }) };
            db.activeTransactions.add(transaction);
            return transaction;
        };

        let result;
        const write = db.create("pos.order", [{ uuid: "local-order" }]).then((value) => {
            result = value;
        });
        await Promise.resolve();
        expect(result).toBe(undefined);

        transaction.oncomplete();
        await write;
        expect(result.ok).toBe(true);
        expect(db.activeTransactions.size).toBe(0);

        const abortedWrite = db.create("pos.order", [{ uuid: "other-order" }]);
        transaction.onabort();
        expect((await abortedWrite).ok).toBe(false);
    });
});
