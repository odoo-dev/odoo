import { DiscussSearch } from "@mail/core/public_web/discuss_search";
import { MessagingMenu } from "@mail/core/public_web/messaging_menu";
import { patch } from "@web/core/utils/patch";
import { useService } from "@web/core/utils/hooks";
import { useState } from "@web/owl2/utils";
import { rpc } from "@web/core/network/rpc";

Object.assign(MessagingMenu.components, { DiscussSearch });

patch(MessagingMenu.prototype, {
    setup() {
        super.setup();
        this.command = useService("command");
        this.menuFetchState = useState({ loading: false });
    },
    async beforeOpen() {
        const res = super.beforeOpen?.(...arguments);
        this.menuFetchState.loading = true;
        try {
            const { store_data } = await rpc("/discuss/channel/lazy_fetch", {
                technical_key: "mail.menu_threads",
                limit: 30,
            });
            this.store.insert(store_data);
        } finally {
            this.menuFetchState.loading = false;
        }
        return res;
    },
    onClickNewMessage() {
        this.command.openMainPalette({ searchValue: "@" });
        if (!this.ui.isSmall && !this.env.inDiscussApp) {
            this.dropdown.close();
        }
    },
});
