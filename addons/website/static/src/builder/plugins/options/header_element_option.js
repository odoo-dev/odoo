import { BaseOptionComponent } from "@html_builder/core/utils";

export class HeaderElementOption extends BaseOptionComponent {
    static template = "website.headerElementOption";

    setup() {
        super.setup();
        this.customizeWebsite = this.env.editor.shared.customizeWebsite;
        this.customizeWebsite.loadConfigKey({
            views: ["website.option_header_brand_logo", "website.option_header_brand_name"],
        });
    }

    get websiteLogoParams() {
        return {
            views: this.customizeWebsite.getConfigKey("website.option_header_brand_name")
                ? ["website.option_header_brand_name"]
                : ["website.option_header_brand_logo"],
            resetViewArch: true,
        };
    }
}
