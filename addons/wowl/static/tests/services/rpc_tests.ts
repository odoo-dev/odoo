import { Component, tags } from "@odoo/owl";
import * as QUnit from "qunit";
import { Registry } from "../../src/core/registry";
import { Service } from "../../src/types";
import { useService } from "../../src/core/hooks";
import { rpcService } from "../../src/services/rpc";
import { Deferred, getFixture, makeDeferred, makeTestEnv, mount, nextTick } from "../helpers";

const { xml } = tags;
// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

function createMockXHR(
  response?: any,
  sendCb?: (data: any) => void,
  def?: Deferred<any>
): typeof XMLHttpRequest {
  let MockXHR: typeof XMLHttpRequest = function () {
    return {
      _loadListener: null,
      url: "",
      addEventListener(type: string, listener: any) {
        if (type === "load") {
          this._loadListener = listener;
        }
      },
      open(method: string, url: string) {
        this.url = url;
      },
      setRequestHeader() {},
      async send(data: string) {
        if (sendCb) {
          sendCb.call(this, JSON.parse(data));
        }
        if (def) {
          await def;
        }
        (this._loadListener as any)();
      },
      response: JSON.stringify(response || ""),
    };
  } as any;
  return MockXHR;
}

interface RPCInfo {
  url: string;
  request: any;
}

async function testRPC(route: string, params?: any): Promise<RPCInfo> {
  let url: string = "";
  let request: any;
  let MockXHR = createMockXHR({ test: true }, function (this: any, data) {
    request = data;
    url = this.url;
  });
  const env = await makeTestEnv({
    services: serviceRegistry,
    browser: { XMLHttpRequest: MockXHR },
  });
  await env.services.rpc(route, params);
  return { url, request };
}

// -----------------------------------------------------------------------------
// Tests
// -----------------------------------------------------------------------------
let serviceRegistry: Registry<Service<any>>;

QUnit.module("RPC", {
  beforeEach() {
    serviceRegistry = new Registry();
    serviceRegistry.add("rpc", rpcService);
  },
});

QUnit.test("can perform a simple rpc", async (assert) => {
  assert.expect(4);
  let MockXHR = createMockXHR({ result: { action_id: 123 } }, (request) => {
    assert.strictEqual(request.jsonrpc, "2.0");
    assert.strictEqual(request.method, "call");
    assert.ok(typeof request.id === "number");
  });

  const env = await makeTestEnv({
    services: serviceRegistry,
    browser: { XMLHttpRequest: MockXHR },
  });
  const result = await env.services.rpc("/test/");
  assert.deepEqual(result, { action_id: 123 });
});

QUnit.test("trigger an error on bus when response has 'error' key", async (assert) => {
  assert.expect(2);
  const error = {
    message: "message",
    code: 12,
    data: {
      debug: "data_debug",
      message: "data_message",
    },
  };
  let MockXHR = createMockXHR({ error });

  const env = await makeTestEnv({
    services: serviceRegistry,
    browser: { XMLHttpRequest: MockXHR },
  });

  env.bus.on("RPC_ERROR", null, (payload) => {
    assert.deepEqual(payload, {
      code: 12,
      data_debug: "data_debug",
      data_message: "data_message",
      message: "message",
      type: "server",
    });
  });
  try {
    await env.services.rpc("/test/");
  } catch (e) {
    assert.ok(true);
  }
});

QUnit.test("rpc with simple routes", async (assert) => {
  const info1 = await testRPC("/my/route");
  assert.strictEqual(info1.url, "/my/route");

  const info2 = await testRPC("/my/route", { hey: "there", model: "test" });
  assert.deepEqual(info2.request.params, {
    hey: "there",
    model: "test",
  });
});

QUnit.test("rpc coming from destroyed components are left pending", async (assert) => {
  class MyComponent extends Component {
    static template = xml`<div/>`;
    rpc = useService("rpc");
  }
  const def = makeDeferred();
  let MockXHR = createMockXHR({ result: "1" }, () => {}, def);

  const env = await makeTestEnv({
    services: serviceRegistry,
    browser: { XMLHttpRequest: MockXHR },
  });

  const component = await mount(MyComponent, { env, target: getFixture() });
  let isResolved = false;
  let isFailed = false;
  component
    .rpc("/my/route")
    .then(() => {
      isResolved = true;
    })
    .catch(() => {
      isFailed = true;
    });
  assert.strictEqual(isResolved, false);
  assert.strictEqual(isFailed, false);

  component.destroy();
  def.resolve();
  await nextTick();

  assert.strictEqual(isResolved, false);
  assert.strictEqual(isFailed, false);
});

QUnit.test("rpc initiated from destroyed components throw exception", async (assert) => {
  assert.expect(1);
  class MyComponent extends Component {
    static template = xml`<div/>`;
    rpc = useService("rpc");
  }

  const env = await makeTestEnv({
    services: serviceRegistry,
  });

  const component = await mount(MyComponent, { env, target: getFixture() });
  component.destroy();
  try {
    await component.rpc("/my/route");
  } catch (e) {
    assert.strictEqual(e.message, "A destroyed component should never initiate a RPC");
  }
});
