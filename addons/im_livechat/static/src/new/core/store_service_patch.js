/** @odoo-module */

import { Store } from "@mail/core/store_service";
import { patch } from "@web/core/utils/patch";

patch(Store.prototype, "im_livechat", {
    setup() {
        this._super(...arguments);
        this.hasLinkPreviewFeature = false;
    },
});
