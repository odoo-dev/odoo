/* @odoo-module */

/** @typedef {{ thread?: import("@mail/new/core/thread_model").Thread, folded?: boolean, replaceNewMessageChatWindow?: boolean }} ChatWindowData */

import { browser } from "@web/core/browser/browser";
import { _t } from "@web/core/l10n/translation";

export const CHAT_WINDOW_END_GAP_WIDTH = 10; // for a single end, multiply by 2 for left and right together.
export const CHAT_WINDOW_INBETWEEN_WIDTH = 5;
export const CHAT_WINDOW_WIDTH = 340;
export const CHAT_WINDOW_HIDDEN_WIDTH = 55;

export class ChatWindow {
    /** @type {import("@mail/new/core/store_service").Store} */
    _store;

    /** @type {import("@mail/new/core/thread_model").Thread.localId} */
    threadLocalId;
    autofocus = 0;
    folded = false;
    hidden = false;

    /** @param {import("@mail/new/core/store_service").Store} */
    static visible(store) {
        return store.chatWindows.filter((chatWindow) => !chatWindow.hidden);
    }

    /** @param {import("@mail/new/core/store_service").Store} */
    static hidden(store) {
        return store.chatWindows.filter((chatWindow) => chatWindow.hidden);
    }

    /** @param {import("@mail/new/core/store_service").Store} */
    static maxVisible(store) {
        const startGap = store.isSmall
            ? 0
            : this.hidden(store).length > 0
            ? CHAT_WINDOW_END_GAP_WIDTH + CHAT_WINDOW_HIDDEN_WIDTH
            : CHAT_WINDOW_END_GAP_WIDTH;
        const endGap = store.isSmall ? 0 : CHAT_WINDOW_END_GAP_WIDTH;
        const awailable = browser.innerWidth - startGap - endGap;
        const maxAmountWithoutHidden = Math.floor(
            awailable / (CHAT_WINDOW_WIDTH + CHAT_WINDOW_INBETWEEN_WIDTH)
        );
        return maxAmountWithoutHidden;
    }

    /**
     * @param {import("@mail/new/core/store_service").Store} store
     * @param {ChatWindowData} [data]
     * @returns {ChatWindow}
     */
    static insert(store, data = {}) {
        const chatWindow = store.chatWindows.find((c) => c.thread === data.thread);
        if (!chatWindow) {
            return new ChatWindow(store, data);
        }
        chatWindow.update(data);
        return chatWindow;
    }

    /**
     * @param {import("@mail/new/core/store_service").Store} store
     * @param {ChatWindowData} data
     * @returns {ChatWindow}
     */
    constructor(store, data) {
        Object.assign(this, {
            thread: data.thread,
            _store: store,
        });
        this.update(data);
        if (ChatWindow.maxVisible(this._store) <= this._store.chatWindows.length) {
            const visible = ChatWindow.visible(this._store);
            const swaped = visible[visible.length - 1];
            swaped.hidden = true;
            swaped.folded = true;
        }
        let index;
        if (!data.replaceNewMessageChatWindow) {
            index = store.chatWindows.length;
        } else {
            const newMessageChatWindowIndex = store.chatWindows.findIndex(
                (chatWindow) => !chatWindow.thread
            );
            index =
                newMessageChatWindowIndex !== -1
                    ? newMessageChatWindowIndex
                    : store.chatWindows.length;
        }
        store.chatWindows.splice(index, 1, this);
        return store.chatWindows[index]; // return reactive version
    }

    get thread() {
        return this._store.threads[this.threadLocalId];
    }

    set thread(thread) {
        this.threadLocalId = thread?.localId;
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

    close({ escape = false } = {}) {
        const index = this._store.chatWindows.findIndex((c) => c.thread === this.thread);
        if (index > -1) {
            this._store.chatWindows.splice(index, 1);
        }
        const thread = this.thread;
        if (thread) {
            thread.state = "closed";
        }
        if (escape && this._store.chatWindows.length > 0) {
            this._store.chatWindows[index - 1].autofocus++;
        }
    }

    fold() {
        this.folded = true;
        this.thread.state = "folded";
    }

    unfold() {
        this.folded = false;
        this.thread.state = "open";
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
        const visible = ChatWindow.visible(this._store);
        const swaped = visible[visible.length - 1];
        swaped.hide();
        this.show();
    }
}
