import { patch } from "@web/core/utils/patch";
import { Component } from "@odoo/owl";
import { rpc } from "@web/core/network/rpc";

import { Message } from "@mail/core/common/message_model";

patch(Message.prototype, {
    async remove() {
        if (this.thread && this.thread.model === "slide.channel") {
            const res = await rpc("/slides/mail/delete_comment", {
                thread_model: this.thread.model,
                thread_id: this.thread.id,
                attachment_ids: [],
                attachment_tokens: [],
                message_id: this.id,
                ...this.thread.rpcParams,
            });
            const detail = {
                rate_with_void_content: false,
                force_submit_url: false,
                ...res,
            };
            const event = new CustomEvent("deleteMessageEvent", { detail });
            document.querySelector(".o_rating_popup_composer")?.dispatchEvent(event);
            Component.env.bus.trigger("reload_chatter_content", detail);
        } else {
            await super.remove();
        }
    },
});
