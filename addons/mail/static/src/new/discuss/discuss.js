/* @odoo-module */

import { AutoresizeInput } from "./autoresize_input";
import { Sidebar } from "./sidebar";
import { Thread } from "../thread/thread";
import { ThreadIcon } from "./thread_icon";
import { useMessaging } from "../messaging_hook";
import { useMessageHighlight } from "@mail/new/utils/hooks";
import { Composer } from "../composer/composer";
import { CallUI } from "../rtc/call_ui";
import { ChannelMemberList } from "./channel_member_list";
import { Component, onWillStart, onMounted, onWillUnmount, useRef, useState } from "@odoo/owl";
import { CallSettings } from "../rtc/call_settings";
import { usePopover } from "@web/core/popover/popover_hook";
import { ChannelInvitationForm } from "./channel_invitation_form";

export class Discuss extends Component {
    setup() {
        this.messaging = useMessaging();
        this.messageHighlight = useMessageHighlight();
        this.contentRef = useRef("content");
        this.popover = usePopover();
        this.closePopover = null;
        this.settingsRef = useRef("settings");
        this.addUsersRef = useRef("addUsers");
        this.state = useState({
            /**
             * activeMode:
             *   "member-list": channel member list is displayed
             *   "": no action pannel
             */
            activeMode: "",
        });
        onWillStart(() => this.messaging.isReady);
        onMounted(() => (this.messaging.state.discuss.isActive = true));
        onWillUnmount(() => (this.messaging.state.discuss.isActive = false));
    }

    get thread() {
        return this.messaging.state.threads[this.messaging.state.discuss.threadId];
    }

    unstarAll() {
        this.messaging.unstarAll();
    }
    startCall() {
        this.messaging.startCall(this.messaging.state.discuss.threadId);
    }

    toggleInviteForm() {
        if (this.closePopover) {
            this.closePopover();
            this.closePopover = null;
        } else {
            const el = this.addUsersRef.el;
            this.closePopover = this.popover.add(
                el,
                ChannelInvitationForm,
                {
                    threadId: this.messaging.state.discuss.threadId,
                },
                {
                    onClose: () => (this.closePopover = null),
                }
            );
        }
    }

    toggleSettings() {
        if (this.closePopover) {
            this.closePopover();
            this.closePopover = null;
        } else {
            const el = this.settingsRef.el;
            this.closePopover = this.popover.add(el, CallSettings);
        }
    }

    toggleMemberList() {
        this.state.activeMode = this.state.activeMode === "member-list" ? "" : "member-list";
    }

    async renameThread({ value: name }) {
        const newName = name.trim();
        if (
            newName !== this.thread.name &&
            ((newName && this.thread.type === "channel") ||
                this.thread.type === "chat" ||
                this.thread.type === "group")
        ) {
            await this.messaging.notifyThreadNameToServer(this.thread.id, newName);
        }
    }

    async updateThreadDescription({ value: description }) {
        const newDescription = description.trim();
        if (newDescription !== this.thread.description) {
            await this.messaging.notifyThreadDescriptionToServer(this.thread.id, newDescription);
        }
    }
}

Object.assign(Discuss, {
    components: {
        AutoresizeInput,
        Sidebar,
        Thread,
        ThreadIcon,
        Composer,
        CallUI,
        CallSettings,
        ChannelMemberList,
    },
    props: ["*"],
    template: "mail.discuss",
});
