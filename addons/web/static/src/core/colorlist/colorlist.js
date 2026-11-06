import { _t } from "@web/core/l10n/translation";

import { Component, t, useProps } from "@odoo/owl";

export class ColorList extends Component {
    static COLORS = [
        _t("No color"),
        _t("Red"),
        _t("Orange"),
        _t("Yellow"),
        _t("Cyan"),
        _t("Purple"),
        _t("Almond"),
        _t("Teal"),
        _t("Blue"),
        _t("Raspberry"),
        _t("Green"),
        _t("Violet"),
    ];
    static template = "web.ColorList";
    props = useProps({
        disableTransparent: t.boolean().optional(),
        onColorSelected: t.function(),
        selectedColor: t.number().optional(),
    });
    getColorListAttrs = getColorListAttrs;

    get colors() {
        return this.constructor.COLORS;
    }
    onColorSelected(id) {
        this.props.onColorSelected(id);
    }
}

/**
 * Returns the custom properties giving the color `colorIndex` of the list, and
 * its contrast color, to the rules of an element: none for "no color" (0) or for
 * a value outside the list.
 *
 * @param {number} colorIndex
 * @returns {string}
 */
export function getColorListStyle(colorIndex) {
    if (!(colorIndex > 0 && colorIndex in ColorList.COLORS)) {
        return "";
    }
    return `--o-colorlist-color: var(--o-colors-${colorIndex}); --o-colorlist-contrast: var(--o-colors-contrast-${colorIndex})`;
}

/**
 * Returns the attributes, to give with t-att, coloring an element like the entry
 * `colorIndex` of the list: the "no color" entry for 0, nothing for a value
 * outside the list.
 *
 * @param {number} colorIndex
 * @returns {{ class?: string, style?: string }}
 */
export function getColorListAttrs(colorIndex) {
    if (colorIndex === 0) {
        return { class: "o_colorlist_no_color" };
    }
    const style = getColorListStyle(colorIndex);
    return style ? { class: "o_colorlist_color", style } : {};
}
