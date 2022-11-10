/* @odoo-module */

/** @typedef {{ threadLocalId?: string, folded?: boolean}} ChatWindowData */
export class ChatWindow {
    /** @type {number} */
    autofocus = 0;
    /** @type {boolean} */
    folded = false;

    /**
     * @param {import("@mail/new/core/messaging").Messaging['state']} state
     * @param {ChatWindowData} data
     * @returns {ChatWindow}
     */
    static insert(state, data) {
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
        state.chatWindows.push(this);
        return state.chatWindows.find((c) => c.threadLocalId === data.threadLocalId); // return reactive version
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
        const index = this._state.chatWindows.findIndex(
            (c) => c.threadLocalId === this.threadLocalId
        );
        if (index > -1) {
            this._state.chatWindows.splice(index, 1);
        }
        const thread = this._state.threads[this.threadLocalId];
        if (thread) {
            thread.state = "closed";
        }
    }

    toggleFold() {
        this.folded = !this.folded;
        const thread = this._state.threads[this.threadLocalId];
        if (thread) {
            thread.state = this.folded ? "folded" : "open";
        }
    }

    /**
     * @returns {import("@mail/new/core/thread_model").Thread}
     */
    get thread() {
        return this._state.threads[this.threadLocalId];
    }
}
