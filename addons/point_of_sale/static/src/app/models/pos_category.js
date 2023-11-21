/** @odoo-module */
import { registry } from "@web/core/registry";
import { Base } from "./related_models";

export class PosCategory extends Base {
    static pythonModel = "pos.category";
}

registry.category("pos_available_models").add(PosCategory.pythonModel, PosCategory);
