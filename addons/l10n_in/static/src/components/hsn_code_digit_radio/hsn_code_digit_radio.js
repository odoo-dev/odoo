import { registry } from "@web/core/registry";
import { _t } from "@web/core/l10n/translation";
import { RadioField, radioField } from "@web/views/fields/radio/radio_field";

export class L10nInHsnCodeDigitRadio extends RadioField {
    static template = "l10n_in.HsnCodeDigitRadio";

    get descriptions() {
        return {
            4: _t(
                "Select this option if your aggregate annual turnover was up to ₹5 crore in the preceding financial year. A minimum of 4 digits is required on B2B, SEZ, Export and Deemed Export invoices, and on B2C invoices unless B2C HSN reporting is disabled."
            ),
            6: _t(
                "Select this option if your aggregate annual turnover exceeded ₹5 crore in the preceding financial year. A minimum of 6 digits is required on all tax invoices."
            ),
            8: _t("The full 8-digit HSN/SAC code is required on all tax invoices."),
        };
    }
}

export const l10nInHsnCodeDigitRadio = {
    ...radioField,
    component: L10nInHsnCodeDigitRadio,
};

registry.category("fields").add("l10n_in_hsn_code_digit_radio", l10nInHsnCodeDigitRadio);
