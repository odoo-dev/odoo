/** @odoo-module */

import { patch } from "@web/core/utils/patch";
import { PosStore } from "@point_of_sale/app/store/pos_store";
import { renderQRCodeDataURL } from "@l10n_sa_pos/app/utils/qr";

patch(PosStore.prototype, {
    getReceiptHeaderData(order) {
        const result = super.getReceiptHeaderData(...arguments);
        const company = this.company;
        result.is_simplified =
            (order?.get_partner()?.company_type === "person" || !order?.get_partner()) &&
            company.country?.code === "SA";
        if (order && company?.country?.code === "SA") {
            result.is_settlement = order.is_settlement();
            if (!result.is_settlement) {
                const qr_values = order.compute_sa_qr_code(
                    result.company.name,
                    result.company.vat,
                    order.date_order.toISO(),
                    order.get_total_with_tax(),
                    order.get_total_tax()
                );
                result.qr_code = renderQRCodeDataURL(qr_values, 150);
            }
        }
        return result;
    },
});
