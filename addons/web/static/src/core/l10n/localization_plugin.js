import { onWillDestroy, onWillStart, usePlugin, Plugin, useListener } from "@odoo/owl";
import { session } from "@web/session";
import { jsToPyLocale, pyToJsLocale } from "@web/core/l10n/utils";
import { user } from "@web/core/user";
import { browser } from "@web/core/browser/browser";
import { services } from "@web/core/services";
import { strftimeToLuxonFormat } from "./dates";
import { localization } from "./localization";
import { rpcBus } from "@web/core/network/rpc";
import {
    translatedTerms,
    translatedTermsGlobal,
    translationLoaded,
    translationResolvers,
} from "./translation";
import { objectToUrlEncodedString } from "@web/core/utils/urls";
import { IndexedDB } from "@web/core/utils/indexed_db";
import { registry } from "@web/core/registry";

const { Settings } = luxon;

export function getFallbackLangParameters(locale) {
    const params = {
        date_format: "%m/%d/%Y",
        time_format: "%H:%M:%S",
        decimal_point: ".",
        direction: "ltr",
        grouping: "[]",
        thousands_sep: ",",
        week_start: 1,
    };

    try {
        const numberParts = new Intl.NumberFormat(locale).formatToParts(1234567.5);
        const decimal = numberParts.find((part) => part.type === "decimal");
        const group = numberParts.find((part) => part.type === "group");
        if (decimal) {
            params.decimal_point = decimal.value;
        }
        if (group) {
            params.thousands_sep = group.value;
            params.grouping = "[3,0]";
        }

        const fields = { day: "%d", month: "%m", year: "%Y" };
        const dateFormat = new Intl.DateTimeFormat(locale)
            .formatToParts(new Date(2024, 0, 2))
            .map((part) => fields[part.type] ?? (part.type === "literal" ? part.value : ""))
            .join("");
        if (["%d", "%m", "%Y"].every((field) => dateFormat.includes(field))) {
            params.date_format = dateFormat;
        }

        const { hourCycle } = new Intl.DateTimeFormat(locale, {
            hour: "numeric",
        }).resolvedOptions();
        if (hourCycle === "h11" || hourCycle === "h12") {
            params.time_format = "%I:%M:%S %p";
        }

        if (typeof Intl.Locale === "function") {
            const intlLocale = new Intl.Locale(locale);
            const weekInfo = intlLocale.weekInfo ?? intlLocale.getWeekInfo?.();
            if (weekInfo?.firstDay) {
                params.week_start = weekInfo.firstDay;
            }
            const textInfo = intlLocale.textInfo ?? intlLocale.getTextInfo?.();
            if (textInfo?.direction) {
                params.direction = textInfo.direction;
            }
        }
    } catch {
        // ignore
    }

    return params;
}

/** @type {[RegExp, string][]} */
const NUMBERING_SYSTEMS = [
    [/^ar-(sa|sy|001)$/i, "arab"],
    [/^bn/i, "beng"],
    [/^bo/i, "tibt"],
    // [/^fa/i, "Farsi (Persian)"], // No numberingSystem found in Intl
    // [/^(hi|mr|ne)/i, "Hindi"], // No numberingSystem found in Intl
    // [/^my/i, "Burmese"], // No numberingSystem found in Intl
    [/^pa-in/i, "guru"],
    [/^ta/i, "tamldec"],
    [/.*/i, "latn"],
];

export class LocalizationPlugin extends Plugin {
    // we need the localization plugin to start (and be ready) before the rest
    // of the code can use translated strings, so we define here a low sequence
    // number
    static sequence = 10;

    localization = localization;

    localizationDB = new IndexedDB("localization", session.registry_hash);
    translationURL = session.translationURL || "/web/webclient/translations";
    lang = jsToPyLocale(user.lang || document.documentElement.getAttribute("lang"));

    setup() {
        useListener(rpcBus, "RPC:RESPONSE", (ev) => {
            const { method, model } = ev.detail.data.params || {};
            if (
                method === "lang_install" &&
                model === "base.language.install" &&
                !ev.detail.error
            ) {
                rpcBus.trigger("CLEAR-CACHES");
            }
        });

        onWillStart(() => this.load());
        onWillDestroy(() => {
            if (!translatedTerms[translationLoaded]) {
                return;
            }
            for (const key in translatedTerms) {
                delete translatedTerms[key];
            }
            for (const key in translatedTermsGlobal) {
                delete translatedTermsGlobal[key];
            }
            translatedTerms[translationLoaded] = false;
        });
    }

    async load() {
        const storedTranslations = await this.localizationDB.read(
            this.translationURL,
            JSON.stringify({ lang: this.lang })
        );

        const translationProm = this.fetchTranslations(storedTranslations?.hash);
        if (storedTranslations) {
            this.updateTranslations(storedTranslations);
        } else {
            await translationProm;
            if (!translatedTerms[translationLoaded]) {
                this.updateTranslations({
                    modules: {},
                    lang_parameters: getFallbackLangParameters(
                        pyToJsLocale(user.lang) || browser.navigator.language
                    ),
                });
            }
        }

        translatedTerms[translationLoaded] = true;
        translationResolvers.resolve(true);

        const locale = user.lang || browser.navigator.language;
        Settings.defaultLocale = locale;
        for (const [re, numberingSystem] of NUMBERING_SYSTEMS) {
            if (re.test(locale)) {
                Settings.defaultNumberingSystem = numberingSystem;
                break;
            }
        }
        localization.locale = locale;
        localization.code = jsToPyLocale(locale);
    }

    async fetchTranslations(hash) {
        let queryString = objectToUrlEncodedString({ hash, lang: this.lang });
        queryString = queryString.length > 0 ? `?${queryString}` : queryString;
        try {
            const response = await browser.fetch(`${this.translationURL}${queryString}`, {
                cache: "no-store",
            });
            if (!response.ok) {
                throw new Error("Error while fetching translations");
            }
            const result = await response.json();
            if (result && result.hash !== hash) {
                this.localizationDB.write(
                    this.translationURL,
                    JSON.stringify({ lang: this.lang }),
                    result
                );
                this.updateTranslations(result);
            }
        } catch (error) {
            if (error instanceof TypeError) {
                console.warn("Could not fetch translations from server (offline)", error);
            } else {
                console.error("Could not load translations", error);
            }
        }
    }

    updateTranslations(result) {
        if (!result || !result.modules) {
            return;
        }
        const terms = {};
        for (const addon of Object.keys(result.modules)) {
            terms[addon] = {};
            for (const message of result.modules[addon].messages) {
                terms[addon][message.id] = message.string;
                translatedTermsGlobal[message.id] = message.string;
            }
        }
        Object.assign(translatedTerms, terms);

        const userLocalization = result.lang_parameters || {};
        const dateFormat = strftimeToLuxonFormat(userLocalization.date_format || "%m/%d/%Y");
        const timeFormat = strftimeToLuxonFormat(userLocalization.time_format || "%H:%M:%S");

        Object.assign(localization, {
            dateFormat,
            timeFormat,
            dateTimeFormat: `${dateFormat} ${timeFormat}`,
            decimalPoint: userLocalization.decimal_point || ".",
            direction: userLocalization.direction || "ltr",
            grouping: JSON.parse(userLocalization.grouping || "[]"),
            multiLang: result.multi_lang || false,
            thousandsSep: userLocalization.thousands_sep || ",",
            weekStart: userLocalization.week_start || 1,
        });
    }
}

services.add(LocalizationPlugin);

/**
 * -----------------------------------------------------------------------------
 * @todo owl3 migration
 * temporary - to remove when all use of localization services are removed
 * -----------------------------------------------------------------------------
 */
registry.category("services").add("localization", {
    start() {
        const localizationPlugin = usePlugin(LocalizationPlugin);
        return localizationPlugin.localization;
    },
});
