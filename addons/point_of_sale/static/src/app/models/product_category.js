/** @odoo-module */
import { registry } from "@web/core/registry";

export class ProductCategory {
    static pythonModel = "product.category";

    constructor(data) {
        this.setup(data);
    }

    setup(data) {
        Object.assign(this, data);
    }
}

registry.category("pos_available_models").add(ProductCategory.pythonModel, ProductCategory);
