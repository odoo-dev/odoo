import { compareDatetime } from "@mail/utils/common/misc";
import { fields, Record } from "@mail/model/export";

import { localeCompare } from "@web/core/l10n/utils";

export class DiscussAppCategory extends Record {
    /**
     * @param {import("models").DiscussChannel} c1
     * @param {import("models").DiscussChannel} c2
     */
    sortChannels(c1, c2) {
        if (["channels", "favorites"].includes(this.id) || this.discussCategoryAsAppCategory) {
            return localeCompare(c1.displayName, c2.displayName) || c2.id - c1.id;
        }
        return compareDatetime(c2.lastInterestDt, c1.lastInterestDt) || c2.id - c1.id;
    }

    get isVisible() {
        return (
            !this.hidden &&
            (!this.hideWhenEmpty ||
                this.channels.some(
                    (channel) => channel.self_member_id?.is_pinned || channel.isLocallyPinned
                ))
        );
    }

    color = fields.Attr("", {
        compute() {
            if (this.technical_key) {
                return "";
            }
            let hash = 0;
            for (let i = 0; i < this.name.length; i++) {
                hash = (hash * 31 + this.name.charCodeAt(i)) | 0;
            }
            return `hsl(${Math.abs(hash) % 360}, 35%, 50%)`;
        },
    });
    /** @type {string} */
    extraClass;
    icon = fields.Attr("fa fa-hashtag", {
        compute() {
            if (this.id === "favorites") {
                return "fa fa-star";
            }
            if (this.technical_key === "mail.direct_messages") {
                return "oi oi-users";
            }
            return "fa fa-hashtag";
        },
    });
    /** @string */
    id;
    /** @type {string} */
    name = fields.Attr("", {
        compute() {
            return this.discussCategoryAsAppCategory?.name || this.name || "";
        },
    });
    discussCategoryAsAppCategory = fields.One("discuss.category", { inverse: "appCategory" });
    /** Hide categories from the devtools if really bothered. */
    hidden = fields.Attr(undefined, { localStorage: true, eager: true });
    hideWhenEmpty = false;
    canView = false;
    /** @type {string|undefined} */
    technical_key;
    app = fields.One("DiscussApp", {
        compute() {
            return this.store.discuss;
        },
    });
    /** @type {number} */
    sequence;

    is_open = fields.Attr(true, { localStorage: true });

    channels = fields.Many("discuss.channel", {
        sort(c1, c2) {
            return this.sortChannels(c1, c2);
        },
        inverse: "discussAppCategory",
    });
    channelsWithCounter = fields.Many("discuss.channel", {
        inverse: "categoryAsChannelWithCounter",
    });
    message_unread_counter = fields.Attr(0, {
        compute() {
            if (this.id === "favorites") {
                return this.store.favoritesUnreadCounter;
            }
            return this.discussCategoryAsAppCategory?.message_unread_counter ?? 0;
        },
    });
}

DiscussAppCategory.register();
