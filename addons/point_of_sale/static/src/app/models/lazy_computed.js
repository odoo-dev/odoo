/** @odoo-module */

import { effect } from "@web/core/utils/reactive";

export function lazyComputed(obj, propName, compute) {
    const key = Symbol(propName);
    Object.defineProperty(obj, propName, {
        get() {
            return this[key]();
        },
        configurable: true,
    });

    effect(
        function recompute(obj) {
            const value = [];
            obj[key] = () => {
                if (!value.length) {
                    value.push(compute(obj));
                }
                return value[0];
            };
        },
        [obj]
    );
}
