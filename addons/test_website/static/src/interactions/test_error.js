import { Interaction } from "@website/core/interaction";
import { registry } from "@web/core/registry";

import { rpc } from "@web/core/network/rpc";

class TestError extends Interaction {
    static selector = ".rpc_error";
    dynamicContent = {
        "a:t-on-click.prevent": this.onClick,
    }

    /**
     * @param {Event} ev
     * @returns {Promise}
     */
    onClick(ev) {
        return rpc(ev.currentTarget.getAttribute("href"));
    }
}

registry
    .category("public.interactions")
    .add("test_website.test_error", TestError);
