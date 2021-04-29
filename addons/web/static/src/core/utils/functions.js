/** @odoo-module **/

/**
 * Creates a version of the function that's memoized on the value of its first
 * argument.
 *
 * @template T, U
 * @param {(arg: T) => U} func the function to memoize
 * @returns {(arg: T) => U} a memoized version of the original function
 */
export function memoize(func) {
    const cache = new Map();
    return function (arg) {
        if (!cache.has(arg)) {
            cache.set(arg, func(arg));
        }
        return cache.get(arg);
    };
}
