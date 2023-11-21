/** @odoo-module */
import { registry } from "@web/core/registry";
import { Base } from "./related_models";

export class AccountTax extends Base {
    static pythonModel = "account.tax";
}

registry.category("pos_available_models").add(AccountTax.pythonModel, AccountTax);
