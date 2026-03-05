import { Message } from "@mail/core/common/message_model";
import { Thread } from "@mail/core/common/thread";
import { PortalChatterService } from "@portal/chatter/portal/portal_chatter_service";

import { patch } from "@web/core/utils/patch";

// Needed to scope the patch to the review only, else it would
// affect for eg. /my/oders/ chatter.
// TODO DEV - Move this so it applies to all review chatters (eg. when
// website_slides is installed without website_sale)
let isReviewChatterNoBubbles = false;

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
            this.store.FETCH_LIMIT = 4;
            isReviewChatterNoBubbles = true;
        }
    },
});

patch(Message.prototype, {
    get authorName() {
        return pseudonymizeName(super.authorName);
    },
    get bubbleColor() {
        if (isReviewChatterNoBubbles) return undefined;
        return super.bubbleColor;
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
