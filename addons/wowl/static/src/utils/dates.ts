import { DateTime } from "luxon";

/**
 * Smart date inputs are shortcuts to write dates quicker.
 * These shortcuts should respect the format ^[+-]\d+[dmwy]?$
 *
 * e.g.
 *   "+1d" or "+1" will return now + 1 day
 *   "-2w" will return now - 2 weeks
 *   "+3m" will return now + 3 months
 *   "-4y" will return now + 4 years
 *
 * @param {string} value
 * @returns {DateTime|false} Luxon datetime object
 */
export function parseSmartDateInput(value: string): DateTime | false {
  const units: { [unit: string]: string } = {
    d: "days",
    m: "months",
    w: "weeks",
    y: "years",
  };
  const re = new RegExp(`^([+-])(\\d+)([${Object.keys(units).join("")}]?)$`);
  const match = re.exec(value);
  if (match) {
    let date = DateTime.local();
    const offset = parseInt(match[2], 10);
    const unit = units[match[3] || "d"];
    if (match[1] === "+") {
      date = date.plus({ [unit]: offset });
    } else {
      date = date.minus({ [unit]: offset });
    }
    return date;
  }
  return false;
}

// TIME

const normalize_format_table: {
  [id: string]: any;
} = {
  // Python strftime to luxon.js conversion table
  // See openerp/addons/base/views/res_lang_views.xml
  // for details about supported directives
  a: "ccc",
  A: "cccc",
  b: "LLL",
  B: "LLLL",
  d: "dd",
  H: "HH",
  I: "hh",
  j: "o",
  m: "LL",
  M: "mm",
  p: "a",
  S: "ss",
  W: "WW",
  w: "c",
  y: "yy",
  Y: "yyyy",
  c: "ccc LLL d HH:mm:ss yyyy",
  x: "LL/dd/yy",
  X: "HH:mm:ss",
  //'U': 'WW', Not supported
};

const _normalize_format_cache: {
  [id: string]: string;
} = {};

/**
 * Convert Python strftime to escaped luxon.js format.
 *
 * @param {String} value original format
 * @returns {String} valid Luxon format
 */
export function strftimeToLuxonFormat(value: string): string {
  if (_normalize_format_cache[value] === undefined) {
    const isletter = /[a-zA-Z]/,
      output = [];
    let inToken = false;

    for (let index = 0; index < value.length; ++index) {
      let character = value[index];
      if (character === "%" && !inToken) {
        inToken = true;
        continue;
      }
      if (isletter.test(character)) {
        if (inToken && normalize_format_table[character] !== undefined) {
          character = normalize_format_table[character];
        } else {
          character = "[" + character + "]"; // moment.js escape
        }
      }
      output.push(character);
      inToken = false;
    }
    _normalize_format_cache[value] = output.join("");
  }
  return _normalize_format_cache[value];
}
