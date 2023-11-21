/** @odoo-module */
import { registry } from "@web/core/registry";
import { Base } from "./related_models";

export class PosBill extends Base {
    static pythonModel = "pos.bill";
}

registry.category("pos_available_models").add(PosBill.pythonModel, PosBill);
