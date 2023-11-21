/** @odoo-module */
import { registry } from "@web/core/registry";
import { Base } from "./related_models";

export class AccountTaxRepartitionLine extends Base {
    static pythonModel = "account.tax.repartition.line";
}

registry
    .category("pos_available_models")
    .add(AccountTaxRepartitionLine.pythonModel, AccountTaxRepartitionLine);
