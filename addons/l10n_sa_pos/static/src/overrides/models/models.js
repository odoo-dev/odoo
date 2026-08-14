/** @odoo-module */

import { Order } from "@point_of_sale/app/store/models";
import { patch } from "@web/core/utils/patch";
import { computeSAQRCode, renderQRCodeDataURL } from "@l10n_sa_pos/app/utils/qr";

patch(Order.prototype, {
    export_for_printing() {
        const result = super.export_for_printing(...arguments);
        if (this.pos.company.country && this.pos.company.country.code === "SA") {
            result.is_settlement = this.is_settlement();
            if (!result.is_settlement) {
                const company = this.pos.company;
                const qr_values = this.compute_sa_qr_code(
                    company.name,
                    company.vat,
                    this.date_order.toISO(),
                    this.get_total_with_tax(),
                    this.get_total_tax()
                );
                result.qr_code = renderQRCodeDataURL(qr_values, 200);
            }
        }
        return result;
    },
    /**
     * If the order is empty (there are no products)
     * and all "pay_later" payments are negative,
     * we are settling a customer's account.
     * If the module pos_settle_due is not installed,
     * the function always returns false (since "pay_later" doesn't exist)
     * @returns {boolean} true if the current order is a settlement, else false
     */
    is_settlement() {
        return (
            this.is_empty() &&
            !!this.paymentlines.filter(
                (paymentline) =>
                    paymentline.payment_method.type === "pay_later" && paymentline.amount < 0
            ).length
        );
    },

    compute_sa_qr_code(name, vat, date_isostring, amount_total, amount_tax) {
        return computeSAQRCode(name, vat, date_isostring, amount_total, amount_tax);
    },
});
