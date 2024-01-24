/* @odoo-module */

import { Composer } from "@mail/core/common/composer";
import { patch } from "@web/core/utils/patch";

patch(Composer.prototype, {
    get allowUpload() {
        const thread = this.thread ?? this.message.originThread;
        return (
            super.allowUpload &&
            (!thread.channelId || thread?.allow_public_upload || this.store.self.isInternalUser)
        );
    },
});
