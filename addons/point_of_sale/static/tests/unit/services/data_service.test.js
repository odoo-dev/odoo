import { test, expect, describe } from "@odoo/hoot";
import { advanceTime } from "@odoo/hoot-mock";
import { patchWithCleanup, MockServer } from "@web/../tests/web_test_helpers";
import { ConnectionAbortedError, ConnectionLostError, rpc } from "@web/core/network/rpc";
import { getFilledOrder, setupPosEnv } from "../utils";
import { definePosModels } from "../data/generate_model_definitions";

definePosModels();

const mockUnreachableServer = ({ onlyPings = false } = {}) => {
    const pings = [];
    patchWithCleanup(rpc, {
        _rpc(url) {
            if (onlyPings && url !== "/pos/ping") {
                return super._rpc(...arguments);
            }
            let resolve;
            let reject;
            const promise = new Promise((res, rej) => {
                resolve = res;
                reject = rej;
            });
            promise.abort = (rejectError = true) => {
                promise.aborted = true;
                if (rejectError) {
                    reject(new ConnectionAbortedError());
                }
            };
            promise.answer = () => resolve({});
            promise.fail = () => reject(new ConnectionLostError(url));
            if (url === "/pos/ping") {
                pings.push(promise);
            }
            return promise;
        },
    });
    return pings;
};

describe("data_service", () => {
    test("localDeleteCascade", async () => {
        const store = await setupPosEnv();
        const data = store.data;
        const order = await getFilledOrder(store);

        expect(store.models["pos.order"].length).toBe(1);
        expect(store.models["pos.order.line"].length).toBe(2);
        data.localDeleteCascade(order);
        expect(store.models["pos.order"].length).toBe(0);
        expect(store.models["pos.order.line"].length).toBe(0);
    });

    test("getRelatedModels returns the model itself when it has no dependencies", async () => {
        const store = await setupPosEnv();
        const data = store.data;

        // pos.category has no declared dependencies in Python
        const related = data.getRelatedModels("pos.category");
        expect(related).toInclude("pos.category");
    });

    test("getRelatedModels for product.product includes its direct dependencies and reverse", async () => {
        const store = await setupPosEnv();
        const data = store.data;
        // product.product → ['product.template.attribute.value', 'product.template']
        let related = data.getRelatedModels("product.product");
        expect(related).toInclude("product.product");
        expect(related).toInclude("product.template");
        expect(related).toInclude("product.template.attribute.value");

        related = data.getRelatedModels("product.template");
        expect(related).toInclude("product.template");
        expect(related).toInclude("product.product");
        expect(related).toInclude("product.template.attribute.value");
    });

    test("getRelatedModels traverses transitive dependencies", async () => {
        const store = await setupPosEnv();
        const data = store.data;
        // product.product → product.template → account.tax (transitive)
        const related = data.getRelatedModels("product.product");
        expect(related).toInclude("account.tax");
    });

    test("getRelatedModels does not include unrelated models", async () => {
        const store = await setupPosEnv();
        const data = store.data;
        // res.lang has no declared dependency on res.partner and no reverse dependency either
        const related = data.getRelatedModels("res.lang");
        expect(related).not.toInclude("res.partner");
    });

    test("loading a missing product.template also requests product.product", async () => {
        const store = await setupPosEnv();
        const data = store.data;

        const capturedRequests = [];
        patchWithCleanup(data, {
            async callRelated(model, method, args, kwargs, needSync, waitForResult) {
                if (method === "load_data") {
                    capturedRequests.push(args[1]);
                }
                return super.callRelated(...arguments);
            },
        });

        // product_tmpl_id points to a template not yet in the local store
        const fakeProductRecord = MockServer.env["product.template"].create({
            list_price: 10,
            name: "Missing Product",
        });

        await data.loadRecordsFromPos(["product.template"], {
            "product.template": [["id", "=", fakeProductRecord.id]],
        });

        expect(capturedRequests.length).toBeGreaterThan(0);
        const allRequestedModels = capturedRequests.flatMap((req) => req.models);
        expect(allRequestedModels).toInclude("product.product");
    });

    test("heartbeat: overlapping pings detect an unreachable server", async () => {
        const store = await setupPosEnv();
        const data = store.data;
        const pings = mockUnreachableServer();

        data.heartbeat();
        expect(pings).toHaveLength(1);

        await advanceTime(5000);
        expect(pings).toHaveLength(2);
        expect(data.connectivity.pings.size).toBe(2);

        await advanceTime(5000);
        expect(data.connectivity.failedAttempts).toBe(1);
        expect(data.network.offline).toBe(false);

        await advanceTime(5000);
        expect(data.connectivity.failedAttempts).toBe(2);
        expect(data.network.offline).toBe(false);

        await advanceTime(5000);
        expect(data.connectivity.failedAttempts).toBe(3);
        expect(data.network.offline).toBe(true);

        const pendingPings = pings.filter((ping) => !ping.aborted);
        expect(pendingPings).toHaveLength(2);
        pendingPings[0].answer();
        await advanceTime(0);
        expect(data.network.offline).toBe(false);
        expect(data.connectivity.pings.size).toBe(0);
        expect(pendingPings[1].aborted).toBe(true);
    });

    test("heartbeat: a slow answer keeps the POS online", async () => {
        const store = await setupPosEnv();
        const data = store.data;
        const pings = mockUnreachableServer();

        data.heartbeat();
        await advanceTime(7000);
        expect(pings).toHaveLength(2);

        pings[0].answer();
        await advanceTime(0);
        expect(data.network.offline).toBe(false);
        expect(data.connectivity.failedAttempts).toBe(0);
        expect(data.connectivity.pings.size).toBe(0);
        expect(pings[1].aborted).toBe(true);
    });

    test("heartbeat: pings failing at the same time count as one failure", async () => {
        const store = await setupPosEnv();
        const data = store.data;
        const pings = mockUnreachableServer();

        data.heartbeat();
        data.heartbeat();
        expect(pings).toHaveLength(2);

        pings[0].fail();
        pings[1].fail();
        await advanceTime(0);
        expect(data.connectivity.failedAttempts).toBe(1);
        expect(data.network.offline).toBe(false);
    });

    test("heartbeat: a successful RPC cancels pending pings", async () => {
        const store = await setupPosEnv();
        const data = store.data;
        const pings = mockUnreachableServer({ onlyPings: true });

        data.heartbeat();
        data.heartbeat();
        expect(data.connectivity.pings.size).toBe(2);

        await data.orm.searchCount("res.partner", []);
        expect(data.connectivity.pings.size).toBe(0);
        expect(pings.every((ping) => ping.aborted)).toBe(true);

        await advanceTime(15000);
        expect(data.connectivity.failedAttempts).toBe(0);
    });
});
