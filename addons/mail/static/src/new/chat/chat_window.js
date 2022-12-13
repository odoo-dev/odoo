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
import { ChatWindowIcon } from "./chat_window_icon";
import { ChannelInvitationForm } from "../discuss/channel_invitation_form";

export class ChatWindow extends Component {
    static components = {
        Thread,
        Composer,
        CallUI,
        CallSettings,
        ChannelMemberList,
        ChatWindowIcon,
        ChannelInvitationForm,
    };
    static props = ["chatWindow", "right?"];
    static template = "mail.chat_window";

    setup() {
        this.messaging = useMessaging();
        this.messageHighlight = useMessageHighlight();
        this.state = useState({
            /**
             * activeMode:
             *   "member-list": channel member list is displayed
             *   "in-settings": settings is displayed
             *   "add-users": add users is displayed (small device)
             *   "": no action pannel
             */
            activeMode: "",
        });
        this.action = useService("action");
        this.contentRef = useRef("content");
        useChildSubEnv({ inChatWindow: true });
    }

    get thread() {
        return this.messaging.state.threads[this.props.chatWindow.threadLocalId];
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

    toggleAddUsers() {
        this.state.activeMode = this.state.activeMode === "add-users" ? "" : "add-users";
    }

    expand() {
        this.messaging.setDiscussThread(this.props.chatWindow.threadLocalId);
        this.action.doAction(
            {
                type: "ir.actions.client",
                tag: "mail.action_discuss",
            },
            { clearBreadcrumbs: true }
        );
    }

    startCall() {
        this.messaging.startCall(this.props.chatWindow.threadLocalId);
    }
}
