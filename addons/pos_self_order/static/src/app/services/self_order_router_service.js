import { patch } from "@web/core/utils/patch";
import { SelfOrderRouter } from "@pos_self/app/services/self_order_router_service";
import { browser } from "@web/core/browser/browser";

patch(SelfOrderRouter.prototype, {
    addTableIdentifier(table) {
        const url = new URL(browser.location.href);
        url.searchParams.set("table_identifier", table.identifier);
        history.replaceState({}, "", url);
    },
    getTableIdentifier() {
        const url = new URL(browser.location.href);
        return url.searchParams.get("table_identifier");
    },
});
