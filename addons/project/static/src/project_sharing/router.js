import { browser } from "@web/core/browser/browser";
import { getStartUrl, parseSearchQuery, PATH_KEYS, router } from "@web/core/browser/router";
import { omit } from "@web/core/utils/objects";
import { patch } from "@web/core/utils/patch";
import { objectToUrlEncodedString } from "@web/core/utils/urls";
import { isNumeric } from "@web/core/utils/strings";

const PREFIX = "/my/projects/";

patch(router, {
    /**
     * @param {{ [key: string]: any }} state
     * @returns {string}
     */
    stateToUrl(state) {
        const url = super.stateToUrl(state);
        let pathname = url.replace(getStartUrl(), "my/projects");
        if (state.action === "project_sharing" && state.active_id) {
            pathname = pathname.replace("/project_sharing", "");
        }
        return pathname;
    },
    urlToState(urlObj) {
        const { pathname, search } = urlObj;
        const state = parseSearchQuery(search);
        if (pathname.startsWith(PREFIX)) {
            const splitPath = pathname.replace(PREFIX, "").split("/");
            if (isNumeric(splitPath.at(0))) {
                state.active_id = parseInt(splitPath.at(0));
            }
            if (isNumeric(splitPath.at(1))) {
                state.resId = parseInt(splitPath.at(1));
            }
        }
        return state;
    },
});

// Since the patch for `stateToUrl` and `urlToState` is executed
// after the router state was already initialized, it has to be replaced.
router.replaceState(router.urlToState(new URL(browser.location)));
