/** @odoo-module **/

import { OrderedRegistry } from "../../src/core/ordered_registry";

QUnit.module("OrderedRegistry");

QUnit.test("can set and get a value", function (assert) {
  const registry = new OrderedRegistry();
  const foo = {};

  registry.add("foo", foo);

  assert.strictEqual(registry.get("foo"), foo);
});

QUnit.test("can set and get a value, with an order arg", function (assert) {
  const registry = new OrderedRegistry();
  const foo = {};

  registry.add("foo", foo, { sequence: 24 });

  assert.strictEqual(registry.get("foo"), foo);
});

QUnit.test("can get ordered list of elements", function (assert) {
  const registry = new OrderedRegistry();

  registry
    .add("foo1", "foo1", { sequence: 1 })
    .add("foo2", "foo2", { sequence: 2 })
    .add("foo5", "foo5", { sequence: 5 })
    .add("foo3", "foo3", { sequence: 3 });

  assert.deepEqual(registry.getAll(), ["foo1", "foo2", "foo3", "foo5"]);
});

QUnit.test("can get ordered list of elements", function (assert) {
  const registry = new OrderedRegistry();

  registry
    .add("foo1", "foo1", { sequence: 1 })
    .add("foo2", "foo2", { sequence: 2 })
    .add("foo5", "foo5", { sequence: 5 })
    .add("foo3", "foo3", { sequence: 3 });

  assert.deepEqual(registry.getAll(), ["foo1", "foo2", "foo3", "foo5"]);
});
