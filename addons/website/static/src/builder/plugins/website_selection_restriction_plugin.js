import { Plugin } from "@html_editor/plugin";
import { registry } from "@web/core/registry";

class WebsiteSelectionRestrictionPlugin extends Plugin {
    static id = "websiteSelectionRestriction";
    /** @type {import("plugins").WebsiteResources} */
    resources = {
        // restricted_to_paragraph_blocks_selector: CSS selectors of elements
        // that the selection should be restricted to paragraph blocks.
        restricted_to_paragraph_blocks_selector: [".s_blockquote"],
    };
}

registry
    .category("website-plugins")
    .add(WebsiteSelectionRestrictionPlugin.id, WebsiteSelectionRestrictionPlugin);
