





import { Interaction } from "@web/public/interaction";
import { registry } from "@web/core/registry";

import { _t } from "@web/core/l10n/translation";
import { CategoryAddDialog } from "@website_slides/js/public/components/category_add_dialog/category_add_dialog";

class WebsiteSlidesCategoryAdd extends Interaction {
    static selector = ".o_wslides_js_slide_section_add"
    dynamiContent = { "t-on-click.prevent": (ev) => this.openDialog(ev.currentTarget.getAttribute('channel_id')) }

    openDialog(channelId) {
        this.services.dialog.add(CategoryAddDialog, {
            title: _t("Add a section"),
            confirmLabel: _t("Save"),
            confirm: ({ formEl }) => {
                if (!formEl.checkValidity()) {
                    return false;
                }
                formEl.classList.add("was-validated");
                formEl.submit();
                return true;
            },
            cancelLabel: _t("Back"),
            cancel: () => { },
            channelId,
        });
    }
}

registry
    .category("public.interactions")
    .add("website_slides.website_slides_category_add", WebsiteSlidesCategoryAdd);
