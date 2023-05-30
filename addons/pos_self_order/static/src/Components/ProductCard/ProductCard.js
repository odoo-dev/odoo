/** @odoo-module */

import { Component } from "@odoo/owl";
import { useSelfOrder } from "@pos_self_order/SelfOrderService";
import { useForwardRefToParent } from "@web/core/utils/hooks";

export class ProductCard extends Component {
    static template = "pos_self_order.ProductCard";
    static props = ["product", "line?", "currentProductCard?", "class?"];
    static defaultProps = { class: "" };

    setup() {
        this.selfOrder = useSelfOrder();
        useForwardRefToParent("currentProductCard");
    }

    get quantityInCart() {
        return this.selfOrder.currentOrder.lines.find((o) => o.product_id === this.props.product.id)
            ?.qty;
    }

    // FIXME: we need to verify the product name for future attribute variants
    // in case of variants, we need to show the main product screen with "add" btn
    // if the user select the same variant as an existing orderline, we merge it.
    clickOnProduct() {
        const product = this.props.product;
        if (!this.canOpenProductMainView(product)) {
            return;
        }
        this.env.navigate("/products/" + product.id);
    }

    canOpenProductMainView(product) {
        return (
            this.selfOrder.table ||
            product.has_image ||
            product.description_sale ||
            product.attributes.length
        );
    }

    getQtyInCartString() {
        // FIXME need to implement price_extra
        const productId = this.props.line.product_id;
        return `${this.props.line.qty} x ${this.selfOrder.productByIds[productId].priceWithTax}`;
    }

    getTotalPriceString() {
        const productPriceWithTax = this.props.product.priceWithTax;
        const quantity = this.props.line?.qty ? this.props.line.qty : 1;
        return this.selfOrder.formatMonetary(productPriceWithTax * quantity);
    }
}
