/* @odoo-module */

import { Thread } from "../thread/thread";
import { Composer } from "../composer/composer";
import { useMessaging } from "../messaging_hook";
import { useMessageHighlight } from "@mail/new/utils/hooks";
import { Component, useChildSubEnv, useRef, useState } from "@odoo/owl";
import { useService } from "@web/core/utils/hooks";
import { CallUI } from "../rtc/call_ui";
import { CallSettings } from "../rtc/call_settings";
import { ChannelMemberList } from "../discuss/channel_member_list";

export class ChatWindow extends Component {
    setup() {
        this.messaging = useMessaging();
        this.messageHighlight = useMessageHighlight();
        this.state = useState({
            /**
             * activeMode:
             *   "member-list": channel member list is displayed
             *   "in-settings": settings is displayed
             *   "": no action pannel
             */
            activeMode: "",
        });
        this.action = useService("action");
        this.contentRef = useRef("content");
        useChildSubEnv({ inChatWindow: true });
    }

    toggleFold() {
        this.props.chatWindow.folded = !this.props.chatWindow.folded;
    }

    toggleSettings() {
        this.state.activeMode = this.state.activeMode === "in-settings" ? "" : "in-settings";
    }

    toggleMemberList() {
        this.state.activeMode = this.state.activeMode === "member-list" ? "" : "member-list";
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
    components: { Thread, Composer, CallUI, CallSettings, ChannelMemberList },
    props: ["chatWindow", "right?"],
    template: "mail.chat_window",
});
