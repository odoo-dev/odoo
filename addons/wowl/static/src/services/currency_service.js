/** @odoo-module **/

import { formatFloat, humanNumber } from "../utils/numbers";
import { serviceRegistry } from "../webclient/service_registry";

export const currencyService = {
  dependencies: ["localization"],
  deploy(env) {
    const { currencies } = odoo.session_info;
    const getAll = () => Object.values(currencies);
    const get = (cid) => {
      if (typeof cid === "number") {
        return currencies[cid];
      }
      return getAll().find((c) => c.name === cid);
    };
    const format = (value, cid, options = {}) => {
      if (value === false) {
        return "";
      }
      const currency = get(cid);
      const { noSymbol } = options || {};
      const digits = (currency && currency.digits) || options.digits;

      const formatted = options.humanReadable
        ? humanNumber(value)
        : formatFloat(value, { precision: digits && digits[1] });
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

serviceRegistry.add("currency", currencyService);
