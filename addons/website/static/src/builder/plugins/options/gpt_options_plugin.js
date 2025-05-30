import { Plugin } from "@website/js/editor/plugin";
import { registry } from "@web/core/registry";
import { _t } from "@web/core/l10n/translation";

class ChatGPTTestPlugin extends Plugin {
    static id = "chatgptPlugin";
    resources = {
        builder_options: [
            {
                template: "website_chatgpt.ChatGPTOptions",
                selector: ".s_chatgpt",
                title: _t("s_ChatGPT"),
                groups: ["website.group_website_designer"],
            },
        ],
    };
}
registry.category("website-plugins").add("website.chatgpt_plugin", ChatGPTTestPlugin);
