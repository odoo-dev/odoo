/** @odoo-module **/

import { serviceRegistry } from "@web/webclient/service_registry";
import { makeTestEnv } from "../helpers/mock_env";
import { makeDeferred, nextTick } from "../helpers/utils";

QUnit.module("deployServices");

QUnit.test("can start a service", async (assert) => {
  serviceRegistry.add("test", {
    start() {
      return 17;
    },
  });
  const env = await makeTestEnv();
  assert.strictEqual(env.services.test, 17);
});

QUnit.test("can start an asynchronous service", async (assert) => {
  const def = makeDeferred();
  serviceRegistry.add("test", {
    async start() {
      assert.step("before");
      const result = await def;
      assert.step("after");
      return result;
    },
  });
  const prom = makeTestEnv();
  assert.verifySteps(["before"]);
  def.resolve(15);
  const env = await prom;
  assert.verifySteps(["after"]);
  assert.strictEqual(env.services.test, 15);
});

QUnit.test("can start two sequentially dependant asynchronous services", async (assert) => {
  const def1 = makeDeferred();
  const def2 = makeDeferred();
  serviceRegistry.add("test2", {
    dependencies: ["test1"],
    start() {
      assert.step("test2");
      return def2;
    },
  });
  serviceRegistry.add("test1", {
    start() {
      assert.step("test1");
      return def1;
    },
  });
  serviceRegistry.add("test3", {
    dependencies: ["test2"],
    start() {
      assert.step("test3");
    },
  });
  const promise = makeTestEnv();
  await nextTick();
  assert.verifySteps(["test1"]);
  def2.resolve();
  await nextTick();
  assert.verifySteps([]);
  def1.resolve();
  await nextTick();
  assert.verifySteps(["test2", "test3"]);
  await promise;
});

QUnit.test("can start two independant asynchronous services in parallel", async (assert) => {
  const def1 = makeDeferred();
  const def2 = makeDeferred();
  serviceRegistry.add("test1", {
    start() {
      assert.step("test1");
      return def1;
    },
  });
  serviceRegistry.add("test2", {
    start() {
      assert.step("test2");
      return def2;
    },
  });
  serviceRegistry.add("test3", {
    dependencies: ["test1", "test2"],
    start() {
      assert.step("test3");
    },
  });
  const promise = makeTestEnv();
  await nextTick();
  assert.verifySteps(["test1", "test2"]);
  def1.resolve();
  await nextTick();
  assert.verifySteps([]);
  def2.resolve();
  await nextTick();
  assert.verifySteps(["test3"]);
  await promise;
});

QUnit.test("can start a service with a dependency", async (assert) => {
  serviceRegistry.add("aang", {
    dependencies: ["appa"],
    start() {
      assert.step("aang");
    },
  });
  serviceRegistry.add("appa", {
    start() {
      assert.step("appa");
    },
  });
  await makeTestEnv();
  assert.verifySteps(["appa", "aang"]);
});

QUnit.test("get an object containing dependencies as second arg", async (assert) => {
  serviceRegistry.add("aang", {
    dependencies: ["appa"],
    start(env, deps) {
      assert.deepEqual(deps, { appa: "flying bison" });
    },
  });
  serviceRegistry.add("appa", {
    start() {
      return "flying bison";
    },
  });
  await makeTestEnv();
});
