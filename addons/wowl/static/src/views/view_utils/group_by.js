/** @odoo-module **/
import { DEFAULT_INTERVAL, INTERVAL_OPTIONS } from "./search_utils";
function errorMsg(descr) {
  return `Invalid groupBy description: ${descr}`;
}
export function getGroupBy(descr, fields) {
  let description;
  let fieldName;
  let interval;
  [fieldName, interval] = descr.split(":");
  if (!fieldName) {
    throw Error();
  }
  if (fields) {
    if (!fields[fieldName]) {
      throw Error(errorMsg(descr));
    }
    const fieldType = fields[fieldName].type;
    if (["date", "datetime"].includes(fieldType)) {
      if (!interval) {
        interval = DEFAULT_INTERVAL;
      } else if (!Object.keys(INTERVAL_OPTIONS).includes(interval)) {
        throw Error(errorMsg(descr));
      }
      description = `${fieldName}:${interval}`;
    } else if (interval) {
      throw Error(errorMsg(descr));
    } else {
      description = fieldName;
      interval = null;
    }
  } else {
    if (interval) {
      if (!Object.keys(INTERVAL_OPTIONS).includes(interval)) {
        throw Error(errorMsg(descr));
      }
      description = `${fieldName}:${interval}`;
    } else {
      description = fieldName;
      interval = null;
    }
  }
  return {
    fieldName,
    interval: interval,
    toJSON() {
      return description;
    },
  };
}
