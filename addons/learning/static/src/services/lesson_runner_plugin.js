import {
    computed,
    markRaw,
    onWillDestroy,
    Plugin,
    proxy,
    signal,
    untrack,
    useListener,
    usePlugin,
} from "@odoo/owl";
import { browser } from "@web/core/browser/browser";
import { DialogPlugin } from "@web/core/dialog/dialog_plugin";
import { ORM } from "@web/core/orm_plugin";
import { services } from "@web/core/services";
import { UIPlugin } from "@web/core/ui/ui_plugin";
import { ActionPlugin } from "@web/webclient/actions/action_plugin";
import { findTarget } from "../core/dom_target";
import { isStepDone } from "../core/step_conditions";
import { countSteps, getLesson, getSteps } from "../lessons/lesson_registry";
import { CURRENT_LESSON_KEY as STORAGE_KEY, LearningModePlugin } from "./learning_mode_plugin";

const TICK_DELAY = 250;
/** Without any target on screen for this long, the learner is probably lost. */
export const STUCK_DELAY = 8000;

/**
 * Plays a lesson: brings the learner to a checkpoint, follows them step by
 * step, and notices when they are stuck.
 */
export class LessonRunnerPlugin extends Plugin {
    orm = usePlugin(ORM);
    action = usePlugin(ActionPlugin);
    dialog = usePlugin(DialogPlugin);
    ui = usePlugin(UIPlugin);
    learning = usePlugin(LearningModePlugin);

    state = proxy({
        lessonKey: null,
        checkpointIndex: 0,
        stepIndex: 0,
        /** "idle" | "intro" | "running" | "done" */
        status: "idle",
        /**
         * false | "lost" (no target on screen) | "invalid" (a field blocks saving)
         * | "window" (the target is behind a window the lesson did not open)
         */
        stuck: false,
        demoRunning: false,
        checkpointStartedAt: null,
        /** Data the steps depend on, given by the checkpoint's setup (e.g. menus). */
        params: {},
    });
    /** The element the current step points at. */
    target = signal(null);

    lesson = computed(() => this.state.lessonKey && getLesson(this.state.lessonKey));
    checkpoint = computed(() => this.lesson()?.checkpoints[this.state.checkpointIndex]);
    steps = computed(() => (this.checkpoint() ? getSteps(this.checkpoint(), this.state.params) : []));
    step = computed(() => this.steps()[this.state.stepIndex]);
    /** The step before the current one in this checkpoint, if any. */
    previousStep = computed(() => this.steps()[this.state.stepIndex - 1]);
    stepCount = computed(() => (this.lesson() ? countSteps(this.lesson(), this.state.params) : 0));
    /** Position of the current step among all the steps of the lesson. */
    stepNumber = computed(() => {
        const checkpoints = this.lesson()?.checkpoints || [];
        const before = checkpoints.slice(0, this.state.checkpointIndex);
        const params = this.state.params;
        return before.reduce((n, cp) => n + getSteps(cp, params).length, 0) + this.state.stepIndex;
    });

    setup() {
        this.clicked = false;
        this.acknowledged = false;
        this.lastInputAt = 0;
        this.lastTargetSeenAt = Date.now();
        this.restore();
        useListener(document, "click", (ev) => this.onDocumentClick(ev), { capture: true });
        useListener(document, "input", () => (this.lastInputAt = Date.now()), { capture: true });
        const interval = browser.setInterval(() => untrack(() => this.tick()), TICK_DELAY);
        onWillDestroy(() => browser.clearInterval(interval));
    }

    // ------------------------------------------------------------------
    // Lesson flow
    // ------------------------------------------------------------------

    /** Shows the lesson's introduction; the lesson starts with `begin`. */
    open(lessonKey) {
        Object.assign(this.state, {
            lessonKey,
            checkpointIndex: 0,
            stepIndex: 0,
            status: "intro",
            stuck: false,
            checkpointStartedAt: null,
            params: {},
        });
        this.persist();
    }

    begin() {
        return this.goToCheckpoint(0);
    }

    /** Prepares the checkpoint's data on the server and opens its screen. */
    async goToCheckpoint(index) {
        const lesson = this.lesson();
        const checkpoint = lesson.checkpoints[index];
        this.dialog.closeAll();
        const result = await this.orm.call("learning.setup", "run", [lesson.key, checkpoint.key]);
        const { location, params } = "location" in result ? result : { location: result, params: {} };
        const startedAt = await this.learning.markCheckpoint(lesson.key, checkpoint.key);
        // saved before opening the screen, which may reload the page
        Object.assign(this.state, {
            checkpointIndex: index,
            stepIndex: 0,
            status: "running",
            stuck: false,
            checkpointStartedAt: this.state.checkpointStartedAt || startedAt,
            params: { ...this.state.params, ...params },
        });
        this.resetStepTracking();
        this.persist();
        if (location) {
            await this.action.doAction(location, { clearBreadcrumbs: true });
        }
    }

    advance() {
        this.wrapUpStep(this.step());
        this.state.stepIndex++;
        if (this.state.stepIndex >= this.steps().length) {
            if (this.state.checkpointIndex + 1 < this.lesson().checkpoints.length) {
                // the learner is already where the next checkpoint starts
                this.state.checkpointIndex++;
                this.state.stepIndex = 0;
                this.learning.markCheckpoint(this.lesson().key, this.checkpoint().key);
            } else {
                this.finish();
                return;
            }
        }
        this.resetStepTracking();
        this.persist();
    }

    /** What a step leaves behind for the next ones (see `remember`, `closeSuggestions`). */
    wrapUpStep(step) {
        if (step.remember) {
            const { key, from } = step.remember;
            const value = document.querySelector(from)?.value?.trim();
            if (value) {
                this.state.params = { ...this.state.params, [key]: value };
            }
        }
        if (step.closeSuggestions) {
            // suggestions close when the input loses the focus (not Escape:
            // in forms and lines, it can discard changes)
            document.activeElement?.blur?.();
        }
    }

    async finish() {
        const lesson = this.lesson();
        this.state.status = "done";
        this.target.set(null);
        this.persist();
        const createdModels = new Set(
            lesson.checkpoints.flatMap((cp) =>
                getSteps(cp, this.state.params).map((step) => step.registerCreated)
            )
        );
        for (const model of createdModels) {
            if (model) {
                await this.orm.call("learning.practice.record", "register_recent", [
                    model,
                    this.state.checkpointStartedAt,
                ]);
            }
        }
        await this.learning.completeLesson(lesson.key);
    }

    /** Leaves the lesson; it can be replayed from the learning map. */
    close() {
        Object.assign(this.state, {
            lessonKey: null,
            status: "idle",
            stuck: false,
            demoRunning: false,
            checkpointStartedAt: null,
            params: {},
        });
        this.target.set(null);
        this.persist();
    }

    // ------------------------------------------------------------------
    // Following the learner
    // ------------------------------------------------------------------

    resetStepTracking() {
        this.clicked = false;
        this.acknowledged = false;
        this.lastTargetSeenAt = Date.now();
    }

    /** The learner read an explanation step ("Got it"). */
    acknowledge() {
        this.acknowledged = true;
    }

    onDocumentClick(ev) {
        const target = this.target();
        if (this.state.status === "running" && target?.contains(ev.target)) {
            this.clicked = true;
        }
    }

    tick() {
        const step = this.step();
        if (this.state.status !== "running" || !step || this.state.demoRunning || this.ui.isSmall()) {
            return;
        }
        const now = Date.now();
        const target = findTarget(step);
        if (target !== this.target()) {
            this.target.set(target && markRaw(target));
        }
        const context = {
            target,
            clicked: this.clicked,
            acknowledged: this.acknowledged,
            idleMs: now - this.lastInputAt,
        };
        if (isStepDone(step, context)) {
            this.advance();
            return;
        }
        if (target) {
            this.lastTargetSeenAt = now;
        }
        let stuck = false;
        if (document.querySelector(".o_field_invalid, .o_invalid_cell")) {
            stuck = "invalid";
        } else if (!target && findTarget(step, { anyLayer: true })) {
            stuck = "window";
        } else if (now - this.lastTargetSeenAt > STUCK_DELAY) {
            stuck = "lost";
        }
        if (stuck !== this.state.stuck) {
            this.state.stuck = stuck;
        }
    }

    // ------------------------------------------------------------------
    // Persistence (survives page reloads)
    // ------------------------------------------------------------------

    persist() {
        const { lessonKey, checkpointIndex, stepIndex, status, checkpointStartedAt, params } = this.state;
        if (status === "idle") {
            browser.localStorage.removeItem(STORAGE_KEY);
        } else {
            browser.localStorage.setItem(
                STORAGE_KEY,
                JSON.stringify({ lessonKey, checkpointIndex, stepIndex, status, checkpointStartedAt, params })
            );
        }
    }

    restore() {
        let saved = null;
        try {
            saved = JSON.parse(browser.localStorage.getItem(STORAGE_KEY));
        } catch {
            browser.localStorage.removeItem(STORAGE_KEY);
        }
        if (saved && this.learning.active() && getLesson(saved.lessonKey)) {
            Object.assign(this.state, saved);
        }
    }
}

services.add(LessonRunnerPlugin);
