import { PosStore } from "@point_of_sale/app/services/pos_store";
import { patch } from "@web/core/utils/patch";
import { Domain } from "@web/core/domain";
import { _t } from "@web/core/l10n/translation";
import { TableJoinRequestsDialog } from "@pos_self_order/overrides/components/table_join_requests_dialog/table_join_requests_dialog";
import { rpc } from "@web/core/network/rpc";

patch(PosStore.prototype, {
    async afterProcessServerData() {
        this.initTableJoinRequests();
        if (this.config.self_order_secure_session) {
            this.data.connectWebSocket("TABLE_JOIN_REQUEST", (payload) =>
                this.addTableJoinRequest(payload)
            );
            this.data.connectWebSocket("TABLE_JOIN_STATUS", ({ request_id }) =>
                this.removeTableJoinRequest(request_id)
            );
        }
        return super.afterProcessServerData(...arguments);
    },
    /**
     * Pending self-order join requests per table id: [{ request_id, time }]. Rebuilt from the
     * loaded table orders, so that requests received while the POS was closed are not lost.
     */
    initTableJoinRequests() {
        this.tableJoinRequests = {};
        for (const order of this.models["pos.order"].filter((o) => o.state === "draft")) {
            // Sent instead of the guest data, which holds secrets (see `_load_pos_data_read`)
            for (const request of order.raw?._table_join_requests || []) {
                this.addTableJoinRequest({
                    table_id: order.table_id?.id,
                    request_id: request.id,
                    time: request.time,
                });
            }
        }
    },
    addTableJoinRequest({ table_id, request_id, time }) {
        if (!table_id) {
            return;
        }
        this.removeTableJoinRequest(request_id);
        (this.tableJoinRequests[table_id] ??= []).push({ request_id, time });
    },
    removeTableJoinRequest(requestId) {
        for (const [tableId, requests] of Object.entries(this.tableJoinRequests)) {
            const remaining = requests.filter((r) => r.request_id !== requestId);
            if (remaining.length) {
                this.tableJoinRequests[tableId] = remaining;
            } else {
                delete this.tableJoinRequests[tableId];
            }
        }
    },
    getTableJoinRequests(table) {
        return this.tableJoinRequests?.[table.id] || [];
    },
    openTableJoinRequests(table) {
        this.dialog.add(TableJoinRequestsDialog, { table });
    },
    async answerTableJoinRequest(table, request, action) {
        const { status } = await rpc("/pos-self-order/table/guest-action", {
            config_id: this.config.id,
            table_id: table.id,
            request_id: request.request_id,
            action,
        });
        // Also removed by the TABLE_JOIN_STATUS notification, unless it was already answered
        this.removeTableJoinRequest(request.request_id);
        if (status === "not_found") {
            this.notification.add(_t("This request has already been answered."));
        }
    },
    getServerOrdersDomain() {
        const base = super.getServerOrdersDomain();
        if (this.session._self_ordering) {
            return Domain.or([
                base,
                new Domain([
                    ["company_id", "=", this.config.company_id.id],
                    ["state", "=", "draft"],
                    ["source", "=", "kiosk"],
                ]),
            ]);
        }
        return base;
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
