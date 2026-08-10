import { BaseOptionComponent } from "@html_builder/core/base_option_component";
import { BuilderAction } from "@html_builder/core/builder_action";
import { pickAndUploadCursorImage } from "./cursor_upload";

// The two independent cursors the theme tab exposes, and the website variables
// backing each of them.
const CURSOR_VARIABLES = {
    base: {
        preset: "cursor-preset",
        image: "cursor-image",
    },
    interactive: {
        preset: "cursor-interactive-preset",
        image: "cursor-interactive-image",
    },
};

export class ThemeCursorOption extends BaseOptionComponent {
    static template = "website.ThemeCursorOption";
}

export class UploadCursorImageAction extends BuilderAction {
    static id = "uploadCursorImage";
    static dependencies = ["builderActions", "customizeWebsite", "domObserver"];

    setup() {
        // Opening a file dialog on hover would be unbearable.
        this.preview = false;
        // The action holds the mutex while the user browses their files.
        this.canTimeout = false;
    }

    getVariables({ params: { mainParam } = {} } = {}) {
        return CURSOR_VARIABLES[mainParam] || CURSOR_VARIABLES.base;
    }

    isApplied(context) {
        const { image } = this.getVariables(context);
        return !!this.dependencies.customizeWebsite.getWebsiteVariableValue(image);
    }

    getCurrentConfig(variables) {
        return {
            image:
                this.dependencies.customizeWebsite.getWebsiteVariableValue(variables.image) || "",
        };
    }

    async setCursorConfigWithLoader(variables, config) {
        this.services.ui.block({ delay: 2500 });
        try {
            await this.dependencies.customizeWebsite.customizeWebsiteVariables({
                [variables.preset]: config.image ? "custom" : "",
                [variables.image]: config.image ? `'${config.image}'` : "",
            });
            this.trigger("on_dom_updated_handlers");
        } finally {
            this.services.ui.unblock();
        }
    }

    async applyConfig(variables, oldConfig, newConfig) {
        await this.setCursorConfigWithLoader(variables, newConfig);
        this.dependencies.domObserver.stageCustomMutation({
            apply: () => this.setCursorConfigWithLoader(variables, newConfig),
            revert: () => this.setCursorConfigWithLoader(variables, oldConfig),
        });
    }

    async apply(context) {
        const variables = this.getVariables(context);
        const attachment = await pickAndUploadCursorImage({
            notification: this.services.notification,
        });
        if (!attachment) {
            // Cancelled or rejected: leave the current cursor untouched.
            return;
        }
        await this.applyConfig(variables, this.getCurrentConfig(variables), {
            image: attachment.image_src,
        });
    }

    async clean(context) {
        const variables = this.getVariables(context);
        await this.applyConfig(variables, this.getCurrentConfig(variables), { image: "" });
    }
}

export class ReplaceCursorImageAction extends BuilderAction {
    static id = "replaceCursorImage";
    static dependencies = ["builderActions"];
    setup() {
        this.preview = false;
        this.canTimeout = false;
    }
    apply(context) {
        return this.dependencies.builderActions.getAction("uploadCursorImage").apply(context);
    }
}

export class RemoveCursorImageAction extends BuilderAction {
    static id = "removeCursorImage";
    static dependencies = ["builderActions"];
    setup() {
        this.preview = false;
    }
    apply(context) {
        return this.dependencies.builderActions.getAction("uploadCursorImage").clean(context);
    }
}
