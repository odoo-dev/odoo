/* @odoo-module */

import { Component, onMounted, onWillStart, onWillUpdateProps, useRef, useState } from "@odoo/owl";
import { useMessaging } from "../messaging_hook";
import {
    useAutoScroll,
    useScrollPosition,
    useScrollSnapshot,
    useVisible,
} from "@mail/new/utils/hooks";
import { Message } from "./message";

import { Transition } from "@web/core/transition";
import { useService } from "@web/core/utils/hooks";

export class Thread extends Component {
    static components = { Message, Transition };
    static props = [
        "thread",
        "messageHighlight?",
        "order?",
        "messageInEditId?",
        "resetMessageInEdit?",
    ];
    static defaultProps = {
        order: "asc", // 'asc' or 'desc'
    };
    static template = "mail.thread";

    setup() {
        this.messaging = useMessaging();
        this.threadService = useState(useService("mail.thread"));
        if (!this.env.inChatter) {
            useAutoScroll("messages", () => {
                if (
                    this.props.messageHighlight &&
                    this.props.messageHighlight.highlightedMessageId
                ) {
                    return false;
                }
                if (this.props.thread.scrollPosition.isSaved) {
                    return false;
                }
                return true;
            });
        }
        this.messagesRef = useRef("messages");
        this.pendingLoadMore = false;
        this.loadMoreState = useVisible("load-more", () => this.loadMore());
        this.oldestNonTransientMessageId = null;
        this.scrollPosition = useScrollPosition(
            "messages",
            this.props.thread.scrollPosition,
            "bottom"
        );
        useScrollSnapshot("messages", {
            onWillPatch: () => {
                return {
                    hasMoreMsgsAbove:
                        this.props.thread.oldestNonTransientMessage?.id !==
                            this.oldestNonTransientMessage && this.props.order === "asc",
                };
            },
            onPatched: ({ hasMoreMsgsAbove, scrollTop, scrollHeight }) => {
                const el = this.messagesRef.el;
                const wasPendingLoadMore = this.pendingLoadMore;
                if (hasMoreMsgsAbove) {
                    el.scrollTop = scrollTop + el.scrollHeight - scrollHeight;
                    this.pendingLoadMore = false;
                }
                this.oldestNonTransientMessage = this.props.thread.oldestNonTransientMessage?.id;
                if (!wasPendingLoadMore) {
                    this.loadMore();
                }
            },
        });
        onMounted(() => {
            this.oldestNonTransientMessage = this.props.thread.oldestNonTransientMessage?.id;
            this.loadMore();
            this.scrollPosition.restore();
        });
        onWillStart(() => this.requestMessages(this.props.thread));
        onWillUpdateProps((nextProps) => this.requestMessages(nextProps.thread));
    }

    loadMore() {
        if (
            this.loadMoreState.isVisible &&
            this.props.thread.status !== "loading" &&
            !this.pendingLoadMore
        ) {
            this.threadService.fetchMoreMessages(this.props.thread);
            this.pendingLoadMore = true;
        }
    }

    requestMessages(thread) {
        // does not return the promise, so the thread is immediately rendered
        // then updated whenever messages get here
        this.threadService.fetchNewMessages(thread);
    }

    isGrayedOut(msg) {
        const { messageToReplyTo } = this.messaging.state.discuss;
        return (
            messageToReplyTo &&
            messageToReplyTo.id !== msg.id &&
            messageToReplyTo.resId === msg.resId
        );
    }

    isSquashed(msg, prevMsg) {
        if (!prevMsg || prevMsg.type === "notification" || prevMsg.isEmpty || this.env.inChatter) {
            return false;
        }

        if (msg.author?.id !== prevMsg.author?.id) {
            return false;
        }
        if (msg.resModel !== prevMsg.resModel || msg.resId !== prevMsg.resId) {
            return false;
        }
        if (msg.parentMessage) {
            return false;
        }
        return msg.dateTime.ts - prevMsg.dateTime.ts < 60 * 1000;
    }
}
