/* @odoo-module */

import { Component, useState } from "@odoo/owl";
import { Dropdown } from "@web/core/dropdown/dropdown";
import { useMessaging } from "../messaging_hook";
import { PartnerImStatus } from "@mail/new/discuss/partner_im_status";
import { RelativeTime } from "../thread/relative_time";

export class MessagingMenu extends Component {
    static components = { Dropdown, RelativeTime, PartnerImStatus };
    static props = [];
    static template = "mail.messaging_menu";

    setup() {
        this.messaging = useMessaging();
        this.state = useState({
            filter: "all", // can be 'all', 'channels' or 'chats'
        });
    }

    activateTab(ev) {
        const target = ev.target.dataset.tabId;
        if (target) {
            this.state.filter = target;
        }
    }

    get displayedPreviews() {
        /** @type {import("@mail/new/core/thread_model").Thread[]} **/
        const threads = Object.values(this.messaging.state.threads);
        const previews = threads.filter((thread) => thread.is_pinned);

        const filter = this.state.filter;
        if (filter === "all") {
            return previews;
        }
        const target = filter === "chats" ? ["chat", "group"] : "channel";
        return previews.filter((preview) => target.includes(preview.type));
    }

    openDiscussion(threadLocalId) {
        this.messaging.openDiscussion(threadLocalId);
        // hack: click on window to close dropdown, because we use a dropdown
        // without dropdownitem...
        document.body.click();
    }
}
