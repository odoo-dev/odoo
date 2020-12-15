import { DateTime } from "luxon";
import { Service } from "../types";
import { strftimeToLuxonFormat } from "../utils/fields_utils";

export interface Localization {
  dateFormat: string;
  decimalPoint: string;
  direction: string;
  formatDateTime: (value: DateTime, format?: string, options?: { timezone: boolean }) => string;
  grouping: any[];
  langDateFormat: string;
  langTimeFormat: string;
  langDateTimeFormat: string;
  multiLang: boolean;
  parseDateTime: (value: string) => DateTime;
  thousandsSep: string;
  timeFormat: string;
  _t: typeof _t;
}

interface TranslatedTerms {
  [key: string]: string;
}

/**
 * Default values for localization parameters
 */
export function getDefaultLocalization(): Localization {
  return {
    dateFormat: "%m/%d/%Y",
    decimalPoint: ".",
    direction: "ltr",
    formatDateTime: makeFormatDateTime(strftimeToLuxonFormat("%m/%d/%Y %H:%M:%S")),
    grouping: [],
    langDateFormat: strftimeToLuxonFormat("%m/%d/%Y"),
    langTimeFormat: strftimeToLuxonFormat("%H:%M:%S"),
    langDateTimeFormat: strftimeToLuxonFormat("%m/%d/%Y %H:%M:%S"),
    multiLang: false,
    thousandsSep: ",",
    timeFormat: "%H:%M:%S",
    parseDateTime,
    _t,
  };
}

function makeFormatDateTime(theFormat: string) {
  /**
   * Returns a string representing a datetime.
   * Note that this is dependent on the localization settings.
   *
   * @param {DateTime} [value] Luxon DateTime object
   * @param {string} [format] Luxon DateTime valid format
   * @param {Object} [options] additional options
   * @param {boolean} [options.timezone=true] use the user timezone when formating the date
   * @returns {string}
   */
  return function formatDateTime(
    value: DateTime,
    format: string = theFormat,
    options: { timezone: boolean } = { timezone: true }
  ): string {
    if (options.timezone === undefined || options.timezone) {
      value = value.plus({ minutes: -value.toJSDate().getTimezoneOffset() });
    }
    return value.toFormat(format);
  };
}

/**
 * Create an Date object
 * The method toJSON return the formated value to send value server side
 *
 * @param {string} value
 * @returns {DateTime} Luxon DateTime object
 */
function parseDateTime(value: string): DateTime {
  const datetime = DateTime.fromSQL(value);
  if (datetime.isValid) {
    return datetime;
  }
  throw new Error(`${_t("'%s' is not a correct datetime")} ${value}`);
}

const translatedTerms: TranslatedTerms = {};

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

export async function fetchLocalization(): Promise<Localization> {
  const cacheHashes = odoo.session_info.cache_hashes;
  const translationsHash = cacheHashes.translations || new Date().getTime().toString();
  const lang = odoo.session_info.user_context.lang || null;

  let url = `/wowl/localization/${translationsHash}`;
  if (lang) {
    url += `?lang=${lang}`;
  }

  let res = await odoo.browser.fetch(url);
  if (!res.ok) {
    throw new Error("Error while fetching translations");
  }
  const { lang_params, terms } = await res.json();

  Object.setPrototypeOf(translatedTerms, terms);

  let localization: Localization;
  if (lang_params) {
    const { date_format, time_format } = lang_params;
    localization = {
      dateFormat: date_format,
      decimalPoint: lang_params.decimal_point,
      direction: lang_params.direction,
      formatDateTime: makeFormatDateTime(strftimeToLuxonFormat(`${date_format} ${time_format}`)),
      grouping: JSON.parse(lang_params.grouping),
      langDateFormat: strftimeToLuxonFormat(date_format),
      langTimeFormat: strftimeToLuxonFormat(time_format),
      langDateTimeFormat: strftimeToLuxonFormat(`${date_format} ${time_format}`),
      multiLang: lang_params.multi_lang,
      thousandsSep: lang_params.thousands_sep,
      timeFormat: time_format,
      parseDateTime,
      _t,
    };
  } else {
    localization = getDefaultLocalization();
  }
  return localization;
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

export const localizationService: Service<Localization> = {
  name: "localization",
  deploy: async (): Promise<Localization> => await fetchLocalization(),
};
