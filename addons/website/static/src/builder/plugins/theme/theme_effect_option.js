import { BaseOptionComponent } from "@html_builder/core/base_option_component";
import { _t } from "@web/core/l10n/translation";
import { useProps, t } from "@odoo/owl";
import { WebsiteConfigAction } from "../customize_website_plugin";

const RIPPLE_ASSETS = ["website.ripple_effect_scss", "website.ripple_effect_js"];
const RIPPLE_VARIABLES = ["btn-ripple", "link-ripple"];

const HOVER_EFFECTS = [
    { value: "none", label: _t("None"), targets: ["btn", "link"] },
    { value: "darken", label: _t("Darken"), targets: ["btn", "link"] },
    { value: "lighter", label: _t("Lighter"), targets: ["btn", "link"] },
    { value: "lift", label: _t("Lift and Shadow"), targets: ["btn", "link"] },
];
const CLICK_EFFECTS = [
    { value: "none", label: _t("None"), targets: ["btn", "link"] },
    { value: "ripple", label: _t("Ripple"), targets: ["btn", "link"] },
];

export class ThemeEffectOption extends BaseOptionComponent {
    static template = "website.ThemeEffectOption";
    props = useProps({
        target: t.string(), // "btn" or "link"
    });

    get tooltip() {
        return this.props.target === "btn"
            ? _t("Effect apply on all buttons")
            : _t("Effect apply on all links");
    }

    setup() {
        super.setup();
        const { target } = this.props;
        this.hoverEffects = HOVER_EFFECTS.filter((effect) => effect.targets.includes(target));
        // The params are built once: a new object at each render would make
        // the builder prepare the action again.
        this.clickEffects = CLICK_EFFECTS.filter((effect) => effect.targets.includes(target)).map(
            (effect) => ({
                ...effect,
                actionParam: {
                    vars: { [`${target}-ripple`]: String(effect.value === "ripple") },
                    assets: effect.value === "ripple" ? RIPPLE_ASSETS : [],
                },
            })
        );
    }
}

/**
 * Buttons and links share the ripple assets: None on one of them unloads the
 * assets only if the other one has no ripple either.
 */
export class RippleEffectAction extends WebsiteConfigAction {
    static id = "rippleEffect";

    async apply(action) {
        const [variable] = Object.keys(action.params.vars);
        const otherVariable = RIPPLE_VARIABLES.find((v) => v !== variable);
        const { customizeWebsite } = this.dependencies;
        if (
            !action.params.assets.length &&
            customizeWebsite.getWebsiteVariableValue(otherVariable) === "true"
        ) {
            action = { ...action, params: { ...action.params, assets: undefined } };
        }
        return super.apply(action);
    }
}
