/** @odoo-module */
import { registry } from "@web/core/registry";
import { Base } from "./related_models";

export class ProductPackaging extends Base {
    static pythonModel = "product.packaging";
}

registry.category("pos_available_models").add(ProductPackaging.pythonModel, ProductPackaging);
