/** @odoo-module */
import { registry } from "@web/core/registry";
import { Base } from "./related_models";

export class AccountCashRounding extends Base {
    static pythonModel = "account.cash.rounding";
}

registry.category("pos_available_models").add(AccountCashRounding.pythonModel, AccountCashRounding);
