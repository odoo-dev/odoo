import { browser } from "@web/core/browser/browser";
import { _t, _safeFormatAndSprintf } from "@web/core/l10n/translation";
const translatedTerms = {};
let langs = [];

function moduleTrems(modules) {
    const terms = {};
    for (const addon of Object.keys(modules)) {
        for (const message of modules[addon].messages) {
            if (message.id !== message.string) {
                terms[message.id] = message.string;
            }
        }
    }
    return terms;
}

(async function () {
    const translationURL = "/web/webclient/translations/all";
    const response = await browser.fetch(translationURL);

    const { langs: resLangs, translations } = await response.json();
    langs = resLangs;
    Object.entries(translations).forEach(([lang, modules]) => {
        translatedTerms[lang] = moduleTrems(modules);
    });
})();

function checkForContext(vals) {
    const common = vals.filter((value) => langs.includes(value));
    return common.length ? common[0] : null;
}

export function _t_pos(term, ...vals) {
    const context = checkForContext(vals);
    vals = vals.filter((value) => value != context);

    console.log("context == ", context);
    if (!context) {
        return _t(term, ...vals);
    }
    // console.log(term, context, translatedTerms[context][term]);
    const translation = translatedTerms[context][term] ?? term;

    return _safeFormatAndSprintf(translation, ...vals);
}
