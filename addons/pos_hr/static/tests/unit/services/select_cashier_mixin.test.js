/* global Sha1 */

import { test, expect, describe } from "@odoo/hoot";
import { setupPosEnv } from "@point_of_sale/../tests/unit/utils";
import { definePosModels } from "@point_of_sale/../tests/unit/data/generate_model_definitions";
import { CashierSelector } from "@pos_hr/app/utils/select_cashier_mixin";

definePosModels();

describe("select_cashier_mixin", () => {
    test("checkPin - correct pin returns true", async () => {
        const store = await setupPosEnv();
        store.resetCashier();

        const selector = new CashierSelector(store, false, () => {});
        const emp = store.models["hr.employee"].getAll()[0];

        // correct pin: simulate by passing employee._pin in Sha1.hash
        emp._pin = Sha1.hash("1234");

        const result = await selector.checkPin(emp, "1234");
        expect(result).toBe(true);
    });

    test("selectCashier", async () => {
        const store = await setupPosEnv();
        store.resetCashier();
        const selector = new CashierSelector(store, false, () => {});
        const emp = store.models["hr.employee"].getAll()[0];

        emp._pin = Sha1.hash("1234");
        // pass valid pin directly
        const selected = await selector.selectCashier("1234", true);

        expect(selected.id).toBe(emp.id);
        expect(store.hasLoggedIn).toBe(true);
        expect(store.getCashier().id).toBe(selected.id);

        // returns undefined with wrong pin
        store.resetCashier();
        const result = await selector.selectCashier("wrongpin", true);
        expect(result).toBeEmpty();
    });
});
