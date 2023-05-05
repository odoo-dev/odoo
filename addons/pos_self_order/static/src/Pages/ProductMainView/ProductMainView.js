/** @odoo-module */

import { Component, onMounted, onWillUnmount, useRef, useState } from "@odoo/owl";
import { useSelfOrder } from "@pos_self_order/SelfOrderService";
import { NavBar } from "@pos_self_order/Components/NavBar/NavBar";
import { FloatingButton } from "@pos_self_order/Components/FloatingButton/FloatingButton";
import { IncrementCounter } from "@pos_self_order/Components/IncrementCounter/IncrementCounter";
export class ProductMainView extends Component {
    static template = "pos_self_order.ProductMainView";
    static props = { product: Object };
    static components = {
        NavBar,
        FloatingButton,
        IncrementCounter,
    };
    setup() {
        this.selfOrder = useSelfOrder();
        this.main = useRef("main");
        onMounted(() => {
            this.main.el.style.height = `${window.innerHeight}px`;
        });

        onWillUnmount(() => {
            this.selfOrder.currentlyEditedOrderLine = null;
        });

        // we want to keep track of the last product that was viewed
        this.selfOrder.currentProduct = this.props.product.product_id;
        this.privateState = useState({
            qty: this.selfOrder?.cartItem?.qty || 1,
            customer_note: this.selfOrder?.cartItem?.customer_note || "",
            selectedVariants: Object.fromEntries(
                this.props.product.attributes.map((attribute, key) => [
                    attribute.name,
                    this.selfOrder?.cartItem?.description?.split(", ")?.[key] ||
                        attribute.values[0].name,
                ])
            ),
        });
    }

    incrementQty = (up) => {
        if (up) {
            this.privateState.qty += 1;
            return;
        }
        if (this.privateState.qty >= 1) {
            this.privateState.qty -= 1;
        }
    };
    /**
     * @param {Object} selectedVariants
     * @param {[]} attributes
     * @param {"list_price" | "price_with_tax" | "price_without_tax"} type
     * @returns {Number}
     */
    getPriceExtra(selectedVariants, attributes, type = "list_price") {
        return (
            Object.entries(selectedVariants).reduce((sum, selected) => {
                return (
                    sum +
                    attributes
                        .find((attribute) => attribute.name == selected[0])
                        .values.find((value) => value.name == selected[1]).price_extra[type]
                );
            }, 0) || 0
        );
    }
    getAllPricesExtra(selectedVariants, attributes) {
        return {
            list_price: this.getPriceExtra(selectedVariants, attributes, "list_price"),
            price_without_tax: this.getPriceExtra(
                selectedVariants,
                attributes,
                "price_without_tax"
            ),
            price_with_tax: this.getPriceExtra(selectedVariants, attributes, "price_with_tax"),
        };
    }
    /**
     * The selfOrder.updateCart method expects us to give it the
     * total qty the orderline should have.
     * If we are currently editing an existing orderline ( that means that we came to this
     * page from the cart page), it means that we are editing the total qty itself,
     * so we just return privateState.qty.
     * If we came to this page from the products page, it means that we are adding items,
     * so we need to add the qty of the current product to the qty that is
     * already in the cart.
     */
    findQty() {
        return this.selfOrder.currentlyEditedOrderLine
            ? this.privateState.qty
            : (this.findMergeableOrderLine()?.qty || 0) + this.privateState.qty;
    }
    findMergeableOrderLine() {
        return this.selfOrder.cart.find((item) =>
            this.selfOrder.canBeMerged(item, this.preFormOrderline())
        );
    }

    preFormOrderline() {
        return {
            product_id: this.selfOrder.currentProduct,
            customer_note: this.privateState.customer_note,
            description: Object.values(this.privateState.selectedVariants).join(", "),
        };
    }

    formOrderLine() {
        return {
            ...this.preFormOrderline(),
            qty: this.findQty(),
            price_extra: this.getAllPricesExtra(
                this.privateState.selectedVariants,
                this.props.product.attributes
            ),
        };
    }

    addToCartButtonClicked() {
        this.selfOrder.updateCart(this.formOrderLine());
        this.selfOrder.setPage(this.returnRoute());
    }
    returnRoute() {
        return this.selfOrder.currentlyEditedOrderLine ? "/cart" : "/products";
    }
}
