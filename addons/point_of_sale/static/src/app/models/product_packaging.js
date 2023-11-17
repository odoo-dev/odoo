/** @odoo-module */
import { registry } from "@web/core/registry";

export class ProductPackaging {
    static pythonModel = "product.packaging";

    constructor(data) {
        this.setup(data);
    }

    setup(data) {
        Object.assign(this, data);
    }
}

registry.category("pos_available_models").add(ProductPackaging.pythonModel, ProductPackaging);
