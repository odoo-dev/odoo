import { Interaction } from "@web/public/interaction";
import { registry } from "@web/core/registry";

import { browser } from '@web/core/browser/browser';

class WebsiteSlidesEmbedShare extends Interaction {
    static selector = ".oe_slide_js_embed_code_widget";
    dynamicContent = {
        ".o_embed_clipboard_button": { "t-on-click.prevent": this.onClick },
    }

    // TODO : Convert JQuery Tooltip
    async onClick(ev) {
        const $clipboardBtn = $(ev.currentTarget);
        $clipboardBtn.tooltip({ title: "Copied!", trigger: "manual", placement: "bottom" });
        var share_embed_el = this.$('#wslides_share_embed_id_' + $clipboardBtn[0].id.split('id_')[1]);
        await browser.navigator.clipboard.writeText(share_embed_el.val() || '');
        $clipboardBtn.tooltip('show');
        this.waitForTimeout(function () {
            $clipboardBtn.tooltip("hide");
        }, 800);
    }
}

registry
    .category("public.interactions")
    .add("website_slides.website_slides_embed_share", WebsiteSlidesEmbedShare);
