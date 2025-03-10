import * as spreadsheet from "@odoo/o-spreadsheet";
import { _t, __namespacedGettext as _translate } from "@web/core/l10n/translation";
import { OdooUIPlugin } from "@spreadsheet/plugins";

const { arg, toString } = spreadsheet.helpers;
const { functionRegistry, featurePluginRegistry } = spreadsheet.registries;

/**
 * Standard spreadsheet dashboards need to be translated.
 * We hack the system by extracting source terms from the spreadsheet json files
 * (look for *.osheet.json files).
 * We then use this function to translate the terms at runtime.
 */
export function dynamicSpreadsheetTranslate(translationNamespace, term) {
    return _translate(translationNamespace, term);
}

class TranslationNamespace extends OdooUIPlugin {
    static getters = /** @type {const} */ (["dynamicTranslate"]);

    constructor(config) {
        super(config);
        this.translationNamespace = config.custom.translationNamespace;
    }

    /**
     * @param {string} term
     */
    dynamicTranslate(term) {
        if (this.translationNamespace) {
            return dynamicSpreadsheetTranslate(this.translationNamespace, term);
        }
        return term;
    }
}
featurePluginRegistry.add("TranslationNamespace", TranslationNamespace);

functionRegistry.add("_t", {
    description: _t("Get the translated value of the given string"),
    args: [arg("value (string)", _t("Value to translate."))],
    compute: function (value) {
        return this.getters.dynamicTranslate(toString(value));
    },
    returns: ["STRING"],
    hidden: true,
});
