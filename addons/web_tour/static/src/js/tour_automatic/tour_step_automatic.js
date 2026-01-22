import { tourState } from "@web_tour/js/tour_state";
import * as hoot from "@odoo/hoot-dom";
import { TourHelpers } from "@web_tour/js/tour_automatic/tour_helpers";
import { TourStep } from "@web_tour/js/tour_step";
import { getTag } from "@web/core/utils/xml";

export class TourStepAutomatic extends TourStep {
    skipped = false;
    error = "";
    constructor(data, tour, index) {
        super(data, tour);
        this.index = index;
        this.tourConfig = tourState.getCurrentConfig();
    }

    get describeWhyIFailed() {
        const errors = [];
        if (this.element) {
            errors.push(`Element has been found.`);
            if (this.isUIBlocked) {
                errors.push("BUT: DOM is blocked by UI.");
            }
            if (!this.elementIsInModal) {
                errors.push(
                    `BUT: It is not allowed to do action on an element that's below a modal.`
                );
            }
            if (!this.elementIsEnabled) {
                errors.push(
                    `BUT: Element is not enabled. TIP: You can use :enable to wait the element is enabled before doing action on it.`
                );
            }
            if (!this.parentFrameIsReady) {
                errors.push(`BUT: parent frame is not ready ([is-ready='false']).`);
            }
        } else {
            const checkElement = hoot.queryFirst(this.trigger);
            if (checkElement) {
                errors.push(`Element has been found.`);
                errors.push(
                    `BUT: Element is not visible. TIP: You can use :not(:visible) to force the search for an invisible element.`
                );
            } else {
                errors.push(`Element (${this.trigger}) has not been found.`);
            }
        }
        return errors;
    }

    /**
     * When return null or false, macro continues.
     */
    async doAction() {
        if (this.skipped) {
            return false;
        }
        const actionHelper = new TourHelpers(this.element);
        if (typeof this.run === "function") {
            return await this.run.call({ anchor: this.element }, actionHelper);
        } else if (typeof this.run === "string") {
            let lastResult = null;
            for (const todo of this.run.split("&&")) {
                const m = String(todo)
                    .trim()
                    .match(/^(?<action>\w*) *\(? *(?<arguments>.*?)\)?$/);
                lastResult = await actionHelper[m.groups?.action](m.groups?.arguments);
            }
            return lastResult;
        }
    }

    /**
     * Each time it returns false, tour engine wait for a mutation
     * to retry to find the trigger.
     * @returns {(HTMLElement|Boolean)}
     */
    findTrigger() {
        if (!this.active) {
            this.skipped = true;
            return true;
        }
        const visible = !/:(hidden|visible)\b/.test(this.trigger);
        this.element = hoot.queryFirst(this.trigger, { visible });
        if (this.element) {
            return !this.isUIBlocked &&
                this.elementIsEnabled &&
                this.elementIsInModal &&
                this.parentFrameIsReady
                ? this.element
                : false;
        }
        return false;
    }

    get isUIBlocked() {
        return (
            document.body.classList.contains("o_ui_blocked") ||
            document.querySelector(".o_blockUI") ||
            document.querySelector(".o_is_blocked")
        );
    }

    get parentFrameIsReady() {
        if (this.trigger.match(/\[is-ready=(true|false)\]/)) {
            return true;
        }
        const parentFrame = hoot.getParentFrame(this.element);
        return parentFrame && parentFrame.contentDocument.body.hasAttribute("is-ready")
            ? parentFrame.contentDocument.body.getAttribute("is-ready") === "true"
            : true;
    }

    get elementIsInModal() {
        if (this.hasAction) {
            const overlays = hoot.queryFirst(
                ".popover, .o-we-command, .o-we-toolbar, .o_notification"
            );
            const modal = hoot.queryFirst(".modal:visible:not(.o_inactive_modal):last");
            if (modal && !overlays && !this.trigger.startsWith("body")) {
                return (
                    modal.contains(hoot.getParentFrame(this.element)) ||
                    modal.contains(this.element)
                );
            }
        }
        return true;
    }

    get elementIsEnabled() {
        const isTag = (array) => array.includes(getTag(this.element, true));
        if (this.hasAction) {
            if (isTag(["input", "textarea"])) {
                return hoot.isEditable(this.element);
            } else if (isTag(["button", "select"])) {
                return !this.element.disabled;
            }
        }
        return true;
    }

    get hasAction() {
        return ["string", "function"].includes(typeof this.run) && !this.skipped;
    }
}
