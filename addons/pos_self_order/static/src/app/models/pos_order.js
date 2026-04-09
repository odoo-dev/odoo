import { PosOrder } from "@point_of_sale/app/models/pos_order";
import { patch } from "@web/core/utils/patch";

patch(PosOrder.prototype, {
    setup() {
        super.setup(...arguments);
    },
    initState() {
        super.initState();
        this.uiState = {
            ...this.uiState,
            lineChanges: this.uiState.lineChanges || {},
            receiptReady: false,
        };
    },
    get unsentLines() {
        return this.lines.filter(
            (l) =>
                !this.uiState.lineChanges[l.uuid] ||
                this.uiState.lineChanges[l.uuid].qty !== l.qty ||
                Object.keys(this.uiState.lineChanges).some(
                    (uuid) => !this.lines.find((line) => line.uuid === uuid)
                )
        );
    },
    get changes() {
        const changes = this.lines.reduce((acc, line) => {
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

        // 🔥 Add removed lines
        const currentUUIDs = new Set(this.lines.map((l) => l.uuid));
        for (const uuid in this.uiState.lineChanges) {
            if (!currentUUIDs.has(uuid)) {
                changes[uuid] = -this.uiState.lineChanges[uuid].qty;
            }
        }

        return changes;
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
        return data;
    },
});
