import { Interaction } from "@web/public/interaction";
import { registry } from "@web/core/registry";

import { SlideUploadDialog } from "@website_slides/js/public/components/slide_upload_dialog/slide_upload_dialog";

export class WebsiteSlidesUpload extends Interaction {
    static selector = ".o_wslides_js_slide_upload";
    dynamicContent = {
        _root: { "t-on-click.prevent": (ev) => this.openDialog(el.currentTarget) }
    }

    /**
     * Automatically opens the upload dialog if requested from query string.
     * If openModal is defined ( === '' ), opens the category selection dialog.
     * If openModal is a category name, opens the category's upload dialog.
     */
    start() {
        if ("openModal" in this.el.dataset) {
            this.openDialog(this.el);
            this.el.setAttribute("openModal", false)
        }
    }

    openDialog(element) {
        this.services.dialog.add(SlideUploadDialog, {
            categoryId: element.dataset.categoryId,
            channelId: element.dataset.channelId,
            canPublish: element.dataset.canPublish === "True",
            canUpload: element.dataset.canUpload === "True",
            modulesToInstall: element.dataset.modulesToInstall || [],
            openModal: element.dataset.openModal,
        });
    }
}

registry
    .category("public.interactions")
    .add("website_slides.website_slides_upload", WebsiteSlidesUpload);
