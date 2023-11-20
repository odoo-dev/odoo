/** @odoo-module */
import { registry } from "@web/core/registry";
import { uuidv4 } from "@point_of_sale/utils";

export class PosOrderline {
    static pythonModel = "pos.order.line";

    constructor(orderLine) {
        this.setup(orderLine);
    }

    setup(lines) {
        Object.assign(this, lines);
        this.uuid = lines.uuid ? lines.uuid : uuidv4();
    }
}

registry.category("pos_available_models").add(PosOrderline.pythonModel, PosOrderline);
