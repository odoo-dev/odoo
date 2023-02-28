/** @odoo-module **/

import { Patch } from "@mail/legacy/model";

Patch({
    name: "NotificationListView",
    fields: {
        filteredChannels: {
            compute() {
                if (this.filter === "livechat") {
                    return this.messaging.models["Channel"].all(
                        (channel) => channel.channel_type === "livechat" && channel.thread.isPinned
                    );
                }
                return this._super();
            },
        },
    },
});
