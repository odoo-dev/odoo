import { PosStore, CONSOLE_COLOR } from "@point_of_sale/app/services/pos_store";
import { patch } from "@web/core/utils/patch";
import { logPosMessage } from "@point_of_sale/app/utils/pretty_console_log";

patch(PosStore.prototype, {
    async setup() {
        await super.setup(...arguments);
        this.printingQueue = [];

        if (this.config.self_ordering_mode === "mobile") {
            this.data.connectWebSocket("SELF_ORDER_KITCHEN_PRINT", (notification) => {
                const orderId = notification["pos.order"][0].id;
                if (!orderId) {
                    return;
                }
                if (document.visibilityState === "visible") {
                    this.printSelfOrderKitchenPrint(orderId);
                } else {
                    this.printingQueue.push(() => this.printSelfOrderKitchenPrint(orderId));
                }
            });
        }
        window.addEventListener("visibilitychange", async () => {
            if (document.visibilityState === "visible") {
                while (this.printingQueue.length > 0) {
                    await this.printingQueue.shift()();
                }
            }
        });
    },

    async printSelfOrderKitchenPrint(orderId) {
        try {
            const result = await this.data.callRelated("pos.order", "get_order_to_kitchen_print", [
                orderId,
            ]);
            const order = result["pos.order"][0];
            await this.sendOrderInPreparation(order);
        } catch {
            logPosMessage(
                "Store",
                "printSelfOrderKitchenPrint",
                "Another instance is already printing the kitchen Print",
                CONSOLE_COLOR
            );
        }
    },

    async getServerOrders() {
        if (this.session._self_ordering) {
            await this.loadServerOrders([
                ["company_id", "=", this.config.company_id.id],
                ["state", "=", "draft"],
                "|",
                ["pos_reference", "ilike", "Kiosk"],
                ["pos_reference", "ilike", "Self-Order"],
                ["table_id", "=", false],
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
