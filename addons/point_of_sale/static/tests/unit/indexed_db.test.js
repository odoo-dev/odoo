import { expect, test, describe, afterEach } from "@odoo/hoot";
import IndexedDB from "@point_of_sale/app/models/utils/indexed_db";

describe("IndexedDB wrapper", () => {
    let db;

    async function initDatabase(stores) {
        const dbName = `testDB_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
        db = new IndexedDB(dbName, stores);
        await db.init();
        expect(db.isReady()).toBe(true);
        return db;
    }

    test("Add record", async () => {
        const storeName = "teststore";
        const db = await initDatabase([["id", storeName]]);

        //Simple record
        await db.add(storeName, { id: 1, name: "rec1" });

        //Array of records
        await db.add(storeName, [
            { id: 2, name: "rec2" },
            { id: 3, name: "rec3" },
        ]);

        const data = await db.readAll();
        const storeData = data[storeName];
        expect(storeData.length).toBe(3);
        expect(storeData).toEqual([
            { id: 1, name: "rec1" },
            { id: 2, name: "rec2" },
            { id: 3, name: "rec3" },
        ]);
    });

    test("Update record", async () => {
        const storeName = "teststore";
        const db = await initDatabase([["id", storeName]]);

        await db.add(storeName, { id: 1, name: "rec1" });
        await db.add(storeName, { id: 1, name: "rec1111" });

        const data = await db.readAll();
        const storeData = data[storeName];
        expect(storeData.length).toBe(1);
        expect(storeData).toEqual([{ id: 1, name: "rec1111" }]);
    });

    test("Delete record", async () => {
        const storeName = "teststore";
        const db = await initDatabase([["id", storeName]]);

        await db.add(storeName, { id: 1, name: "rec1" });

        let data = await db.readAll();
        expect(data[storeName].length).toBe(1);
        await db.delete(storeName, 1);

        data = await db.readAll();
        expect(data[storeName].length).toBe(0);

        // Remove multiple records
        await db.add(storeName, [
            { id: 2, name: "rec2" },
            { id: 3, name: "rec3" },
        ]);
        data = await db.readAll();
        expect(data[storeName].length).toBe(2);

        await db.delete(storeName, [1, 2, 3]);
        data = await db.readAll();
        expect(data[storeName].length).toBe(0);
    });

    test("Read all", async () => {
        const store1 = "teststore";
        const store2 = "teststore2";

        const db = await initDatabase([
            ["id", store1],
            ["id", store2],
        ]);

        await db.add(store1, { id: 1, name: "rec-store-1" });
        await db.add(store2, { id: 1, name: "rec-store-2" });

        // Read records of all stores
        const allRecords = await db.readAll();
        expect(allRecords[store1]).toEqual([{ id: 1, name: "rec-store-1" }]);
        expect(allRecords[store2]).toEqual([{ id: 1, name: "rec-store-2" }]);

        // Read only the given store
        const store1Records = await db.readAll([store1]);
        expect(store1Records[store1]).toEqual([{ id: 1, name: "rec-store-1" }]);
    });

    test("Upgrade DB", async () => {
        const store1 = "teststore";
        const store2 = "teststore2";

        db = await initDatabase([["id", store1]]);
        await db.add(store1, { id: 1, name: "rec-store-1" });
        let allRecords = await db.readAll();
        expect(allRecords[store1]).toEqual([{ id: 1, name: "rec-store-1" }]);

        //Store2 is not yet created, add will failed
        let addError = false;
        await db.add(store2, { id: 1, name: "rec-store-2" }).catch(() => (addError = true));
        expect(addError).toBe(true);

        // Upgrade
        db.close();
        db = new IndexedDB(db.name, [
            ["id", store1],
            ["id", store2],
        ]);
        await db.init();
        await db.add(store2, { id: 1, name: "rec-store-2" });
        allRecords = await db.readAll();
        expect(allRecords[store1]).toEqual([{ id: 1, name: "rec-store-1" }]);
        expect(allRecords[store2]).toEqual([{ id: 1, name: "rec-store-2" }]);
    });

    test("Delete db", async () => {
        const storeName = "teststore";
        const db = await initDatabase([["id", storeName]]);
        await db.deleteDatabase();
        expect(db.isReady()).toBe(false);
    });

    afterEach(async () => {
        await db?.deleteDatabase().catch((err) => {
            console.error(err);
        });
    });
});
