import { DateTime } from "luxon";
import { OdooEnv, Service } from "../types";
import * as dates from "../utils/dates";
import * as numbers from "../utils/numbers";
import { escapeRegExp, sprintf } from "../utils/strings";

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
   * @param {DateTime|false} [value] Luxon DateTime object
   * @param {Object} [options] additional options
   * @param {boolean} [options.timezone=true] use the user timezone when formating the date
   * @returns {string}
   */
  formatDateTime: (value: DateTime | false, options?: { timezone?: boolean }) => string;
  /**
   * Returns a string representing a float.  The result takes into account the
   * user settings (to display the correct decimal separator).
   *
   * @param {float|false} value the value that should be formatted
   * @param {Object} [options] additional options to override the values in the
   *   python description of the field.
   * @param {integer} [options.precision] number of digits to keep after decimal point
   * @returns {string}
   */
  formatFloat: (
    value: number | false,
    options?: {
      precision?: number;
    }
  ) => string;
  /**
   * Returns a human readable number (e.g. 34000 -> 34k).
   *
   * @param {number} number
   * @param {Object} options - additional options
   * @param {integer} [options.decimals=0]
   *        maximum number of decimals to use in human readable representation
   * @param {integer} [options.minDigits=1]
   *        the minimum number of digits to preserve when switching to another
   *        level of thousands (e.g. with a value of '2', 4321 will still be
   *        represented as 4321 otherwise it will be down to one digit (4k))
   * @returns {string}
   */
  humanNumber: (number: number, options?: { decimals?: number; minDigits?: number }) => string;
  langDateFormat: string;
  langDateTimeFormat: string;
  langTimeFormat: string;
  /**
   * Parses a string into a DateTime object from the localized date format.
   *
   * @param {string} value
   * @param {boolean} [options.timezone=false] parse the date then apply the timezone offset
   * @returns {DateTime|false} Luxon DateTime object
   */
  parseDate: (value: string, options?: { timezone?: boolean }) => DateTime | false;
  /**
   * Parses a string into a DateTime object from the localized date and time formats.
   *
   * @param {string} value
   * @param {boolean} [options.timezone=false] parse the date then apply the timezone offset
   * @returns {DateTime|false} Luxon DateTime object
   */
  parseDateTime: (value: string, options?: { timezone?: boolean }) => DateTime | false;
  /**
   * Parse a String containing float in language formating
   *
   * @param {string} value
   *        he string to be parsed with the setting of thousands and decimal separator
   * @returns {float}
   * @throws {Error} if no float is found respecting the language configuration
   */
  parseFloat: (value: string) => number;
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

export interface Stringable {
  toString: () => string;
}

/**
 * Lazy translation function, only performs the translation when actually
 * printed (e.g. inserted into a template).
 * Useful when defining translatable strings in code evaluated before the
 * translations are loaded, as class attributes or at the top-level of
 * an Odoo Web module
 */
export function _lt(str: string): Stringable {
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

  const langDateFormat = dates.strftimeToLuxonFormat(langParams.dateFormat);
  const langTimeFormat = dates.strftimeToLuxonFormat(langParams.timeFormat);
  const langDateTimeFormat = `${langDateFormat} ${langTimeFormat}`;

  const humanNumber: Localization["humanNumber"] = (
    number,
    options = { decimals: 0, minDigits: 1 }
  ) => {
    number = Math.round(number);
    const decimals = options.decimals || 0;
    const minDigits = options.minDigits || 1;
    const d2 = Math.pow(10, decimals);

    const numberMagnitude = +number.toExponential().split("e+")[1];
    // the case numberMagnitude >= 21 corresponds to a number
    // better expressed in the scientific format.
    if (numberMagnitude >= 21) {
      // we do not use number.toExponential(decimals) because we want to
      // avoid the possible useless O decimals: 1e.+24 preferred to 1.0e+24
      number = Math.round(number * Math.pow(10, decimals - numberMagnitude)) / d2;
      return `${number}e+${numberMagnitude}`;
    }

    const unitSymbols = _t("kMGTPE");
    const sign = Math.sign(number);
    number = Math.abs(number);
    let symbol = "";
    for (let i = unitSymbols.length; i > 0; i--) {
      const s = Math.pow(10, i * 3);
      if (s <= number / Math.pow(10, minDigits - 1)) {
        number = Math.round((number * d2) / s) / d2;
        symbol = unitSymbols[i - 1];
        break;
      }
    }
    number = sign * number;
    return (
      numbers.insertThousandsSep(number, langParams.thousandsSep, langParams.grouping) + symbol
    );
  };

  const formatDateTime: Localization["formatDateTime"] = (value, options = { timezone: true }) => {
    return dates.formatDateTime(value, { format: langDateTimeFormat, timezone: options.timezone });
  };

  const formatFloat: Localization["formatFloat"] = (value, options = {}) => {
    return numbers.formatFloat(value, {
      precision: options.precision,
      decimalPoint: langParams.decimalPoint,
      thousandsSep: langParams.thousandsSep,
      grouping: langParams.grouping,
    });
  };

  const parseDate: Localization["parseDate"] = (value, options = {}) => {
    const result = dates.parseDateTime(value, {
      format: langDateFormat,
      timezone: options.timezone,
    });
    if (result && !result.isValid) {
      throw new Error(sprintf(_t("'%s' is not a correct date"), value));
    }
    return result;
  };

  const parseDateTime: Localization["parseDateTime"] = (value, options = {}) => {
    const result = dates.parseDateTime(value, {
      format: langDateTimeFormat,
      timezone: options.timezone,
    });
    if (result && !result.isValid) {
      throw new Error(sprintf(_t("'%s' is not a correct datetime"), value));
    }
    return result;
  };

  const thousandsSepRegex = new RegExp(escapeRegExp(langParams.thousandsSep), "g");
  const decimalPointRegex = new RegExp(escapeRegExp(langParams.decimalPoint), "g");
  const parseFloat: Localization["parseFloat"] = (value) => {
    const parsed = numbers.parseNumber(value, {
      thousandsSepSelector: thousandsSepRegex,
      decimalPointSelector: decimalPointRegex,
    });
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
    langDateFormat,
    langDateTimeFormat,
    langTimeFormat,
    parseDate,
    parseDateTime,
    parseFloat,
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
      dateFormat: lang_params && lang_params.date_format,
      decimalPoint: lang_params && lang_params.decimal_point,
      direction: lang_params && lang_params.direction,
      grouping: lang_params && lang_params.grouping,
      multiLang: lang_params && lang_params.multi_lang,
      timeFormat: lang_params && lang_params.time_format,
      thousandsSep: lang_params && lang_params.thousands_sep,
    };

    return makeLocalization({ langParams, terms });
  },
};
