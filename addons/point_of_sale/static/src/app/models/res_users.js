/** @odoo-module */
import { registry } from "@web/core/registry";

export class ResUsers {
    static pythonModel = "res.users";

    constructor(data) {
        this.setup(data);
    }

    setup(data) {
        Object.assign(this, data);
    }
}

registry.category("pos_available_models").add(ResUsers.pythonModel, ResUsers);
