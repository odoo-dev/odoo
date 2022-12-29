/* @odoo-module */

import { AttachmentList } from "@mail/new/thread/attachment_list";
import { onExternalClick, useAttachmentUploader, useSelection } from "@mail/new/utils/hooks";
import { isDragSourceExternalFile, isEventHandled, markEventHandled } from "@mail/new/utils/misc";
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
import { NavigableList } from "./navigable_list";
import { useEmojiPicker } from "./emoji_picker";

import { sprintf } from "@web/core/utils/strings";
import { FileUploader } from "@web/views/fields/file_handler";
import { Typing } from "./typing";
import { useDebounced } from "@web/core/utils/timing";
import { browser } from "@web/core/browser/browser";
import { useSuggestion } from "./composer_hook";

import { _t } from "@web/core/l10n/translation";

export const SHORT_TYPING = 5000;
export const LONG_TYPING = 50000;

export class Composer extends Component {
    static components = { NavigableList, AttachmentList, FileUploader, Typing };
    static defaultProps = {
        mode: "normal",
    }; // mode = compact, normal, extended
    static props = [
        "composer",
        "autofocus?",
        "highlightReplyTo?",
        "onDiscardCallback?",
        "onPostCallback?",
        "mode?",
        "placeholder?",
        "dropzoneRef?",
        "startEditingLastMessageOfCurrentUser?",
    ];
    static template = "mail.composer";

    setup() {
        this.attachmentUploader = useAttachmentUploader(
            this.props.composer.thread,
            this.props.composer.message
        );
        this.messaging = useMessaging();
        this.ref = useRef("textarea");
        this.typingNotified = false;
        this.state = useState({
            autofocus: 0,
            active: true,
        });
        this.suggestion = useSuggestion();
        this.stopTyping = useDebounced(() => {
            this.notifyIsTyping(false);
            this.typingNotified = false;
        }, SHORT_TYPING);
        this.selection = useSelection({
            refName: "textarea",
            model: this.props.composer.selection,
            preserveOnClickAwayPredicate: async (ev) => {
                // Let event be handled by bubbling handlers first.
                await new Promise(setTimeout);
                return (
                    !this.isEventTrusted(ev) ||
                    isEventHandled(ev, "sidebar.openThread") ||
                    isEventHandled(ev, "emoji.selectEmoji") ||
                    isEventHandled(ev, "composer.clickOnAddEmoji") ||
                    isEventHandled(ev, "composer.clickOnAddAttachment") ||
                    isEventHandled(ev, "composer.selectSuggestion")
                );
            },
        });
        if (this.props.dropzoneRef) {
            useDropzone(this.props.dropzoneRef, (ev) => {
                if (isDragSourceExternalFile(ev.dataTransfer)) {
                    for (const file of ev.dataTransfer.files) {
                        this.attachmentUploader.uploadFile(file);
                    }
                }
            });
        }
        useChildSubEnv({
            inComposer: true,
        });
        useEmojiPicker("emoji-picker", {
            onSelect: (str) => this.addEmoji(str),
            onClose: () => this.state.autofocus++,
        });
        useEffect(
            (focus) => {
                if (focus && this.ref.el) {
                    this.selection.restore();
                    this.ref.el.focus();
                }
            },
            () => [this.props.autofocus + this.state.autofocus, this.props.placeholder]
        );
        useEffect(
            (messageToReplyTo) => {
                if (messageToReplyTo && messageToReplyTo.resId === this.props.composer.thread?.id) {
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
        useEffect(
            () => {
                if (!this.props.composer.forceCursorMove) {
                    return;
                }
                this.selection.restore();
                this.props.composer.forceCursorMove = false;
            },
            () => [this.props.composer.forceCursorMove]
        );
        onMounted(() => {
            this.selection.restore();
            this.state.autofocus++;
            this.ref.el.scrollTo({ top: 0, behavior: "instant" });
        });
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

    typing(ev) {
        if (!this.typingNotified && !ev.target.value.startsWith("/")) {
            this.notifyIsTyping();
            this.typingNotified = true;
            browser.setTimeout(() => {
                this.typingNotified = false;
            }, LONG_TYPING);
        }
        this.stopTyping();
    }

    get hasSuggestions() {
        return this.suggestion.state.items.length > 0;
    }

    get hasReplyToHeader() {
        const { messageToReplyTo } = this.messaging.state.discuss;
        const thread = this.props.composer.thread;
        if (!messageToReplyTo || !thread) {
            return false;
        }
        return (
            messageToReplyTo.resId === thread.id ||
            (thread.type === "mailbox" && thread.messages.includes(messageToReplyTo.id))
        );
    }

    get placeholder() {
        if (this.props.placeholder) {
            return this.props.placeholder;
        }
        if (this.thread) {
            if (this.thread.type === "channel") {
                return sprintf(_t("Message #%(thread name)s…"), {
                    "thread name": this.thread.displayName,
                });
            }
            return sprintf(_t("Message %(thread name)s…"), {
                "thread name": this.thread.displayName,
            });
        }
        return "";
    }

    get thread() {
        return this.props.composer.thread ?? null;
    }

    get message() {
        return this.props.composer.message ?? null;
    }

    get isSendButtonDisabled() {
        return (
            (!this.props.composer.textInputContent &&
                this.attachmentUploader.attachments.length === 0) ||
            this.attachmentUploader.attachments.some(({ uploading }) => Boolean(uploading))
        );
    }

    onKeydown(ev) {
        switch (ev.key) {
            case "ArrowUp":
                if (this.hasSuggestions) {
                    return;
                }
                this.props.startEditingLastMessageOfCurrentUser?.();
                break;
            case "Enter": {
                if (isEventHandled(ev, "NavigableList.select")) {
                    return;
                }
                const shouldPost = this.props.mode === "extended" ? ev.ctrlKey : !ev.shiftKey;
                if (!shouldPost) {
                    return;
                }
                ev.preventDefault(); // to prevent useless return
                if (this.props.composer.message) {
                    this.editMessage();
                } else {
                    this.sendMessage();
                }
                break;
            }
            case "Escape":
                if (isEventHandled(ev, "NavigableList.close")) {
                    return;
                }
                if (this.props.onDiscardCallback) {
                    this.props.onDiscardCallback();
                    markEventHandled(ev, "Composer.discard");
                }
                break;
        }
    }

    getNavigableListProps() {
        return {
            anchorRef: this.ref.el,
            position: "top",
            onSelect: (ev, option) => {
                this.suggestion.insert(option);
                markEventHandled(ev, "composer.selectSuggestion");
            },
            sources: this.suggestion.state.items.map((mainOrExtraSuggestions) => {
                switch (mainOrExtraSuggestions.type) {
                    case "Partner":
                        return {
                            placeholder: "Loading",
                            optionTemplate: "mail.Composer.suggestionPartner",
                            options: mainOrExtraSuggestions.suggestions.map((suggestion) => {
                                return {
                                    label: suggestion.nameOrDisplayName,
                                    partner: suggestion,
                                    classList:
                                        "o-composer-suggestion o-composer-suggestion-partner",
                                };
                            }),
                        };
                    case "Thread":
                        return {
                            placeholder: "Loading",
                            optionTemplate: "mail.Composer.suggestionThread",
                            options: mainOrExtraSuggestions.suggestions.map((suggestion) => {
                                return {
                                    label: suggestion.displayName,
                                    thread: suggestion,
                                    classList: "o-composer-suggestion o-composer-suggestion-thread",
                                };
                            }),
                        };
                    case "ChannelCommand":
                        return {
                            placeholder: "Loading",
                            optionTemplate: "mail.Composer.suggestionChannelCommand",
                            options: mainOrExtraSuggestions.suggestions.map((suggestion) => {
                                return {
                                    label: suggestion.name,
                                    help: suggestion.help,
                                    classList:
                                        "o-composer-suggestion o-composer-suggestion-channel-command",
                                };
                            }),
                        };
                    case "CannedResponse":
                        return {
                            placeholder: "Loading",
                            optionTemplate: "mail.Composer.suggestionCannedResponse",
                            options: mainOrExtraSuggestions.suggestions.map((suggestion) => {
                                return {
                                    name: suggestion.name,
                                    label: suggestion.substitution,
                                    classList:
                                        "o-composer-suggestion o-composer-suggestion-canned-response",
                                };
                            }),
                        };
                    default:
                        return {
                            options: [],
                        };
                }
            }),
        };
    }

    onClickAddAttachment(ev) {
        markEventHandled(ev, "composer.clickOnAddAttachment");
        this.selection.restore();
        this.state.autofocus++;
    }

    onClickAddEmoji(ev) {
        markEventHandled(ev, "composer.clickOnAddEmoji");
    }

    isEventTrusted(ev) {
        // Allow patching during tests
        return ev.isTrusted;
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
            const thread = messageToReplyTo?.originThread ?? this.props.composer.thread;
            const postData = {
                attachments: this.attachmentUploader.attachments,
                isNote: this.props.composer.type === "note" || messageToReplyTo?.isNote,
                rawMentions: this.suggestion.rawMentions,
                parentId: messageToReplyTo?.id,
            };
            const message = await this.messaging.postMessage(thread, value, postData);
            if (this.props.composer.thread.type === "mailbox") {
                this.env.services.notification.add(
                    sprintf(_t('Message posted on "%s"'), message.originThread.displayName),
                    { type: "info" }
                );
            }
            this.suggestion.clearRawMentions();
            this.messaging.cancelReplyTo();
            if (this.typingNotified) {
                this.typingNotified = false;
                this.notifyIsTyping(false);
            }
        });
    }

    /**
     * Notify the server of the current typing status
     *
     * @param {boolean} [is_typing=true]
     */
    notifyIsTyping(is_typing = true) {
        if (["chat", "channel"].includes(this.thread?.type)) {
            this.messaging.rpc(
                "/mail/channel/notify_typing",
                {
                    channel_id: this.thread.id,
                    is_typing,
                },
                { silent: true }
            );
        }
    }

    async editMessage() {
        await this.processMessage(async (value) =>
            this.messaging.updateMessage(
                this.props.composer.message,
                value,
                this.attachmentUploader.attachments,
                this.suggestion.rawMentions
            )
        );
        this.suggestion.clearRawMentions();
    }

    addEmoji(str) {
        const textContent = this.ref.el.value;
        const firstPart = textContent.slice(0, this.props.composer.selection.start);
        const secondPart = textContent.slice(this.props.composer.selection.end, textContent.length);
        this.props.composer.textInputContent = firstPart + str + secondPart;
        this.selection.moveCursor((firstPart + str).length);
        this.state.autofocus++;
    }
}
