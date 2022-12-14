/* @odoo-module */

import { PartnerImStatus } from "@mail/new/discuss/partner_im_status";
import { AttachmentList } from "@mail/new/thread/attachment_list";
import { MessageInReplyTo } from "@mail/new/thread/message_in_reply_to";
import { isEventHandled, markEventHandled } from "@mail/new/utils/misc";
import { removeFromArrayWithPredicate } from "@mail/new/utils/arrays";
import { convertBrToLineBreak } from "@mail/new/utils/format";
import { onExternalClick } from "@mail/new/utils/hooks";
import { Component, onPatched, useChildSubEnv, useRef, useState } from "@odoo/owl";
import { useService } from "@web/core/utils/hooks";
import { Composer } from "../composer/composer";
import { Composer as ComposerModel } from "../core/composer_model";
import { useMessaging } from "../messaging_hook";
import { MessageDeleteDialog } from "../thread/message_delete_dialog";
import { LinkPreviewList } from "./link_preview/link_preview_list";
import { RelativeTime } from "./relative_time";
import { MessageReactions } from "@mail/new/thread/message_reactions";
import { useEmojiPicker } from "../composer/emoji_picker";

/**
 * @typedef {Object} Props
 * @property {boolean} [hasActions]
 * @property {boolean} [grayedOut]
 * @property {boolean} [highlighted]
 * @property {function} [onParentMessageClick]
 * @property {import("@mail/new/core/message_model").Message} message
 * @property {boolean} [squashed]
 * @property {string} [threadLocalId]
 * @extends {Component<Props, Env>}
 */
export class Message extends Component {
    static components = {
        AttachmentList,
        Composer,
        LinkPreviewList,
        MessageInReplyTo,
        MessageReactions,
        PartnerImStatus,
        RelativeTime,
    };
    static defaultProps = {
        hasActions: true,
        onParentMessageClick: () => {},
    };
    static props = [
        "hasActions?",
        "grayedOut?",
        "highlighted?",
        "onParentMessageClick?",
        "message",
        "squashed?",
        "threadLocalId?",
    ];
    static template = "mail.message";

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
        if (this.props.hasActions && this.canAddReaction) {
            useEmojiPicker("emoji-picker", {
                onSelect: (emoji) => {
                    const reaction = this.message.reactions.find(
                        ({ content, partners }) =>
                            content === emoji &&
                            partners.find(({ id }) => id === this.user.partnerId)
                    );
                    if (reaction) {
                        this.messaging.removeReaction(reaction);
                    } else {
                        this.messaging.addReaction(this.message.id, emoji);
                    }
                },
            });
        }
    }

    get message() {
        return this.props.message;
    }

    /**
     * @returns {boolean}
     */
    get canAddReaction() {
        return Boolean(!this.message.isTransient && this.message.resId);
    }

    get canBeDeleted() {
        if (!this.props.hasActions) {
            return false;
        }
        if (!this.user.isAdmin && !this.message.isAuthoredByCurrentUser) {
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

    /**
     * @returns {boolean}
     */
    get canToggleStar() {
        return Boolean(!this.message.isTransient && this.message.resId);
    }

    get isAlignedRight() {
        return Boolean(
            this.env.inChatWindow && this.user.partnerId === this.props.message.author.id
        );
    }

    get isOriginThread() {
        if (!this.props.threadLocalId) {
            return false;
        }
        return this.message.originThread.localId === this.props.threadLocalId;
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

    async onClickAttachmentUnlink(attachment) {
        await this.messaging.unlinkAttachment(attachment);
        removeFromArrayWithPredicate(this.message.attachments, ({ id }) => id === attachment.id);
    }

    openRecord() {
        if (this.message.resModel === "mail.channel") {
            this.messaging.openDiscussion(this.message.originThread.localId);
        } else {
            this.action.doAction({
                type: "ir.actions.act_window",
                res_id: this.message.resId,
                res_model: this.message.resModel,
                views: [[false, "form"]],
            });
        }
    }

    openChatAvatar() {
        if (this.message.author.isCurrentUser) {
            this.messaging.openChat({ partnerId: this.message.author.id });
        }
    }

    /**
     * @param {MouseEvent} ev
     */
    onClickEdit(ev) {
        ComposerModel.insert(this.messaging.state, {
            message: this.props.message,
            textInputContent: convertBrToLineBreak(this.props.message.body),
        });
        this.state.isEditing = true;
    }

    exitEditMode() {
        this.message.composer = null;
        this.state.isEditing = false;
    }
}
