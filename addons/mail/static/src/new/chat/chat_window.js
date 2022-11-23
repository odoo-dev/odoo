/** @odoo-module */

import { Thread } from "../thread/thread";
import { Composer } from "../composer/composer";
import { useMessageHighlight, useMessaging } from "../messaging_hook";
import { Component, useChildSubEnv, useRef } from "@odoo/owl";
import { useService } from "@web/core/utils/hooks";
import { CallUI } from "../rtc/call_ui";

export class ChatWindow extends Component {
    setup() {
        this.messaging = useMessaging();
        this.messageHighlight = useMessageHighlight();
        this.action = useService("action");
        this.contentRef = useRef("content");
        useChildSubEnv({ inChatWindow: true });
    }

    close() {
        this.messaging.closeChatWindow(this.props.chatWindow.threadId);
    }

    toggleFold() {
        this.props.chatWindow.folded = !this.props.chatWindow.folded;
    }

    expand() {
        this.messaging.setDiscussThread(this.props.chatWindow.threadId);
        this.action.doAction(
            {
                type: "ir.actions.client",
                tag: "mail.action_discuss",
            },
            { clearBreadcrumbs: true }
        );
    }

    startCall() {
        this.messaging.startCall(this.props.chatWindow.threadId);
    }
}

Object.assign(ChatWindow, {
    components: { Thread, Composer, CallUI },
    props: ["chatWindow", "right?"],
    template: "mail.chat_window",
});
