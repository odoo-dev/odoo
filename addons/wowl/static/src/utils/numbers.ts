import { intersperse } from "./strings";

/**
 * Formats a number into a string representing a float.
 * @param {number|false} value
 * @param {Object} options - additional options
 * @param {number} [options.precision=2] - number of digits to keep after decimal point
 * @param {string} [options.decimalPoint="."] - decimal separating character
 * @param {string} [options.thousandsSep=""] - thousands separator to insert
 * @param {number[]} [options.grouping]
 *   array of relative offsets at which to insert `thousandsSep`.
 *   See `numbers.insertThousandsSep` method.
 * @returns string
 */
export function formatFloat(
  value: number | false,
  options: {
    precision?: number;
    decimalPoint?: string;
    thousandsSep?: string;
    grouping?: number[];
  } = {}
): string {
  if (value === false) {
    return "";
  }
  const formatted = value.toFixed(options.precision || 2).split(".");
  if (options.grouping || options.thousandsSep) {
    formatted[0] = insertThousandsSep(+formatted[0], options.thousandsSep, options.grouping);
  }
  return formatted.join(options.decimalPoint || ".");
}

/**
 * Insert "thousands" separators in the provided number.
 *
 * @param {integer} [num] integer number
 * @param {string} [thousandsSep=","] the separator to insert
 * @param {number[]} [grouping=[3,0]]
 *   array of relative offsets at which to insert `thousandsSep`.
 *   See `strings.intersperse` method.
 */
export function insertThousandsSep(
  num: number,
  thousandsSep: string = ",",
  grouping: number[] = [3, 0]
): string {
  let numStr = `${num}`;
  const negative = numStr[0] === "-";
  numStr = negative ? numStr.slice(1) : numStr;
  return (negative ? "-" : "") + intersperse(numStr, grouping, thousandsSep);
}

/**
 * Parses a string into a number.
 * @param {String} value
 * @param {Object} options - additional options
 * @param {String|RegExp} options.thousandsSepSelector - the thousands separator used in the value
 * @param {String|RegExp} options.decimalPointSelector - the decimal point used in the value
 * @returns Number
 */
export function parseNumber(
  value: string,
  options: { thousandsSepSelector?: string | RegExp; decimalPointSelector?: string | RegExp } = {}
): number {
  value = value.replace(options.thousandsSepSelector || ",", "");
  value = value.replace(options.decimalPointSelector || ".", ".");
  return Number(value);
}
