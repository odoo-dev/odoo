import { proxy } from "@odoo/owl";
import { registry } from "@web/core/registry";
import { _t } from "@web/core/l10n/translation";
import { defaultFontFamily, FontFamilyPlugin } from "@html_editor/main/font/font_family_plugin";
import { closestElement } from "@html_editor/utils/dom_traversal";
import { getCSSVariableValue, getHtmlStyle } from "@html_editor/utils/formatting";

// Allowing any font family in website would mean having to load and track
// additional fonts, which is bad for performances. Instead, only the fonts
// which are already defined by the theme are proposed. They are applied as a
// reference to the theme CSS variable (and never as the actual font family), so
// that changing e.g. the headings font in the theme also changes the text on
// which that font was applied.
export const WEBSITE_FONT_VARIABLES = [
    { label: _t("Paragraphs"), variable: "font" },
    { label: _t("Headings"), variable: "headings-font" },
    { label: _t("Buttons"), variable: "buttons-font" },
];

export class WebsiteFontFamilyPlugin extends FontFamilyPlugin {
    get fontFamilyItems() {
        if (!this._fontFamilyItems) {
            this._fontFamilyItems = proxy([
                defaultFontFamily,
                ...WEBSITE_FONT_VARIABLES.map(({ label, variable }) => ({
                    label: label,
                    variable: variable,
                    name: label,
                    nameShort: label,
                    fontFamily: `var(--${variable})`,
                })),
            ]);
            this.updateFontNames();
        }
        return this._fontFamilyItems;
    }

    updateFontNames() {
        const htmlStyle = getHtmlStyle(this.document);
        for (const item of this._fontFamilyItems) {
            if (!item.variable) {
                continue;
            }
            // Scss string values are printed single-quoted.
            const fontName = getCSSVariableValue(item.variable, htmlStyle).replaceAll("'", "");
            item.name = fontName ? `${item.label} (${fontName})` : item.label;
        }
    }

    updateCurrentFontFamily(ev) {
        this.updateFontNames();
        super.updateCurrentFontFamily(ev);
    }

    getCurrentFontFamily(anchorElement) {
        // The computed style resolves the CSS variable into the actual font
        // family, which would never match the proposed items.
        const styledElement = closestElement(anchorElement, (el) => el.style?.["font-family"]);
        return styledElement?.style["font-family"];
    }
}

registry.category("website-plugins").add(WebsiteFontFamilyPlugin.id, WebsiteFontFamilyPlugin);
