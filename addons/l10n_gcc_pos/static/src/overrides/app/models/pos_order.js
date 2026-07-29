import { PosOrder } from "@point_of_sale/app/models/pos_order";
import { patch } from "@web/core/utils/patch";
import { _t } from "@web/core/l10n/translation";

const EXCLUDE_IF_NOT_REGISTERED = ['AE', 'SA', 'OM'];
const GCC_COUNTRIES = ['SA', 'AE', 'BH', 'OM', 'QA', 'KW'];

patch(PosOrder.prototype, {
    export_for_printing(baseUrl, headerData) {
        const results = super.export_for_printing(...arguments);
        const country = this.company.country_id?.code;
        results.use_gcc_report =
            GCC_COUNTRIES.includes(country) &&
            (this.company.vat || !EXCLUDE_IF_NOT_REGISTERED.includes(country));
        if (results.use_gcc_report) {
            results.label_total = _t("TOTAL / اﻹجمالي");
            results.label_rounding = _t("Rounding / التقريب");
            results.label_change = _t("CHANGE / الباقي");
            results.label_discounts = _t("Discounts / الخصومات");
        }
        results.is_settlement = this.is_settlement();
        return results;
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
            !!this.payment_ids.filter(
                (paymentline) =>
                    paymentline.payment_method_id.type === "pay_later" && paymentline.amount < 0
            ).length
        );
    },

});
