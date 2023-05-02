/** @odoo-module **/

import { endDiscussion, okRating, feedback, transcript, close } from "./website_livechat_common";
import { registry } from "@web/core/registry";

const chatRequest = [
    {
        content: "Answer the chat request!",
        trigger: "input.o_composer_text_field",
        run: "text Hi ! What a coincidence! I need your help indeed.",
    },
    {
        content: "Send the message",
        trigger: "input.o_composer_text_field",
        run() {
            $("input.o_composer_text_field").trigger(
                $.Event("keydown", { which: $.ui.keyCode.ENTER })
            );
        },
    },
    {
        content: "Verify your message has been typed",
        trigger:
            "div.o_thread_message_content>p:contains('Hi ! What a coincidence! I need your help indeed.')",
    },
    {
        content: "Verify there is no duplicates",
        trigger: "body",
        run() {
            if (
                $(
                    "div.o_thread_message_content p:contains('Hi ! What a coincidence! I need your help indeed.')"
                ).length === 1
            ) {
                $("body").addClass("no_duplicated_message");
            }
        },
    },
    {
        content: "Is your message correctly sent ?",
        trigger: "body.no_duplicated_message",
    },
];

registry.category("web_tour.tours").add("website_livechat_chat_request_part_1_no_close_tour", {
    test: true,
    url: "/",
    steps: [].concat(chatRequest),
});

registry.category("web_tour.tours").add("website_livechat_chat_request_part_2_end_session_tour", {
    test: true,
    url: "/",
    steps: [].concat(endDiscussion, okRating, feedback, transcript, close),
});
