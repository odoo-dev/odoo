/**
@typedef {{
    originalProperties: Map<keyof object, PropertyDescriptor>;
    skeleton: object;
    extensions: Set<object>;
}} PatchDescription
*/

/**
@typedef {new (...args: any[]) => any} AnyCtor
*/

/**
@template T
@template U
@typedef {Partial<T> & U & ThisType<T & U>} Extension
*/

/** @type {WeakMap<object, PatchDescription>} */
const patchDescriptions = new WeakMap();

/**
 * Create or get the patch description for the given `objToPatch`.
 * @param {object} objToPatch
 * @returns {PatchDescription}
 */
function getPatchDescription(objToPatch) {
    if (!patchDescriptions.has(objToPatch)) {
        patchDescriptions.set(objToPatch, {
            originalProperties: new Map(),
            skeleton: Object.create(Object.getPrototypeOf(objToPatch)),
            extensions: new Set(),
        });
    }
    return patchDescriptions.get(objToPatch);
}

/**
 * @param {object} objToPatch
 * @returns {boolean}
 */
function isClassPrototype(objToPatch) {
    // class A {}
    // isClassPrototype(A) === false
    // isClassPrototype(A.prototype) === true
    // isClassPrototype(new A()) === false
    // isClassPrototype({}) === false
    return (
        Object.hasOwn(objToPatch, "constructor") && objToPatch.constructor?.prototype === objToPatch
    );
}

/**
 * Traverse the prototype chain to find a potential property.
 * @param {object} objToPatch
 * @param {keyof object} key
 * @returns {object}
 */
function findAncestorPropertyDescriptor(objToPatch, key) {
    let descriptor = null;
    let prototype = objToPatch;
    do {
        descriptor = Object.getOwnPropertyDescriptor(prototype, key);
        prototype = Object.getPrototypeOf(prototype);
    } while (!descriptor && prototype);
    return descriptor;
}

/**
 * Patch an object with the object initializer notation.
 *
 * ```
 * // patch an object.
 * patch(obj, {
 *     exec() {
 *         super.exec();
 *         // Do something more.
 *     },
 * });
 * ```
 *
 * If the intent is to patch a class, don't forget to patch the prototype, unless
 * you want to patch static properties/methods.
 *
 * ```
 * // patch the properties of a class instance.
 * patch(OriginalClass.prototype, {
 *     instanceMethod() {
 *         super.instanceMethod();
 *         // Do something more.
 *     }
 * });
 * // patch the static properties of a class.
 * patch(OriginalClass, {
 *     staticMethod() {
 *         super.staticMethod();
 *         // Do something more.
 *     }
 * });
 * ```
 *
 * @template {object} T
 * @template {object} U
 * @param {T} objToPatch The object to patch
 * @param {Extension<T, U>} extension The object containing the patched properties
 */
export function patch(objToPatch, extension) {
    if (typeof extension === "string") {
        throw new Error(
            `Patch "${extension}": Second argument is not the patch name anymore, it should be the object containing the patched properties`
        );
    }

    const description = getPatchDescription(objToPatch);
    description.extensions.add(extension);

    for (const key of Reflect.ownKeys(extension)) {
        const newProperty = Reflect.getOwnPropertyDescriptor(extension, key);
        const oldProperty = Reflect.getOwnPropertyDescriptor(objToPatch, key);

        if (oldProperty) {
            // Store the old property on the skeleton.
            Reflect.defineProperty(description.skeleton, key, oldProperty);
        }

        if (!description.originalProperties.has(key)) {
            // Keep a trace of original property (prop before first patch), useful for unpatching.
            description.originalProperties.set(key, oldProperty);
        }

        if (isClassPrototype(objToPatch)) {
            // A property is enumerable on POJO ({ prop: 1 }) but not on classes (class A {}).
            // Here, we only check if we patch a class prototype.
            newProperty.enumerable = false;
        }

        if ((newProperty.get && 1) ^ (newProperty.set && 1)) {
            // get and set are defined together. If they are both defined
            // in the previous descriptor but only one in the new descriptor
            // then the other will be undefined so we need to apply the
            // previous descriptor in the new one.
            const ancestorProperty = findAncestorPropertyDescriptor(objToPatch, key);
            newProperty.get = newProperty.get ?? ancestorProperty?.get;
            newProperty.set = newProperty.set ?? ancestorProperty?.set;
        }

        // Replace the old property by the new one.
        Reflect.defineProperty(objToPatch, key, newProperty);
    }

    // Sets the current skeleton as the extension's prototype to make
    // `super` keyword working and then set extension as the new skeleton.
    description.skeleton = Reflect.setPrototypeOf(extension, description.skeleton);

    return () => {
        // Remove the description to start with a fresh base.
        patchDescriptions.delete(objToPatch);

        for (const [key, property] of description.originalProperties) {
            if (property) {
                // Restore the original property on the `objToPatch` object.
                Reflect.defineProperty(objToPatch, key, property);
            } else {
                // Or remove the property if it did not exist at first.
                Reflect.deleteProperty(objToPatch, key);
            }
        }

        // Re-apply the patches without the current one.
        description.extensions.delete(extension);
        for (const extension of description.extensions) {
            patch(objToPatch, extension);
        }
    };
}
