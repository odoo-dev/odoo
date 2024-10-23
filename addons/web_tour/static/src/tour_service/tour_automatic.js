import { tourState } from "./tour_state";
import { config as transitionConfig } from "@web/core/transition";
import { TourStepAutomatic } from "./tour_step_automatic";
import { MacroEngine } from "@web/core/macro";
import { browser } from "@web/core/browser/browser";

export class TourAutomatic {
    mode = "auto";
    constructor(data) {
        Object.assign(this, data);
        this.steps = this.steps.map((step, index) => new TourStepAutomatic(step, this, index));
        this.macroEngine = new MacroEngine({
            target: document,
        });
        const tourConfig = tourState.getCurrentConfig();
        this.stepDelay = tourConfig.stepDelay || 0;
    }

    get debugMode() {
        const config = tourState.getCurrentConfig() || {};
        return config.debug !== false;
    }

    get currentIndex() {
        return tourState.getCurrentIndex();
    }

    get currentStep() {
        return this.steps[this.currentStepIndex];
    }

    get previousStep() {
        return this.steps[this.currentStepIndex - 1];
    }

    start(pointer, callback) {
        const currentStepIndex = tourState.getCurrentIndex();
        const macroSteps = this.steps
            .filter((step) => step.index >= currentStepIndex)
            .flatMap((step) => {
                return [
                    {
                        action: () => step.log(),
                    },
                    {
                        initialDelay: () => {
                            return this.previousStep?.hasAction ? 0 : null;
                        },
                        timeout: step.timeout,
                        onTimeout: () => {
                            return this.throwError(step.describeWhyIFailed);
                        },
                        trigger: () => step.findTrigger(),
                        action: () => {
                            tourState.setCurrentIndex(step.index + 1);
                            return step.doAction();
                        },
                    },
                    {
                        action: () => step.waitForPause(),
                    },
                ];
            });

        const macro = {
            name: this.name,
            debounceDelay: this.checkDelay,
            steps: macroSteps,
            stepDelay: this.stepDelay,
            onError: (error) => this.throwError([error]),
            onComplete: () => {
                transitionConfig.disabled = false;
                callback();
            },
        };

        transitionConfig.disabled = true;
        //Activate macro in exclusive mode (only one macro per MacroEngine)
        this.macroEngine.activate(macro, true);
    }

    get describeWhereIFailed() {
        const offset = 3;
        const start = Math.max(this.currentIndex - offset, 0);
        const end = Math.min(this.currentIndex + offset, this.steps.length - 1);
        const result = [];
        for (let i = start; i <= end; i++) {
            const step = this.steps[i];
            const stepString = step.stringify;
            const text = [stepString];
            if (i === this.currentIndex) {
                const line = "-".repeat(10);
                const failing_step = `${line} FAILED: ${step.describeMe} ${line}`;
                text.unshift(failing_step);
                text.push("-".repeat(failing_step.length));
            }
            result.push(...text);
        }
        return result.join("\n");
    }

    /**
     * @param {string} [error]
     */
    throwError(errors = []) {
        this.isErrored = true;
        tourState.setCurrentTourOnError();
        // console.error notifies the test runner that the tour failed.
        errors.unshift(`FAILED: ${this.currentStep.describeMe}.`);
        browser.console.error(errors.join("\n"));
        // The logged text shows the relative position of the failed step.
        // Useful for finding the failed step.
        browser.console.dir(this.describeWhereIFailed);
        this.stop();
        if (this.debugMode) {
            // eslint-disable-next-line no-debugger
            debugger;
        }
    }
}
