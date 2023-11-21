/** @odoo-module */
import { registry } from "@web/core/registry";
import { Base } from "./related_models";

export class UomUom extends Base {
    static pythonModel = "uom.uom";
}

registry.category("pos_available_models").add(UomUom.pythonModel, UomUom);
