import { Store } from "@mail/core/common/store_service";

import { patch } from "@web/core/utils/patch";

/** @type {import("models").Store} */
const StorePatch = {
    _hasFullscreenUrlOnUpdate() {
        const url = new URL(location.href);
        if (!this._hasFullscreenUrl) {
            url.searchParams.delete("fullscreen");
        } else if (!url.searchParams.has("fullscreen")) {
            url.searchParams.append("fullscreen", "1");
        }
        history.replaceState(history.state, null, url);
    },
};
patch(Store.prototype, StorePatch);
