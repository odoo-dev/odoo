import { loadLanguages, translatedTerms, translationLoaded } from "@web/core/l10n/translation";
import { serverState } from "./mock_server_state.hoot";
import { patchWithCleanup } from "./patch_test_helpers";

/**
 * @param {Record<string, string>} languages
 */
export function installLanguages(languages) {
    serverState.multiLang = true;
    patchWithCleanup(loadLanguages, {
        installedLanguages: Object.entries(languages),
    });
}

/**
 * @param {Record<string, string>} [terms]
 */
export function patchTranslations(terms = {}) {
    patchWithCleanup(translatedTerms, {
        [translationLoaded]: true,
        ...terms,
    });
}
