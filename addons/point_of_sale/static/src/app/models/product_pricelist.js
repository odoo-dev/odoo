/** @odoo-module */
import { registry } from "@web/core/registry";
import { Base } from "./related_models";

export class ProductPricelist extends Base {
    static pythonModel = "product.pricelist";
}

registry.category("pos_available_models").add(ProductPricelist.pythonModel, ProductPricelist);
