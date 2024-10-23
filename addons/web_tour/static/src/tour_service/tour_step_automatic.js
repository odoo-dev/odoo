import { _legacyIsVisible } from "@web/core/utils/ui";
import * as hoot from "@odoo/hoot-dom";
import { setupEventActions } from "@web/../lib/hoot-dom/helpers/events";
import { callWithUnloadCheck } from "./tour_utils";
import { TourHelpers } from "./tour_helpers";
import { TourStep } from "./tour_step";

export class TourStepAutomatic extends TourStep {
    triggerFound = false;
    hasRun = false;
    isUIBlocked = false;
    running = false;
    skipped = false;
    constructor(data, tour, index) {
        super(data, tour);
        this.index = index;
    }

    // Check step has a run and not has been skipped
    get hasAction() {
        return ["string", "function"].includes(typeof this.run) && !this.skipped;
    }

    async doAction() {
        const actionHelper = new TourHelpers(this.element);

        let result;
        if (!this.skipped) {
            if (typeof this.run === "function") {
                const willUnload = await callWithUnloadCheck(async () => {
                    await this.run.call({ anchor: this.element }, actionHelper);
                });
                result = willUnload && "will unload";
            } else if (typeof this.run === "string") {
                for (const todo of this.run.split("&&")) {
                    const m = String(todo)
                        .trim()
                        .match(/^(?<action>\w*) *\(? *(?<arguments>.*?)\)?$/);
                    await actionHelper[m.groups?.action](m.groups?.arguments);
                }
            }
        }
        return result;
    }

    get describeWhyIFailed() {
        const errors = [];
        if (this.element) {
            errors.push(`Element has been found.`);
            if (this.isUIBlocked) {
                errors.push("ERROR: DOM is blocked by UI.");
            } else if (!this.hasRun) {
                errors.push("BUT: an error has triggered in run().");
            }
        } else {
            errors.push(`Element has not been found.`);
        }
        return errors;
    }

    /**
     * @returns {HTMLElement}
     */
    findTrigger() {
        if (!this.active) {
            this.skipped = true;
            return true;
        }

        let nodes;
        try {
            nodes = hoot.queryAll(this.trigger);
        } catch (error) {
            throw new Error(`HOOT: ${this.trigger} : ${error.message}`);
        }
        this.element = this.trigger.includes(":visible")
            ? nodes.at(0)
            : nodes.find(_legacyIsVisible);
        // If DOM is blocked by UI.
        this.isUIBlocked =
            document.body.classList.contains("o_ui_blocked") ||
            document.querySelector(".o_blockUI");
        if (this.isUIBlocked) {
            return false;
        } else {
            return this.element;
        }
    }

    log() {
        this.running = true;
        setupEventActions(document.createElement("div"));
        if (this.break && this.tour.debugMode) {
            // eslint-disable-next-line no-debugger
            debugger;
        }
        if (this.tour.debugMode) {
            console.groupCollapsed(this.describeMe);
            console.log(this.stringify);
            console.groupEnd();
        } else {
            console.log(this.describeMe);
        }
    }

    async waitForPause() {
        if (this.pause && this.tour.debugMode) {
            const styles = [
                "background: black; color: white; font-size: 14px",
                "background: black; color: orange; font-size: 14px",
            ];
            console.log(
                `%cTour is paused. Use %cplay()%c to continue.`,
                styles[0],
                styles[1],
                styles[0]
            );
            await new Promise((resolve) => {
                window.play = () => {
                    resolve();
                    delete window.play;
                };
            });
        }
    }
}
