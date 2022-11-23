/** @odoo-module */

import { Thread } from "../thread/thread";
import { Composer } from "../composer/composer";
import { useMessageHighlight, useMessaging } from "../messaging_hook";
import { Component, useChildSubEnv } from "@odoo/owl";
import { useService } from "@web/core/utils/hooks";
import { CallUI } from "../rtc/call_ui";

export class ChatWindow extends Component {
    setup() {
        this.messaging = useMessaging();
        this.messageHighlight = useMessageHighlight();
        this.action = useService("action");
        useChildSubEnv({ inChatWindow: true });
    }

    close() {
        this.messaging.closeChatWindow(this.props.threadId);
    }

    toggleFold() {
        this.messaging.chatWindows.find((cw) => cw.threadId === this.props.threadId).folded =
            !this.props.folded;
    }

    expand() {
        // todo
        this.messaging.setDiscussThread(this.props.threadId);
        this.action.doAction(
            {
                type: "ir.actions.client",
                tag: "mail.action_discuss",
            },
            { clearBreadcrumbs: true }
        );
    }

    startCall() {
        this.messaging.startCall(this.props.threadId);
    }
}

Object.assign(ChatWindow, {
    components: { Thread, Composer, CallUI },
    props: ["threadId", "right?", "autofocus?", "folded?"],
    defaultProps: { folded: false },
    template: "mail.chat_window",
});
