import { expect, test, describe } from "@odoo/hoot";
import { createRelatedModels } from "@point_of_sale/app/models/related_models";
import { sleep } from "../utils";

import { MODEL_DEF as modelDefs, MODEL_OPTS as modelOpts } from "./utils";

describe(`Model Cascade Delete`, () => {
    test("Specified related models must be delete  ", async () => {
        const cascadeDeleteModels = { "pos.order": ["pos.order.line"] };

        const storageAdapter = new TestStorageAdapter();
        const modelOpts2 = {
            ...modelOpts,
            cascadeDeleteModels,
            storageAdapter,
        };

        const { models } = createRelatedModels(modelDefs, {}, modelOpts2);

        const order = models["pos.order"].create({ id: 1 });
        const line1 = models["pos.order.line"].create({ id: 11, order_id: 1 });
        const line2 = models["pos.order.line"].create({ id: 12, order_id: 1 });
        expect(order.lines.length).toBe(2);
        expect(models["pos.order"].get(1)).toBe(order);
        expect(models["pos.order.line"].get(11)).toBe(line1);
        expect(models["pos.order.line"].get(12)).toBe(line2);

        await sleep(1);
        storageAdapter.savedRecords = [];
        storageAdapter.deletedRecords = [];

        order.delete();
        expect(order.lines.length).toBe(0);
        expect(models["pos.order"].get(1)).toBeEmpty();
        expect(models["pos.order.line"].get(11)).toBeEmpty();
        expect(models["pos.order.line"].get(12)).toBeEmpty();

        await sleep(1);
        expect(storageAdapter.savedRecords.length).toBe(0);
        expect(storageAdapter.deletedRecords.length).toBe(3);
        expect(storageAdapter.deletedRecords.map((r) => r.id)).toEqual([11, 12, 1]);

        console.log();
    });

    class TestStorageAdapter {
        constructor() {
            this.savedRecords = [];
            this.deletedRecords = [];
        }

        save(record) {
            this.savedRecords.push(record);
        }

        delete(record) {
            this.deletedRecords.push(record);
        }
    }
});
