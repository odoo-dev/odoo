import { test, expect, describe } from "@odoo/hoot";
import { patchWithCleanup } from "@web/../tests/web_test_helpers";
import { ConnectionLostError } from "@web/core/network/rpc";
import { setupPosEnv, getFilledOrder } from "./utils";
import { definePosModels } from "./data/generate_model_definitions";

definePosModels();

describe("server order check", () => {
    test("a connection loss while checking orders keeps them locally", async () => {
        const store = await setupPosEnv();
        const order = await getFilledOrder(store);
        await store.syncAllOrders();
        expect(order.isSynced).toBe(true);

        patchWithCleanup(store.data, {
            async callRelated() {
                throw new ConnectionLostError();
            },
        });
        await store.data.checkAndDeleteMissingOrders({ "pos.order": [order] });

        expect(store.models["pos.order"].get(order.id)).toBe(order);
    });
});
