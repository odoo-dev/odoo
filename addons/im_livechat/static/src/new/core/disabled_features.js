/** @odoo-module */

import { ChatWindowService } from "@mail/web/chat_window/chat_window_service";
import { Composer } from "@mail/composer/composer";
import { Message as MessageModel } from "@mail/core/message_model";
import { Thread } from "@mail/core/thread_model";
import { patch } from "@web/core/utils/patch";
import { ThreadService } from "@mail/core/thread_service";
import { Message } from "@mail/core_ui/message";

patch(ChatWindowService.prototype, "im_livechat/disabled", {
    notifyState() {
        return;
    },
});

patch(Composer.prototype, "im_livechat/disabled", {
    get allowUpload() {
        return false;
    },

    get allowEmojis() {
        return false;
    },
});

patch(MessageModel.prototype, "im_livechat/disabled", {
    get hasActions() {
        return false;
    },
});

patch(Message.prototype, "im_livechat/disabled", {
    get imStatusClassName() {
        // do not show im status in public livechat.
        return "d-none";
    },
});

patch(Thread.prototype, "im_livechat/disabled", {
    get hasMemberList() {
        return false;
    },

    get allowOpenInDiscuss() {
        return false;
    },

    get hasNewMessageSeparator() {
        return false;
    },
});

patch(ThreadService.prototype, "im_livechat/disabled", {
    async fetchNewMessages(thread) {
        return;
    },
});
