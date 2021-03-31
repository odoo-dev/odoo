/** @odoo-module **/

import { PyDate, PyDateTime, PyRelativeDelta, PyTime } from "./py_date";

export const BUILTINS = {
  /**
   * @param {any} value
   * @returns {boolean}
   */
  bool(value) {
    switch (typeof value) {
      case "number":
        return value !== 0;
      case "string":
        return value !== "";
      case "boolean":
        return value;
      case "object":
        return value !== null;
    }
    return true;
  },

  time: {
    strftime(format) {
      return new PyDateTime().strftime(format);
    },
  },

  context_today() {
    return new PyDate();
  },

  get today() {
    return new PyDate().strftime("%Y-%m-%d");
  },

  get now() {
    return new PyDateTime().strftime("%Y-%m-%d %H:%M:%S");
  },

  datetime: {
    time: PyTime,
    timedelta: PyRelativeDelta,
    datetime: PyDateTime,
    date: PyDate,
  },

  relativedelta: PyRelativeDelta,
};
