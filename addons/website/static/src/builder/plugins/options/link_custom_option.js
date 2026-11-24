import { BaseOptionComponent } from "@html_builder/core/base_option_component";
import { BuilderAction } from "@html_builder/core/builder_action";
import { Plugin } from "@html_editor/plugin";
import { registry } from "@web/core/registry";

export const LINK_CUSTOM_CLASS = "o_link_custom";
const LINK_STYLE_CLASS_PREFIXES = ["o_link_underline_", "o_link_hover_"];

export class LinkCustomOption extends BaseOptionComponent {
    static id = "link_custom_option";
    static template = "website.LinkCustomOption";
}

export class LinkCustomOptionPlugin extends Plugin {
    static id = "linkCustomOption";
    /** @type {import("plugins").WebsiteResources} */
    resources = {
        builder_actions: { LinkCustomAction },
    };
}

export class LinkCustomAction extends BuilderAction {
    static id = "linkCustom";

    isApplied({ editingElement }) {
        return editingElement.classList.contains(LINK_CUSTOM_CLASS);
    }
    apply({ editingElement }) {
        editingElement.classList.add(LINK_CUSTOM_CLASS);
    }
    clean({ editingElement }) {
        const toRemove = [...editingElement.classList].filter(
            (cls) =>
                cls === LINK_CUSTOM_CLASS ||
                LINK_STYLE_CLASS_PREFIXES.some((prefix) => cls.startsWith(prefix))
        );
        editingElement.classList.remove(...toRemove);
        editingElement.style.removeProperty("color");
        if (!editingElement.getAttribute("style")) {
            editingElement.removeAttribute("style");
        }
    }
}

registry.category("website-plugins").add(LinkCustomOptionPlugin.id, LinkCustomOptionPlugin);
registry.category("website-options").add(LinkCustomOption.id, LinkCustomOption);
