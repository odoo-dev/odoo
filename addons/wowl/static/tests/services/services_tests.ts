import * as QUnit from "qunit";
import { deployServices, Service } from "../../src/services";
import { Registry } from "../../src/core/registry";
import { OdooEnv } from "../../src/env";
import { makeDeferred, makeTestOdoo, nextTick } from "../helpers";
import { Odoo } from "../../src/types";

let registry: Registry<Service>;
let env: OdooEnv;
let odoo: Odoo = makeTestOdoo();

QUnit.module("deployServices", {
  beforeEach() {
    registry = new Registry();
    env = { services: {} } as any;
  },
});

QUnit.test("can deploy a service", async (assert) => {
  registry.add("test", {
    name: "test",
    deploy() {
      return 17;
    },
  });
  await deployServices(env, registry, odoo);
  assert.strictEqual(env.services.test, 17);
});

QUnit.test("can deploy an asynchronous service", async (assert) => {
  const def = makeDeferred();
  registry.add("test", {
    name: "test",
    deploy() {
      return def;
    },
  });
  deployServices(env, registry, odoo);
  assert.strictEqual(env.services.test, undefined);
  def.resolve(15);
  await Promise.resolve();
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
  deployServices(env, registry, odoo);
  await nextTick();
  assert.verifySteps(["test1"]);
  def2.resolve();
  await nextTick();
  assert.verifySteps([]);
  def1.resolve();
  await nextTick();
  assert.verifySteps(["test2", "test3"]);
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
  deployServices(env, registry, odoo);
  await nextTick();
  assert.verifySteps(["test1", "test2"]);

  def1.resolve();
  await nextTick();
  assert.verifySteps([]);

  def2.resolve();
  await nextTick();
  assert.verifySteps(["test3"]);
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

  await deployServices(env, registry, odoo);
  assert.verifySteps(["appa", "aang"]);
});

QUnit.test("throw an error if missing dependency", async (assert) => {
  assert.expect(1);
  registry.add("aang", {
    dependencies: ["appa"],
    name: "aang",
    deploy() {
      assert.step("aang");
    },
  });
  try {
    await deployServices(env, registry, odoo);
  } catch (e) {
    assert.ok(true);
  }
});

QUnit.test("throw an error when there is a cycle in service dependencies", async (assert) => {
  assert.expect(1);
  registry.add("a", {
    name: "a",
    dependencies: ["b"],
    deploy: () => {},
  });
  registry.add("b", {
    name: "b",
    dependencies: ["a"],
    deploy: () => {},
  });
  try {
    await deployServices(env, registry, odoo);
  } catch (e) {
    assert.ok(e.message.startsWith("Some services could not be deployed"));
  }
});
