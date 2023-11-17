/** @odoo-module */
import { registry } from "@web/core/registry";

export class ResCurrency {
    static pythonModel = "res.currency";

    constructor(data) {
        this.setup(data);
    }

    setup(data) {
        Object.assign(this, data);
    }
}

registry.category("pos_available_models").add(ResCurrency.pythonModel, ResCurrency);
