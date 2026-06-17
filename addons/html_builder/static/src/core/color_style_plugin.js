import { Plugin } from "@html_editor/plugin";
import { registry } from "@web/core/registry";
import { applyNeededCss, normalizeGradientThemeVars } from "@html_builder/utils/utils_css";
import { withSequence } from "@html_editor/utils/resource";
import { isColorGradient } from "@web/core/utils/colors";

/**
 * @typedef {((editingElement: HTMLElement) => void)[]} on_bg_color_updated_handlers
 */

export class ColorStylePlugin extends Plugin {
    static id = "colorStyle";
    static dependencies = ["color"];
    /** @type {import("plugins").BuilderResources} */
    resources = {
        apply_color_style_overrides: withSequence(5, (element, cssProp, color, params = {}) => {
            if (cssProp === "background-image" && isColorGradient(color)) {
                color = normalizeGradientThemeVars(color);
            }
            applyNeededCss(
                element,
                cssProp,
                color,
                element.ownerDocument.defaultView.getComputedStyle(element),
                params
            );
            return true;
        }),
        apply_custom_css_style_overrides: withSequence(20, this.applyColorStyle.bind(this)),
    };
    /**
     * @param {Object} context
     * @param {Element} context.editingElement element being edited
     * @param {string} context.styleName CSS style name
     * @param {string} context.value CSS style value
     * @param {Object} context.params additional parameters
     * @returns {boolean} whether the color style was applied
     */
    applyColorStyle({ editingElement, styleName, value, params = {} }) {
        if (styleName === "background-color") {
            if (isColorGradient(value)) {
                value = normalizeGradientThemeVars(value);
            } else {
                const match = value.match(/var\(--([a-zA-Z0-9-_]+)\)/);
                if (match) {
                    value = `bg-${match[1]}`;
                }
            }
            this.dependencies.color.colorElement(editingElement, value, "backgroundColor", params);
            this.trigger("on_bg_color_updated_handlers", editingElement);
            return true;
        } else if (styleName === "color") {
            const match = value.match(/var\(--([a-zA-Z0-9-_]+)\)/);
            if (match) {
                value = `text-${match[1]}`;
            }
            this.dependencies.color.colorElement(editingElement, value, "color", params);
            return true;
        }
        return false;
    }
}

registry.category("builder-plugins").add(ColorStylePlugin.id, ColorStylePlugin);
