/** @odoo-module **/

export const translatedTerms = {};

/**
 * Translate a term, or return the term if no translation can be found.
 *
 * Note that it translates eagerly, which means that if the translations have
 * not been loaded yet, it will return the untranslated term. If it cannot be
 * guaranteed that translations are ready, one should use the _lt function
 * instead (see below)
 *
 * @param {string} term
 * @returns {string}
 */
export function _t(term) {
    if ("localization" in odoo.__WOWL_DEBUG__.root.env.services) {
        return translatedTerms[term] || term;
    }
    return new LazyTranslatedString(term);
}

class LazyTranslatedString extends String {
    valueOf() {
        const str = super.valueOf();
        return _t(str);
    }
    toString() {
        return this.valueOf();
    }
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

/**
 * Load the installed languages long names and code
 *
 * The result of the call is put in cache.
 * If any new language is installed, a full page refresh will happen,
 * so there is no need invalidate it.
 */
export async function loadLanguages(orm) {
    if (!loadLanguages.installedLanguages) {
        loadLanguages.installedLanguages = await orm.call("res.lang", "get_installed");
    }
    return loadLanguages.installedLanguages;
}
