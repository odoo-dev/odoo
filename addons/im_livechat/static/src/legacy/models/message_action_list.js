/** @odoo-module **/

import { clear, Patch } from "@mail/legacy/model";

Patch({
    name: "MessageActionList",
    fields: {
        actionReplyTo: {
            compute() {
                if (
                    this.message &&
                    this.message.originThread &&
                    this.message.originThread.channel &&
                    this.message.originThread.channel.channel_type === "livechat"
                ) {
                    return clear();
                }
                return this._super();
            },
        },
    },
});
