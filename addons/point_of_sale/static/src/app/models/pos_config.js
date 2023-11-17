/** @odoo-module */
import { registry } from "@web/core/registry";

export class PosConfig {
    static pythonModel = "pos.config";

    constructor(data) {
        this.setup(data);
    }

    setup(data) {
        Object.assign(this, data);
    }
}

registry.category("pos_available_models").add(PosConfig.pythonModel, PosConfig);
