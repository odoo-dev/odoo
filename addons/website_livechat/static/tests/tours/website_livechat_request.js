/** @odoo-module **/

import { endDiscussion, okRating, feedback, transcript, close } from "./website_livechat_common";
import { registry } from "@web/core/registry";
import { queryAll } from "@odoo/hoot-dom";

const chatRequest = [
    {
        content: "Answer the chat request!",
        trigger: ".o-mail-Composer-input",
        run: "text Hi ! What a coincidence! I need your help indeed.",
    },
    {
        content: "Send the message",
        trigger: ".o-mail-Composer-input",
        run() {
            this.anchor.dispatchEvent(
                new KeyboardEvent("keydown", { key: "Enter", which: 13, bubbles: true })
            );
        },
    },
    {
        content: "Verify your message has been typed",
        trigger: ".o-mail-Message:contains('Hi ! What a coincidence! I need your help indeed.')",
    },
    {
        content: "Verify there is no duplicates",
        trigger: ".o-mail-Thread",
        run() {
            if (
                queryAll(
                    ".o-mail-Message:contains('Hi ! What a coincidence! I need your help indeed.')",
                    { root: this.anchor }
                ).length === 1
            ) {
                $("body").addClass("no_duplicated_message");
            }
        },
    },
    {
        content: "Is your message correctly sent ?",
        shadow_dom: false,
        trigger: "body.no_duplicated_message",
        isCheck: true,
    },
];

registry.category("web_tour.tours").add("website_livechat_chat_request_part_1_no_close_tour", {
    test: true,
    url: "/",
    shadow_dom: ".o-livechat-root",
    steps: () => [].concat(chatRequest),
});

registry.category("web_tour.tours").add("website_livechat_chat_request_part_2_end_session_tour", {
    test: true,
    url: "/",
    shadow_dom: ".o-livechat-root",
    steps: () => [].concat(endDiscussion, okRating, feedback, transcript, close),
});
