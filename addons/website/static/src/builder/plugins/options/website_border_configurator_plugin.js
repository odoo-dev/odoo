import { ClassAction } from "@html_builder/core/core_builder_action_plugin";
import { CSS_SHORTHANDS } from "@html_builder/utils/utils_css";
import { Plugin } from "@html_editor/plugin";
import { registry } from "@web/core/registry";

export class WebsiteBorderConfiguratorPlugin extends Plugin {
    static id = "websiteBorderConfigurator";

    resources = {
        builder_actions: { SetBorderRadiusAction },
    };
}

class SetBorderRadiusAction extends ClassAction {
    static id = "setBorderRadius";

    clean(context) {
        super.clean(context);

        const { editingElement, params } = context;
        if (!params || params.mainParam !== "o-rounded-custom") {
            return;
        }

        const { extraClass, mainParam: borderRadius } = params.radiusActionParam || {};

        if (extraClass) {
            editingElement.classList.remove(extraClass);
        }

        const variablesToClean = CSS_SHORTHANDS[borderRadius];
        if (Array.isArray(variablesToClean)) {
            for (const variable of variablesToClean) {
                editingElement.style.removeProperty(variable);
            }
        }
    }
}

registry
    .category("website-plugins")
    .add(WebsiteBorderConfiguratorPlugin.id, WebsiteBorderConfiguratorPlugin);
