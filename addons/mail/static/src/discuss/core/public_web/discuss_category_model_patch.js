import { DiscussCategory } from "@mail/discuss/core/common/discuss_category_model";
import { fields } from "@mail/model/misc";

import { patch } from "@web/core/utils/patch";

/** @type {import("models").DiscussCategory} */
const discussCategoryPatch = {
    setup() {
        super.setup(...arguments);
        this.appCategory = fields.One("DiscussAppCategory", {
            eager: true,
            inverse: "discussCategoryAsAppCategory",
            compute() {
                return {
                    canView: false,
                    extraClass: "o-mail-DiscussSidebarCategory-discussCategory",
                    hideWhenEmpty: false,
                    id: `discuss_category_${this.id}`,
                    technical_key: this.technical_key,
                };
            },
        });
    },
    delete() {
        this.appCategory?.delete();
        super.delete();
    },
};
patch(DiscussCategory.prototype, discussCategoryPatch);
