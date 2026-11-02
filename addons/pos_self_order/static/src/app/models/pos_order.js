import { PosOrder } from "@point_of_sale/app/models/pos_order";
import { patch } from "@web/core/utils/patch";
import { getTableSessionStorageKey } from "@pos_self_order/app/utils";

patch(PosOrder.prototype, {
    setup() {
        super.setup(...arguments);
    },
    initState() {
        super.initState();
        this.uiState = {
            ...this.uiState,
            lineChanges: this.uiState.lineChanges || {},
        };
    },
    get unsentLines() {
        return this.getOrderlines().filter(
            (l) =>
                !l.isTipLine() &&
                (!Object.keys(this.uiState.lineChanges).includes(l.uuid) ||
                    this.uiState.lineChanges[l.uuid].qty !== l.qty)
        );
    },
    get changes() {
        return this.lines.reduce((acc, line) => {
            // Tip isn't tracked as a change. counting it would mark an unsent change and could block payment.
            if (line.isTipLine()) {
                return acc;
            }
            const diff = line.changes;
            if (
                diff.qty ||
                diff.customer_note ||
                diff.attribute_value_ids ||
                diff.custom_attribute_value_ids
            ) {
                acc[line.uuid] = diff;
            }
            return acc;
        }, {});
    },
    get isTakeaway() {
        return this.preset_id?.service_at !== "table" && this.config.use_presets;
    },
    recomputeChanges() {
        const lines = this.lines;
        for (const line of lines) {
            if (!line.isSynced) {
                continue;
            }

            this.uiState.lineChanges[line.uuid] = {
                qty: line.qty,
                customer_note: line.customer_note,
                attribute_value_ids: JSON.stringify(
                    line.attribute_value_ids.map((a) => a.id).sort()
                ),
                custom_attribute_value_ids: JSON.stringify(
                    line.custom_attribute_value_ids.map((a) => a.id).sort()
                ),
            };
        }

        for (const uuid of Object.keys(this.uiState.lineChanges)) {
            const line = this.lines.find((l) => l.uuid === uuid);
            if (!line) {
                delete this.uiState.lineChanges[uuid];
            }
        }
    },
    serializeForORM(opts = {}) {
        const data = super.serializeForORM(opts);
        if (this.mobile && !data.mobile) {
            data.mobile = this.mobile;
        }
        if (this.email && !data.email) {
            data.email = this.email;
        }
        data.partner_id = this.raw.partner_id || false;

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
