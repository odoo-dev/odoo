/**
 * Creates a memoized version of the provided function.
 *
 * The memoization cache is cleared automatically whenever any value
 * in the dependency array changes.
 *
 * @template T, U
 * @param {(arg: T) => U} func - The function to memoize.
 * @param {() => any[]} getDependencies - Function returning the current dependency array.
 * @returns {(arg: T) => U} A memoized version of the original function.
 */
export function memoize(func, getDependencies) {
    let cache = new Map();
    let previousDeps = "[]";
    try {
        previousDeps = JSON.stringify(getDependencies());
    } catch (error) {
        console.warn("Error getting dependencies array for Memoization : ", error);
    }
    const memoizedName = func.name ? `${func.name}Memoized` : "memoizedFunc";

    return {
        [memoizedName](...args) {
            const currentDeps = JSON.stringify(getDependencies());

            // Clear the cache when dependencies change
            if (currentDeps !== previousDeps) {
                cache = new Map();
                previousDeps = currentDeps;
            }

            const key = JSON.stringify(args);

            if (!cache.has(key)) {
                const result = func(...args);
                cache.set(key, result);
            }

            return cache.get(key);
        },
    }[memoizedName];
}
