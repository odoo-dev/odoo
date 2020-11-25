import { Odoo } from "../types";
declare const odoo: Odoo;

export interface Localization {
  dateFormat: string;
  decimalPoint: string;
  direction: string;
  grouping: any[];
  multiLang: boolean;
  thousandsSep: string;
  timeFormat: string;
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
    grouping: [],
    multiLang: false,
    thousandsSep: ",",
    timeFormat: "%H:%M:%S",
  };
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

interface Result {
  localization: Localization;
  _t: (str: string) => string;
}

export async function fetchLocalization(): Promise<Result> {
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
    localization = {
      dateFormat: lang_params.date_format,
      decimalPoint: lang_params.decimal_point,
      direction: lang_params.direction,
      grouping: JSON.parse(lang_params.grouping),
      multiLang: lang_params.multi_lang,
      thousandsSep: lang_params.thousands_sep,
      timeFormat: lang_params.time_format,
    };
  } else {
    localization = getDefaultLocalization();
  }
  return { localization, _t };
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
