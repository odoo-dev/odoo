import { PosStore } from "@point_of_sale/app/store/pos_store";
import { EventBus } from "@odoo/owl";
import { patch } from "@web/core/utils/patch";

patch(PosStore.prototype, {
    async setup() {
        await super.setup(...arguments);
        this.bus = new EventBus();
    },
    postSyncAllOrders(orders) {
        super.postSyncAllOrders(...arguments);
        orders.forEach(order => {
            this.bus.trigger('order_synchronized', this.env.pos, order);
        });
    }
})
