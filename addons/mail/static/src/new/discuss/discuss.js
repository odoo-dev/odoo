/* @odoo-module */

import { AutoresizeInput } from "./autoresize_input";
import { Sidebar } from "./sidebar";
import { Thread } from "../thread/thread";
import { ThreadIcon } from "./thread_icon";
import { useMessaging } from "../core/messaging_hook";
import { useRtc } from "../rtc/rtc_hook";
import { useMessageEdition, useMessageHighlight } from "@mail/new/utils/hooks";
import { Composer } from "../composer/composer";
import { Call } from "../rtc/call";
import { ChannelMemberList } from "./channel_member_list";
import {
    Component,
    onWillStart,
    onMounted,
    onWillUnmount,
    useChildSubEnv,
    useRef,
    useState,
    useEffect,
} from "@odoo/owl";
import { CallSettings } from "../rtc/call_settings";
import { usePopover } from "@web/core/popover/popover_hook";
import { useService } from "@web/core/utils/hooks";
import { ChannelInvitationForm } from "./channel_invitation_form";
import { _t } from "@web/core/l10n/translation";

export class Discuss extends Component {
    static components = {
        AutoresizeInput,
        Sidebar,
        Thread,
        ThreadIcon,
        Composer,
        Call,
        CallSettings,
        ChannelMemberList,
    };
    static props = ["*"];
    static template = "mail.discuss";

    setup() {
        this.messaging = useMessaging();
        this.threadService = useState(useService("mail.thread"));
        this.messageService = useState(useService("mail.message"));
        this.rtc = useRtc();
        this.messageHighlight = useMessageHighlight();
        this.messageEdition = useMessageEdition();
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
        this.orm = useService("orm");
        this.effect = useService("effect");
        this.prevInboxCounter = this.messaging.state.discuss.inbox.counter;
        useChildSubEnv({
            inDiscuss: true,
        });
        useEffect(
            () => {
                if (
                    this.prevInboxCounter !== this.messaging.state.discuss.inbox.counter &&
                    this.messaging.state.discuss.inbox.counter === 0
                ) {
                    this.effect.add({
                        message: _t("Congratulations, your inbox is empty!"),
                        type: "rainbow_man",
                        fadeout: "fast",
                    });
                }
                this.prevInboxCounter = this.messaging.state.discuss.inbox.counter;
            },
            () => [this.messaging.state.discuss.inbox.counter]
        );
        onWillStart(() => this.messaging.isReady);
        onMounted(() => (this.messaging.state.discuss.isActive = true));
        onWillUnmount(() => (this.messaging.state.discuss.isActive = false));
    }

    markAllAsRead() {
        this.orm.silent.call("mail.message", "mark_all_as_read");
    }

    get thread() {
        return this.messaging.state.threads[this.messaging.state.discuss.threadLocalId];
    }

    unstarAll() {
        this.messageService.unstarAll();
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
                    thread: this.thread,
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
            newName !== this.thread.displayName &&
            ((newName && this.thread.type === "channel") ||
                this.thread.type === "chat" ||
                this.thread.type === "group")
        ) {
            await this.threadService.notifyThreadNameToServer(this.thread, newName);
        }
    }

    async updateThreadDescription({ value: description }) {
        const newDescription = description.trim();
        if (!newDescription && !this.thread.description) {
            return;
        }
        if (newDescription !== this.thread.description) {
            await this.threadService.notifyThreadDescriptionToServer(this.thread, newDescription);
        }
    }
}
