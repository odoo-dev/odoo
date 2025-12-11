/** @odoo-module **/

import { Component, onWillDestroy, useRef, useState } from "@odoo/owl";
import { browser } from "@web/core/browser/browser";
import { normalizedMatch } from "@web/core/l10n/utils";
import { useService } from "@web/core/utils/hooks";
import { isVisible } from "@web/core/utils/ui";
import { session } from "@web/session";

/**
 * @typedef {import("./interactive_translation_service").TargetedTranslation} TargetedTranslation
 */

/**
 * @param {string} lang
 */
function getFlagUrl(lang) {
    return `/base/static/img/country_flags/${lang}.png`;
}

/**
 * @param {TargetedTranslation} translation
 */
function isMissingSource(translation) {
    return !translation.source || R_MISSING_SOURCE.test(translation.source);
}

/**
 * @param {TargetedTranslation} translation
 */
function isMissingTranslation(translation) {
    return !translation.translated;
}

/**
 * @param {string} filter
 * @param {TargetedTranslation} translation
 */
function matchFilter(filter, translation) {
    if (!filter) {
        return true;
    }
    if (!isMissingSource(translation) && matchPattern(translation.source, filter).match) {
        return true;
    }
    if (!isMissingTranslation(translation) && matchPattern(translation.translation, filter).match) {
        return true;
    }
    return false;
}

const matchPattern =
    typeof normalizedMatch === "function"
        ? normalizedMatch
        : function normalizedMatch(string, pattern) {
              const nString = string
                  .trim()
                  .toLowerCase()
                  .normalize("NFD")
                  .replace(/[\u0300-\u036f]/g, "");
              const nPattern = pattern
                  .trim()
                  .toLowerCase()
                  .normalize("NFD")
                  .replace(/[\u0300-\u036f]/g, "");
              return {
                  match: nString.includes(nPattern),
              };
          };

const R_MISSING_SOURCE = /^MISSING_SOURCE_\d{8}$/;

export class InteractiveTranslationSidePanel extends Component {
    static props = {
        mode: { type: [{ value: "discard" }, { value: "keep" }] },
        translations: {
            type: Array,
            element: {
                type: Object,
                shape: {
                    context: String,
                    link: String,
                    source: String,
                    targets: {
                        type: Array,
                        element: { type: Array, element: [HTMLElement, String] },
                    },
                    translated: Boolean,
                    translation: String,
                },
            },
        },
    };
    static template = "web.InteractiveTranslationSidePanel";

    isMissingSource = isMissingSource;
    isMissingTranslation = isMissingTranslation;

    /**
     * Internal set recomputed on each render keeping track of which translations
     * are only bound to hidden targets.
     * @type {Set<TargetedTranslation>}
     */
    hiddenTranslations = new Set();

    setup() {
        this.interactiveTranslation = useService("interactive_translation");
        this.orm = useService("orm");
        this.localization = useService("localization");

        this.defaultLang = "en_US";
        this.defaultLangFlag = [getFlagUrl("us"), `English (US)`];

        this.currentLang = this.localization.code;
        this.currentLangFlag = ["", this.localization.code];

        this.interactiveTranslation.useBodyClass("o-body-with-translate-side-panel");

        this.rootRef = useRef("root");
        this.state = useState({
            filter: "",
            lang: this.currentLang,
            languages: [
                // Placeholder while the actual languages are fetched
                {
                    id: -1,
                    code: this.currentLang,
                    display_name: `loading...`,
                },
            ],
            mode: this.props.mode,
        });

        this.onPointerDown = this.onPointerDown.bind(this);
        window.addEventListener("pointerdown", this.onPointerDown, { capture: true });
        onWillDestroy(() =>
            window.removeEventListener("pointerdown", this.onPointerDown, { capture: true })
        );

        this.orm
            .webSearchRead("res.lang", [], {
                specification: {
                    code: {},
                    display_name: {},
                    flag_image_url: {},
                },
            })
            .then(({ records }) => {
                this.state.languages = records;
                const currentLang = records.find((rec) => rec.code === this.currentLang);
                this.currentLangFlag = [currentLang.flag_image_url, currentLang.display_name];
            });
    }

    /**
     * @param {[target: HTMLElement, position: string]} targets
     */
    formatTarget(targets) {
        const resultSet = new Set();
        for (const [, position] of targets) {
            if (TRANSLATABLE_ATTRIBUTE_LABELS[position]) {
                resultSet.add(TRANSLATABLE_ATTRIBUTE_LABELS[position]);
            } else if (TRANSLATABLE_PROPERTY_LABELS[position]) {
                resultSet.add(TRANSLATABLE_PROPERTY_LABELS[position]);
            } else {
                resultSet.add(position);
            }
        }
        return [...resultSet].join(" / ");
    }

    getTranslationCategories() {
        const translated = [];
        const untranslated = [];
        this.hiddenTranslations.clear();
        const filter = this.state.filter.toLowerCase().trim();
        for (const translation of this.props.translations) {
            if (!matchFilter(filter, translation)) {
                continue;
            }
            if (!translation.targets.some(([el]) => isVisible(el, { css: true, viewPort: true }))) {
                this.hiddenTranslations.add(translation);
            }
            if (translation.translated) {
                translated.push(translation);
            } else {
                untranslated.push(translation);
            }
        }
        const categories = [];
        if (untranslated.length) {
            categories.push({
                id: "untranslated",
                label: `Untranslated`,
                translations: untranslated,
            });
        }
        if (translated.length) {
            categories.push({
                id: "translated",
                label: `Translated`,
                translations: translated,
            });
        }
        return categories;
    }

    /**
     * @param {TargetedTranslation} translation
     * @param {PointerEvent} ev
     */
    onCardClick(translation, ev) {
        this.interactiveTranslation.highlightTranslation(translation, ev.ctrlKey);
    }

    /**
     * @param {Event} ev
     */
    onLanguageChange(ev) {
        this.state.lang = ev.target.value;
    }

    /**
     * @param {Event} ev
     */
    onPointerDown(ev) {
        if (ev.composedPath().includes(this.rootRef.el)) {
            // Stop all pointer events from within the side panel.
            // This is done to avoid dropdowns closing when focusing translations
            ev.stopImmediatePropagation();
            ev.stopPropagation();
        }
    }

    switchMode() {
        this.state.mode = this.state.mode === "keep" ? "discard" : "keep";
        this.interactiveTranslation.setMode(this.state.mode);
    }

    async updateLanguage() {
        await this.orm.write("res.users", [session.uid], {
            lang: this.state.lang,
        });
        browser.location.reload();
    }
}

export const TRANSLATABLE_ATTRIBUTE_LABELS = {
    "aria-label": `Aria label`,
    "aria-placeholder": `Aria placeholder`,
    "aria-roledescription": `Aria role description`,
    "aria-valuetext": `Aria value text`,
    "data-tooltip-info": `Tooltip info data`,
    "data-tooltip": `Tooltip data`,
    "o-we-hint-text": `Web editor text hint`,
    alt: `Alternate text`,
    label: `Label`,
    name: `Name`,
    placeholder: `Placeholder`,
    searchabletext: `Searchable text`,
    title: `Title`,
};
export const TRANSLATABLE_PROPERTY_LABELS = {
    textContent: `Text`,
    value: `Value`,
};
