/** @odoo-module */

import { PartnerImStatus } from "@mail/new/discuss/partner_im_status";
import { AttachmentList } from "@mail/new/thread/attachment_list";
import { MessageInReplyTo } from "@mail/new/thread/message_in_reply_to";
import { isEventHandled, markEventHandled } from "@mail/new/utils/misc";
import { removeFromArrayWithPredicate } from "@mail/new/utils/arrays";
import { onExternalClick } from "@mail/new/utils/hooks";
import { Component, onPatched, useChildSubEnv, useRef, useState } from "@odoo/owl";
import { useService } from "@web/core/utils/hooks";
import { Composer } from "../composer/composer";
import { Composer as ComposerModel } from "../core/composer_model";
import { useMessaging } from "../messaging_hook";
import { MessageDeleteDialog } from "../thread/message_delete_dialog";
import { LinkPreviewList } from "./link_preview/link_preview_list";
import { RelativeTime } from "./relative_time";

export class Message extends Component {
    setup() {
        this.state = useState({
            isEditing: false,
        });
        this.ref = useRef("ref");
        this.messaging = useMessaging();
        this.action = useService("action");
        this.user = useService("user");
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
            this.exitEditMode();
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
        if (!this.user.isAdmin && this.props.message.author.id !== this.user.partnerId) {
            return false;
        }
        if (this.props.message.type !== "comment") {
            return false;
        }
        return this.props.message.isNote || this.props.message.resModel === "mail.channel";
    }

    get canBeEdited() {
        return this.canBeDeleted;
    }

    get canReplyTo() {
        return this.props.message.needaction || this.props.message.resModel === "mail.channel";
    }

    get isAlignedRight() {
        return Boolean(
            this.env.inChatWindow && this.user.partnerId === this.props.message.author.id
        );
    }

    get isOriginThread() {
        if (!this.props.threadId) {
            return false;
        }
        const thread = this.messaging.state.threads[this.props.threadId];
        // channel has no resId, it's indistinguishable from threadId in that case
        return this.props.message.resId === (thread.resId || this.props.threadId);
    }

    toggleStar() {
        this.messaging.toggleStar(this.props.message.id);
    }

    onClickDelete() {
        this.env.services.dialog.add(MessageDeleteDialog, {
            message: this.props.message,
            messageComponent: Message,
        });
    }

    onClickReplyTo(ev) {
        markEventHandled(ev, "message.replyTo");
        this.messaging.toggleReplyTo(this.props.message);
    }

    async onClickAttachmentUnlink(attachment) {
        await this.messaging.unlinkAttachment(attachment);
        removeFromArrayWithPredicate(
            this.props.message.attachments,
            ({ id }) => id === attachment.id
        );
    }

    openRecord() {
        if (this.props.message.resModel === "mail.channel") {
            this.messaging.openDiscussion(this.props.message.resId);
        } else {
            this.action.doAction({
                type: "ir.actions.act_window",
                res_id: this.props.message.resId,
                res_model: this.props.message.resModel,
                views: [[false, "form"]],
            });
        }
    }

    openChatAvatar() {
        if (this.props.message.author.isCurrentUser) {
            this.messaging.openChat({ partnerId: this.message.author.id });
        }
    }

    /**
     * @param {MouseEvent} ev
     */
    onClickEdit(ev) {
        this.props.message.composer = ComposerModel.insert(this.messaging.state, {
            messageId: this.props.message.id,
        });
        this.state.isEditing = true;
    }

    exitEditMode() {
        this.props.message.composer = null;
        this.state.isEditing = false;
    }
}

Object.assign(Message, {
    components: {
        AttachmentList,
        Composer,
        MessageInReplyTo,
        RelativeTime,
        LinkPreviewList,
        PartnerImStatus,
    },
    defaultProps: { hasActions: true, onParentMessageClick: () => {} },
    props: [
        "hasActions?",
        "grayedOut?",
        "highlighted?",
        "onParentMessageClick?",
        "message",
        "squashed?",
        "threadId?",
    ],
    template: "mail.message",
});
