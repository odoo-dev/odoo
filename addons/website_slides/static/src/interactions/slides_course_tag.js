import { Interaction } from "@web/public/interaction";
import { registry } from "@web/core/registry";

import { CourseTagAddDialog } from "@website_slides/js/public/components/course_tag_add_dialog/course_tag_add_dialog";

export class WebsiteSlidesTag extends Interaction {
    static selector = ".o_wslides_js_channel_tag_add";
    dynamicContent = {
        _root: { "t-on-click.prevent": this.onClick },
    }

    onClick(ev) {
        const channelTagIds = ev.currentTarget.dataset.channelTagIds;
        this.services.dialog.add(CourseTagAddDialog, {
            channelId: parseInt(ev.currentTarget.dataset.channelId, 10),
            tagIds: channelTagIds ? JSON.parse(channelTagIds) : [],
        });
    }
}

registry
    .category("public.interactions")
    .add("website_slides.website_slides_tag", WebsiteSlidesTag);
