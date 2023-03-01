/** @odoo-module */
import { Component, whenReady, App, useState, onWillStart, useSubEnv } from "@odoo/owl";
import { makeEnv, startServices } from "@web/env";
import { setLoadXmlDefaultApp, templates } from "@web/core/assets";
import { _t } from "@web/core/l10n/translation";
import { LandingPage } from "@pos_self_order/LandingPageComponents/LandingPage/LandingPage";
import { NavBar } from "@pos_self_order/NavBar/NavBar";
import { ProductMainView } from "@pos_self_order/ProductMainView/ProductMainView";
import { ProductList } from "@pos_self_order/ProductList/ProductList";
import { useService } from "@web/core/utils/hooks";
import { useSelfOrder } from "@pos_self_order/SelfOrderService";
import { effect } from "@point_of_sale/utils";
/**
 * @typedef {import("@pos_self_order/jsDocTypes").Product} Product
 * @typedef {import("@pos_self_order/jsDocTypes").Order} Order
 * @typedef {import("@pos_self_order/jsDocTypes").CartItem} CartItem
 */
class SelfOrderRoot extends Component {
    /*
    This is the Root Component of the SelfOrder App
    Most of the business logic is done here
    The app has the folowing screens:
    0. LandingPage  -- the main screen of the app
                    -- it has a button that redirects to the menu
    1. ProductList -- the screen that shows the list of products ( the menu )
    2. ProductMainView  -- the screen that shows the details of a product ( the product page )
    */
    setup() {
        this.selfOrder = useSelfOrder();
        /**
         * @type {{
         * currentScreen: number,
         * currentProduct: number,
         * cart: CartItem[],
         * currentOrderDetails: Object,
         * message_to_display: string,
         * user_name: string,
         * table_id: string,
         * order_to_pay: Order,
         * }}
         */
        this.state = useState({
            currentScreen: 0,
            currentProduct: 0,
            // this is a message that will be displayed to the user on the landing page
            // example: "Your order has been placed successfully", "Your order has been paid successfully"
            message_to_display: this.selfOrder.config.message_to_display ?? "",
        });
        effect(
            (state) => {
                // it is possible to call the /pos-self-order route with the "message_to_display"
                // query param; the controller will put the value of this param in the "this.selfOrder.config.message_to_display"
                // variable; here we don't need this parameter anymore in the url so we remove it
                const url = new URL(location.href);
                url.searchParams.delete("message_to_display");
                window.history.replaceState({}, "", url.href);
                // we only want to display the message for 9 seconds
                setTimeout(() => {
                    state.message_to_display = "";
                }, "9000");
            },
            [this.state]
        );
        useSubEnv({ state: this.state });
        this.rpc = useService("rpc");
        onWillStart(async () => {
            this.result_from_get_menu = await this.rpc(`/pos-self-order/get-menu`, {
                pos_id: this.selfOrder.config.pos_id,
            });
            /**
             * @type {Product[]}
             */
            this.productList = this.result_from_get_menu.map(
                ({ id, pos_categ_id, price_info, ...rest }) => ({
                    product_id: id,
                    // TODO: we have to TEST if prices are correctly displayed / calculated with tax included or tax excluded
                    list_price: this.selfOrder.config.show_prices_with_tax_included
                        ? price_info["price_with_tax"]
                        : price_info["price_without_tax"],
                    // We are using a system of tags to categorize products
                    // the categories of a product will also be considered as tags
                    // ex of tags: "Pizza", "Drinks", "Italian", "Vegetarian", "Vegan", "Gluten Free","healthy", "organic",
                    // "Spicy", "Hot", "Cold", "Alcoholic", "Non Alcoholic", "Dessert", "Breakfast", "Lunch", "Dinner"
                    // "pairs well with wine", "pairs well with beer", "pairs well with soda", "pairs well with water",
                    // "HAPPY HOUR", "kids menu",  "local", "seasonal"
                    tag_list: pos_categ_id ? new Set(pos_categ_id[1].split(" / ")) : new Set(),
                    attributes: [],
                    ...rest,
                })
            );
            this.productList.forEach((product) => {
                if (
                    !product.attribute_line_ids.some(
                        (id) => id in this.selfOrder.config.attributes_by_ptal_id
                    )
                ) {
                    return;
                }
                product.attributes = product.attribute_line_ids
                    .map((id) => this.selfOrder.config.attributes_by_ptal_id[id])
                    .filter((attr) => attr !== undefined);
            });
        });
    }

    viewLandingPage() {
        this.state.currentScreen = 0;
    }
    viewMenu() {
        this.state.currentScreen = 1;
    }
    viewProduct = (id) => {
        this.state.currentScreen = 2;
        this.state.currentProduct = id;
    };

    static components = {
        LandingPage,
        ProductMainView,
        NavBar,
        ProductList,
    };
}
SelfOrderRoot.template = "SelfOrderRoot";
export async function createPublicRoot() {
    await whenReady();
    const wowlEnv = makeEnv();
    await startServices(wowlEnv);
    const app = new App(SelfOrderRoot, {
        templates,
        env: wowlEnv,
        dev: wowlEnv.debug,
        translateFn: _t,
        translatableAttributes: ["data-tooltip"],
    });
    setLoadXmlDefaultApp(app);
    return app.mount(document.body);
}
createPublicRoot();
export default { SelfOrderRoot, createPublicRoot };
