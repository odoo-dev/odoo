/** @odoo-module **/

import { memoize } from "@web/utils/functions";

QUnit.module("utils", () => {
  QUnit.module("Functions");

  QUnit.test("memoize: simple valid cases", function (assert) {
    let callCount = 0;
    const func = function (arg) {
      return callCount++;
    };
    const memoized = memoize(func);
    const firstValue = memoized("first");
    assert.equal(callCount, 1, "Memoized function was called once to fill the cache");
    const secondValue = memoized("first");
    assert.equal(callCount, 1, "Subsequent calls to memoized function with the same argument do not call the original function again");
    assert.equal(firstValue, secondValue, "Subsequent call to memoized function with the same argument returns the same value");
    const thirdValue = memoized();
    assert.equal(callCount, 2, "Subsequent calls to memoized function with a different argument call the original function again");
    const fourthValue = memoized();
    assert.equal(thirdValue, fourthValue, "Memoization also works with no first argument as a key");
    assert.equal(callCount, 2, "Subsequent calls to memoized function with no first argument do not call the original function again");
  });
});
