/* @odoo-module */

import { ChatWindowService } from "@mail/core/common/chat_window_service";

import { patch } from "@web/core/utils/patch";

patch(ChatWindowService.prototype, {
    close(chatWindow) {
        super.close(...arguments);
        this.notifyState(chatWindow);
    },
    notifyState(chatWindow) {
        if (this.ui.isSmall) {
            return;
        }
        if (chatWindow.thread?.model === "discuss.channel") {
            return this.orm.silent.call(
                "discuss.channel",
                "channel_fold",
                [[chatWindow.thread.id]],
                {
                    state: chatWindow.thread.state,
                }
            );
        }
    },
    open() {
        const chatWindow = super.open(...arguments);
        this.notifyState(chatWindow);
    },
    toggleFold(chatWindow) {
        super.toggleFold(...arguments);
        this.notifyState(chatWindow);
    },
});
