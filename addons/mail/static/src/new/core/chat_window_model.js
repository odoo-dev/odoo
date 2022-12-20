/* @odoo-module */

/** @typedef {{ threadLocalId?: string, folded?: boolean, replaceNewMessageChatWindow?: boolean }} ChatWindowData */

import { _t } from "@web/core/l10n/translation";

export class ChatWindow {
    /** @type {number} */
    autofocus = 0;
    /** @type {boolean} */
    folded = false;

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
        const { autofocus = this.autofocus, folded = this.folded } = data;
        Object.assign(this, {
            autofocus,
            folded,
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

    toggleFold() {
        this.folded = !this.folded;
        const thread = this.thread;
        if (thread) {
            thread.state = this.folded ? "folded" : "open";
        }
    }
}
