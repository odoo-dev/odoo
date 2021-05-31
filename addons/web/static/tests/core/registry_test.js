/** @odoo-module **/

import { Registry } from "@web/core/registry";

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

QUnit.test("can set and get a value, with an order arg", function (assert) {
    const registry = new Registry();
    const foo = {};

    registry.add("foo", foo, { sequence: 24 });

    assert.strictEqual(registry.get("foo"), foo);
});

QUnit.test("can get ordered list of elements", function (assert) {
    const registry = new Registry();

    registry
        .add("foo1", "foo1", { sequence: 1 })
        .add("foo2", "foo2", { sequence: 2 })
        .add("foo5", "foo5", { sequence: 5 })
        .add("foo3", "foo3", { sequence: 3 });

    assert.deepEqual(registry.getAll(), ["foo1", "foo2", "foo3", "foo5"]);
});

QUnit.test("can get ordered list of entries", function (assert) {
    const registry = new Registry();

    registry
        .add("foo1", "foo1", { sequence: 1 })
        .add("foo2", "foo2", { sequence: 2 })
        .add("foo5", "foo5", { sequence: 5 })
        .add("foo3", "foo3", { sequence: 3 });

    assert.deepEqual(registry.getEntries(), [
        ["foo1", "foo1"],
        ["foo2", "foo2"],
        ["foo3", "foo3"],
        ["foo5", "foo5"],
    ]);
});

QUnit.test("can override element with sequence", function (assert) {
    const registry = new Registry();

    registry
        .add("foo1", "foo1", { sequence: 1 })
        .add("foo2", "foo2", { sequence: 2 })
        .add("foo1", "foo3", { force: true });

    assert.deepEqual(registry.getEntries(), [
        ["foo1", "foo3"],
        ["foo2", "foo2"],
    ]);
});

QUnit.test("can override element with sequence 2 ", function (assert) {
    const registry = new Registry();

    registry
        .add("foo1", "foo1", { sequence: 1 })
        .add("foo2", "foo2", { sequence: 2 })
        .add("foo1", "foo3", { force: true, sequence: 3 });

    assert.deepEqual(registry.getEntries(), [
        ["foo2", "foo2"],
        ["foo1", "foo3"],
    ]);
});

QUnit.test("can recursively open sub registry", function (assert) {
    const registry = new Registry();

    registry.category("sub").add("a", "b");
    assert.deepEqual(registry.category("sub").get("a"), "b");
});
