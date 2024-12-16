import { Interaction } from "@web/public/interaction";
import { registry } from "@web/core/registry";

import { rpc } from "@web/core/network/rpc";

export class WebsiteSlidesSlideToggleIsPreview extends Interaction {
    static selector = ".o_wslides_js_slide_toggle_is_preview"
    dynamicContent = {
        _root: { "t-on-click.prevent": (ev) => this.toggleSlidePreview(ev.currentTarget) }
    }

    toggleSlidePreview(targetEl) {
        rpc('/slides/slide/toggle_is_preview', {
            slide_id: targetEl.dataset.slideId
        }).then(function (isPreview) {
            targetEl.classList.toggle("text-bg-success", isPreview)
            targetEl.classList.toggle("text-bg-light badge-hide border", !isPreview)
        });
    }
}

registry
    .category("public.interactions")
    .add("website_slides.website_slides_slide_toggle_is_preview", WebsiteSlidesSlideToggleIsPreview);
