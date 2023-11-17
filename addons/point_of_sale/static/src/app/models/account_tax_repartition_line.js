/** @odoo-module */
import { registry } from "@web/core/registry";

export class AccountTaxRepartitionLine {
    static pythonModel = "account.tax.repartition.line";

    constructor(data) {
        this.setup(data);
    }

    setup(data) {
        Object.assign(this, data);
    }
}

registry
    .category("pos_available_models")
    .add(AccountTaxRepartitionLine.pythonModel, AccountTaxRepartitionLine);
