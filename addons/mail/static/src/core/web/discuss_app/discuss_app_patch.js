import { useLayoutEffect } from "@web/owl2/utils";

import { Discuss } from "@mail/core/public_web/discuss_app/discuss_app";
import { MessagingMenuInDropdown } from "@mail/core/web/messaging_menu_in_dropdown";

import { ControlPanel } from "@web/search/control_panel/control_panel";
import { patch } from "@web/core/utils/patch";

Object.assign(Discuss.components, { ControlPanel, MessagingMenuInDropdown });

patch(Discuss.prototype, {
    setup() {
        super.setup();
        useLayoutEffect(
            (threadName) => {
                if (threadName) {
                    this.env.config?.setDisplayName(threadName);
                }
            },
            () => [this.thread?.displayName]
        );
    },
});
