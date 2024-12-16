import { Interaction } from "@web/public/interaction";
import { registry } from "@web/core/registry";

import { ConfirmationDialog } from "@web/core/confirmation_dialog/confirmation_dialog";
import { _t } from "@web/core/l10n/translation";
import { rpc } from "@web/core/network/rpc";

export class WebsiteSlidesSlideArchive extends Interaction {
    static selector = ".o_wslides_js_slide_archive"
    dynamicContent = {
        _root: { "t-on-click.prevent": (ev) => this.openDialog(ev.currentTarget) }
    }

    openDialog(targetEl) {
        const slideId = targetEl.dataset.slideId;
        this.services.dialog.add(ConfirmationDialog, {
            title: _t("Archive Content"),
            body: _t("Are you sure you want to archive this content?"),
            confirmLabel: _t("Archive"),
            confirm: async () => {
                /**
                 * Calls 'archive' on slide controller and then visually removes the slide dom element
                 */
                const isArchived = await rpc("/slides/slide/archive", {
                    slide_id: slideId,
                });
                if (isArchived) {
                    targetEl.closest(".o_wslides_slides_list_slide").remove();
                    const categories = document.querySelectorAll(".o_wslides_slide_list_category")
                    for (const category in categories) {
                        var categoryHeader = this.el.querySelector(".o_wslides_slide_list_category_header");
                        var categorySlideCount = this.el.querySelector(".o_wslides_slides_list_slide:not(.o_not_editable)").length;
                        var emptyFlagContainer = categoryHeader.querySelector(".o_wslides_slides_list_drag");
                        var emptyFlag = !!emptyFlagContainer.querySelector("small");
                        if (categorySlideCount === 0 && !emptyFlag) {
                            const small = document.createElement("small");
                            small.classList.add("ms-1 text-muted fw-bold");
                            small.innerText = _t("(empty)")
                            emptyFlagContainer.appendChild(small);
                        }
                    }
                }
            },
            cancel: () => { },
        });
    }
}

registry
    .category("public.interactions")
    .add("website_slides.website_slides_slide_archive", WebsiteSlidesSlideArchive);
