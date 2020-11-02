import { mergeContexts } from "../../src/core/utils";

QUnit.module("utils", {}, () => {
  QUnit.module("combineContexts");

  QUnit.test("return empty context", (assert) => {
    assert.deepEqual(mergeContexts(), {});
  });

  QUnit.test("duplicate a context", (assert) => {
    const ctx1 = { a: 1 };
    const ctx2 = mergeContexts(ctx1);
    assert.notStrictEqual(ctx1, ctx2);
    assert.deepEqual(ctx1, ctx2);
  });

  QUnit.test("can accept undefined", (assert) => {
    assert.deepEqual(mergeContexts(undefined), {});
    assert.deepEqual(mergeContexts({ a: 1 }, undefined, { b: 2 }), { a: 1, b: 2 });
  });

  QUnit.test("evaluate strings", (assert) => {
    assert.deepEqual(mergeContexts("{'a': 33}"), { a: 33 });
    assert.deepEqual(mergeContexts({ a: 1 }, "{'b': a + 1}"), { a: 1, b: 2 });
  });
});
