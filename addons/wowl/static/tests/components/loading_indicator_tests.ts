import * as QUnit from "qunit";
import { LoadingIndicator } from "../../src/components/loading_indicator/loading_indicator";
import { uiService } from "../../src/services/ui/ui";
import { OdooEnv, Service } from "../../src/types";
import { Registry } from "../../src/core/registry";
import { getFixture, makeTestEnv, mount, nextTick } from "../helpers/index";
import { TestConfig } from "../helpers/utility";

let target: HTMLElement;
let services: Registry<Service>;
let browser: Partial<OdooEnv["browser"]>;

let baseConfig: TestConfig;

QUnit.module("LoadingIndicator", {
  async beforeEach() {
    target = getFixture();
    services = new Registry<Service>();
    services.add(uiService.name, uiService);
    browser = { setTimeout: () => 1 };

    baseConfig = { services, browser };
  },
});

QUnit.test("displays the loading indicator for one rpc", async (assert) => {
  const env = await makeTestEnv({ ...baseConfig });
  await mount(LoadingIndicator, { env, target });

  let loadingIndicator = target.querySelector(".o_loading");
  assert.strictEqual(loadingIndicator, null, "the loading indicator should not be displayed");

  env.bus.trigger("RPC:REQUEST", 1);
  await nextTick();
  loadingIndicator = target.querySelector(".o_loading");
  assert.notStrictEqual(loadingIndicator, null, "the loading indicator should be displayed");
  assert.strictEqual(
    loadingIndicator!.textContent,
    " Loading (1)",
    "the loading indicator should indicate 1 request in progress"
  );

  env.bus.trigger("RPC:RESPONSE", 1);
  await nextTick();
  loadingIndicator = target.querySelector(".o_loading");
  assert.strictEqual(loadingIndicator, null, "the loading indicator should not be displayed");
});

QUnit.test("displays the loading indicator for multi rpc", async (assert) => {
  const env = await makeTestEnv({ ...baseConfig });
  await mount(LoadingIndicator, { env, target });

  let loadingIndicator = target.querySelector(".o_loading");
  assert.strictEqual(loadingIndicator, null, "the loading indicator should not be displayed");

  env.bus.trigger("RPC:REQUEST", 1);
  env.bus.trigger("RPC:REQUEST", 2);
  await nextTick();

  loadingIndicator = target.querySelector(".o_loading");
  assert.notStrictEqual(loadingIndicator, null, "the loading indicator should be displayed");
  assert.strictEqual(
    loadingIndicator!.textContent,
    " Loading (2)",
    "the loading indicator should indicate 2 requests in progress."
  );

  env.bus.trigger("RPC:REQUEST", 3);
  await nextTick();
  loadingIndicator = target.querySelector(".o_loading");
  assert.strictEqual(
    loadingIndicator!.textContent,
    " Loading (3)",
    "the loading indicator should indicate 3 requests in progress."
  );

  env.bus.trigger("RPC:RESPONSE", 1);
  await nextTick();
  loadingIndicator = target.querySelector(".o_loading");
  assert.strictEqual(
    loadingIndicator!.textContent,
    " Loading (2)",
    "the loading indicator should indicate 2 requests in progress."
  );

  env.bus.trigger("RPC:REQUEST", 4);
  await nextTick();
  loadingIndicator = target.querySelector(".o_loading");
  assert.strictEqual(
    loadingIndicator!.textContent,
    " Loading (3)",
    "the loading indicator should indicate 3 requests in progress."
  );

  env.bus.trigger("RPC:RESPONSE", 2);
  env.bus.trigger("RPC:RESPONSE", 3);
  await nextTick();
  loadingIndicator = target.querySelector(".o_loading");
  assert.strictEqual(
    loadingIndicator!.textContent,
    " Loading (1)",
    "the loading indicator should indicate 1 request in progress."
  );

  env.bus.trigger("RPC:RESPONSE", 4);
  await nextTick();
  loadingIndicator = target.querySelector(".o_loading");
  assert.strictEqual(loadingIndicator, null, "the loading indicator should not be displayed");
});
