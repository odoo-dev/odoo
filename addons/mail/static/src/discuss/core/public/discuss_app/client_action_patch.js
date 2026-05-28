import { DiscussClientAction } from "@mail/core/public_web/discuss_app/client_action";
import { WelcomePage } from "@mail/discuss/core/public/welcome_page";
import { patch } from "@web/core/utils/patch";

DiscussClientAction.components = { ...DiscussClientAction.components, WelcomePage };
patch(DiscussClientAction.prototype, {
    setup() {
        super.setup(...arguments);
        if (this.store.isChannelTokenSecret) {
            // Change the URL to avoid leaking the invitation link.
            history.replaceState(
                history.state,
                null,
                `/discuss/channel/${this.store.discuss.thread.id}${location.search}`
            );
        }
        const url = new URL(location.href);
        url.searchParams.delete("email_token");
        history.replaceState(history.state, null, url.toString());
        window.addEventListener("popstate", () => this.restoreDiscussThread(this.props));
    },
    getActiveId() {
        const currentURL = new URL(location);
        if (!/\/discuss\/channel\/\d+$/.test(currentURL.pathname)) {
            return null;
        }
        return `discuss.channel_${currentURL.pathname.split("/")[3]}`;
    },
    async restoreDiscussThread() {
        await super.restoreDiscussThread(...arguments);
        this.store.is_welcome_page_displayed ||=
            this.store.discuss.thread?.channel.default_display_mode === "video_full_screen";
    },
    closeWelcomePage() {
        this.store.is_welcome_page_displayed = false;
    },
});
