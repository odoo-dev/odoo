/** @odoo-module */

import { registry } from "@web/core/registry";
import { Base } from "@point_of_sale/app/models/related_models";

export class LoyaltyProgram extends Base {
    static pythonModel = "loyalty.program";
}

registry.category("pos_available_models").add(LoyaltyProgram.pythonModel, LoyaltyProgram);
