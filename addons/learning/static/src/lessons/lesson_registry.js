import { registry } from "@web/core/registry";

/**
 * Lessons are registered in this registry by the modules that teach them.
 *
 * @typedef {Object} LessonStep
 * @property {string} trigger CSS selector of the element the learner acts on
 * @property {string} [text] only match elements containing this text
 * @property {string} [child] point at this element inside the matched one
 * @property {boolean} [revealedOnHover] the target only shows when hovered
 *      (e.g. a many2one's link button): point at it anyway
 * @property {string} bubble very short imperative shown next to the target
 * @property {string} content full sentence shown in the learning bar
 * @property {string} [run] what "Show me" does: "click" or "edit <text>"
 * @property {string|{trigger: string, text?: string}|Function} [until]
 *      the step is done when this selector appears, or when the function
 *      returns true; without it, the step is done when the target is clicked
 * @property {string[]} [focus] field names kept in focus during this step
 * @property {{key: string, from: string}} [remember] when the step is done,
 *      keep the value of the `from` input in `params[key]`, for the next
 *      steps (e.g. the company the learner picked, whatever its name)
 * @property {boolean} [closeSuggestions] when the step is done, close the
 *      suggestions the input may show, so they do not hide the next field
 * @property {boolean} [acknowledge] an explanation about the target: no
 *      action expected, the step is done when the learner clicks "Got it"
 * @property {boolean} [pointOfNoReturn] the action really happens and cannot
 *      simply be undone (confirm, post, pay, send): the learner is warned
 * @property {string} [registerCreated] model whose records created during the
 *      lesson are practice records (e.g. categories created on the fly)
 *
 * @typedef {Object} LessonCheckpoint
 * @property {string} key the server prepares it with `_setup_<lesson>_<key>`
 * @property {LessonStep[] | ((params: Object) => LessonStep[])} steps
 *      a function when steps depend on the database (e.g. its menus): it
 *      receives the `params` returned by the checkpoint's setup. Also a
 *      function when steps format translated text (`_t("… %s", …)`):
 *      translations are not loaded yet when lesson files are
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
