import { LandingPage } from "@pos_self/app/pages/landing_page/landing_page";
import { patch } from "@web/core/utils/patch";

patch(LandingPage.prototype, {
    onWillStart() {
        if (this.selfOrder.config.self_ordering_mode === "kiosk") {
            const orders = this.selfOrder.models["pos.order"].getAll();
            for (const order of orders) {
                order.delete();
            }
            this.selfOrder.selectedOrderUuid = null;
        }
    },
    start() {
        if (
            this.draftOrder.length > 0 &&
            this.selfOrder.config.self_ordering_pay_after === "each"
        ) {
            return;
        }
        if (this.selfOrder.hasPresets() && !this.selfOrder.currentOrder.preset_id) {
            this.router.navigate("location");
        } else {
            this.router.navigate("product_list");
        }
    },
    clickCustomLink(link) {
        const arrayLink = link.url.split("/");
        const routeName = arrayLink[arrayLink.length - 1];

        if (routeName !== "products") {
            this.router.customLink(link);
            return;
        }

        this.start();
    },
    clickMyOrder() {
        this.router.navigate(this.draftOrder.length > 0 ? "cart" : "orderHistory");
    },

    showMyOrderBtn() {
        const ordersNotDraft = this.selfOrder.models["pos.order"].find((o) => o.access_token);
        return this.selfOrder.ordering && ordersNotDraft;
    },
    hideBtn(link) {
        const arrayLink = link.url.split("/");
        const routeName = arrayLink[arrayLink.length - 1];

        if (routeName !== "products") {
            return;
        }

        return (
            this.draftOrder.length > 0 && this.selfOrder.config.self_ordering_pay_after === "each"
        );
    },
});
