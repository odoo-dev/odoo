import { makeContext, sprintf } from "../../src/core/utils";

QUnit.module("utils", {}, () => {
  QUnit.module("makeContext");

  QUnit.test("return empty context", (assert) => {
    assert.deepEqual(makeContext(), {});
  });

  QUnit.test("duplicate a context", (assert) => {
    const ctx1 = { a: 1 };
    const ctx2 = makeContext(ctx1);
    assert.notStrictEqual(ctx1, ctx2);
    assert.deepEqual(ctx1, ctx2);
  });

  QUnit.test("can accept undefined", (assert) => {
    assert.deepEqual(makeContext(undefined), {});
    assert.deepEqual(makeContext({ a: 1 }, undefined, { b: 2 }), { a: 1, b: 2 });
  });

  QUnit.test("evaluate strings", (assert) => {
    assert.deepEqual(makeContext("{'a': 33}"), { a: 33 });
    assert.deepEqual(makeContext({ a: 1 }, "{'b': a + 1}"), { a: 1, b: 2 });
  });

  QUnit.module("sprintf");

  QUnit.test("sprintf properly formats strings", (assert) => {
    assert.deepEqual(sprintf("Hello %s!", "ged"), "Hello ged!");
    assert.deepEqual(sprintf("Hello %s and %s!", "ged", "lpe"), "Hello ged and lpe!");

    assert.deepEqual(sprintf("Hello %(x)s!", { x: "ged" }), "Hello ged!");
    assert.deepEqual(
      sprintf("Hello %(x)s and %(y)s!", { x: "ged", y: "lpe" }),
      "Hello ged and lpe!"
    );

    assert.deepEqual(sprintf("Hello!"), "Hello!");
    assert.deepEqual(sprintf("Hello %s!"), "Hello %s!");
    assert.deepEqual(sprintf("Hello %(value)s!"), "Hello %(value)s!");
  });
});
