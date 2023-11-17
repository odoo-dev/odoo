/** @odoo-module */
import { registry } from "@web/core/registry";

export class ProductProduct {
    static pythonModel = "product.product";

    constructor(data) {
        this.setup(data);
    }

    setup(data) {
        Object.assign(this, data);
    }
}

registry.category("pos_available_models").add(ProductProduct.pythonModel, ProductProduct);
