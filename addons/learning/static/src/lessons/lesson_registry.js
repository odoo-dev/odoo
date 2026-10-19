import { registry } from "@web/core/registry";

/**
 * Lessons are registered in this registry by the modules that teach them.
 *
 * @typedef {Object} LessonStep
 * @property {string} trigger CSS selector of the element the learner acts on
 * @property {string} [text] only match elements containing this text
 * @property {string} bubble very short imperative shown next to the target
 * @property {string} content full sentence shown in the learning bar
 * @property {string} [run] what "Show me" does: "click" or "edit <text>"
 * @property {string|{trigger: string, text?: string}|Function} [until]
 *      the step is done when this selector appears, or when the function
 *      returns true; without it, the step is done when the target is clicked
 * @property {string[]} [focus] field names kept in focus during this step
 * @property {string} [registerCreated] model whose records created during the
 *      lesson are practice records (e.g. categories created on the fly)
 *
 * @typedef {Object} LessonCheckpoint
 * @property {string} key the server prepares it with `_setup_<lesson>_<key>`
 * @property {LessonStep[] | ((params: Object) => LessonStep[])} steps
 *      a function when steps depend on the database (e.g. its menus): it
 *      receives the `params` returned by the checkpoint's setup
 *
 * @typedef {Object} Lesson
 * @property {string} name
 * @property {string} intro what the learner will be able to do afterwards
 * @property {string} level "A", "B", ... (see the learning map)
 * @property {number} sequence order inside the level
 * @property {{types?: string[], fields?: string[]}} [teaches]
 *      field types and "model.field" names the learner knows afterwards
 * @property {string[]} [focus] field names kept in focus for the whole lesson
 * @property {LessonCheckpoint[]} checkpoints
 */
export const lessonRegistry = registry.category("learning.lessons");

/** @returns {(Lesson & {key: string})[]} */
export function getLessons() {
    return lessonRegistry
        .getEntries()
        .map(([key, lesson]) => ({ key, ...lesson }))
        .sort((a, b) => a.level.localeCompare(b.level) || a.sequence - b.sequence);
}

export function getLesson(key) {
    const lesson = lessonRegistry.get(key, null);
    return lesson && { key, ...lesson };
}

/** @returns {LessonStep[]} */
export function getSteps(checkpoint, params = {}) {
    return typeof checkpoint.steps === "function" ? checkpoint.steps(params) : checkpoint.steps;
}

export function countSteps(lesson, params = {}) {
    return lesson.checkpoints.reduce((count, checkpoint) => count + getSteps(checkpoint, params).length, 0);
}
