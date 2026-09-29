import { test, expect, describe } from "@odoo/hoot";
import { MockServer, patchWithCleanup } from "@web/../tests/web_test_helpers";
import { ConnectionLostError, RPCError } from "@web/core/network/rpc";
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

describe("dirty flag persistence", () => {
    test("the dirty flag is serialized with the UI state", async () => {
        const store = await setupPosEnv();
        const order = await getFilledOrder(store);

        expect(order.isDirty()).toBe(true);
        expect(order.serializeState()._recordDirty).toBe(true);

        order.unmarkDirty();
        expect(order.serializeState()._recordDirty).toBe(false);
    });

    test("a locally edited record stays dirty after being restored", async () => {
        const store = await setupPosEnv();
        const order = await getFilledOrder(store);

        const state = order.serializeState();

        order.unmarkDirty();
        expect(order.isDirty()).toBe(false);

        order.restoreState(state);
        expect(order.isDirty()).toBe(true);
    });

    test("restoring a clean record does not mark it dirty", async () => {
        const store = await setupPosEnv();
        const order = await getFilledOrder(store);

        order.unmarkDirty();
        const cleanState = order.serializeState();

        order.restoreState(cleanState);
        expect(order.isDirty()).toBe(false);
    });

    test("_recordDirty does not leak into uiState", async () => {
        const store = await setupPosEnv();
        const order = await getFilledOrder(store);

        order.restoreState(order.serializeState());
        expect("_recordDirty" in order.uiState).toBe(false);
    });
});

describe("pending order recovery", () => {
    test("only the orders that were queued are sent again after a reload", async () => {
        const store = await setupPosEnv();
        patchWithCleanup(store.deviceSync, { readDataFromServer: async () => ({}) });
        store.data.network.offline = true;

        const queued = await getFilledOrder(store);
        // Retail drafts stay local until payment: not in the queue
        const localDraft = store.addNewOrder();
        await store.addLineToOrder(
            { product_tmpl_id: store.models["product.template"].get(5) },
            localDraft
        );

        // Reload: the in-memory queue is gone
        store.pendingOrder.create.clear();
        await store.afterProcessServerData();

        const toCreate = store.getPendingOrder().orderToCreate.map((o) => o.uuid);
        expect(toCreate).toInclude(queued.uuid);
        expect(toCreate.includes(localDraft.uuid)).toBe(false);
    });
});

describe("sync robustness", () => {
    test("a failing preSyncAllOrders no longer aborts the whole batch", async () => {
        const store = await setupPosEnv();
        const first = await getFilledOrder(store);
        const second = await getFilledOrder(store);

        const attempted = [];
        const originalPreSync = store.preSyncAllOrders.bind(store);
        patchWithCleanup(store.deviceSync, { readDataFromServer: async () => ({}) });
        patchWithCleanup(store, {
            async preSyncAllOrders(orders) {
                attempted.push(orders[0].uuid);
                if (orders[0].uuid === first.uuid) {
                    throw new Error("fiscal module unreachable");
                }
                return originalPreSync(orders);
            },
        });

        await store.syncAllOrders({ orders: [first, second] });

        expect(attempted).toInclude(first.uuid);
        expect(attempted).toInclude(second.uuid);
    });
});

describe("offline order cancellation", () => {
    test("an offline cancellation outlives the local removal, a reload and server errors", async () => {
        const store = await setupPosEnv();
        const order = await getFilledOrder(store);
        await store.syncAllOrders();
        const orderId = order.id;
        const serverData = { ...order.raw };
        expect(orderId).toBeOfType("number");

        store.data.network.offline = true;
        expect(await store.deleteOrders([order])).toBe(true);
        expect(store.models["pos.order"].get(orderId)).toBe(undefined);
        expect(store.pendingOrder.delete.has(orderId)).toBe(true);

        // Reload: the in-memory queue is gone and the server still sends the order as open
        store.pendingOrder.delete.clear();
        store.models.connectNewData({ "pos.order": [serverData] });
        store.restorePendingOrders();
        expect(store.pendingOrder.delete.has(orderId)).toBe(true);
        expect(store.models["pos.order"].get(orderId)).toBe(undefined);

        // Back online, the server refuses the cancellation: it stays queued, the sync goes on
        store.data.network.offline = false;
        let serverDown = true;
        patchWithCleanup(store.data, {
            async call(model, method) {
                if (method === "cancel_order_from_pos" && serverDown) {
                    throw new RPCError("Service Unavailable");
                }
                return super.call(...arguments);
            },
        });
        const draft = await getFilledOrder(store);
        await store.syncAllOrders();
        expect(draft.isSynced).toBe(true);
        expect(JSON.parse(localStorage.getItem(store.getPendingOrdersKey())).delete).toEqual([
            orderId,
        ]);

        serverDown = false;
        await store.syncAllOrders();
        expect(MockServer.env["pos.order"].browse(orderId)[0].state).toBe("cancel");
        expect(store.pendingOrder.delete.size).toBe(0);
    });

    test("cancelling several orders offline queues every id, not just the first", async () => {
        const store = await setupPosEnv();

        store.clearPendingOrder();
        store.addPendingOrder([101, 102, 103], true);

        expect([...store.pendingOrder.delete].sort((a, b) => a - b)).toEqual([101, 102, 103]);
    });
});
