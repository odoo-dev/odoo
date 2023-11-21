/** @odoo-module */
import { registry } from "@web/core/registry";
import { Base } from "./related_models";

export class ResPartner extends Base {
    static pythonModel = "res.partner";
}

registry.category("pos_available_models").add(ResPartner.pythonModel, ResPartner);
