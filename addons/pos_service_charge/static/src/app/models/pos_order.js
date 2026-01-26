import { PosOrder } from "@point_of_sale/app/models/pos_order";
import { patch } from "@web/core/utils/patch";
import { accountTaxHelpers } from "@account/helpers/account_tax";

patch(PosOrder.prototype, {
    async applyServiceCharge() {
        const serviceChargeRate = this.config.service_charge_rate;
        const serviceChargeProduct = this.config.service_charge_product_id;

        const serviceChargeLines = this.lines.filter(l => l.isServiceChargeLine);
        for (const line of serviceChargeLines) {
            this.removeOrderline(line);
        }

        if (!serviceChargeRate || !serviceChargeProduct) {
             return;
        }

        const configPresetIds = this.config.service_charge_preset_ids;
        if (configPresetIds.length > 0) {
             if (!this.preset_id || !configPresetIds.some((p) => p.id === this.preset_id.id)) {
                 return;
             }
        }

        const lines = this.lines.filter(l => !l.isServiceChargeLine);
        const baseLines = lines.map((line) =>
            accountTaxHelpers.prepare_base_line_for_taxes_computation(
                line,
                line.prepareBaseLineForTaxesComputationExtraValues({
                    discount:
                        this.config.service_charge_calculation_method === "before_discount"
                            ? 0.0
                            : line.discount,
                })
            )
        );

        accountTaxHelpers.add_tax_details_in_base_lines(baseLines, this.company);
        accountTaxHelpers.round_base_lines_tax_details(baseLines, this.company);

        const groupingFunction = (base_line) => ({
            grouping_key: { product_id: serviceChargeProduct },
            raw_grouping_key: { product_id: serviceChargeProduct.id },
        });
        const serviceChargeBaseLines = accountTaxHelpers.prepare_global_discount_lines(
            baseLines,
            this.company,
            "percent",
            serviceChargeRate,
            {
                computation_key: "service_charge",
                grouping_function: groupingFunction,
            }
        );

        for (const baseLine of serviceChargeBaseLines) {
            await this.models["pos.order.line"].create({
                order_id: this,
                product_id: baseLine.product_id,
                qty: baseLine.quantity,
                price_unit: -baseLine.price_unit,
                price_type: "original",
                tax_ids: [["link", ...baseLine.tax_ids]],
            });
        }
    },

    setPreset(preset) {
        super.setPreset(preset);
        this.applyServiceCharge();
    },
});
