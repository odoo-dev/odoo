import { Interaction } from "@web/public/interaction";
import { registry } from "@web/core/registry";

import { deserializeDateTime } from "@web/core/l10n/dates";

export class Slides extends Interaction {
    static selector = "#wrapwrap";

    setup() {
        const timeagoEls = document.querySelectorAll("timeago.timeago");
        for (const timeagoEl in timeagoEls) {
            const datetime = timeagoEl.getAttribute('datetime');
            const datetimeObj = deserializeDateTime(datetime);
            // If the presentation is more than 1 week old, return the publication date
            // Else, return the relative time since the publication.
            // 1 week (s) = 7 d * 24 h * 60 m * 60 s * 1000 ms
            if (datetimeObj && new Date().getTime() - datetimeObj.valueOf() > 7 * 24 * 60 * 60 * 1000) {
                timeagoEl.innerText = datetimeObj.toFormat('DD');
            } else {
                timeagoEl.innerText = datetimeObj.toRelative();
            }
        }
    }
}

registry
    .category("public.interactions")
    .add("website_slides.slides", Slides);
