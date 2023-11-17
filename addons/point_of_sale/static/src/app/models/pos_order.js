/** @odoo-module */
import { registry } from "@web/core/registry";

export class PosOrder {
    static pythonModel = "pos.order";

    constructor(data) {
        this.setup(data);
    }

    setup(data) {
        Object.assign(this, data);
    }
}

registry.category("pos_available_models").add(PosOrder.pythonModel, PosOrder);
