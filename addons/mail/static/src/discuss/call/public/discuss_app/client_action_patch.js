import { DiscussClientAction } from "@mail/core/public_web/discuss_app/client_action";
import "@mail/discuss/core/public/discuss_app/client_action_patch";

import { browser } from "@web/core/browser/browser";
import { useService } from "@web/core/utils/hooks";
import { patch } from "@web/core/utils/patch";

patch(DiscussClientAction.prototype, {
    setup() {
        super.setup(...arguments);
        this.rtc = useService("discuss.rtc");
    },
    async restoreDiscussThread() {
        await super.restoreDiscussThread(...arguments);
        if (!this.store.discuss.thread) {
            return;
        }
        const channel = this.store.discuss.thread.channel;
        if (channel.default_display_mode !== "video_full_screen") {
            return;
        }
        // If the call is already running in another tab, skip the welcome page
        // and enter fullscreen directly as a passive viewer.
        if (this.rtc.isRemote && channel.id === this.rtc.channel?.id) {
            const url = new URL(browser.location.href);
            url.searchParams.delete("fullscreen");
            browser.history.replaceState(browser.history.state, null, url);
            this.store.is_welcome_page_displayed = false;
            return;
        }
        if (this.store.is_welcome_page_displayed) {
            return;
        }
        await this.joinCallWithDefaultSettings();
    },
    closeWelcomePage() {
        super.closeWelcomePage(...arguments);
        if (this.store.discuss.thread.channel.default_display_mode === "video_full_screen") {
            this.joinCallWithDefaultSettings();
        }
    },
});
