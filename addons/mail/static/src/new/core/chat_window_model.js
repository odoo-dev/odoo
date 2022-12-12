/* @odoo-module */

export class ChatWindow {
    /**
     * @param {import("@mail/new/core/messaging").Messaging['state']} state
     * @param {Object} data
     * @returns {ChatWindow}
     */
    static insert(state, data) {
        const { threadLocalId } = data;
        const chatWindow = state.chatWindows.find((c) => c.threadLocalId === threadLocalId);
        if (!chatWindow) {
            const chatWindow = new ChatWindow(data);
            chatWindow._state = state;
            state.chatWindows.push(chatWindow);
        } else {
            chatWindow.folded = false;
            chatWindow.autofocus++;
        }
    }

    constructor(data) {
        const { threadLocalId } = data;
        Object.assign(this, { threadLocalId, autofocus: 1, folded: false });
    }

    close() {
        const index = this._state.chatWindows.findIndex(
            (c) => c.threadLocalId === this.threadLocalId
        );
        if (index > -1) {
            this._state.chatWindows.splice(index, 1);
        }
    }
}
