/* @odoo-module */

import { AttachmentList } from "@mail/new/thread/attachment_list";
import { onExternalClick, useAttachmentUploader } from "@mail/new/utils/hooks";
import { dataUrlToBlob, isDragSourceExternalFile, isEventHandled } from "@mail/new/utils/misc";
import {
    Component,
    onMounted,
    onWillDestroy,
    useChildSubEnv,
    useEffect,
    useRef,
    useState,
} from "@odoo/owl";
import { useDropzone } from "../dropzone/dropzone_hook";
import { useMessaging } from "../messaging_hook";
import { useEmojiPicker } from "./emoji_picker";

import { sprintf } from "@web/core/utils/strings";
import { FileUploader } from "@web/views/fields/file_handler";

export class Composer extends Component {
    setup() {
        this.attachmentUploader = useAttachmentUploader({
            threadId: this.props.composer.threadId,
            messageId: this.props.composer.messageId,
        });
        this.messaging = useMessaging();
        this.ref = useRef("textarea");
        this.state = useState({
            autofocus: 0,
            active: true,
        });
        if (this.props.dropzoneRef) {
            useDropzone(this.props.dropzoneRef, {
                onDrop: (ev) => {
                    if (isDragSourceExternalFile(ev.dataTransfer)) {
                        [...ev.dataTransfer.files].forEach(this.attachmentUploader.upload);
                    }
                },
            });
        }
        useChildSubEnv({
            inComposer: true,
        });
        useEmojiPicker("emoji-picker", {
            onSelect: (str) => this.addEmoji(str),
        });
        useEffect(
            (focus) => {
                if (focus && this.ref.el) {
                    this.ref.el.focus();
                }
            },
            () => [this.props.autofocus + this.state.autofocus, this.props.placeholder]
        );
        useEffect(
            (messageToReplyTo) => {
                if (messageToReplyTo && messageToReplyTo.resId === this.props.composer.threadId) {
                    this.state.autofocus++;
                }
            },
            () => [this.messaging.state.discuss.messageToReplyTo]
        );
        useEffect(
            () => {
                this.ref.el.style.height = "1px";
                this.ref.el.style.height = this.ref.el.scrollHeight + "px";
            },
            () => [this.props.composer.textInputContent, this.ref.el]
        );
        onMounted(() => this.ref.el.scrollTo({ top: 0, behavior: "instant" }));
        onExternalClick("composer", async (ev) => {
            // Let event be handled by bubbling handlers first.
            await new Promise(setTimeout);
            if (isEventHandled(ev, "message.replyTo") || isEventHandled(ev, "emoji.selectEmoji")) {
                return;
            }
            this.messaging.cancelReplyTo();
        });
        onWillDestroy(() => this.attachmentUploader.unlinkAll());
    }

    get hasReplyToHeader() {
        const { messageToReplyTo } = this.messaging.state.discuss;
        if (!messageToReplyTo) {
            return false;
        }
        return (
            messageToReplyTo.resId === this.props.composer.threadId ||
            (this.props.composer.threadId === "inbox" && messageToReplyTo.needaction)
        );
    }

    get placeholder() {
        if (this.props.placeholder) {
            return this.props.placeholder;
        }
        if (this.thread) {
            return sprintf(this.env._t("Message #%(thread name)s…"), {
                "thread name": this.thread.name,
            });
        }
        return "";
    }

    get thread() {
        if (this.props.composer.threadId) {
            return this.messaging.state.threads[this.props.composer.threadId];
        }
        return null;
    }

    get message() {
        return this.props.composer.messageId
            ? this.messaging.state.messages[this.props.composer.messageId]
            : null;
    }

    get isSendButtonDisabled() {
        return (
            (!this.props.composer.textInputContent &&
                this.attachmentUploader.attachments.length === 0) ||
            this.attachmentUploader.attachments.some(({ uploading }) => Boolean(uploading))
        );
    }

    onKeydown(ev) {
        if (ev.key === "Enter") {
            const shouldPost = this.props.mode === "extended" ? ev.ctrlKey : !ev.shiftKey;
            if (!shouldPost) {
                return;
            }
            ev.preventDefault(); // to prevent useless return
            if (this.props.composer.messageId) {
                this.editMessage();
            } else {
                this.sendMessage();
            }
        } else if (ev.key === "Escape") {
            this.props.onDiscardCallback();
        }
    }

    async processMessage(cb) {
        const el = this.ref.el;
        const attachments = this.attachmentUploader.attachments;
        if (
            el.value.trim() ||
            (attachments.length > 0 && attachments.every(({ uploading }) => !uploading)) ||
            (this.message && this.message.attachments.length > 0)
        ) {
            if (!this.state.active) {
                return;
            }
            this.state.active = false;
            await cb(el.value);
            if (this.props.onPostCallback) {
                this.props.onPostCallback();
            }
            this.state.active = true;
        }
        this.attachmentUploader.reset();
        this.props.composer.textInputContent = "";
        el.focus();
    }

    async sendMessage() {
        return this.processMessage(async (value) => {
            const { messageToReplyTo } = this.messaging.state.discuss;
            const { id: parentId, isNote, resId, resModel } = messageToReplyTo || {};
            const postData = {
                attachments: this.attachmentUploader.attachments,
                isNote: this.props.type === "note" || isNote,
                parentId,
            };
            if (
                messageToReplyTo &&
                this.props.composer.threadId === this.messaging.state.discuss.inbox.id
            ) {
                await this.messaging.postInboxReply(resId, resModel, value, postData);
            } else {
                await this.messaging.postMessage(this.props.composer.threadId, value, postData);
            }
            this.messaging.cancelReplyTo();
        });
    }

    async editMessage() {
        return this.processMessage(async (value) =>
            this.messaging.updateMessage(
                this.props.composer.messageId,
                value,
                this.attachmentUploader.attachments
            )
        );
    }

    async onFileUpload({ data, name, type }) {
        this.attachmentUploader.upload(new File([dataUrlToBlob(data, type)], name, { type }));
    }

    addEmoji(str) {
        this.props.composer.textInputContent += str;
        this.state.autofocus++;
    }
}

Object.assign(Composer, {
    components: { AttachmentList, FileUploader },
    defaultProps: {
        mode: "normal",
        onDiscardCallback: () => {},
        type: "message",
    }, // mode = compact, normal, extended
    props: [
        "composer",
        "autofocus?",
        "highlightReplyTo?",
        "onDiscardCallback?",
        "onPostCallback?",
        "mode?",
        "placeholder?",
        "type?",
        "dropzoneRef?",
    ],
    template: "mail.composer",
});
