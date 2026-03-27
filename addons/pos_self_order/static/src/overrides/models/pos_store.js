import { CONSOLE_COLOR, PosStore } from "@point_of_sale/app/services/pos_store";
import { logPosMessage } from "@point_of_sale/app/utils/pretty_console_log";
import { patch } from "@web/core/utils/patch";

patch(PosStore.prototype, {
    async setup() {
        await super.setup(...arguments);
        this.preparationPrintQueue = [];
        this.data.connectWebSocket("SELF_ORDER_KITCHEN_PRINT", (notification) => {
            const { order_id, data } = notification;
            this.models.connectNewData(data);
            const order = this.models["pos.order"].get(order_id);
            if (document.visibilityState === "visible") {
                this.printSelfOrderPreparation(order);
            } else {
                this.preparationPrintQueue.push(() => this.printSelfOrderPreparation(order));
            }
        });

        window.addEventListener("visibilitychange", async () => {
            if (document.visibilityState === "visible") {
                while (this.preparationPrintQueue.length > 0) {
                    await this.preparationPrintQueue.shift()();
                }
            }
        });
    },

    async printSelfOrderPreparation(order) {
        try {
            await this.sendOrderInPreparation(order);
        } catch {
            logPosMessage(
                "Store",
                "printSelfOrderPreparation",
                "Another instance is already printing or failed",
                CONSOLE_COLOR
            );
        }
    },

    async getServerOrders() {
        if (this.session._self_ordering) {
            await this.data.loadServerOrders([
                ["company_id", "=", this.config.company_id.id],
                ["state", "=", "draft"],
                ["source", "in", ["kiosk", "mobile"]],
                ["self_ordering_table_id", "=", false],
            ]);
        }

        return await super.getServerOrders(...arguments);
    },
    async redirectToQrForm() {
        const user_data = await this.data.call("pos.config", "get_pos_qr_order_data", [
            this.config.id,
        ]);
        return await this.action.doAction({
            type: "ir.actions.client",
            tag: "pos_qr_stands",
            params: { data: user_data },
        });
    },
});
