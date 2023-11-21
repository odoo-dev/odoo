/** @odoo-module */
import { registry } from "@web/core/registry";
import { Base } from "./related_models";

export class ResCurrency extends Base {
    static pythonModel = "res.currency";
}

registry.category("pos_available_models").add(ResCurrency.pythonModel, ResCurrency);
