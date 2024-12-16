
import { Interaction } from "@web/public/interaction";
import { registry } from "@web/core/registry";

import { deserializeDateTime } from "@web/core/l10n/dates";

export class WebsiteSlides extends Interaction {
    static selector = "#wrapwrap";

    setup() {
        const timeagoEls = document.querySelectorAll("timeago.timeago")
        for (const timeagoEl in timeagoEls) {
            var datetime = timeagoEl.getAttribute('datetime');
            var datetimeObj = deserializeDateTime(datetime);
            // if presentation 7 days, 24 hours, 60 min, 60 second, 1000 millis old(one week)
            // then return fix formate string else timeago
            var displayStr = '';
            if (datetimeObj && new Date().getTime() - datetimeObj.valueOf() > 7 * 24 * 60 * 60 * 1000) {
                displayStr = datetimeObj.toFormat('DD');
            } else {
                displayStr = datetimeObj.toRelative();
            }
            timeagoEl.innerText = displayStr;
        }
    }
}

registry
    .category("public.interactions")
    .add("website_slides.website_slides", WebsiteSlides);
