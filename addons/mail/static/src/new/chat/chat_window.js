/* @odoo-module */

import { Call } from "../rtc/call";
import { Thread } from "../thread/thread";
import { Composer } from "../composer/composer";
import { useMessaging } from "../messaging_hook";
import { useRtc } from "../rtc/rtc_hook";
import { useMessageHighlight } from "@mail/new/utils/hooks";
import { Component, useChildSubEnv, useRef, useState } from "@odoo/owl";
import { useService } from "@web/core/utils/hooks";
import { CallSettings } from "../rtc/call_settings";
import { ChannelMemberList } from "../discuss/channel_member_list";
import { ChatWindowIcon } from "./chat_window_icon";
import { ChannelInvitationForm } from "../discuss/channel_invitation_form";
import { isEventHandled } from "../utils/misc";
import { ChannelSelector } from "@mail/new/discuss/channel_selector";

/**
 * @typedef {Object} Props
 * @property {import("@mail/new/core/chat_window_model").ChatWindow} chatWindow
 * @property {boolean} [right]
 * @extends {Component<Props, Env>}
 */
export class ChatWindow extends Component {
    static components = {
        Call,
        Thread,
        ChannelSelector,
        Composer,
        CallSettings,
        ChannelMemberList,
        ChatWindowIcon,
        ChannelInvitationForm,
    };
    static props = ["chatWindow", "right?"];
    static template = "mail.chat_window";

    setup() {
        this.messaging = useMessaging();
        this.chatWindowService = useState(useService("mail.chat_window"));
        this.threadService = useState(useService("mail.thread"));
        this.rtc = useRtc();
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
            messageInEditId: undefined,
        });
        this.action = useService("action");
        this.contentRef = useRef("content");
        useChildSubEnv({ inChatWindow: true });
    }

    onKeydown(ev) {
        switch (ev.key) {
            case "Escape":
                // prevent reopening last app when in home menu
                ev.stopPropagation();
                if (
                    isEventHandled(ev, "NavigableList.close") ||
                    isEventHandled(ev, "Composer.discard")
                ) {
                    return;
                }
                this.close();
                break;
        }
    }

    toggleFold() {
        if (this.props.chatWindow.hidden) {
            this.props.chatWindow.makeVisible();
        } else {
            this.props.chatWindow.toggleFold();
        }
        this.chatWindowService.notifyState(this.props.chatWindow);
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
        this.threadService.setDiscussThread(this.props.chatWindow.thread);
        this.action.doAction(
            {
                type: "ir.actions.client",
                tag: "mail.action_discuss",
            },
            { clearBreadcrumbs: true }
        );
    }

    close() {
        this.props.chatWindow.close();
        this.chatWindowService.notifyState(this.props.chatWindow);
    }

    resetMessageInEdit() {
        this.state.messageInEditId = undefined;
    }

    startEditingLastMessageOfCurrentUser() {
        const messageToEdit = this.thread.lastEditableMessageOfCurrentUser;
        if (messageToEdit) {
            this.state.messageInEditId = messageToEdit.id;
        }
    }
}
