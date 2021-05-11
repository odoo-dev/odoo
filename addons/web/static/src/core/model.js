/** @odoo-module **/

import { useBus } from "@web/core/bus_hook";

const { core, hooks } = owl;
const { EventBus } = core;
const { useComponent } = hooks;

export class Model extends EventBus {
    /**
     * @param {Object} env
     */
    constructor(env) {
        super();
        this.env = env;
        this.setup();
    }

    setup() {}
}

/**
 * @param {Object} params
 * @param {any} params.Model @todo specify type
 * @param {Function} [params.onUpdate]
 * @returns {any} @todo specify type
 */
export function useModel(params) {
    const component = useComponent();
    const ModelClass = params.Model;
    const model = new ModelClass(component.env);
    useBus(model, "update", params.onUpdate || component.render);
    return model;
}
