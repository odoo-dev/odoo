import { registry } from "@web/core/registry";
import { session } from "@web/session";

/**
 * Reloads the page when the server reports a change of web files (js, xml,
 * css, scss) or a restart. Only active with `--dev=hot_reload`: the server then
 * puts `hot_reload_token` in the session info.
 */
export const hotReloadService = {
    start() {
        const token = session.hot_reload_token;
        // In an iframe (e.g. website preview), the top window does the reload.
        if (!token || window.top !== window) {
            return;
        }
        (async () => {
            while (true) {
                try {
                    const response = await fetch(
                        `/web/hot_reload?token=${encodeURIComponent(token)}`
                    );
                    if (response.status === 404) {
                        return; // server restarted without hot reload
                    }
                    if (response.ok) {
                        if ((await response.json()) !== token) {
                            window.location.reload();
                            return;
                        }
                        continue; // long-poll timed out without change
                    }
                } catch {
                    // server down (restarting): retry below
                }
                await new Promise((resolve) => setTimeout(resolve, 1000));
            }
        })();
    },
};

registry.category("services").add("hot_reload", hotReloadService);
