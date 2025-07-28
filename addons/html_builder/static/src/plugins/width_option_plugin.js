import { Plugin } from "@html_editor/plugin";
import { withSequence } from "@html_editor/utils/resource";
import { registry } from "@web/core/registry";
import { WIDTH } from "@html_builder/utils/option_sequence";

class WidthOptionPlugin extends Plugin {
    static id = "widthOption";
    resources = {
        builder_options: [withSequence(WIDTH, WidthOption)],
    };
}

export class WidthOption {
    static template = "html_builder.WidthOption";
    static selector = ".s_alert, .s_blockquote, .s_text_highlight";
}
registry.category("website-plugins").add(WidthOptionPlugin.id, WidthOptionPlugin);
