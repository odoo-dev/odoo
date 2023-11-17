/** @odoo-module */
import { registry } from "@web/core/registry";

export class AccountFiscalPosition {
    static pythonModel = "account.fiscal.position";

    constructor(data) {
        this.setup(data);
    }

    setup(data) {
        Object.assign(this, data);
    }
}

registry
    .category("pos_available_models")
    .add(AccountFiscalPosition.pythonModel, AccountFiscalPosition);
