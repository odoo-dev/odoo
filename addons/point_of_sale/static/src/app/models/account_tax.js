/** @odoo-module */
import { registry } from "@web/core/registry";

export class AccountTax {
    static pythonModel = "account.tax";

    constructor(data) {
        this.setup(data);
    }

    setup(data) {
        Object.assign(this, data);
    }
}

registry.category("pos_available_models").add(AccountTax.pythonModel, AccountTax);
