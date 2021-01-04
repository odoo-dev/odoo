import { OdooEnv, Service } from "../types";

export type Currency = {
  id: number;
  name: string;
  symbol: string;
  position: "after" | "before";
  digits: [number, number];
};

type CurrencyId = Currency["id"] | Currency["name"];

export interface CurrencyService {
  getAll(): Currency[];
  get(c: CurrencyId): Currency | undefined;
  /**
   * Returns a string representing a monetary value. The result takes into account
   * the user settings (to display the correct decimal separator, currency, ...).
   *
   * @param {number|false} [value] the value that should be formatted
   * @param {string|number} [currency]
   *        The currency name/id from which to format the value.
   * @param {Object} [options] additional options
   * @param {integer[]} [options.digits]
   *        the number of digits that should be used.
   *        Note: if the currency defines a precision, the currency's one is used.
   * @param {boolean} [options.humanReadable]
   *        if true, calls localization.humanNumber
   * @param {boolean|function} [options.noSymbol] if true, no currency symbol outputs.
   * @returns {string}
   */
  format(
    value: number | false,
    currency: CurrencyId,
    options?: {
      digits?: Currency["digits"];
      humanReadable?: boolean;
      noSymbol?: boolean;
    }
  ): string;
}

export const currencyService: Service<CurrencyService> = {
  name: "currency",
  dependencies: ["localization"],
  deploy: async (env: OdooEnv): Promise<CurrencyService> => {
    const { currencies } = odoo.session_info;
    const { localization: l10n } = env.services;

    const getAll: CurrencyService["getAll"] = () => Object.values(currencies);
    const get: CurrencyService["get"] = (cid) => {
      if (typeof cid === "number") {
        return currencies[cid];
      }
      return getAll().find((c) => c.name === cid);
    };

    const format: CurrencyService["format"] = (value, cid, options = {}) => {
      if (value === false) {
        return "";
      }
      const currency = get(cid);
      const { noSymbol } = options || {};
      const digits = (currency && currency.digits) || options.digits;
      const formatted = options.humanReadable
        ? l10n.humanNumber(value)
        : l10n.formatFloat(value, { precision: digits && digits[1] });
      if (!currency || noSymbol) {
        return formatted;
      }
      if (currency.position === "after") {
        return `${formatted} ${currency.symbol}`;
      } else {
        return `${currency.symbol} ${formatted}`;
      }
    };

    return { get, getAll, format };
  },
};
