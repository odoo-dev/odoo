/** @odoo-module */
import { registry } from "@web/core/registry";

export class ResCountry {
    static pythonModel = "res.country";

    constructor(data) {
        this.setup(data);
    }

    setup(data) {
        Object.assign(this, data);
    }
}

registry.category("pos_available_models").add(ResCountry.pythonModel, ResCountry);
