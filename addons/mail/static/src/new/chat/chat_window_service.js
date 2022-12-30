/** @odoo-module */

import { ChatWindow } from "../core/chat_window_model";

class ChatWindowService {
    constructor(env, state, orm) {
        this.env = env;
        this.state = state;
        this.orm = orm;
        /** @type {import("@mail/new/core/chat_window_model").ChatWindow[]} */
        this.state.chatWindows = [];
    }

    openNewMessage() {
        if (this.state.chatWindows.some(({ thread }) => !thread)) {
            // New message chat window is already opened.
            return;
        }
        ChatWindow.insert(this.state);
    }

    closeNewMessage() {
        this.state.chatWindows.find(({ thread }) => !thread)?.close();
    }

    get visible() {
        return ChatWindow.visible(this.state);
    }

    get hidden() {
        return ChatWindow.hidden(this.state);
    }

    get maxVisible() {
        return ChatWindow.maxVisible(this.state);
    }

    notifyState(chatWindow) {
        if (this.env.isSmall) {
            return;
        }
        if (chatWindow.thread?.model === "mail.channel") {
            return this.orm.silent.call("mail.channel", "channel_fold", [[chatWindow.thread.id]], {
                state: chatWindow.thread.state,
            });
        }
    }
}

export const chatWindowService = {
    dependencies: ["mail.state", "orm"],
    start(env, { "mail.state": state, orm }) {
        return new ChatWindowService(env, state, orm);
    },
};
