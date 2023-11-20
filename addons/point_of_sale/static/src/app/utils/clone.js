/** @odoo-module */

const isArray = (val) => {
    return Array.isArray(val);
};

const isObject = (val) => {
    return {}.toString.call(val) === "[object Object]" && !isArray(val);
};

export const clone = (val, history = null) => {
    const stack = history || new Set();

    if (stack.has(val)) {
        return val;
    }

    stack.add(val);

    const copyObject = (o) => {
        const oo = Object.create({});
        for (const k in o) {
            oo[k] = clone(o[k], stack);
        }
        return oo;
    };

    const copyArray = (a) => {
        return [...a].map((e) => {
            if (isArray(e)) {
                return copyArray(e);
            } else if (isObject(e)) {
                return copyObject(e);
            }
            return clone(e, stack);
        });
    };

    if (isArray(val)) {
        return copyArray(val);
    }

    if (isObject(val)) {
        return copyObject(val);
    }

    return val;
};
