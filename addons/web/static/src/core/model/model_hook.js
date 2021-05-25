/** @odoo-module **/

import { useBus } from "../bus_hook";

const { useComponent } = owl.hooks;

/**
 * @template {import("./model").Model} T
 * @param {new(object) => T} ModelClass
 * @param {object} [params]
 * @param {() => void} [params.onUpdate]
 * @returns {T}
 */
export function useModel(ModelClass, params = {}) {
    const component = useComponent();
    const model = new ModelClass(component.env);
    useBus(model, "update", params.onUpdate || component.render);
    return model;
}
