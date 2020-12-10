import { Component, tags } from "@odoo/owl";
import * as QUnit from "qunit";
import { Registry } from "../../src/core/registry";
import { Registries, Service } from "../../src/types";
import { useService } from "../../src/core/hooks";
import { modelService } from "../../src/services/model";
import { RPC } from "../../src/services/rpc";
import { getFixture, makeFakeUserService, makeTestEnv, mount } from "../helpers/index";

const { xml } = tags;

let serviceRegistry: Registries["serviceRegistry"];

QUnit.module("Model Service", {
  async beforeEach() {
    serviceRegistry = new Registry();
    serviceRegistry.add("user", makeFakeUserService());
    serviceRegistry.add(modelService.name, modelService);
  },
});

interface Query {
  route: null | string;
  params: null | any;
}

function makeFakeRPC(): [Query, Service<RPC>] {
  const query: Query = { route: null, params: null };
  const rpc: Service<RPC> = {
    name: "rpc",
    deploy() {
      return async (route, params) => {
        query.route = route;
        query.params = params;
      };
    },
  };
  return [query, rpc];
}

QUnit.test("add user context to a simple read request", async (assert) => {
  const [query, rpc] = makeFakeRPC();
  serviceRegistry.add("rpc", rpc);
  const env = await makeTestEnv({ serviceRegistry });
  await env.services.model("my.model").read([3], ["id", "descr"]);

  assert.strictEqual(query.route, "/web/dataset/call_kw/my.model/read");
  assert.deepEqual(query.params, {
    args: [[3], ["id", "descr"]],
    kwargs: { context: { uid: 2 } },
    method: "read",
    model: "my.model",
  });
});

QUnit.test("context is combined with user context in read request", async (assert) => {
  const [query, rpc] = makeFakeRPC();
  serviceRegistry.add("rpc", rpc);
  const env = await makeTestEnv({ serviceRegistry });
  await env.services.model("my.model").read([3], ["id", "descr"], { earth: "isfucked" });

  assert.strictEqual(query.route, "/web/dataset/call_kw/my.model/read");
  assert.deepEqual(query.params, {
    args: [[3], ["id", "descr"]],
    kwargs: { context: { uid: 2, earth: "isfucked" } },
    method: "read",
    model: "my.model",
  });
});

QUnit.test("basic method call of model", async (assert) => {
  const [query, rpc] = makeFakeRPC();
  serviceRegistry.add("rpc", rpc);
  const env = await makeTestEnv({ serviceRegistry });
  await env.services.model("partner").call("test", [], { context: { a: 1 } });
  assert.strictEqual(query.route, "/web/dataset/call_kw/partner/test");
  assert.deepEqual(query.params, {
    args: [],
    kwargs: { context: { uid: 2, a: 1 } },
    method: "test",
    model: "partner",
  });
});

QUnit.test("create method", async (assert) => {
  const [query, rpc] = makeFakeRPC();
  serviceRegistry.add("rpc", rpc);
  const env = await makeTestEnv({ serviceRegistry });
  await env.services.model("partner").create({ color: "red" });
  assert.strictEqual(query.route, "/web/dataset/call_kw/partner/create");
  assert.deepEqual(query.params, {
    args: [
      {
        color: "red",
      },
    ],
    kwargs: { context: { uid: 2 } },
    method: "create",
    model: "partner",
  });
});

QUnit.test("unlink method", async (assert) => {
  const [query, rpc] = makeFakeRPC();
  serviceRegistry.add("rpc", rpc);
  const env = await makeTestEnv({ serviceRegistry });
  await env.services.model("partner").unlink([43]);
  assert.strictEqual(query.route, "/web/dataset/call_kw/partner/unlink");
  assert.deepEqual(query.params, {
    args: [[43]],
    kwargs: { context: { uid: 2 } },
    method: "unlink",
    model: "partner",
  });
});

QUnit.test("write method", async (assert) => {
  const [query, rpc] = makeFakeRPC();
  serviceRegistry.add("rpc", rpc);
  const env = await makeTestEnv({ serviceRegistry });
  await env.services.model("partner").write([43, 14], { active: false });
  assert.strictEqual(query.route, "/web/dataset/call_kw/partner/write");
  assert.deepEqual(query.params, {
    args: [[43, 14], { active: false }],
    kwargs: { context: { uid: 2 } },
    method: "write",
    model: "partner",
  });
});

QUnit.test("readGroup method", async (assert) => {
  const [query, rpc] = makeFakeRPC();
  serviceRegistry.add("rpc", rpc);
  const env = await makeTestEnv({ serviceRegistry });
  await env.services
    .model("sale.order")
    .readGroup([["user_id", "=", 2]], ["amount_total:sum"], ["date_order"], { offset: 1 });
  assert.strictEqual(query.route, "/web/dataset/call_kw/sale.order/web_read_group");
  assert.deepEqual(query.params, {
    args: [[["user_id", "=", 2]], ["amount_total:sum"], ["date_order"]],
    kwargs: { context: { uid: 2 }, offset: 1 },
    method: "web_read_group",
    model: "sale.order",
  });
});

QUnit.test("searchRead method", async (assert) => {
  const [query, rpc] = makeFakeRPC();
  serviceRegistry.add("rpc", rpc);
  const env = await makeTestEnv({ serviceRegistry });
  await env.services.model("sale.order").searchRead([["user_id", "=", 2]], ["amount_total"]);
  assert.strictEqual(query.route, "/web/dataset/call_kw/sale.order/search_read");
  assert.deepEqual(query.params, {
    args: [],
    kwargs: {
      context: { uid: 2 },
      domain: [["user_id", "=", 2]],
      fields: ["amount_total"],
    },
    method: "search_read",
    model: "sale.order",
  });
});

QUnit.test("webSearchRead method", async (assert) => {
  const [query, rpc] = makeFakeRPC();
  serviceRegistry.add("rpc", rpc);
  const env = await makeTestEnv({ serviceRegistry });
  await env.services.model("sale.order").searchRead([["user_id", "=", 2]], ["amount_total"]);
  assert.strictEqual(query.route, "/web/dataset/call_kw/sale.order/web_search_read");
  assert.deepEqual(query.params, {
    args: [],
    kwargs: {
      context: { uid: 2 },
      domain: [["user_id", "=", 2]],
      fields: ["amount_total"],
    },
    method: "search_read",
    model: "sale.order",
  });
});

QUnit.test("useModel take proper reference to rpc service", async (assert) => {
  class MyComponent extends Component {
    static template = xml`<div/>`;
    model = useService("model");
  }
  const [, rpc] = makeFakeRPC();
  serviceRegistry.add("rpc", rpc);

  const env = await makeTestEnv({ serviceRegistry });

  const component = await mount(MyComponent, { env, target: getFixture() });

  const rpcFn: RPC = function (this: any) {
    assert.strictEqual(this, component);
  } as any;
  env.services.rpc = rpcFn;

  await component.model("test").read([1], ["asfd"]);
});
