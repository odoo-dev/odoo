/** @odoo-module */
import { registry } from "@web/core/registry";

export class ProductPricelist {
    static pythonModel = "product.pricelist";

    constructor(data) {
        this.setup(data);
    }

    setup(data) {
        Object.assign(this, data);
    }
}

registry.category("pos_available_models").add(ProductPricelist.pythonModel, ProductPricelist);
