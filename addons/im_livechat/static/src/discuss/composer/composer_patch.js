/** @odoo-module */

import { Composer } from "@mail/discuss/composer/composer";
import { patch } from "@web/core/utils/patch";

patch(Composer.prototype, "im_livechat", {
    get allowUpload() {
        return this.thread?.type !== "livechat" && this._super();
    },
});
