import { sprintf } from "../../src/utils/strings";

QUnit.module("utils", {}, () => {
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
