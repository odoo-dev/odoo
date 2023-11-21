/** @odoo-module */
import { registry } from "@web/core/registry";
import { Base } from "./related_models";

export class PosPaymentMethod extends Base {
    static pythonModel = "pos.payment.method";
}

registry.category("pos_available_models").add(PosPaymentMethod.pythonModel, PosPaymentMethod);
