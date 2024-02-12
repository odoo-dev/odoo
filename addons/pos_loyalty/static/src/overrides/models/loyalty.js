/** @odoo-module **/

import { registry } from "@web/core/registry";
import { Base } from "@point_of_sale/app/models/related_models";

let nextId = -1;

export function loyaltyIdsGenerator() {
    return nextId--;
}

export class LoyaltyCard extends Base {
    static pythonModel = "loyalty.card";

    isExpired() {
        return this.expiration_date && this.expiration_date < new Date();
    }
}

registry.category("pos_available_models").add(LoyaltyCard.pythonModel, LoyaltyCard);
