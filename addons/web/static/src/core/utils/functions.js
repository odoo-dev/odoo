/** @odoo-module **/

/**
 * Creates a version of the function that's memoized on the value of its first
 * argument (or no argument).
 *
 * Note that if the function is defined with no explicit argument, it will be
 * considered as a function without any argument. So, if the intent is to memoize
 * on the first argument, it should appears explicitely in the definition:
 *   function f(a) { return a; } is ok
 *   function f() { return arguments[0]; } is not ok
 *
 * @template T, U
 * @param {(arg?: T) => U} func the function to memoize
 * @returns {(arg?: T) => U} a memoized version of the original function
 */
export function memoize(func) {
    if (func.length === 0) {
        // optimization to make it faster in the case where a function is just
        // a delayed computation. Doing it this way allow us to avoid using the
        // Map
        let val;
        let called = false;
        return function memoized() {
            if (!called) {
                val = func();
                called = true;
            }
            return val;
        };
    }
    const cache = new Map();
    return function memoized(...args) {
        if (!cache.has(args[0])) {
            cache.set(args[0], func(...args));
        }
        return cache.get(...args);
    };
}
