import { Interaction } from "@website/core/interaction";
import { registry } from "@web/core/registry";

import { renderToElement } from "@web/core/utils/render";
import { rpc } from "@web/core/network/rpc";

export class WebsiteEventCreateMeetingRoom extends Interaction {
    static selector = ".o_wevent_create_room_button";
    dynamicContent = {
        "_root": { "t-on-click": this.onClick }
    }

    destroy() {
        document.querySelector(".o_wevent_create_meeting_room_modal")?.remove();
    }

    async onClick() {
        if (!this.createModalEl) {
            const langs = await rpc("/event/active_langs");

            this.createModalEl = renderToElement("event_meet_create_room_modal", {
                csrf_token: odoo.csrf_token,
                eventId: this.el.dataset.eventId,
                defaultLangCode: this.el.dataset.defaultLangCode,
                langs: langs,
            });
            this.el.parentNode.append(this.createModalEl);
        }

        Modal.getOrCreateInstance(this.createModalEl).show();
    }
}

registry
    .category("public.interactions")
    .add("website_event_meet.website_event_create_meeting_room", WebsiteEventCreateMeetingRoom);
