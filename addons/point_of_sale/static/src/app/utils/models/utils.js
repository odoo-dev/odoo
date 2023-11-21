/** @odoo-module */
import { formatMonetary } from "@web/views/fields/formatters";

export const formatCurrency = (value, currency, hasSymbol = true) => {
    return formatMonetary(value, {
        currencyId: currency.id,
        noSymbol: !hasSymbol,
    });
};
