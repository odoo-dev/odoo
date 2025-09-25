import { formatMonetary } from "@web/views/fields/formatters";

export const formatCurrency = (value, currency, hasSymbol = true) =>
    formatMonetary(value, {
        currencyId: currency.id,
        noSymbol: !hasSymbol,
    });

export const roundCurrency = (value, currency) => currency.round(value);

export function convertCurrency(fromAmount, currency, { round = true, inverse = false } = {}) {
    if (!fromAmount || !currency.rate) {
        return 0.0;
    }
    const rate = inverse ? currency.inverse_rate : currency.rate;
    const amount = fromAmount * rate;

    return round ? roundCurrency(amount, currency) : amount;
}
