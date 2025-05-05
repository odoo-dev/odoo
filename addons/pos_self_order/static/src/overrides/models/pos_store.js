import { PosStore } from "@point_of_sale/app/services/pos_store";
import { patch } from "@web/core/utils/patch";

patch(PosStore.prototype, {
    async getServerOrders() {
        if (this.session._self_ordering) {
            const localSelfOrder = this.models["pos.order"].filter((order) => {
                return (
                    order.pos_reference &&
                    (order.pos_reference.includes("Kiosk") ||
                        order.pos_reference.includes("Self-Order")) &&
                    order.state === "draft" &&
                    order.company_id === this.config.company_id.id
                );
            });
            const res = await this.loadServerOrders([
                ["company_id", "=", this.config.company_id.id],
                ["state", "=", "draft"],
                "|",
                ["pos_reference", "ilike", "Kiosk"],
                ["pos_reference", "ilike", "Self-Order"],
                ["table_id", "=", false],
            ]);
            localSelfOrder
                .filter((order) => {
                    return !res.some((serverOrder) => {
                        return order.pos_reference === serverOrder.pos_reference;
                    });
                })
                .array.forEach((order) => {
                    this.pos.removeOrder(order, false);
                });
        }

        return await super.getServerOrders(...arguments);
    },
});
