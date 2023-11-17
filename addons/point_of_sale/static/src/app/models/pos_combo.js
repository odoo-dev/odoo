/** @odoo-module */
import { registry } from "@web/core/registry";

export class PosCombo {
    static pythonModel = "pos.combo";

    constructor(data) {
        this.setup(data);
    }

    setup(data) {
        Object.assign(this, data);
    }
}

registry.category("pos_available_models").add(PosCombo.pythonModel, PosCombo);
