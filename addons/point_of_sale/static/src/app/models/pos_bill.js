/** @odoo-module */
import { registry } from "@web/core/registry";

export class PosBill {
    static pythonModel = "pos.bill";

    constructor(data) {
        this.setup(data);
    }

    setup(data) {
        Object.assign(this, data);
    }
}

registry.category("pos_available_models").add(PosBill.pythonModel, PosBill);
