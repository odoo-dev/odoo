/** @odoo-module */

import { isEventHandled, markEventHandled, onExternalClick } from "@mail/new/utils";
import { useMessaging } from "../messaging_hook";
import { RelativeTime } from "./relative_time";
import { Component, onPatched, useChildSubEnv, useRef, useState } from "@odoo/owl";
import { useService } from "@web/core/utils/hooks";
import { Composer } from "../composer/composer";
import { MessageDeleteDialog } from "../thread/message_delete_dialog";
import { LinkPreviewList } from "./link_preview/link_preview_list";
import { MessageInReplyTo } from "@mail/new/thread/message_in_reply_to";

export class Message extends Component {
    setup() {
        this.state = useState({
            isEditing: false,
        });
        this.ref = useRef("ref");
        this.messaging = useMessaging();
        this.action = useService("action");
        this.user = useService("user");
        this.message = this.props.message;
        useChildSubEnv({
            LinkPreviewListComponent: LinkPreviewList,
            alignedRight: this.isAlignedRight,
        });
        onExternalClick("ref", async (ev) => {
            // Let event be handled by bubbling handlers first.
            await new Promise(setTimeout);
            if (isEventHandled(ev, "emoji.selectEmoji")) {
                return;
            }
            // Stop editing the message on click away.
            if (!this.ref.el || ev.target === this.ref.el || this.ref.el.contains(ev.target)) {
                return;
            }
            this.state.isEditing = false;
        });
        onPatched(() => {
            if (this.props.highlighted && this.ref.el) {
                this.ref.el.scrollIntoView({ behavior: "smooth", block: "center" });
            }
        });
    }

    get canBeDeleted() {
        if (!this.props.hasActions) {
            return false;
        }
        if (!this.user.isAdmin && this.message.author.id !== this.user.partnerId) {
            return false;
        }
        if (this.message.type !== "comment") {
            return false;
        }
        return this.message.isNote || this.message.resModel === "mail.channel";
    }

    get canBeEdited() {
        return this.canBeDeleted;
    }

    get canReplyTo() {
        return this.message.needaction || this.message.resModel === "mail.channel";
    }

    get isAlignedRight() {
        return Boolean(
            this.env.inChatWindow && this.user.partnerId === this.props.message.author.id
        );
    }

    toggleStar() {
        this.messaging.toggleStar(this.props.message.id);
    }

    onClickDelete() {
        this.env.services.dialog.add(MessageDeleteDialog, {
            message: this.message,
            messageComponent: Message,
        });
    }

    onClickReplyTo(ev) {
        markEventHandled(ev, "message.replyTo");
        this.messaging.toggleReplyTo(this.message);
    }

    openRecord() {
        this.action.doAction({
            type: "ir.actions.act_window",
            res_id: this.message.resId,
            res_model: this.message.resModel,
            views: [[false, "form"]],
        });
    }

    get hasOpenChatFromAvatarClick() {
        return this.message.author.id !== this.messaging.user.partnerId;
    }

    openChatAvatar() {
        if (this.hasOpenChatFromAvatarClick) {
            this.messaging.openChat({ partnerId: this.message.author.id });
        }
    }
}

Object.assign(Message, {
    components: { Composer, MessageInReplyTo, RelativeTime, LinkPreviewList },
    defaultProps: { hasActions: true, onParentMessageClick: () => {} },
    props: [
        "hasActions?",
        "grayedOut?",
        "highlighted?",
        "onParentMessageClick?",
        "message",
        "squashed?",
    ],
    template: "mail.message",
});
