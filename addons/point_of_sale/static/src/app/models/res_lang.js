/** @odoo-module */
import { registry } from "@web/core/registry";

export class ResLang {
    static pythonModel = "res.lang";

    constructor(data) {
        this.setup(data);
    }

    setup(data) {
        Object.assign(this, data);
    }
}

registry.category("pos_available_models").add(ResLang.pythonModel, ResLang);
