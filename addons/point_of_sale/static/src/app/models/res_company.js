/** @odoo-module */
import { registry } from "@web/core/registry";

export class ResCompany {
    static pythonModel = "res.company";

    constructor(data) {
        this.setup(data);
    }

    setup(data) {
        Object.assign(this, data);
    }
}

registry.category("pos_available_models").add(ResCompany.pythonModel, ResCompany);
