import { test, expect, describe } from "@odoo/hoot";
import { setupPosEnv } from "../utils";
import { definePosModels } from "../data/generate_model_definitions";

definePosModels();

describe("IndexedDB isolation between tests", () => {
    test("creating a partner record in IndexedDB", async () => {
        const store = await setupPosEnv();
        const indexedDB = store.data.indexedDB;
        await indexedDB.create("res.partner", [
            {
                id: 21,
                name: "TEST-P",
            },
        ]);

        const data = await indexedDB.readAll(["res.partner"]);
        const testPartner = data["res.partner"].find((p) => p.name == "TEST-P");
        expect(Boolean(testPartner)).toBe(true);
    });

    test("should reset IndexedDB and not contain previously created partner", async () => {
        const store = await setupPosEnv();
        const data = await store.data.indexedDB.readAll(["res.partner"]);
        const testPartner = data["res.partner"].find((p) => p.name == "TEST-P");

        expect(Boolean(testPartner)).toBe(false);
    });
});

test("resetIndexedDB", async () => {
    const store = await setupPosEnv();
    const dbName = store.data.databaseName;

    let db = (await window.indexedDB.databases()).find((db) => db.name == dbName);
    expect(Boolean(db)).toBe(true);
    await store.data.resetIndexedDB();
    db = (await window.indexedDB.databases()).find((db) => db.name == dbName);
    expect(Boolean(db)).toBe(false);
});
