import { onWillRender, useChildSubEnv, useRef, useState, useSubEnv } from "@web/owl2/utils";
import { Composer } from "@mail/core/common/composer";
import { Thread } from "@mail/core/common/thread";
import { useMessageScrolling } from "@mail/utils/common/hooks";

import { Component, onMounted, onWillUpdateProps } from "@odoo/owl";

import { _t } from "@web/core/l10n/translation";
import { router } from "@web/core/browser/router";
import { useService } from "@web/core/utils/hooks";
import { useThrottleForAnimation } from "@web/core/utils/timing";

/**
 * @typedef {Object} Props
 * @extends {Component<Props, Env>}
 */
export class Chatter extends Component {
    static template = "mail.Chatter";
    static components = { Thread, Composer };
    static props = ["composer?", "threadId?", "threadModel", "twoColumns?"];
    static defaultProps = { composer: true, threadId: false, twoColumns: false };

    setup() {
        window.aku = this;
        this.store = useService("mail.store");
        this.state = useState({
            jumpThreadPresent: 0,
            /** @type {import("models").Thread} */
            akuThread: undefined,
            aside: false,
            disabled: !this.props.threadId,
        });
        this.messageHighlight = useMessageScrolling({
            thread: () => this.state.akuThread,
            messageFetchRouteParams: () => this.messageFetchRouteParams,
        });
        this.highlightMessage = router.current.highlight_message_id;
        this.rootRef = useRef("root");
        this.onScrollDebounced = useThrottleForAnimation(this.onScroll);
        useChildSubEnv(this.childSubEnv);
        useSubEnv(this.subEnv);
        onWillRender(() => {
            console.log(this.state.akuThread?.localId);
            console.count("AKU - onWillRender of Chatter");
        });

        onMounted(this._onMounted);
        onWillUpdateProps((nextProps) => {
            this.state.disabled = !nextProps.threadId;
            if (
                this.props.threadId !== nextProps.threadId ||
                this.props.threadModel !== nextProps.threadModel
            ) {
                this.changeThread(nextProps.threadModel, nextProps.threadId);
            }
            if (!this.env.chatter || this.env.chatter?.fetchThreadData) {
                if (this.env.chatter) {
                    this.env.chatter.fetchThreadData = false;
                }
                this.load(this.state.akuThread, this.requestList);
            }
        });
    }

    get afterPostRequestList() {
        return ["messages"];
    }

    get childSubEnv() {
        return {
            inChatter: this.state,
            messageHighlight: this.messageHighlight,
        };
    }

    get extraMessageFetchRouteParams() {
        return {};
    }

    get messageFetchRouteParams() {
        return this.env.messageFetchRouteParams;
    }

    get onCloseFullComposerRequestList() {
        return ["messages"];
    }

    get requestList() {
        return [];
    }

    get subEnv() {
        return { messageFetchRouteParams: this.extraMessageFetchRouteParams };
    }

    changeThread(threadModel, threadId) {
        const data = {
            model: threadModel,
            id: threadId,
        };
        if (this.highlightMessage) {
            data.highlightMessage = this.highlightMessage;
        }
        console.count("CHANGE_THREAD");
        this.state.akuThread = this.store["mail.thread"].insert(data);
        if (threadId === false) {
            if (this.state.akuThread.messages.length === 0) {
                this.state.akuThread.messages.push({
                    id: this.store.getNextTemporaryId(),
                    author_id: this.state.akuThread.effectiveSelf,
                    body: _t("Creating a new record..."),
                    message_type: "notification",
                    thread: this.state.akuThread,
                    res_id: threadId,
                    model: threadModel,
                });
            }
        }
    }

    /**
     * Fetch data for the thread according to the request list.
     * @param {import("models").Thread} thread
     * @param {string[]} requestList
     */
    async load(thread, requestList) {
        if (!thread.id || !this.state.akuThread?.eq(thread)) {
            return;
        }
        await thread.fetchThreadData(requestList, {
            messageFetchRouteParams: this.messageFetchRouteParams,
        });
    }

    onCloseFullComposerCallback() {
        this.load(this.state.akuThread, this.onCloseFullComposerRequestList);
    }

    _onMounted() {
        this.changeThread(this.props.threadModel, this.props.threadId);
        if (!this.env.chatter || this.env.chatter?.fetchThreadData) {
            if (this.env.chatter) {
                this.env.chatter.fetchThreadData = false;
            }
            this.load(this.state.akuThread, this.requestList);
        }
    }

    onPostCallback() {
        this.state.jumpThreadPresent++;
        // Load new messages to fetch potential new messages from other users (useful due to lack of auto-sync in chatter).
        this.load(this.state.akuThread, this.afterPostRequestList);
    }

    onScroll() {
        this.state.isTopStickyPinned = this.rootRef.el.scrollTop !== 0;
    }
}
