import { MediaManagerPlugin } from "@html_editor/backend/media_manager/media_manager_plugin";
import { WEBSITE_DOMAIN } from "@html_editor/main/media/media_manager/domain_helper";
import { registry } from "@web/core/registry";

/**
 * Replaces the MediaManagerPlugin (see `builderPluginsToRemove` in the website
 * builder) to display the website media library in the media manager.
 */
export class WebsiteMediaPlugin extends MediaManagerPlugin {
    /**
     * @override
     */
    getDomain() {
        return WEBSITE_DOMAIN;
    }
}

registry.category("website-plugins").add(WebsiteMediaPlugin.name, WebsiteMediaPlugin);
registry.category("translation-plugins").add(WebsiteMediaPlugin.name, WebsiteMediaPlugin);
