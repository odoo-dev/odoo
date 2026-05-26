import { ThreadIcon } from "@mail/core/common/thread_icon";

import { patch } from "@web/core/utils/patch";

patch(ThreadIcon.prototype, {
    get typingMember() {
        return this.correspondent || this.channel?.otherTypingMembers[0];
    },
});
