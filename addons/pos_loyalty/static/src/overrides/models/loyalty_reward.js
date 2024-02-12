/** @odoo-module */

import { registry } from "@web/core/registry";
import { Base } from "@point_of_sale/app/models/related_models";

export class LoyaltyReward extends Base {
    static pythonModel = "loyalty.reward";
}

registry.category("pos_available_models").add(LoyaltyReward.pythonModel, LoyaltyReward);
