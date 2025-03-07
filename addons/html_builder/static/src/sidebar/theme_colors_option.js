import { Component, useState, onMounted } from "@odoo/owl";
import { getCSSVariableValue } from "@html_builder/utils/utils_css";
import { defaultBuilderComponents } from "../core/default_builder_components";

export class ThemeColorsOption extends Component {
    static template = "html_builder.ThemeColorsOption";
    static components = { ...defaultBuilderComponents };
    setup() {
        this.presets = useState([]);
        this.palettes = this._getPalettes();
        this.observer = new MutationObserver(this._updatePresets.bind(this));
        onMounted(() => {
            this.iframeDocument = document.querySelector("iframe").contentWindow.document;
            this.observer.observe(this.iframeDocument.documentElement, {
                attributes: true,
                childList: true,
                subtree: true,
                attributeFilter: ["style"],
            });
            this._updatePresets();
        });
    }

    _getPalettes() {
        const palettes = [];
        const style = window.getComputedStyle(document.documentElement);
        const allPaletteNames = getCSSVariableValue("palette-names", style)
            .split(", ")
            .map((name) => name.replace(/'/g, ""));
        for (const paletteName of allPaletteNames) {
            const palette = {
                name: paletteName,
                colors: [],
            };
            [1, 3, 2].forEach((c) => {
                const color = getCSSVariableValue(`o-palette-${paletteName}-o-color-${c}`, style);
                palette.colors.push(color);
            });
            palettes.push(palette);
        }
        return palettes;
    }

    _updatePresets() {
        this.presets.length = 0;
        for (let i = 1; i <= 5; i++) {
            const preset = {
                id: i,
                background: this._getColor(`o-cc${i}-bg`),
                backgroundGradient: this._getColor(`o-cc${i}-bg-gradient`),
                text: this._getColor(`o-cc${i}-text`),
                headings: this._getColor(`o-cc${i}-headings`),
                primaryBtn: this._getColor(`o-cc${i}-btn-primary`),
                primaryBtnText: this._getColor(`o-cc${i}-btn-primary-text`),
                primaryBtnBorder: this._getColor(`o-cc${i}-btn-primary-border`),
                secondaryBtn: this._getColor(`o-cc${i}-btn-secondary`),
                secondaryBtnText: this._getColor(`o-cc${i}-btn-secondary-text`),
                secondaryBtnBorder: this._getColor(`o-cc${i}-btn-secondary-border`),
            };

            // TODO: check if this is necessary
            if (preset.backgroundGradient) {
                preset.backgroundGradient += ", url('/web/static/img/transparent.png')";
            }
            this.presets.push(preset);
        }
        console.log(this.presets);
    }

    _getColor(color) {
        if (!this.iframeStyle) {
            this.iframeStyle = this.iframeDocument.defaultView.getComputedStyle(
                this.iframeDocument.documentElement
            );
        }
        return getCSSVariableValue(color, this.iframeStyle);
    }
}
