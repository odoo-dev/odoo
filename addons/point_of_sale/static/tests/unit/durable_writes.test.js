import { describe, expect, test } from "@odoo/hoot";
import { setupPosEnv, getFilledOrder } from "./utils";
import { definePosModels } from "./data/generate_model_definitions";
import IndexedDB from "@point_of_sale/app/models/utils/indexed_db";
import OrderPaymentValidation from "@point_of_sale/app/utils/order_payment_validation";

definePosModels();

describe("transaction durability", () => {
    test("frontend-created stores are flushed to disk, the catalogue is not", async () => {
        const requested = [];
        const db = Object.create(IndexedDB.prototype);
        db.activeTransactions = new Set();
        db.durableStores = new Set(["pos.order", "pos.order.line"]);
        db.db = {
            transaction: (stores, mode, options) => {
                requested.push([stores, options?.durability]);
                return {};
            },
        };

        db.getNewTransaction(["pos.order"], "readwrite");
        db.getNewTransaction(["product.product"], "readwrite");
        db.getNewTransaction(["product.product", "pos.order.line"], "readwrite");

        expect(requested[0][1]).toBe("strict");
        expect(requested[1][1]).toBe("default");
        expect(requested[2][1]).toBe("strict");
    });

    test("promises resolves only after transaction.oncomplete fires", async () => {
        const db = Object.create(IndexedDB.prototype);
        db.activeTransactions = new Set();
        db.durableStores = new Set();

        let completeTx;
        db.getNewTransaction = () => {
            const tx = {
                objectStore: () => ({
                    put: () => ({}),
                }),
            };
            completeTx = () => tx.oncomplete?.();
            return tx;
        };

        let resolved = false;
        const promise = db.promises("pos.order", [{ id: 1 }], "put").then(() => {
            resolved = true;
        });

        await Promise.resolve();
        expect(resolved).toBe(false);

        completeTx();
        await promise;
        expect(resolved).toBe(true);
    });

    test("promises rejects when transaction.onabort fires", async () => {
        const db = Object.create(IndexedDB.prototype);
        db.activeTransactions = new Set();
        db.durableStores = new Set();

        let abortTx;
        db.getNewTransaction = () => {
            const tx = {
                error: new Error("QuotaExceededError"),
                objectStore: () => ({
                    put: () => ({}),
                }),
            };
            abortTx = () => tx.onabort?.();
            return tx;
        };

        const promise = db.promises("pos.order", [{ id: 1 }], "put");
        abortTx();
        const results = await promise;
        expect(results[0].status).toBe("rejected");
        expect(results[0].reason.message).toBe("QuotaExceededError");
    });
});

describe("persist before printing", () => {
    test("a paid order is written to disk before any network attempt", async () => {
        const store = await setupPosEnv();
        const order = await getFilledOrder(store);

        const events = [];
        store.data.persistOrdersInIndexedDB = async (orders) => {
            events.push(`persist ${orders.map((o) => o.uuid)}`);
        };
        store.syncAllOrders = async () => {
            events.push("sync");
            return [];
        };

        const validation = new OrderPaymentValidation({ pos: store, orderUuid: order.uuid });
        validation.afterOrderValidation = async () => {};

        await validation.finalizeValidation();

        expect(events.indexOf(`persist ${order.uuid}`)).toBeLessThan(events.indexOf("sync"));
    });

    test("only the given orders and all their stored records are written", async () => {
        const store = await setupPosEnv();
        const paid = await getFilledOrder(store);
        await getFilledOrder(store);
        const prepOrder = store.models["pos.prep.order"].create({ pos_order_id: paid });
        const prepLine = store.models["pos.prep.line"].create({
            prep_order_id: prepOrder,
            pos_order_line_id: paid.lines[0],
            quantity: 1,
        });

        const written = {};
        store.data.indexedDB.create = async (model, records) => {
            written[model] = records.map((r) => r.uuid);
            return { ok: true, failures: [] };
        };
        await store.data.persistOrdersInIndexedDB([paid]);

        expect(written["pos.order"]).toEqual([paid.uuid]);
        expect(written["pos.order.line"].sort()).toEqual(paid.lines.map((l) => l.uuid).sort());
        // Reached through the preparation order, two relations away from the order
        expect(written["pos.prep.order"]).toEqual([prepOrder.uuid]);
        expect(written["pos.prep.line"]).toEqual([prepLine.uuid]);
    });
});
