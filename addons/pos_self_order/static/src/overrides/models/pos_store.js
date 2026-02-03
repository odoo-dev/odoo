import { PosStore } from "@point_of_sale/app/services/pos_store";
import { patch } from "@web/core/utils/patch";

patch(PosStore.prototype, {
    setup() {
        super.setup(...arguments);
        this.customerRequests = this.getCustomerRequests() || [];
        this.data.connectWebSocket(`UPDATE_CUSTOMER_REQUESTS`, (data) => {
            this.setCustomerRequests(data);
        });
    },
    setCustomerRequests(data) {
        const table_requests = this.customerRequests.find((r) => r.table_id == data.table_id);
        if (table_requests) {
            if (!table_requests.requested_services.includes(data.service)) {
                table_requests.requested_services.push(data.service);
            }
        } else {
            this.customerRequests.push({
                table_id: data.table_id,
                requested_services: [data.service],
            });
        }
        sessionStorage.setItem("customer_requests", JSON.stringify(this.customerRequests));
    },
    getCustomerRequests() {
        return JSON.parse(sessionStorage.getItem("customer_requests"));
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
