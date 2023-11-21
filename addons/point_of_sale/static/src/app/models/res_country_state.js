/** @odoo-module */
import { registry } from "@web/core/registry";
import { Base } from "./related_models";

export class ResCountryState extends Base {
    static pythonModel = "res.country.state";
}

registry.category("pos_available_models").add(ResCountryState.pythonModel, ResCountryState);
