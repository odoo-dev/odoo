import { HomeCounters } from "@portal/interactions/home_counter";
import { patch } from "@web/core/utils/patch";


patch(HomeCounters.prototype, {
    getCountersAlwaysDisplayed() {
        return super.getCountersAlwaysDisplayed().concat(["order_count"]);
    }
});
