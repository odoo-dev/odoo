/** @odoo-module */
import { registry } from "@web/core/registry";

export class PosOrderline {
    static pythonModel = "pos.order.line";

    constructor(orderLine) {
        this.setup(orderLine);
    }

    setup(lines) {
        Object.assign(this, lines);
    }
}

registry.category("pos_available_models").add(PosOrderline.pythonModel, PosOrderline);
