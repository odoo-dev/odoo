/** @odoo-module */
import { registry } from "@web/core/registry";
import { Base } from "./related_models";

export class ProductCategory extends Base {
    static pythonModel = "product.category";
}

registry.category("pos_available_models").add(ProductCategory.pythonModel, ProductCategory);
