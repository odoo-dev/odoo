import { useDomState } from "@html_builder/core/utils";
import { BorderConfigurator } from "@html_builder/plugins/border_configurator_option";
import { convertValueToUnit } from "@html_builder/utils/utils_css";
import { getHtmlStyle } from "@html_editor/utils/formatting";
import { registry } from "@web/core/registry";

const ROUND_CORNERS_ITEM = [
    { label: "None", class: "" },
    { label: "Small", class: "rounded-1", variable: "border-radius-sm" },
    { label: "Normal", class: "rounded-2", variable: "border-radius" },
    { label: "Large", class: "rounded-3", variable: "border-radius-lg" },
    { label: "Custom", class: "o-rounded-custom" },
];

const ALLOWED_ACTION_PARAMS = ["--box-border-radius", "border-radius"];

export class WebsiteBorderConfigurator extends BorderConfigurator {
    static id = "website_border_configurator";
    static template = "website.WebsiteBorderConfiguratorOption";
    static dependencies = [...super.dependencies, "customizeWebsite"];

    setup() {
        super.setup();
        this.roundCorners = useDomState(() => {
            const items = ROUND_CORNERS_ITEM.map((item) => {
                if (!item.variable) {
                    return item;
                }

                const variable = this.dependencies.customizeWebsite.getWebsiteVariableValue(
                    item.variable
                );
                const valueInPx = convertValueToUnit(variable, "px", getHtmlStyle(document)) || "0";

                return { ...item, value: valueInPx };
            });

            return { items };
        });
    }

    get radiusActionParam() {
        return {
            mainParam: super.getStyleActionParam("radius"),
            extraClass: this.props.withBSClass ? "rounded" : undefined,
        };
    }
    // We only show the theme border-radius suggestions for a limited number of cases.
    get showRoundnessSuggestions() {
        if (this.props.action !== "styleAction") {
            return false;
        }
        return ALLOWED_ACTION_PARAMS.includes(this.radiusActionParam.mainParam);
    }

    getOnEditButtonClick(variable) {
        return () => this.env.editBorderRadius(variable);
    }
}
registry.category("website-options").add(WebsiteBorderConfigurator.id, WebsiteBorderConfigurator);
