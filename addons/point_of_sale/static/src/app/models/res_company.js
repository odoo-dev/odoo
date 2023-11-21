/** @odoo-module */
import { registry } from "@web/core/registry";
import { Base } from "./related_models";

export class ResCompany extends Base {
    static pythonModel = "res.company";
}

registry.category("pos_available_models").add(ResCompany.pythonModel, ResCompany);
