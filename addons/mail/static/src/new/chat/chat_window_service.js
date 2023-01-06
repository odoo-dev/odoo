/** @odoo-module */

import { ChatWindow } from "../core/chat_window_model";

class ChatWindowService {
    constructor(env, store, orm) {
        this.env = env;
        /** @type {import("@mail/new/core/store_service").Store} */
        this.store = store;
        this.orm = orm;
    }

    openNewMessage() {
        if (this.store.chatWindows.some(({ thread }) => !thread)) {
            // New message chat window is already opened.
            return;
        }
        ChatWindow.insert(this.store);
    }

    closeNewMessage() {
        this.store.chatWindows.find(({ thread }) => !thread)?.close();
    }

    get visible() {
        return ChatWindow.visible(this.store);
    }

    get hidden() {
        return ChatWindow.hidden(this.store);
    }

    get maxVisible() {
        return ChatWindow.maxVisible(this.store);
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
    dependencies: ["mail.store", "orm"],
    start(env, { "mail.store": store, orm }) {
        return new ChatWindowService(env, store, orm);
    },
};
