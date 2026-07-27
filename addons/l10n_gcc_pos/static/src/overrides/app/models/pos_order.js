import { PosOrder } from "@point_of_sale/app/models/pos_order";
import { patch } from "@web/core/utils/patch";
import { _t } from "@web/core/l10n/translation";

const EXCLUDE_IF_NOT_REGISTERED = ['AE', 'SA'];
const GCC_COUNTRIES = ['SA', 'AE', 'BH', 'OM', 'QA', 'KW'];

patch(PosOrder.prototype, {
    export_for_printing(baseUrl, headerData) {
        const results = super.export_for_printing(...arguments);
        const country = this.pos.company.country?.code;
        results.use_gcc_report =
            GCC_COUNTRIES.includes(country) &&
            (this.pos.company.vat || !EXCLUDE_IF_NOT_REGISTERED.includes(country));
        if (results.use_gcc_report) {
            results.label_total = _t("TOTAL / اﻹجمالي");
            results.label_rounding = _t("Rounding / التقريب");
            results.label_change = _t("CHANGE / الباقي");
            results.label_discounts = _t("Discounts / الخصومات");
        }
        return results;
    },
});
