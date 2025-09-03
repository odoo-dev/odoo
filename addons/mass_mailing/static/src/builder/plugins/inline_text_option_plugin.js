import { Plugin } from "@html_editor/plugin";
import { registry } from "@web/core/registry";

class InlineTextOptionPlugin extends Plugin {
    static id = "mass_mailing.inlineText";
    resources = {
        dropzone_selector: {
            selector: "p",
            dropNear: "p, h1, h2, h3, blockquote, .s_hr",
        },
        // so_content_addition_selector: [".s_hr"],
        // is_movable_selector: { selector: ".s_hr", direction: "vertical" },
    };
}
registry.category("mass_mailing-plugins").add(InlineTextOptionPlugin.id, InlineTextOptionPlugin);
