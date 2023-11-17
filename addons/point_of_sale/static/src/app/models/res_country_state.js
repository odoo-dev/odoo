/** @odoo-module */
import { registry } from "@web/core/registry";

export class ResCountryState {
    static pythonModel = "res.country.state";

    constructor(data) {
        this.setup(data);
    }

    setup(data) {
        Object.assign(this, data);
    }
}

registry.category("pos_available_models").add(ResCountryState.pythonModel, ResCountryState);
