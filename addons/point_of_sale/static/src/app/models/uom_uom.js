/** @odoo-module */
import { registry } from "@web/core/registry";

export class UomUom {
    static pythonModel = "uom.uom";

    constructor(data) {
        this.setup(data);
    }

    setup(data) {
        Object.assign(this, data);
    }
}

registry.category("pos_available_models").add(UomUom.pythonModel, UomUom);
