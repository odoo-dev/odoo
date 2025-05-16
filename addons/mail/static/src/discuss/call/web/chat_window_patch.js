import { ChatWindow } from "@mail/core/common/chat_window";

import { useEffect } from "@odoo/owl";

import { patch } from "@web/core/utils/patch";

patch(ChatWindow.prototype, {
    setup(...args) {
        super.setup(...args);
        useEffect(
            () => {
                if (this.props.chatWindow.thread === this.store.openInviteThread) {
                    this.threadActions.actions
                        .find((action) => action.id === "invite-people")
                        ?.onSelect();
                    this.store.openInviteThread = null;
                }
            },
            () => [this.store.openInviteThread]
        );
    },
});
