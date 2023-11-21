/** @odoo-module */
import { registry } from "@web/core/registry";
import { Base } from "./related_models";

export class StockPickingType extends Base {
    static pythonModel = "stock.picking.type";
}

registry.category("pos_available_models").add(StockPickingType.pythonModel, StockPickingType);
