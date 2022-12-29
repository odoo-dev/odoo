/* @odoo-module */

/** @typedef {{ threadLocalId?: string, folded?: boolean, replaceNewMessageChatWindow?: boolean }} ChatWindowData */

import { browser } from "@web/core/browser/browser";
import { _t } from "@web/core/l10n/translation";

export const CHAT_WINDOW_END_GAP_WIDTH = 10; // for a single end, multiply by 2 for left and right together.
export const CHAT_WINDOW_INBETWEEN_WIDTH = 5;
export const CHAT_WINDOW_WIDTH = 340;
export const CHAT_WINDOW_HIDDEN_WIDTH = 55;

export class ChatWindow {
    /** @type {import("@mail/new/core/messaging").Messaging['state']} */
    _state;

    /** @type {string} */
    threadLocalId;
    autofocus = 0;
    folded = false;
    hidden = false;

    /** @params {import("@mail/new/core/messaging").Messaging['state']} */
    static visibleChatWindows(state) {
        return state.chatWindows.filter((chatWindow) => !chatWindow.hidden);
    }

    /** @params {import("@mail/new/core/messaging").Messaging['state']} */
    static hiddenChatWindows(state) {
        return state.chatWindows.filter((chatWindow) => chatWindow.hidden);
    }

    /** @params {import("@mail/new/core/messaging").Messaging['state']} */
    static maxVisibleChatWindows(state) {
        const startGap = state.isSmall
            ? 0
            : this.hiddenChatWindows(state).length > 0
            ? CHAT_WINDOW_END_GAP_WIDTH + CHAT_WINDOW_HIDDEN_WIDTH
            : CHAT_WINDOW_END_GAP_WIDTH;
        const endGap = state.isSmall ? 0 : CHAT_WINDOW_END_GAP_WIDTH;
        const awailable = browser.innerWidth - startGap - endGap;
        const maxAmountWithoutHidden = Math.floor(
            awailable / (CHAT_WINDOW_WIDTH + CHAT_WINDOW_INBETWEEN_WIDTH)
        );
        return maxAmountWithoutHidden;
    }

    /**
     * @param {import("@mail/new/core/messaging").Messaging['state']} state
     * @param {ChatWindowData} [data]
     * @returns {ChatWindow}
     */
    static insert(state, data = {}) {
        const chatWindow = state.chatWindows.find((c) => c.threadLocalId === data.threadLocalId);
        if (!chatWindow) {
            return new ChatWindow(state, data);
        }
        chatWindow.update(data);
        return chatWindow;
    }

    /**
     * @param {import("@mail/new/core/messaging").Messaging['state']} state
     * @param {ChatWindowData} data
     * @returns {ChatWindow}
     */
    constructor(state, data) {
        Object.assign(this, {
            threadLocalId: data.threadLocalId,
            _state: state,
        });
        this.update(data);
        if (ChatWindow.maxVisibleChatWindows(this._state) <= this._state.chatWindows.length) {
            const visibleChatWindows = ChatWindow.visibleChatWindows(this._state);
            const swaped = visibleChatWindows[visibleChatWindows.length - 1];
            swaped.hidden = true;
            swaped.folded = true;
        }
        let index;
        if (!data.replaceNewMessageChatWindow) {
            index = state.chatWindows.length;
        } else {
            const newMessageChatWindowIndex = state.chatWindows.findIndex(
                (chatWindow) => !chatWindow.thread
            );
            index =
                newMessageChatWindowIndex !== -1
                    ? newMessageChatWindowIndex
                    : state.chatWindows.length;
        }
        state.chatWindows.splice(index, 1, this);
        return state.chatWindows[index]; // return reactive version
    }

    get thread() {
        return this._state.threads[this.threadLocalId];
    }

    get displayName() {
        return this.thread?.displayName ?? _t("New message");
    }

    /**
     * @param {ChatWindow} data
     */
    update(data) {
        const { autofocus = this.autofocus, folded = this.folded, hidden = this.hidden } = data;
        Object.assign(this, {
            autofocus,
            folded,
            hidden,
        });
    }

    close() {
        const index = this._state.chatWindows.findIndex((c) => c.thread === this.thread);
        if (index > -1) {
            this._state.chatWindows.splice(index, 1);
        }
        const thread = this.thread;
        if (thread) {
            thread.state = "closed";
        }
    }

    fold() {
        this.folded = true;
        const thread = this._state.threads[this.threadLocalId];
        thread.state = "folded";
    }

    unfold() {
        this.folded = false;
        const thread = this._state.threads[this.threadLocalId];
        thread.state = "open";
    }

    toggleFold() {
        this.folded = !this.folded;
        const thread = this.thread;
        if (thread) {
            thread.state = this.folded ? "folded" : "open";
        }
    }

    hide() {
        this.hidden = true;
        this.fold();
    }

    show() {
        this.hidden = false;
        this.unfold();
    }

    makeVisible() {
        const visibleChatWindows = this._state.chatWindows.filter(
            (chatWindow) => !chatWindow.hidden
        );
        const swaped = visibleChatWindows[visibleChatWindows.length - 1];
        swaped.hide();
        this.show();
    }
}
