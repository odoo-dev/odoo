import { describe, expect, test } from "@odoo/hoot";
import { animationFrame } from "@odoo/hoot-dom";
import { contains, mountWithCleanup, onRpc } from "@web/../tests/web_test_helpers";
import { definePosModels } from "@point_of_sale/../tests/unit/data/generate_model_definitions";
import { getFilledOrder, setupAndMountPosApp } from "@point_of_sale/../tests/unit/utils";
import { unpatchSelf } from "@pos_self_order/app/plugins/pos_data_plugin";
import { RAW_SYMBOL } from "@point_of_sale/app/models/related_models/utils";
import { TableJoinRequestsDialog } from "@pos_self_order/overrides/components/table_join_requests_dialog/table_join_requests_dialog";
import { setupPoSEnvForSelfOrder } from "../../utils";

definePosModels();

const now = () => Math.floor(Date.now() / 1000);

function onGuestAction(status) {
    onRpc("/pos-self-order/table/guest-action", async (request) => {
        const { params } = await request.json();
        expect.step(params);
        return { status };
    });
}

describe("table join requests", () => {
    test("pending requests are tracked per table", async () => {
        const store = await setupPoSEnvForSelfOrder();
        const [table1, table2] = store.models["restaurant.table"].getAll();
        expect(store.getTableJoinRequests(table1)).toEqual([]);

        store.addTableJoinRequest({ table_id: table1.id, request_id: "r1", time: 10 });
        store.addTableJoinRequest({ table_id: table1.id, request_id: "r2", time: 20 });
        store.addTableJoinRequest({ table_id: table2.id, request_id: "r3", time: 30 });
        // Same request notified twice
        store.addTableJoinRequest({ table_id: table1.id, request_id: "r1", time: 10 });
        // Request without table
        store.addTableJoinRequest({ table_id: false, request_id: "r4", time: 40 });
        expect(store.getTableJoinRequests(table1).map((r) => r.request_id)).toEqual(["r2", "r1"]);
        expect(store.getTableJoinRequests(table2)).toHaveLength(1);

        store.removeTableJoinRequest("r1");
        store.removeTableJoinRequest("r3");
        expect(store.getTableJoinRequests(table1).map((r) => r.request_id)).toEqual(["r2"]);
        expect(store.getTableJoinRequests(table2)).toEqual([]);
        expect(Object.keys(store.tableJoinRequests)).toEqual([String(table1.id)]);
    });

    test("pending requests are restored from the loaded table orders", async () => {
        const store = await setupPoSEnvForSelfOrder();
        const table = store.models["restaurant.table"].getFirst();
        const order = await getFilledOrder(store, { table_id: table });
        // Loaded by the server instead of the guest data, see `_load_pos_data_read`
        order[RAW_SYMBOL]._table_join_requests = [{ id: "r1", time: 10 }];
        const paidOrder = await getFilledOrder(store, { table_id: table });
        paidOrder.state = "paid";
        paidOrder[RAW_SYMBOL]._table_join_requests = [{ id: "r2", time: 20 }];

        store.initTableJoinRequests();
        expect(store.getTableJoinRequests(table)).toEqual([{ request_id: "r1", time: 10 }]);
    });

    test("answering a request only sends the table id, never its identifier", async () => {
        const store = await setupPoSEnvForSelfOrder();
        const table = store.models["restaurant.table"].getFirst();
        store.addTableJoinRequest({ table_id: table.id, request_id: "r1", time: now() });
        onGuestAction("approved");

        await store.answerTableJoinRequest(table, store.getTableJoinRequests(table)[0], "approve");
        expect.verifySteps([
            { config_id: store.config.id, table_id: table.id, request_id: "r1", action: "approve" },
        ]);
        expect(store.getTableJoinRequests(table)).toEqual([]);
    });

    test("TableJoinRequestsDialog lists and answers the requests of a table", async () => {
        const store = await setupPoSEnvForSelfOrder();
        const table = store.models["restaurant.table"].getFirst();
        store.addTableJoinRequest({ table_id: table.id, request_id: "r1", time: now() - 120 });
        store.addTableJoinRequest({ table_id: table.id, request_id: "r2", time: now() - 10 });
        onGuestAction("approved");

        await mountWithCleanup(TableJoinRequestsDialog, {
            props: { table, close: () => expect.step("close") },
        });
        expect(".o_table_join_requests_dialog .fs-4").toHaveText(`Table ${table.table_number}`);
        expect(".o_table_join_request").toHaveCount(2);
        expect(".o_table_join_request:eq(0)").toHaveText(/Guest 1\s*2 minutes ago/);

        await contains(".o_table_join_request:eq(0) .btn-success").click();
        expect.verifySteps([
            { config_id: store.config.id, table_id: table.id, request_id: "r1", action: "approve" },
        ]);
        expect(".o_table_join_request").toHaveCount(1);

        await contains(".o_table_join_request:eq(0) .btn-outline-danger").click();
        expect.verifySteps([
            { config_id: store.config.id, table_id: table.id, request_id: "r2", action: "reject" },
            "close",
        ]);
    });
});

test("floor plan shows a badge on tables with join requests", async () => {
    unpatchSelf();
    const store = await setupAndMountPosApp();
    const table = store.models["restaurant.table"].getFirst();
    expect(".o_table_join_requests_badge").toHaveCount(0);

    store.addTableJoinRequest({ table_id: table.id, request_id: "r1", time: now() });
    store.addTableJoinRequest({ table_id: table.id, request_id: "r2", time: now() });
    await animationFrame();
    expect(`[data-table_id='${table.id}'] .o_table_join_requests_badge`).toHaveText("2");

    await contains(".o_table_join_requests_badge").click();
    expect(".o_table_join_requests_dialog .o_table_join_request").toHaveCount(2);
    // Clicking the badge does not open the table
    expect(".floor-screen").toHaveCount(1);
});
