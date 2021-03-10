/** @odoo-module **/

import { Registry } from "../../src/core/registry";

QUnit.module("Registry");

QUnit.test("key set and get", function (assert) {
  const registry = new Registry();
  const foo = {};

  registry.add("foo", foo);

  assert.strictEqual(registry.get("foo"), foo);
});

QUnit.test("contains method", function (assert) {
  const registry = new Registry();

  registry.add("foo", 1);

  assert.ok(registry.contains("foo"));
  assert.notOk(registry.contains("bar"));
});
