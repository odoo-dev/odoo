import { PosOrder } from "@point_of_sale/app/models/pos_order";
import { patch } from "@web/core/utils/patch";
import { getTableSessionStorageKey } from "@pos_self_order_secure/app/utils";

patch(PosOrder.prototype, {
    serializeForORM(opts = {}) {
        const data = super.serializeForORM(opts);

        // For non-table orders, no table session token is required
        const isDineIn =
            this.config?.use_presets && this.preset_id
                ? this.preset_id.service_at === "table"
                : this.config?.self_ordering_service_mode === "table";

        if (!isDineIn) {
            return data;
        }

        const configId = this.config?.id;
        let tableIdentifier = null;
        try {
            const url = new URL(window.location.href);
            tableIdentifier = url.searchParams.get("table_identifier");
        } catch (err) {
            console.warn("Could not parse table_identifier from URL:", err);
        }

        if (!tableIdentifier) {
            tableIdentifier = this.self_ordering_table_id?.identifier || this.table_id?.identifier;
        }

        if (configId && tableIdentifier) {
            try {
                const raw = localStorage.getItem(
                    getTableSessionStorageKey(configId, tableIdentifier)
                );
                if (raw) {
                    const parsed = JSON.parse(raw);
                    if (parsed && parsed.token) {
                        data.table_session_token = parsed.token;
                    }
                }
            } catch (err) {
                console.warn("Failed to retrieve table session token from localStorage:", err);
            }
        }
        return data;
    },
});
