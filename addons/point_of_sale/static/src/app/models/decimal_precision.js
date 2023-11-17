/** @odoo-module */
import { registry } from "@web/core/registry";

export class DecimalPrecision {
    static pythonModel = "decimal.precision";

    constructor(data) {
        this.setup(data);
    }

    setup(data) {
        Object.assign(this, data);
    }
}

registry.category("pos_available_models").add(DecimalPrecision.pythonModel, DecimalPrecision);
