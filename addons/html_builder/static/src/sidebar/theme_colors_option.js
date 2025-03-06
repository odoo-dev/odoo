import { Component } from "@odoo/owl";
import { getCSSVariableValue } from "@html_builder/utils/utils_css";
import { defaultBuilderComponents } from "../core/default_builder_components";

export class ThemeColorsOption extends Component {
    static template = "html_builder.ThemeColorsOption";
    static components = { ...defaultBuilderComponents };
    setup() {
        this.palettes = [];
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
            this.palettes.push(palette);
        }
        console.log(this.palettes);
    }
}
