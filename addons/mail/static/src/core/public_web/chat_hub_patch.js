import { ChatHub } from "@mail/core/common/chat_hub";

import { patch } from "@web/core/utils/patch";

patch(ChatHub.prototype, {
    get isShown() {
        return super.isShown && !this.store.discuss.isActive;
    },
});
