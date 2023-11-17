/** @odoo-module */
import { registry } from "@web/core/registry";

export class AccountCashRounding {
    static pythonModel = "account.cash.rounding";

    constructor(data) {
        this.setup(data);
    }

    setup(data) {
        Object.assign(this, data);
    }
}

registry.category("pos_available_models").add(AccountCashRounding.pythonModel, AccountCashRounding);
