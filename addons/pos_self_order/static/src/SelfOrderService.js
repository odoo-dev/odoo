/** @odoo-module */
import { useState } from "@odoo/owl";
import { registry } from "@web/core/registry";
import { useService } from "@web/core/utils/hooks";
import { session } from "@web/session";
import { formatMonetary } from "@web/views/fields/formatters";
import { _t } from "@web/core/l10n/translation";
import { groupBy } from "@web/core/utils/arrays";
import { effect } from "@point_of_sale/utils";

/**
 * @typedef {import("@pos_self_order/jsDocTypes").OrderLine} OrderLine
 */
export class SelfOrder {
    constructor(env, rpc, notification) {
        Object.assign(this, {
            env,
            rpc,
            notification,
            ...session.pos_self_order,
            // Global state
            currentProduct: 0,
            cart: JSON.parse(localStorage.getItem("cart")) ?? [],
            orders: JSON.parse(localStorage.getItem("orders")) ?? [],
            currentlyEditedOrderLine: null,
            page: null,
        });
        // we create a set with all the tags that are present in the menu
        this.tagList = new Set(this.products.map((product) => product.tag));
        this.productsGroupedByTag = groupBy(this.products, "tag");
        // We want to keep a backup of some of the state in local storage
        effect(
            (state) => {
                localStorage.setItem("cart", JSON.stringify(state.cart));
            },
            [this]
        );
        effect(
            (state) => {
                localStorage.setItem("orders", JSON.stringify(state.orders));
            },
            [this]
        );
    }
    setPage(page) {
        this.page = page;
        this.navigate(page, this.pos_config_id);
    }

    setCurrentlyEditedOrderLine(orderLine) {
        this.currentlyEditedOrderLine = orderLine;

        this.cart = this.cart.filter(
            (x) => JSON.stringify(x) !== JSON.stringify(this.currentlyEditedOrderLine)
        );
    }

    formatMonetary(price) {
        return formatMonetary(price, { currencyId: this.currency_id });
    }

    getTotalCartQty() {
        const cart = this.cart;
        return cart.reduce((sum, orderLine) => {
            return sum + orderLine.qty;
        }, 0);
    }
    getTotalCartCost() {
        const cart = this.cart;
        return cart.reduce((sum, orderLine) => {
            return (
                sum +
                (this.getProduct({ id: orderLine.product_id }).price_info.price_with_tax +
                    orderLine.price_extra.price_with_tax) *
                    orderLine.qty
            );
        }, 0);
    }
    getTotalCartTax = () => {
        return this._getTotalCartTax(this.cart, this.products);
    };
    /**
     * From the server, for each product we get both the price with and without tax.
     * We never actually compute taxes on the frontend.
     * Here we add up the tax for each product in the cart
     * @param {OrderLine[]} cart
     * @param {import("@pos_self_order/jsDocTypes").Product[]} products
     * @returns {number}
     */
    _getTotalCartTax(cart, products) {
        return cart.reduce((sum, orderLine) => {
            const product = this.getProduct({ id: orderLine.product_id });
            const getTax = (x) => x.price_with_tax - x.price_without_tax;
            return (
                sum + (getTax(product.price_info) + getTax(orderLine.price_extra)) * orderLine.qty
            );
        }, 0);
    }

    /**
     * @param {OrderLine} orderline
     */
    updateCart(orderline) {
        this.cart = this.getUpdatedCart(this.cart, orderline);
    }

    /**
     * Returns the cart with the updated item
     * @param {OrderLine[]} cart
     * @param {OrderLine} orderline
     * @returns {OrderLine[]}
     */
    getUpdatedCart(cart, orderline) {
        return cart
            .filter((item) => !this.canBeMerged(item, orderline))
            .concat((orderline.qty && [orderline]) || []);
    }

    canBeMerged(item, orderline) {
        return (
            this.getProduct({ id: item.product_id }).is_pos_groupable &&
            this.product_uniqueness_keys.every((key) => item[key] === orderline[key])
        );
    }
    getProduct({ id }) {
        return this.products.find((product) => product.product_id === id);
    }

    combineOrders(orders, new_order) {
        return [
            new_order,
            ...orders.filter((order) => order.pos_reference !== new_order.pos_reference),
        ];
    }

    sendOrder = async () => {
        try {
            /*
            If this is the first time the user is sending an order
            we just send the order items to the server
            If this is not the first time the user is sending an order
            ( the user is adding more items to an existing order )
            we send the order items along with the order id and access_token to the server
            */
            const postedOrder = await this.rpc(`/pos-self-order/send-order`, this.getOrderData());
            this.orders = this.combineOrders(this.orders, postedOrder);
            this.notification.add(_t("Order sent successfully"), { type: "success" });
            // we only want to clear the cart if the order was sent successfully;
            // in the case of an unsuccessful order the user might want to try again
            this.cart = [];
        } catch (error) {
            this.notification.add(_t("Error sending order"), { type: "danger" });
            console.error(error);
        } finally {
            this.navigate("/");
        }
    };
    getOrderData() {
        return {
            pos_config_id: this.pos_config_id,
            cart: this.extractCartData(this.cart),
            table_access_token: this?.table?.access_token,
            // The last order is always the first one in the array
            // The orders are kept in reverse chronological order
            order_pos_reference: this.orders?.[0]?.pos_reference,
            order_access_token: this.orders?.[0]?.access_token,
        };
    }
    /**
     * @param {import("@pos_self_order/jsDocTypes").OrderLine[]} cart
     * @returns {import("@pos_self_order/jsDocTypes").OrderLine[]}
     */
    extractCartData(cart) {
        return cart.map((orderLine) => ({
            product_id: orderLine.product_id,
            qty: orderLine.qty,
            description: orderLine.description,
            customer_note: orderLine.customer_note,
        }));
    }

    /**
     * @param {Order[]} old_orders_list
     * @returns {Order[]}
     */
    async getUpdatedOrdersFromServer(old_orders_list) {
        return await Promise.all(
            old_orders_list.map(async (order) =>
                order.state === "paid" || order.state === "done"
                    ? order
                    : await this.getUpdatedOrderFromServer(order)
            )
        );
    }
    /**
     * @param {Order} order
     * @returns {Order}
     */
    async getUpdatedOrderFromServer(order) {
        try {
            return await this.rpc(`/pos-self-order/view-order/`, {
                pos_reference: order.pos_reference,
                access_token: order.access_token,
            });
        } catch (error) {
            console.log(error);
            return (({ state, ...rest }) => ({ state: "not found", ...rest }))(order);
        }
    }
    showProductMainView(orderLine) {
        this.orderLine = orderLine;
    }
}

export const selfOrderService = {
    dependencies: ["rpc", "notification"],
    async start(env, { rpc, notification }) {
        return new SelfOrder(env, rpc, notification);
    },
};
registry.category("services").add("self_order", selfOrderService);

export function useSelfOrder() {
    return useState(useService("self_order"));
}
