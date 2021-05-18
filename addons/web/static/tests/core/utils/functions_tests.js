/** @odoo-module **/

import { memoize } from "@web/core/utils/functions";

QUnit.module("utils", () => {
    QUnit.module("Functions");

    QUnit.test("memoize (function with one argument)", function (assert) {
        let callCount = 0;
        let lastReceivedArgs;
        const func = function (arg) {
            lastReceivedArgs = [...arguments];
            return callCount++;
        };
        const memoized = memoize(func);
        const firstValue = memoized("first");
        assert.equal(callCount, 1, "Memoized function was called once to fill the cache");
        assert.equal(lastReceivedArgs, "first", "Memoized function received the correct argument");
        const secondValue = memoized("first");
        assert.equal(
            callCount,
            1,
            "Subsequent calls to memoized function with the same argument do not call the original function again"
        );
        assert.equal(
            firstValue,
            secondValue,
            "Subsequent call to memoized function with the same argument returns the same value"
        );

        const thirdValue = memoized();
        assert.equal(
            callCount,
            2,
            "Subsequent calls to memoized function with a different argument call the original function again"
        );
        const fourthValue = memoized();
        assert.equal(
            thirdValue,
            fourthValue,
            "Memoization also works with no first argument as a key"
        );
        assert.equal(
            callCount,
            2,
            "Subsequent calls to memoized function with no first argument do not call the original function again"
        );

        memoized(1, 2, 3);
        assert.equal(callCount, 3);
        assert.deepEqual(
            lastReceivedArgs,
            [1, 2, 3],
            "Arguments after the first one are passed through correctly"
        );
        memoized(1, 20, 30);
        assert.equal(
            callCount,
            3,
            "Subsequent calls to memoized function with more than one argument do not call the original function again even if the arguments other than the first have changed"
        );
    });

    QUnit.test("memoize (function with no argument)", function (assert) {
        let i = 0;
        let f = memoize(() => {
            i++;
            return i;
        });
        assert.strictEqual(i, 0);
        assert.strictEqual(f(), 1);
        assert.strictEqual(i, 1);
        assert.strictEqual(f(), 1);
        assert.strictEqual(i, 1);
    });

    QUnit.test("memoize on a function with no argument, returning false", function (assert) {
        let i = 0;
        let f = memoize(() => {
            i++;
            return false;
        });
        assert.strictEqual(i, 0);
        assert.strictEqual(f(), false);
        assert.strictEqual(i, 1);
        assert.strictEqual(f(), false);
        assert.strictEqual(i, 1);
    });

    QUnit.test("memoized functions have a name", function (assert) {
        const f1 = memoize(() => {});
        assert.strictEqual(f1.name, "memoized");
        const f2 = memoize((someArg) => {});
        assert.strictEqual(f2.name, "memoized");
    });
});
