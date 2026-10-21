import { Plugin, signal, usePlugin } from "@odoo/owl";
import { DialogPlugin } from "@web/core/dialog/dialog_plugin";
import { services } from "@web/core/services";
import { findTarget, waitForTarget } from "../core/dom_target";
import { playDemo } from "../show_me_cursor/show_me";
import { LessonRunnerPlugin } from "./lesson_runner_plugin";

/**
 * What a lost learner can do, from the lightest to the strongest help:
 * hint, show me, take me back to the last checkpoint, start again.
 */
export class LessonRecoveryPlugin extends Plugin {
    runner = usePlugin(LessonRunnerPlugin);
    dialog = usePlugin(DialogPlugin);

    /** The learner asked for help ("I'm lost"). */
    helpOpen = signal(false);
    /** Increases each time the learner asks for a hint: the pointer pulses again. */
    hintCount = signal(0);

    openHelp() {
        this.helpOpen.set(true);
    }

    closeHelp() {
        this.helpOpen.set(false);
    }

    hint() {
        this.hintCount.set(this.hintCount() + 1);
        this.runner.target()?.scrollIntoView({ block: "center", behavior: "smooth" });
        this.runner.resetStepTracking();
        this.runner.state.stuck = false;
        this.closeHelp();
    }

    /** Closes the windows opened on top of the lesson's screen. */
    closeWindows() {
        this.dialog.closeAll();
        this.runner.state.stuck = false;
        this.runner.resetStepTracking();
        this.closeHelp();
    }

    /** Plays the current step on the learner's screen, then hands back. */
    async showMe() {
        this.closeHelp();
        const step = this.runner.step();
        if (!step) {
            return;
        }
        this.runner.state.demoRunning = true;
        try {
            let target = findTarget(step);
            if (!target) {
                target = await this.replayPreviousStep(step);
            }
            if (!target) {
                // the learner wandered off: bring them back first
                this.runner.state.demoRunning = false;
                await this.takeMeBack();
                return;
            }
            await playDemo(target, step);
            if (!step.until) {
                this.runner.clicked = true;
            }
            // edit steps are done once typing stopped
            this.runner.lastInputAt = 0;
        } finally {
            this.runner.state.demoRunning = false;
        }
    }

    /**
     * The target may have vanished with a dropdown that closed (e.g. the
     * learner clicked elsewhere): replaying the previous step reopens it.
     *
     * @returns {Promise<HTMLElement|null>} the target of `step`, if it came back
     */
    async replayPreviousStep(step) {
        const previous = this.runner.previousStep();
        const previousTarget = previous?.run && findTarget(previous);
        if (!previousTarget) {
            return null;
        }
        await playDemo(previousTarget, previous);
        return waitForTarget(step);
    }

    /** Closes stray windows, prepares the checkpoint again and opens its screen. */
    async takeMeBack() {
        this.closeHelp();
        await this.runner.goToCheckpoint(this.runner.state.checkpointIndex);
    }

    async restart() {
        this.closeHelp();
        await this.runner.goToCheckpoint(0);
    }
}

services.add(LessonRecoveryPlugin);
