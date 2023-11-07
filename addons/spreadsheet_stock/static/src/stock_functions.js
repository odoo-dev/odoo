/** @odoo-module **/

import { _t } from "@web/core/l10n/translation";
import spreadsheet from "@spreadsheet/o_spreadsheet/o_spreadsheet_extended";
import { sprintf } from "@web/core/utils/strings";

const { functionRegistry } = spreadsheet.registries;
const { args, toBoolean, toString, toNumber, toJsDate } = spreadsheet.helpers;

const ODOO_STOCK_ARGS = `
    product_id (number) ${_t("ID of the product.")}
    location_id (number) ${_t("ID of the location.")}
    date_range (string, date) ${_t(`The date range. Supported formats are "21/12/2022", "Q1/2022", "12/2022", and "2022".`)}
    posted (boolean, default=FALSE) ${_t("Set to TRUE to include posted entries.")}
`;

functionRegistry.add("ODOO.STOCK.IN", {
    description: _t("Get the stock in data for the specified product and location."),
    args: args(ODOO_STOCK_ARGS),
    returns: ["NUMBER"],
    compute: function (product_id, location_id, date_range, posted = false) {
        product_id = toNumber(product_id);
        location_id = toNumber(location_id);
        date_range = parseStockDate(date_range);
        return this.getters.getStockIn(product_id, location_id, date_range, posted);
    },
});

functionRegistry.add("ODOO.STOCK.OUT", {
    description: _t("Get the stock out data for the specified product and location."),
    args: args(ODOO_STOCK_ARGS),
    returns: ["NUMBER"],
    compute: function (product_id, location_id, date_range, posted = false) {
        product_id = toNumber(product_id);
        location_id = toNumber(location_id);
        date_range = parseStockDate(date_range);
        return this.getters.getStockOut(product_id, location_id, date_range, posted);
    },
});

functionRegistry.add("ODOO.STOCK.OPENING", {
    description: _t("Get the opening stock data for the specified product and location."),
    args: args(ODOO_STOCK_ARGS),
    returns: ["NUMBER"],
    compute: function (product_id, location_id, date_range, posted = false) {
        product_id = toNumber(product_id);
        location_id = toNumber(location_id);
        date_range = parseStockDate(date_range);
        return this.getters.getStockOpening(product_id, location_id, date_range, posted);
    },
});

functionRegistry.add("ODOO.STOCK.CLOSING", {
    description: _t("Get the closing stock data for the specified product and location."),
    args: args(ODOO_STOCK_ARGS),
    returns: ["NUMBER"],
    compute: function (product_id, location_id, date_range, posted = false) {
        product_id = toNumber(product_id);
        location_id = toNumber(location_id);
        date_range = parseStockDate(date_range);
        return this.getters.getStockClosing(product_id, location_id, date_range, posted);
    },
});

const QuarterRegexp = /^q([1-4])\/(\d{4})$/i;
const MonthRegexp = /^0?([1-9]|1[0-2])\/(\d{4})$/i;

/**
 * @typedef {Object} YearDateRange
 * @property {"year"} rangeType
 * @property {number} year
 */

/**
 * @typedef {Object} QuarterDateRange
 * @property {"quarter"} rangeType
 * @property {number} year
 * @property {number} quarter
 */

/**
 * @typedef {Object} MonthDateRange
 * @property {"month"} rangeType
 * @property {number} year
 * @property {number} month
 */

/**
 * @typedef {Object} DayDateRange
 * @property {"day"} rangeType
 * @property {number} year
 * @property {number} month
 * @property {number} day
 */

/**
 * @typedef {YearDateRange | QuarterDateRange | MonthDateRange | DayDateRange} DateRange
 */

/**
 * @param {string} dateRange
 * @returns {QuarterDateRange | undefined}
 */
function parseAccountingQuarter(dateRange) {
    const found = dateRange.match(QuarterRegexp);
    return found
        ? {
              rangeType: "quarter",
              year: toNumber(found[2]),
              quarter: toNumber(found[1]),
          }
        : undefined;
}

/**
 * @param {string} dateRange
 * @returns {MonthDateRange | undefined}
 */
function parseAccountingMonth(dateRange) {
    const found = dateRange.match(MonthRegexp);
    return found
        ? {
              rangeType: "month",
              year: toNumber(found[2]),
              month: toNumber(found[1]),
          }
        : undefined;
}

/**
 * @param {string} dateRange
 * @returns {YearDateRange | undefined}
 */
function parseAccountingYear(dateRange) {
    const dateNumber = toNumber(dateRange);
    // This allows a bit of flexibility for the user if they were to input a
    // numeric value instead of a year.
    // Users won't need to fetch accounting info for year 3000 before a long time
    // And the numeric value 3000 corresponds to 18th march 1908, so it's not an
    //issue to prevent them from fetching accounting data prior to that date.
    if (dateNumber < 3000) {
        return { rangeType: "year", year: dateNumber };
    }
    return undefined;
}

/**
 * @param {string} dateRange
 * @returns {DayDateRange}
 */
function parseAccountingDay(dateRange) {
    const dateNumber = toNumber(dateRange);
    return {
        rangeType: "day",
        year: functionRegistry.get("YEAR").compute(dateNumber),
        month: functionRegistry.get("MONTH").compute(dateNumber),
        day: functionRegistry.get("DAY").compute(dateNumber),
    };
}

/**
 * @param {string | number} dateRange
 * @returns {DateRange}
 */
export function parseStockDate(dateRange) {
    try {
        dateRange = toString(dateRange).trim();
        return (
            parseAccountingQuarter(dateRange) ||
            parseAccountingMonth(dateRange) ||
            parseAccountingYear(dateRange) ||
            parseAccountingDay(dateRange)
        );
    } catch (_) {
        throw new Error(
            sprintf(
                _t(
                    `'%s' is not a valid period. Supported formats are "21/12/2022", "Q1/2022", "12/2022", and "2022".`
                ),
                dateRange
            )
        );
    }
}
