import { BaseOptionComponent } from "@html_builder/core/base_option_component";
import { useDomState } from "@html_builder/core/utils";
import { useProps, t } from "@odoo/owl";
import { ThemeFontFamilyOption } from "./theme_fontfamily_option";
import { ThemeFontWeightOption } from "./theme_font_weight_option";
import { ThemeEffectOption } from "./theme_effect_option";

export class ThemeButtonStyleOption extends BaseOptionComponent {
    static template = "website.ThemeButtonStyleOption";
    static components = {
        ThemeFontFamilyOption,
        ThemeFontWeightOption,
    };
    static dependencies = ["customizeWebsite"];
    props = useProps({
        btnStyle: t.string(), // "primary" or "secondary"
    });

    setup() {
        super.setup();
        this.state = useDomState(() => ({
            isFlat:
                this.dependencies.customizeWebsite.getWebsiteVariableValue(
                    `btn-${this.props.btnStyle}-flat`
                ) === "true",
        }));
    }
}

export class ThemeButtonOption extends BaseOptionComponent {
    static template = "website.ThemeButtonOption";
    static components = { ThemeButtonStyleOption, ThemeEffectOption };
}
