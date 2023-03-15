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
import { Router } from "@pos_self_order/router";
class SelfOrderRoot extends Component {
    static template = "SelfOrderRoot";
    static components = {
        LandingPage,
        ProductMainView,
        NavBar,
        ProductList,
        Router,
    };
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
        this.state = useState({
            currentScreen: 0,
            currentProduct: 0,
        });
        useSubEnv({ state: this.state });
        this.rpc = useService("rpc");
        onWillStart(async () => {
            this.result_from_get_menu = await this.rpc(`/menu/get-menu`, {
                pos_id: this.selfOrder.config.pos_id,
            });
            this.productList = this.result_from_get_menu.map(
                ({ id, pos_categ_id, price_info, ...rest }) => ({
                    product_id: id,
                    // TODO: we have to TEST if prices are correctly displayed / calculated with tax included or tax excluded
                    list_price: this.selfOrder.config.show_prices_with_tax_included
                        ? price_info["price_with_tax"]
                        : price_info["price_without_tax"],
                    tagList: pos_categ_id ? new Set(pos_categ_id[1].split(" / ")) : new Set(),
                    attributes: [],
                    ...rest,
                })
            );
            // we create a set with all the tags that are present in the menu
            this.selfOrder.config.tagList = new Set(
                this.productList.map((product) => Array.from(product.tagList)).flat()
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
}
// FIXME: env.js:115 TypeError: Cannot read properties of undefined (reading 'allowed_companies')
// at computeAllowedCompanyIds
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
