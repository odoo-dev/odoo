/** @odoo-module */
import { registry } from "@web/core/registry";

export class PosCategory {
    static pythonModel = "pos.category";

    constructor(data) {
        this.setup(data);
    }

    setup(data) {
        Object.assign(this, data);
    }
}

registry.category("pos_available_models").add(PosCategory.pythonModel, PosCategory);
