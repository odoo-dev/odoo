/** @odoo-module */
import { registry } from "@web/core/registry";

export class ResPartner {
    static pythonModel = "res.partner";

    constructor(data) {
        this.setup(data);
    }

    setup(data) {
        Object.assign(this, data);
    }
}

registry.category("pos_available_models").add(ResPartner.pythonModel, ResPartner);
