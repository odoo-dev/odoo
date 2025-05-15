import { registry } from "@web/core/registry";
import { Plugin } from "@html_editor/plugin";
import { withSequence } from "@html_editor/utils/resource";
import { BuilderAction } from "@html_builder/core/builder_action";
import { after } from "@html_builder/utils/option_sequence";
import { WEBSITE_BACKGROUND_OPTIONS } from "@website/builder/option_sequence";

export class SetItemTextAction extends BuilderAction {
    static id = "setItemTextAction";

    getValue({ editingElement, params }) {
        return editingElement.innerHTML;
    }
    apply({ editingElement, value, params }) {
        editingElement.innerHTML = value;
    }
}

class AnnouncementScrollOptionPlugin extends Plugin {
    static id = "announcementScrollOptionPlugin";
    selector = "section.s_announcement_scroll";
    resources = {
        builder_options: [
            withSequence(after(WEBSITE_BACKGROUND_OPTIONS), {
                template: "website.AnnouncementScrollOption",
                selector: this.selector,
            }),
        ],
        builder_actions: {
            SetItemTextAction,
        },
    };
}

registry.category("website-plugins")
    .add(AnnouncementScrollOptionPlugin.id, AnnouncementScrollOptionPlugin);
