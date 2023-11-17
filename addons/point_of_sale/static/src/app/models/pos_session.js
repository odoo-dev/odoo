/** @odoo-module */
import { registry } from "@web/core/registry";

export class PosSession {
    static pythonModel = "pos.session";

    constructor(data) {
        this.setup(data);
    }

    setup(data) {
        Object.assign(this, data);
    }
}

registry.category("pos_available_models").add(PosSession.pythonModel, PosSession);
