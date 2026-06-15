import { patch } from "@web/core/utils/patch";
import { registry } from "@web/core/registry";

/**
 * Patch tracker to avoid waitForTimeout.
 */
function patchOdooTracker() {
    const { OdooTracker } = odoo.loader.modules.get("@website/interactions/odoo_tracker");
    patch(OdooTracker.prototype, {
        waitForTimeout(callback, delay) {
            callback();
            return {
                clear: () => {},
            };
        },
    });
}

if (odoo.loader.modules.has("@website/interactions/odoo_tracker")) {
    patchOdooTracker();
} else {
    odoo.loader.bus.addEventListener("module-started", (e) => {
        if (e.detail.moduleName === "@website/interactions/odoo_tracker") {
            patchOdooTracker();
        }
    });
}

registry.category("web_tour.tours").add("visitor_tracking", {
    steps: () => [
        {
            content: "link to tracked page",
            trigger: "#tracked_link",
            run: "click",
            expectUnloadPage: true,
        },
    ],
});
