import { BuilderAction } from "@html_builder/core/builder_action";
import { Plugin } from "@html_editor/plugin";
import { registry } from "@web/core/registry";

export class HeaderBgBlurOptionPlugin extends Plugin {
    static id = "HeaderBgBlurOptionPlugin";
    resources = {
        builder_actions: {
            HeaderBgBlurRangeAction,
            HeaderBgBlurNoEnhanceAction,
        },
    };
}

export class HeaderBgBlurRangeAction extends BuilderAction {
    static id = "headerBgBlurRangeAction";
    static dependencies = ["customizeWebsite"];
    getValue() {
        return this.dependencies.customizeWebsite.getWebsiteVariableValue("test-mano-blur");
    }
    async apply({ value, isPreviewing }) {
        if (!isPreviewing) {
            await this.dependencies.customizeWebsite.customizeWebsiteVariables({
                "test-mano-blur": String(value),
            });
        }
    }
}

export class HeaderBgBlurNoEnhanceAction extends BuilderAction {
    static id = "headerBgBlurNoEnhanceAction";
    static dependencies = ["customizeWebsite"];
    isApplied() {
        return this.dependencies.customizeWebsite.getWebsiteVariableValue("test-mano-blur-enhance");
    }
    async apply({ isPreviewing }) {
        if (!isPreviewing) {
            await this.dependencies.customizeWebsite.customizeWebsiteVariables({
                "test-mano-blur-enhance": true,
            });
        }
    }
    async clean({ isPreviewing }) {
        if (!isPreviewing) {
            await this.dependencies.customizeWebsite.customizeWebsiteVariables({
                "test-mano-blur-enhance": false,
            });
        }
    }
}

registry.category("website-plugins").add(HeaderBgBlurOptionPlugin.id, HeaderBgBlurOptionPlugin);
