import { expect, test, describe } from "@odoo/hoot";
import { createRelatedModels } from "@point_of_sale/app/models/related_models";
import { MODEL_DEF as modelDefs, MODEL_OPTS as modelOpts } from "./utils";
import { sleep } from "../utils";

describe("Storage adapter", () => {
    test("Add / update record", async () => {
        const storageAdapter = new TestAdapter();
        const { models } = createRelatedModels(modelDefs, {}, { ...modelOpts, storageAdapter });

        const order = models["pos.order"].create({
            total: 12,
        });
        await sleep(1);
        expect(storageAdapter.savedRecords.length).toBe(1);

        // Update record
        order.total = 13;
        await sleep(2);
        expect(storageAdapter.savedRecords.length).toBe(2);

        order.stateData = 90;
        await sleep(2);
        expect(storageAdapter.savedRecords.length).toBe(3);

        //Batched calls
        order.total = 14;
        order.total = 15;
        order.total = 17;
        await sleep(2);
        expect(storageAdapter.savedRecords.length).toBe(4);
    });

    test("Delete record", async () => {
        const storageAdapter = new TestAdapter();
        const { models } = createRelatedModels(modelDefs, {}, { ...modelOpts, storageAdapter });
        const order = models["pos.order"].create({
            total: 12,
        });

        order.delete();
        await sleep(2);
        expect(storageAdapter.deletedRecords.length).toBe(1);
    });

    class TestAdapter {
        constructor() {
            this.savedRecords = [];
            this.deletedRecords = [];
        }

        save(record) {
            record.serializeForIndexedDB();
            this.savedRecords.push(record);
        }

        delete(record) {
            this.deletedRecords.push(record);
        }
    }
});
