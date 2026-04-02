import { LandingPage } from "@pos_self/app/pages/landing_page/landing_page";
import { patch } from "@web/core/utils/patch";

patch(LandingPage.prototype, {
    onWillStart() {
        const orders = this.selfOrder.models["pos.order"].getAll();
        for (const order of orders) {
            order.delete();
        }
        this.selfOrder.selectedOrderUuid = null;
    },
    start() {
        this.router.navigate("scanning");
    },
});
