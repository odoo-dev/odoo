import { EventBus, Plugin } from "@odoo/owl";
import { useBus } from "@web/core/utils/hooks";

/**
 * Communication between the components of a BoM or MO overview, e.g. to fold
 * or unfold all the lines from the control panel.
 *
 * Provided by the overview action (BomOverviewComponent, MoOverview) and used
 * by its descendants with usePlugin. The `on...` methods are hooks: call them
 * in the setup of a component, the listener is removed when it is unmounted.
 */
export class MrpOverviewPlugin extends Plugin {
    bus = new EventBus();

    /**
     * @param {boolean} isFolded
     */
    toggleFoldAll(isFolded) {
        this.bus.trigger("toggle-fold-all", { isFolded });
    }

    /**
     * @param {(isFolded: boolean) => any} handler
     */
    onToggleFoldAll(handler) {
        useBus(this.bus, "toggle-fold-all", (ev) => handler(ev.detail.isFolded));
    }
}
