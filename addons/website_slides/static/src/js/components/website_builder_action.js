import { WebsiteBuilder } from "@html_builder/website_preview/website_builder_action";
import { patch } from "@web/core/utils/patch";

patch(WebsiteBuilder.prototype, {
    interceptEdit() {
        const { pathname, search } = this.websiteService.contentWindow.location;
        if (pathname.includes("slides") && search.includes("fullscreen=1")) {
            this.websiteContext.edition = false;
            this.websiteService.goToWebsite({ path: `${pathname}?fullscreen=0`, edition: true });
            return true;
        } else {
            return super.interceptEdit(...arguments);
        }
    }
});
