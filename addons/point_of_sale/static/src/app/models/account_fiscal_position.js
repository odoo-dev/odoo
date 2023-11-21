/** @odoo-module */
import { registry } from "@web/core/registry";
import { Base } from "./related_models";

export class AccountFiscalPosition extends Base {
    static pythonModel = "account.fiscal.position";
}

registry
    .category("pos_available_models")
    .add(AccountFiscalPosition.pythonModel, AccountFiscalPosition);
