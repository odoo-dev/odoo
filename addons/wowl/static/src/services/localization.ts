import { DateTime } from "luxon";
import { OdooEnv, Service } from "../types";
import { parseSmartDateInput, strftimeToLuxonFormat } from "../utils/dates";
import { escapeRegExp, intersperse, sprintf, stripAlphaDupes } from "../utils/strings";

interface LangParams {
  dateFormat: string;
  decimalPoint: string;
  direction: "ltr" | "rtl";
  grouping: number[];
  multiLang: boolean;
  timeFormat: string;
  thousandsSep: string;
}

export interface Localization extends LangParams {
  _t: typeof _t;
  /**
   * Returns a string representing a datetime.
   * Note that this is dependent on the localization settings.
   *
   * @param {DateTime} [value] Luxon DateTime object
   * @param {Object} [options] additional options
   * @param {string} [options.format] Luxon DateTime valid format
   * @param {boolean} [options.timezone=true] use the user timezone when formating the date
   * @returns {string}
   */
  formatDateTime: (value: DateTime, options?: { format?: string; timezone?: boolean }) => string;
  /**
   * Returns a string representing a float.  The result takes into account the
   * user settings (to display the correct decimal separator).
   *
   * @param {float|false} value the value that should be formatted
   * @param {Object} [field] a description of the field (returned by fields_get
   *   for example).  It may contain a description of the number of digits that
   *   should be used.
   * @param {Object} [options] additional options to override the values in the
   *   python description of the field.
   * @param {integer[]} [options.digits] the number of digits that should be used,
   *   instead of the default digits precision in the field.
   * @param {function} [options.humanReadable] if returns true,
   *   formatFloat acts like utils.human_number
   * @param {integer} [options.decimals] @see humanNumber
   * @param {integer} [options.minDigits] @see humanNumber
   * @param {integer} [options.formatterCallback] @see humanNumber
   * @returns {string}
   */
  formatFloat: (
    value: number | false,
    field?: any,
    options?: {
      decimals?: number;
      minDigits?: number;
      formatterCallback?: (s: string) => string;
      digits?: [number, number];
      humanReadable?: boolean | ((value: number) => boolean);
    }
  ) => string;
  /**
   * Returns a human readable number (e.g. 34000 -> 34k).
   *
   * @param {number} number
   * @param {integer} [decimals=0]
   *        maximum number of decimals to use in human readable representation
   * @param {integer} [minDigits=1]
   *        the minimum number of digits to preserve when switching to another
   *        level of thousands (e.g. with a value of '2', 4321 will still be
   *        represented as 4321 otherwise it will be down to one digit (4k))
   * @param {function} [formatterCallback]
   *        a callback to transform the final number before adding the
   *        thousands symbol (default to adding thousands separators (useful
   *        if minDigits > 1))
   * @returns {string}
   */
  humanNumber: (
    number: number,
    decimals?: number,
    minDigits?: number,
    formatterCallback?: (s: string) => string
  ) => string;
  /**
   * Insert "thousands" separators in the provided number (which is actually a string)
   *
   * @param {String} num
   * @returns {String}
   */
  insertThousandsSep: (number: string) => string;
  langDateFormat: string;
  langDateTimeFormat: string;
  langTimeFormat: string;
  /**
   * Create an Date object
   * The method toJSON return the formated value to send value server side
   *
   * @param {string} value
   * @param {Object} [options] additional options
   * @param {boolean} [options.timezone=false] parse the date then apply the timezone offset
   * @param {boolean} [options.fromISO8601=false] parse the date from ISO8601 format
   * @returns {DateTime} Luxon DateTime object
   */
  parseDate: (value: string, options?: { timezone?: boolean; fromISO8601?: boolean }) => DateTime;
  /**
   * Create an Date object
   * The method toJSON return the formated value to send value server side
   *
   * @param {string} value
   * @param {Object} [options] additional options
   * @param {boolean} [options.timezone=false] parse the date then apply the timezone offset
   * @param {boolean} [options.fromISO8601=false] parse the date from ISO8601 format
   * @param {boolean} [options.dateOnly=false] parse the date without the time
   * @returns {DateTime} Luxon DateTime object
   */
  parseDateTime: (
    value: string,
    options?: { timezone?: boolean; fromISO8601?: boolean; dateOnly?: boolean }
  ) => DateTime;
  /**
   * Parse a String containing float in language formating
   *
   * @param {string} value
   *        he string to be parsed with the setting of thousands and decimal separator
   * @returns {float}
   * @throws {Error} if no float is found respecting the language configuration
   */
  parseFloat: (value: string) => number;
  /**
   * Parse a String containing number in language formating
   *
   * @param {string} value
   *        The string to be parsed with the setting of thousands and decimal separator
   * @returns {float|NaN} the number value contained in the string representation
   */
  parseNumber: (value: string) => number;
}

export interface TranslatedTerms {
  [key: string]: string;
}

const translatedTerms: TranslatedTerms = {};

export interface LocalizationConfig {
  langParams: Partial<LangParams>;
  terms: TranslatedTerms;
}

/**
 * Eager translation function, performs translation immediately at call.
 */
function _t(str: string): string {
  return translatedTerms[str] || str;
}

export interface Stringifiable {
  toString: () => string;
}

/**
 * Lazy translation function, only performs the translation when actually
 * printed (e.g. inserted into a template).
 * Useful when defining translatable strings in code evaluated before the
 * translations are loaded, as class attributes or at the top-level of
 * an Odoo Web module
 */
export function _lt(str: string): Stringifiable {
  return { toString: () => _t(str) };
}

/*
 * Setup jQuery timeago:
 * Strings in timeago are "composed" with prefixes, words and suffixes. This
 * makes their detection by our translating system impossible. Use all literal
 * strings we're using with a translation mark here so the extractor can do its
 * job.
 */
_t("less than a minute ago");
_t("about a minute ago");
_t("%d minutes ago");
_t("about an hour ago");
_t("%d hours ago");
_t("a day ago");
_t("%d days ago");
_t("about a month ago");
_t("%d months ago");
_t("about a year ago");
_t("%d years ago");

export function makeLocalization(config: LocalizationConfig) {
  const langParams: LangParams = Object.assign(
    {
      // Default values for localization parameters
      dateFormat: "%m/%d/%Y",
      decimalPoint: ".",
      direction: "ltr",
      grouping: [],
      multiLang: false,
      thousandsSep: ",",
      timeFormat: "%H:%M:%S",
    },
    config.langParams
  );

  Object.setPrototypeOf(translatedTerms, config.terms);

  const langDateFormat = strftimeToLuxonFormat(langParams.dateFormat);
  const langDateTimeFormat = strftimeToLuxonFormat(
    `${langParams.dateFormat} ${langParams.timeFormat}`
  );
  const langTimeFormat = strftimeToLuxonFormat(langParams.timeFormat);

  const insertThousandsSep: Localization["insertThousandsSep"] = (num) => {
    const negative = num[0] === "-";
    num = negative ? num.slice(1) : num;
    return (negative ? "-" : "") + intersperse(num, langParams.grouping, langParams.thousandsSep);
  };

  const parseDate: Localization["parseDate"] = (value, options) => {
    return parseDateTime(value, Object.assign({ dateOnly: true }, options));
  };

  const parseDateTime: Localization["parseDateTime"] = (value, options = {}) => {
    let result: DateTime;
    const smartDate = parseSmartDateInput(value);
    if (smartDate) {
      result = smartDate;
    } else if (options.fromISO8601) {
      result = DateTime.fromISO(value);
    } else {
      const format = options.dateOnly ? langDateFormat : langDateTimeFormat;
      const formatWoZero = stripAlphaDupes(format);

      // Luxon is not permissive regarding non alphabetical characters for
      // formatting strings. So if the value to parse has less characters than
      // the format, we would try to parse without the separators characters.
      const woSeps = value.length < format.length && {
        val: value.replace(/\D/g, ""),
        fmt: format.replace(/\W/g, ""),
      };

      // FYI, luxon authorizes years until 275760 included...
      const check = (d: DateTime): false | DateTime => d.isValid && d.year < 10000 && d;
      result =
        check(DateTime.fromFormat(value, format)) ||
        check(DateTime.fromFormat(value, formatWoZero)) ||
        (woSeps &&
          (check(DateTime.fromFormat(woSeps.val, woSeps.fmt)) ||
            check(DateTime.fromFormat(woSeps.val, woSeps.fmt.slice(0, woSeps.val.length))))) ||
        DateTime.invalid("mandatory but unused string");
    }

    if (!result.isValid) {
      throw new Error(sprintf(_t("'%s' is not a correct datetime"), value));
    }
    if (options.timezone) {
      result = result.minus({ minutes: result.offset });
    }
    result.toJSON = function () {
      return this.setLocale("en").toFormat("yyyy-MM-dd HH:mm:ss");
    };
    return result;
  };

  const parseNumber: Localization["parseNumber"] = (value) => {
    value = value.replace(new RegExp(escapeRegExp(langParams.thousandsSep), "g"), "");
    value = value.replace(new RegExp(escapeRegExp(langParams.decimalPoint), "g"), ".");
    return Number(value);
  };

  const formatDateTime: Localization["formatDateTime"] = (value, options = { timezone: true }) => {
    if (options.timezone === undefined || options.timezone) {
      value = value.plus({ minutes: -value.toJSDate().getTimezoneOffset() });
    }
    return value.toFormat(options.format || langDateTimeFormat);
  };

  const humanNumber: Localization["humanNumber"] = (
    number,
    decimals = 0,
    minDigits = 1,
    formatterCallback = insertThousandsSep
  ) => {
    number = Math.round(number);

    const d2 = Math.pow(10, decimals);
    const val = _t("kMGTPE");
    let symbol = "";
    const numberMagnitude = +number.toExponential().split("e+")[1];
    // the case numberMagnitude >= 21 corresponds to a number
    // better expressed in the scientific format.
    if (numberMagnitude >= 21) {
      // we do not use number.toExponential(decimals) because we want to
      // avoid the possible useless O decimals: 1e.+24 preferred to 1.0e+24
      number = Math.round(number * Math.pow(10, decimals - numberMagnitude)) / d2;
      // formatterCallback seems useless here.
      return number + "e+" + numberMagnitude;
    }
    const sign = Math.sign(number);
    number = Math.abs(number);
    for (let i = val.length; i > 0; i--) {
      const s = Math.pow(10, i * 3);
      if (s <= number / Math.pow(10, minDigits - 1)) {
        number = Math.round((number * d2) / s) / d2;
        symbol = val[i - 1];
        break;
      }
    }
    number = sign * number;
    return formatterCallback("" + number) + symbol;
  };

  const formatFloat: Localization["formatFloat"] = (value, field, options = {}) => {
    if (value === false) {
      return "";
    }
    if (
      (typeof options.humanReadable === "function" && options.humanReadable(value)) ||
      (typeof options.humanReadable === "boolean" && options.humanReadable)
    ) {
      return humanNumber(value, options.decimals, options.minDigits, options.formatterCallback);
    }
    let precision: number;
    if (options.digits) {
      precision = options.digits[1];
    } else if (field && field.digits) {
      precision = field.digits[1];
    } else {
      precision = 2;
    }
    const formatted = value.toFixed(precision).split(".");
    formatted[0] = insertThousandsSep(formatted[0]);
    return formatted.join(langParams.decimalPoint);
  };

  const parseFloat: Localization["parseFloat"] = (value) => {
    const parsed = parseNumber(value);
    if (isNaN(parsed)) {
      throw new Error(sprintf(_t("'%s' is not a correct float"), value));
    }
    return parsed;
  };

  return {
    _t,
    ...langParams,
    formatDateTime,
    formatFloat,
    humanNumber,
    insertThousandsSep,
    langDateFormat,
    langDateTimeFormat,
    langTimeFormat,
    parseDate,
    parseDateTime,
    parseFloat,
    parseNumber,
  };
}

export const localizationService: Service<Localization> = {
  name: "localization",
  dependencies: ["user"],
  deploy: async (env: OdooEnv): Promise<Localization> => {
    const response = await (async function fetchLocalization(): Promise<Response> {
      const cacheHashes = odoo.session_info.cache_hashes;
      const translationsHash = cacheHashes.translations || new Date().getTime().toString();
      const lang = env.services.user.lang || null;
      let url = `/wowl/localization/${translationsHash}`;
      if (lang) {
        url += `?lang=${lang}`;
      }
      const res = await odoo.browser.fetch(url);
      if (!res.ok) {
        throw new Error("Error while fetching translations");
      }
      return res;
    })();

    const { lang_params, terms } = await response.json();
    const langParams: LangParams = {
      dateFormat: lang_params?.date_format,
      decimalPoint: lang_params?.decimal_point,
      direction: lang_params?.direction,
      grouping: lang_params?.grouping,
      multiLang: lang_params?.multi_lang,
      timeFormat: lang_params?.time_format,
      thousandsSep: lang_params?.thousands_sep,
    };

    return makeLocalization({ langParams, terms });
  },
};
