import { PosConfig } from "@point_of_sale/app/models/pos_config";
import { PosOrderlineAccounting } from "@point_of_sale/app/models/accounting/pos_order_line_accounting";
import { patch } from "@web/core/utils/patch";

patch(PosConfig.prototype, {
    handlePricesComputation() {
        super.handlePricesComputation();
        const lineModel = this.models["pos.order.line"];

        const recomputeServiceCharge = (ids, fields) => {
            const fieldTargetted = fields?.some((field) =>
                PosOrderlineAccounting.accountingFields.has(field)
            );

            if (fieldTargetted || !fields) {
                const lines = lineModel.readMany(ids);
                const orderIds = new Set(lines.map((l) => l.raw.order_id));
                const orders = this.models["pos.order"].readMany([...orderIds]);
                orders.forEach((order) => {
                    const triggeringLines = lines.filter(l => ids.includes(l.id));
                    const isServiceChargeUpdate = triggeringLines.some(l => l.isServiceChargeLine);

                    if (!isServiceChargeUpdate) {
                        order.applyServiceCharge();
                    }
                });
            }
        };

        lineModel.addEventListener("create", (data) => recomputeServiceCharge(data.ids));
        lineModel.addEventListener("update", (data) => recomputeServiceCharge([data.id], data.fields));
    }
});
