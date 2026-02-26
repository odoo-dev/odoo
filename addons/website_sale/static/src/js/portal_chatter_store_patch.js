import { Message } from "@mail/core/common/message_model";
import { Thread } from "@mail/core/common/thread";
import { PortalChatterService } from "@portal/chatter/portal/portal_chatter_service";

import { patch } from "@web/core/utils/patch";

function pseudonymizeName(name) {
    if (!name) return name;
    const parts = name.trim().split(/\s+/);
    if (parts.length > 1) {
        return `${parts[0]} ${parts[parts.length - 1][0]}.`;
    }
    return name;
}

patch(PortalChatterService.prototype, {
    setup() {
        super.setup(...arguments);
        if (document.querySelector(".o_portal_chatter")?.getAttribute("data-display_rating") === "True") {
            this.store.FETCH_LIMIT = 3;
        }
    },
});

patch(Message.prototype, {
    get authorName() {
        return pseudonymizeName(super.authorName);
    },
});

patch(Thread.prototype, {
    applyScroll() {
        super.applyScroll(...arguments);
        if (this.env.displayRating) {
            this.loadOlderState.ready = false;
            this.loadNewerState.ready = false;
        }
    },
});
