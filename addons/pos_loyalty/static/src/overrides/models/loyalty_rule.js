/** @odoo-module */

import { registry } from "@web/core/registry";
import { Base } from "@point_of_sale/app/models/related_models";

export class LoyaltyRule extends Base {
    static pythonModel = "loyalty.rule";
}

registry.category("pos_available_models").add(LoyaltyRule.pythonModel, LoyaltyRule);
