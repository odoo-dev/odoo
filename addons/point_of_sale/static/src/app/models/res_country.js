/** @odoo-module */
import { registry } from "@web/core/registry";
import { Base } from "./related_models";

export class ResCountry extends Base {
    static pythonModel = "res.country";
}

registry.category("pos_available_models").add(ResCountry.pythonModel, ResCountry);
