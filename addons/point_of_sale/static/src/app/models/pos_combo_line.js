/** @odoo-module */
import { registry } from "@web/core/registry";

export class PosComboLine {
    static pythonModel = "pos.combo.line";

    constructor(data) {
        this.setup(data);
    }

    setup(data) {
        Object.assign(this, data);
    }
}

registry.category("pos_available_models").add(PosComboLine.pythonModel, PosComboLine);
