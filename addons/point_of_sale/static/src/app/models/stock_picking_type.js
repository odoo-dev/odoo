/** @odoo-module */
import { registry } from "@web/core/registry";

export class StockPickingType {
    static pythonModel = "stock.picking.type";

    constructor(data) {
        this.setup(data);
    }

    setup(data) {
        Object.assign(this, data);
    }
}

registry.category("pos_available_models").add(StockPickingType.pythonModel, StockPickingType);
