/** @odoo-module */

import { chatWindowService, ChatWindowService } from "@mail/web/chat_window/chat_window_service";
import { patch } from "@web/core/utils/patch";

chatWindowService.dependencies.push("im_livechat.livechat");

patch(ChatWindowService.prototype, "im_livechat", {
    setup() {
        this._super(...arguments);
        this.livechatService = this.env.services["im_livechat.livechat"];
    },

    toggleFold(chatWindow) {
        this._super(chatWindow);
        if (!chatWindow.thread) {
            return;
        }
        this.livechatService.updateFoldState(chatWindow.thread.state);
    },
});
