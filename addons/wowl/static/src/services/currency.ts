import { OdooEnv, Service } from "../types";
import { escapeRegExp, sprintf } from "../utils/strings";

export type Currency = {
  id: number;
  name: string;
  symbol: string;
  position: "after" | "before";
  digits: [number, number];
};

export interface Currencies {
  [id: number]: Currency;
  [name: string]: Currency;
}

type CurrencyId = keyof Currencies;

export interface CurrencyService {
  getAll(): Currency[];
  get(c: CurrencyId): Currency | undefined;
  /**
   * Returns a string representing a monetary value. The result takes into account
   * the user settings (to display the correct decimal separator, currency, ...).
   *
   * @param {float} [value] the value that should be formatted
   * @param {string|number} [currency]
   *        The currency name/id from which to format the value.
   * @param {Object} [options] additional options
   * @param {integer[]} [options.digits]
   *        the number of digits that should be used.
   *        Note: if the currency defines a precision, the currency's one is used.
   * @param {boolean} [options.forceString]
   *        if false, returns a string encoding the html formatted value (with
   *        whitespace encoded as '&nbsp;')
   * @param {boolean|function} [options.humanReadable]
   *        if returns true, calls localization.humanNumber
   * @param {boolean|function} [options.noSymbol] if true, no currency symbol outputs.
   * @returns {string}
   */
  format(
    value: number,
    currency: CurrencyId,
    options?: {
      digits?: Currency["digits"];
      forceString?: boolean;
      humanReadable?: boolean | ((value: number) => boolean);
      noSymbol?: boolean;
    }
  ): string;
  /**
   * Parse a String containing currency symbol and returns amount
   *
   * @param {string} value
   *        The string to be parsed
   *        We assume that a monetary is always a pair (symbol, amount) separated
   *        by a non breaking space. A simple float can also be accepted as value
   * @param {string|number} currency
   *        The currency name/id from which to parse the value.
   * @returns {float} the float value contained in the string representation
   * @throws {Error} if no float is found or if parameter does not respect monetary condition
   */
  parse(value: string, currency: CurrencyId): number;
}

export const currencyService: Service<CurrencyService> = {
  name: "currency",
  dependencies: ["localization"],
  deploy: async (env: OdooEnv): Promise<CurrencyService> => {
    const { currencies } = odoo.session_info;

    const getAll: CurrencyService["getAll"] = () => Object.values(currencies);
    const get: CurrencyService["get"] = (cid) => {
      if (typeof cid === "number") {
        return currencies[cid];
      }
      return getAll().find((c) => c.name === cid);
    };

    const format: CurrencyService["format"] = (value, cid, options) => {
      const currency = get(cid);
      const { digits, forceString, humanReadable, noSymbol } = options || {};
      let formatted_value = env.services.localization.formatFloat(value, null, {
        digits: (currency && currency.digits) || digits,
        humanReadable,
      });
      if (!currency || noSymbol) {
        return formatted_value;
      }
      const ws = forceString ? " " : "&nbsp;";
      if (currency.position === "after") {
        return formatted_value + ws + currency.symbol;
      } else {
        return currency.symbol + ws + formatted_value;
      }
    };

    const parse: CurrencyService["parse"] = (value, c) => {
      const currency = get(c);
      if (!currency) {
        throw new Error(sprintf(env._t("Parsing value '%s': currency not found"), value));
      }
      const { position, symbol } = currency;
      if (
        (position === "before" && !value.startsWith(symbol)) ||
        (position === "after" && !value.endsWith(symbol))
      ) {
        throw new Error(
          sprintf(env._t("'%s' is not a correct '%s' monetary field"), value, currency.name)
        );
      }
      value = position === "before" ? value.slice(symbol.length) : value.slice(0, -symbol.length);
      value = value.replace(new RegExp(escapeRegExp("&nbsp;")), "").trim();
      return env.services.localization.parseFloat(value);
    };

    return { get, getAll, format, parse };
  },
};
