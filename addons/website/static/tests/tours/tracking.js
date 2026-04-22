import {
    registerWebsitePreviewTour,
} from "@website/js/tours/tour_utils";
import { patch } from "@web/core/utils/patch";

/**
 * Patch tracker to avoid waitForTimeout.
 */
let unpatchOdooTracker;
function patchOdooTracker() {
    const { OdooTracker } = odoo.loader.modules.get('@website/interactions/odoo_tracker');
    unpatchOdooTracker = patch(OdooTracker.prototype, {
        waitForTimeout(callback, delay) {
            callback();
            return {
                clear: () => {},
            };
        },
    });
}

patchOdooTracker();

registerWebsitePreviewTour("visitor_tracking", {}, () => [
    {
        content: "link to tracked page",
        trigger: "#tracked_link",
        run: "click",
        expectUnloadPage: true,
    },
    {
        content: "Unpatch",
        trigger: "body",
        run: () => unpatchOdooTracker(),
    },
]);
