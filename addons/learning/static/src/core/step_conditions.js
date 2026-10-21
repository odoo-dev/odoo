import { findTarget } from "./dom_target";

/** How long a learner must stop typing before a "type something" step is done. */
export const TYPING_PAUSE = 1200;

/** The form's cloud button: only visible while there are changes not saved yet. */
const FORM_SAVE_BUTTON = ".o_form_status_indicator .o_form_button_save";

/**
 * Whether a lesson step is done.
 *
 * @param {import("../lessons/lesson_registry").LessonStep} step
 * @param {{target: HTMLElement|null, clicked: boolean, idleMs: number, acknowledged?: boolean}} context
 */
export function isStepDone(step, context) {
    if (step.acknowledge) {
        return Boolean(context.acknowledged);
    }
    const { until } = step;
    if (!until) {
        return context.clicked;
    }
    if (typeof until === "function") {
        return Boolean(until(context));
    }
    if (typeof until === "string") {
        return Boolean(findTarget({ trigger: until }));
    }
    return Boolean(findTarget(until));
}

/**
 * `until` condition for "save" steps: done once the form has nothing left to
 * save (the save button is hidden, not removed, so a selector cannot tell).
 */
export function formSaved() {
    return () =>
        Boolean(document.querySelector(".o_form_status_indicator")) &&
        !findTarget({ trigger: FORM_SAVE_BUTTON });
}

/**
 * `until` condition for steps where the learner types in the target: done once
 * the value matches and the learner paused typing.
 *
 * @param {(value: string) => boolean} [accept]
 */
export function typed(accept = (value) => value.length > 0) {
    return ({ target, idleMs }) =>
        Boolean(target) && accept(target.value.trim()) && idleMs >= TYPING_PAUSE;
}

/**
 * Like `typed`, for a record that already exists: also waits for the form to
 * show it has changes not saved yet (the cloud appears).
 *
 * @param {(value: string) => boolean} [accept]
 */
export function typedChange(accept) {
    const isTyped = typed(accept);
    return (context) => isTyped(context) && Boolean(findTarget({ trigger: FORM_SAVE_BUTTON }));
}
