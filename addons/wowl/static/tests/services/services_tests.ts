import * as QUnit from "qunit";
import { Registry } from "../../src/core/registry";
import { Service } from "../../src/types";
import { makeDeferred, makeTestEnv, nextTick } from "../helpers/index";

let registry: Registry<Service>;

QUnit.module("deployServices", {
  beforeEach() {
    registry = new Registry();
  },
});

QUnit.test("can deploy a service", async (assert) => {
  registry.add("test", {
    name: "test",
    deploy() {
      return 17;
    },
  });
  const env = await makeTestEnv({ services: registry });
  assert.strictEqual(env.services.test, 17);
});

QUnit.test("can deploy an asynchronous service", async (assert) => {
  const def = makeDeferred();
  registry.add("test", {
    name: "test",
    async deploy() {
      assert.step("before");
      const result = await def;
      assert.step("after");
      return result;
    },
  });
  const prom = makeTestEnv({ services: registry });
  assert.verifySteps(["before"]);
  def.resolve(15);
  const env = await prom;
  assert.verifySteps(["after"]);
  assert.strictEqual(env.services.test, 15);
});

QUnit.test("can deploy two sequentially dependant asynchronous services", async (assert) => {
  const def1 = makeDeferred();
  const def2 = makeDeferred();

  registry.add("test2", {
    dependencies: ["test1"],
    name: "test2",
    deploy() {
      assert.step("test2");
      return def2;
    },
  });
  registry.add("test1", {
    name: "test1",
    deploy() {
      assert.step("test1");
      return def1;
    },
  });
  registry.add("test3", {
    dependencies: ["test2"],
    name: "test3",
    deploy() {
      assert.step("test3");
    },
  });
  const promise = makeTestEnv({ services: registry });
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

QUnit.test("can deploy two independant asynchronous services in parallel", async (assert) => {
  const def1 = makeDeferred();
  const def2 = makeDeferred();

  registry.add("test1", {
    name: "test1",
    deploy() {
      assert.step("test1");
      return def1;
    },
  });
  registry.add("test2", {
    name: "test2",
    deploy() {
      assert.step("test2");
      return def2;
    },
  });
  registry.add("test3", {
    dependencies: ["test1", "test2"],
    name: "test3",
    deploy() {
      assert.step("test3");
    },
  });
  const promise = makeTestEnv({ services: registry });
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

QUnit.test("can deploy a service with a dependency", async (assert) => {
  registry.add("aang", {
    dependencies: ["appa"],
    name: "aang",
    deploy() {
      assert.step("aang");
    },
  });
  registry.add("appa", {
    name: "appa",
    deploy() {
      assert.step("appa");
    },
  });

  await makeTestEnv({ services: registry });
  assert.verifySteps(["appa", "aang"]);
});
