/* @odoo-module */

import { AttachmentList } from "@mail/new/thread/attachment_list";
import { onExternalClick, useAttachmentUploader, useSelection } from "@mail/new/utils/hooks";
import {
    dataUrlToBlob,
    isDragSourceExternalFile,
    isEventHandled,
    markEventHandled,
} from "@mail/new/utils/misc";
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

export class Composer extends Component {
    setup() {
        this.attachmentUploader = useAttachmentUploader({
            threadId: this.props.composer.thread?.id,
            messageId: this.props.composer.message?.id,
        });
        this.messaging = useMessaging();
        this.ref = useRef("textarea");
        this.typingNotified = false;
        this.state = useState({
            autofocus: 0,
            active: true,
            suggestions: [],
        });
        this.suggestionSearchProps = {
            suggestionDelimiter: undefined,
            suggestionDelimiterPosition: undefined,
            suggestionSearchTerm: undefined,
        };
        this.fetchMentionRpcProps = {
            hasMentionRpcInProgress: false,
            rpcFunction: undefined,
        };
        this.rawMentions = {
            partnerIds: new Set(),
        };
        this.stopTyping = useDebounced(() => {
            this.notifyIsTyping(false);
            this.typingNotified = false;
        }, 1000);
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
                this.detectSuggestionProps();
            },
            () => [
                this.props.composer.selection.start,
                this.props.composer.selection.end,
                this.props.composer.textInputContent,
            ]
        );
        useEffect(
            () => {
                this.updateSuggestionList();
                this.executeOrQueueFunction(async () => {
                    if (
                        this.suggestionSearchProps.suggestionDelimiterPosition === undefined ||
                        this.suggestionSearchProps.suggestionSearchTerm === ""
                    ) {
                        return; // ignore obsolete call
                    }
                    await this.messaging.fetchSuggestions(this.suggestionSearchProps, {
                        threadId: this.props.composer.threadId,
                    });
                    this.updateSuggestionList();
                });
            },
            () => [
                this.suggestionSearchProps.suggestionDelimiter,
                this.suggestionSearchProps.suggestionDelimiterPosition,
                this.suggestionSearchProps.suggestionSearchTerm,
            ]
        );
        useEffect(
            () => {
                if (!this.props.composer.forceCursorMove) {
                    return;
                }
                this.ref.el.selectionStart = this.props.composer.selection.start;
                this.ref.el.selectionEnd = this.props.composer.selection.end;
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
            }, 50000);
        }
        this.stopTyping();
    }

    get hasReplyToHeader() {
        const { messageToReplyTo } = this.messaging.state.discuss;
        if (!messageToReplyTo || !this.props.composer.thread) {
            return false;
        }
        return (
            messageToReplyTo.resId === this.props.composer.thread.id ||
            (this.props.composer.thread.id === "inbox" && messageToReplyTo.needaction)
        );
    }

    get placeholder() {
        if (this.props.placeholder) {
            return this.props.placeholder;
        }
        if (this.thread) {
            return sprintf(this.env._t("Message #%(thread name)s…"), {
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

    get hasSuggestions() {
        return this.state.suggestions
            .map((mainOrExtraSuggestions) => {
                return Boolean(
                    mainOrExtraSuggestions.suggestions &&
                        mainOrExtraSuggestions.suggestions.length > 0
                );
            })
            .reduce((result, hasSuggestion) => result || hasSuggestion, false);
    }

    onKeydown(ev) {
        if (ev.key === "Enter") {
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
        } else if (ev.key === "Escape") {
            this.props.onDiscardCallback();
        }
    }

    detectSuggestionProps() {
        const selectionEnd = this.props.composer.selection.end;
        const selectionStart = this.props.composer.selection.start;
        const content = this.props.composer.textInputContent;
        if (selectionStart !== selectionEnd) {
            // avoid interfering with multi-char selection
            this.clearSuggestionSearch();
        }
        const candidatePositions = [];
        // keep the current delimiter if it is still valid
        if (
            this.suggestionSearchProps.suggestionDelimiterPosition !== undefined &&
            this.suggestionSearchProps.suggestionDelimiterPosition < selectionStart
        ) {
            candidatePositions.push(this.suggestionSearchProps.suggestionDelimiterPosition);
        }
        // consider the char before the current cursor position if the
        // current delimiter is no longer valid (or if there is none)
        if (selectionStart > 0) {
            candidatePositions.push(selectionStart - 1);
        }
        const suggestionDelimiters = ["@", ":", "#", "/"];
        for (const candidatePosition of candidatePositions) {
            if (candidatePosition < 0 || candidatePosition >= content.length) {
                continue;
            }
            const candidateChar = content[candidatePosition];
            if (candidateChar === "/" && candidatePosition !== 0) {
                continue;
            }
            if (!suggestionDelimiters.includes(candidateChar)) {
                continue;
            }
            const charBeforeCandidate = content[candidatePosition - 1];
            if (charBeforeCandidate && !/\s/.test(charBeforeCandidate)) {
                continue;
            }
            Object.assign(this.suggestionSearchProps, {
                suggestionDelimiter: candidateChar,
                suggestionDelimiterPosition: candidatePosition,
                suggestionSearchTerm: content.substring(candidatePosition + 1, selectionStart),
            });
            return;
        }
        this.clearSuggestionSearch();
    }

    async executeOrQueueFunction(func) {
        if (this.fetchMentionRpcProps.hasMentionRpcInProgress) {
            this.fetchMentionRpcProps.rpcFunction = func;
            return;
        }
        this.fetchMentionRpcProps.hasMentionRpcInProgress = true;
        this.fetchMentionRpcProps.rpcFunction = undefined;
        await func();
        this.fetchMentionRpcProps.hasMentionRpcInProgress = false;
        if (this.fetchMentionRpcProps.nextMentionRpcFunction) {
            this.executeOrQueueFunction(this.fetchMentionRpcProps.nextMentionRpcFunction);
        }
    }

    updateSuggestionList() {
        if (!this.suggestionSearchProps.suggestionDelimiter) {
            return;
        }
        const [mainSuggestions, extraSuggestions = {}] = this.messaging.searchSuggestions(
            this.suggestionSearchProps,
            { threadId: this.props.composer.threadId },
            true
        );
        // arbitrary limit to avoid displaying too many elements at once
        // ideally a load more mechanism should be introduced
        const limit = 8;
        mainSuggestions.suggestions.length = Math.min(mainSuggestions.suggestions.length, limit);
        extraSuggestions.suggestions.length = Math.min(
            extraSuggestions.suggestions.length,
            limit - mainSuggestions.suggestions.length
        );
        this.state.suggestions = [mainSuggestions, extraSuggestions];
    }

    insertSuggestion(option) {
        const cursorPosition = this.props.composer.selection.start;
        const content = this.props.composer.textInputContent;
        let textLeft = content.substring(
            0,
            this.suggestionSearchProps.suggestionDelimiterPosition + 1
        );
        let textRight = content.substring(cursorPosition, content.length);
        if (this.suggestionSearchProps.suggestionDelimiter === ":") {
            textLeft = content.substring(
                0,
                this.suggestionSearchProps.suggestionDelimiterPosition - 1
            );
            textRight = content.substring(cursorPosition, content.length);
        }
        const recordReplacement = option.label;
        if (option.partner) {
            this.rawMentions.partnerIds.add(option.partner.id);
        }
        this.clearSuggestionSearch();
        this.props.composer.textInputContent = textLeft + recordReplacement + " " + textRight;
        this.props.composer.selection.start = textLeft.length + recordReplacement.length + 1;
        this.props.composer.selection.end = textLeft.length + recordReplacement.length + 1;
        this.props.composer.forceCursorMove = true;
    }

    clearRawMentions() {
        this.rawMentions.partnerIds.length = 0;
    }

    clearSuggestionSearch() {
        Object.assign(this.suggestionSearchProps, {
            suggestionDelimiter: undefined,
            suggestionDelimiterPosition: undefined,
            suggestionSearchTerm: undefined,
        });
        this.state.suggestions.length = [];
    }

    getNavigableListProps() {
        return {
            anchorRef: this.ref.el,
            position: "top",
            onSelect: (ev, option) => {
                this.insertSuggestion(option);
                markEventHandled(ev, "composer.selectSuggestion");
            },
            sources: this.state.suggestions.map((mainOrExtraSuggestions) => {
                switch (mainOrExtraSuggestions.type) {
                    case "Partner":
                        return {
                            placeholder: "Loading",
                            optionTemplate: "mail.Composer.suggestionPartner",
                            options: mainOrExtraSuggestions.suggestions.map((suggestion) => {
                                return {
                                    label: suggestion.nameOrDisplayName,
                                    partner: suggestion,
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
            const { id: parentId, isNote, resId, resModel } = messageToReplyTo || {};
            const postData = {
                attachments: this.attachmentUploader.attachments,
                isNote: this.props.composer.type === "note" || isNote,
                rawMentions: this.rawMentions,
                parentId,
            };
            if (messageToReplyTo && this.props.composer.thread.id === "inbox") {
                await this.messaging.postInboxReply(resId, resModel, value, postData);
            } else {
                await this.messaging.postMessage(this.props.composer.thread.id, value, postData);
            }
            this.clearRawMentions();
            this.messaging.cancelReplyTo();
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
                this.props.composer.message.id,
                value,
                this.attachmentUploader.attachments,
                this.rawMentions
            )
        );
        this.clearRawMentions();
    }

    async onFileUpload({ data, name, type }) {
        this.attachmentUploader.upload(new File([dataUrlToBlob(data, type)], name, { type }));
    }

    addEmoji(str) {
        const textContent = this.ref.el.value;
        const firstPart = textContent.slice(0, this.props.composer.selection.start);
        const secondPart = textContent.slice(this.props.composer.selection.end, textContent.length);
        this.props.composer.textInputContent = firstPart + str + secondPart;
        this.state.autofocus++;
    }
}

Object.assign(Composer, {
    components: { NavigableList, AttachmentList, FileUploader, Typing },
    defaultProps: {
        mode: "normal",
        onDiscardCallback: () => {},
    }, // mode = compact, normal, extended
    props: [
        "composer",
        "autofocus?",
        "highlightReplyTo?",
        "onDiscardCallback?",
        "onPostCallback?",
        "mode?",
        "placeholder?",
        "dropzoneRef?",
    ],
    template: "mail.composer",
});
