import { STATE_SYMBOL, INTERNAL_MODEL_PROPS } from "./utils";

/**
 *  Defines a Proxy trap for `set` operations to store state properties in an internal state object.
 *  If it's a new property, a custom getter/setter is created to access and update the value.
 */
export function defineStateSetterTrap() {
    return function set(target, prop, value, receiver) {
        if (isStateProp(target, prop)) {
            defineStateAccessor(receiver, prop); // receiver for reactivity
        }
        return Reflect.set(target, prop, value, receiver);
    };
}

function isStateProp(target, prop) {
    if (typeof prop === "symbol") {
        return false;
    }
    return !INTERNAL_MODEL_PROPS.has(prop) && !(prop in target);
}

function defineStateAccessor(obj, prop) {
    Object.defineProperty(obj, prop, {
        get: function () {
            return this[STATE_SYMBOL]?.[prop];
        },
        set: function (value) {
            try {
                validateStateValue(value);
            } catch (err) {
                throw new Error("'" + prop + "' value not supported: " + err.message);
            }
            if (!this[STATE_SYMBOL]) {
                this[STATE_SYMBOL] = {};
            }
            this[STATE_SYMBOL][prop] = value;
        },
        enumerable: true,
    });
}

/**
 * Validates that the value being set in the state is allowed.
 * Allowed types include primitives, plain objects, arrays, sets, Date, and maps.
 * Disallowed types include functions , DOM nodes, and any non-plain objects.
 * It also detects circular references.
 **/
export function validateStateValue(obj, seen = new WeakSet()) {
    if (obj === null) {
        return true;
    }

    if (typeof obj === "function") {
        throw new Error("Functions are not allowed");
    }

    // Primitive
    if (typeof obj !== "object") {
        return true;
    }

    // Allow Date instances.
    if (obj instanceof Date) {
        return true;
    }

    // Check for disallowed types
    if (obj instanceof Node) {
        throw new Error("DOM node not allowed");
    }

    // Detect circular references
    if (seen.has(obj)) {
        throw new Error("Circular reference detected");
    }
    seen.add(obj);

    if (Array.isArray(obj)) {
        for (const item of obj) {
            validateStateValue(item, seen);
        }
        return true;
    }

    if (obj instanceof Set) {
        for (const item of obj) {
            validateStateValue(item, seen);
        }
        return true;
    }

    if (obj instanceof Map) {
        for (const [key, value] of obj) {
            validateStateValue(key, seen);
            validateStateValue(value, seen);
        }
        return true;
    }
    // Allow only plain objects.
    if (!isPlainObject(obj)) {
        throw new Error(`Object '${obj.constructor?.name}' not allowed`);
    }

    for (const [, value] of Object.entries(obj)) {
        validateStateValue(value, seen);
    }

    return true;
}

/*
 * Check if the object is a plain old javascript object.
 */
function isPlainObject(obj) {
    return (
        typeof obj === "object" &&
        obj !== null &&
        // obj.constructor can be undefined when there's no prototype (`Object.create(null, {})`)
        (obj.constructor === Object || obj.constructor === undefined)
    );
}

export function assignState(record, state) {
    record[STATE_SYMBOL] = state;
    for (const prop of Object.keys(state)) {
        if (!(prop in record)) {
            defineStateAccessor(record, prop);
        }
    }
}
