



import { Interaction } from "@web/public/interaction";
import { registry } from "@web/core/registry";

import { _t } from "@web/core/l10n/translation";
import { ConfirmationDialog } from "@web/core/confirmation_dialog/confirmation_dialog";

class WebsiteSlidesCategoryDelete extends Interaction {
    static selector = ".o_wslides_js_category_delete"
    dynamiContent = { "t-on-click.prevent": (ev) => this.openDialog(parseInt(ev.currentTarget.dataset.categoryId)) }

    openDialog(categoryId) {
        this.services.dialog.add(ConfirmationDialog, {
            title: _t("Delete Category"),
            body: _t("Are you sure you want to delete this category?"),
            confirmLabel: _t("Delete"),
            confirm: async () => {
                /**
                 * Calls 'unlink' method on slides.slide to delete the category and
                 * reloads page after deletion to re-arrange the content on UI
                 */
                await this.services.orm.unlink("slide.slide", [categoryId]);
                window.location.reload();
            },
            cancel: () => { },
        });
    }
}

registry
    .category("public.interactions")
    .add("website_slides.website_slides_category_delete", WebsiteSlidesCategoryDelete);
