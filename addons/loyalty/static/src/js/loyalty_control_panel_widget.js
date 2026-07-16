import { registry } from "@web/core/registry";
import { X2ManyField, one2ManyField } from "@web/views/fields/x2many/x2many_field";

export class LoyaltyX2ManyField extends X2ManyField {
    static template = "loyalty.LoyaltyX2ManyField";
}

export const loyaltyX2ManyField = {
    ...one2ManyField,
    component: LoyaltyX2ManyField,
};

registry.category("fields").add("loyalty_one2many", loyaltyX2ManyField);
