import { BaseOptionComponent } from "@html_builder/core/base_option_component";
import { BuilderAction } from "@html_builder/core/builder_action";
import { Plugin } from "@html_editor/plugin";
import { registry } from "@web/core/registry";

export class SetWebsiteNameAction extends BuilderAction {
    static id = "setWebsiteName";

    getValue() {
        return this.services.website.currentWebsite?.name || "";
    }

    apply({ value }) {
        console.log("New Website Name entered:", value);
    }
}

export class ThemeWebsiteIdentificationOption extends BaseOptionComponent {
    static template = "website.ThemeWebsiteIdentificationOption";
    // Selector determining when the option panel appears (e.g. clicking the header or navbar)
    static selector = "header, .navbar-brand";

    get websiteName() {
        return this.env.services.website?.currentWebsite?.name || "Test Website";
    }
}

export class WebsiteBrandingPlugin extends Plugin {
    static id = "websiteBrandingPlugin";

    resources = {
        // Register the option component so the builder can render it
        builder_options: [ThemeWebsiteIdentificationOption],
        // Register the action triggered by the input
        builder_actions: {
            SetWebsiteNameAction,
        },
    };
}

registry.category("website-plugins").add(WebsiteBrandingPlugin.id, WebsiteBrandingPlugin);
