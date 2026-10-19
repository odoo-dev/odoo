import { registry } from "@web/core/registry";
import { performAction } from "@learning/core/demo_actions";
import { waitForTarget } from "@learning/core/dom_target";
import { isStepDone } from "@learning/core/step_conditions";
import { getLessons, getSteps } from "@learning/lessons/lesson_registry";

/**
 * Every lesson checkpoint is also a test tour, generated from the lesson
 * itself: a UI change that breaks a lesson breaks the build.
 * Tour name: `learning_lesson_<lesson>_<checkpoint>`; the Python test runs
 * the checkpoint's setup, opens its screen and passes the setup's `params` in
 * `window.learningTourParams` for steps that depend on them.
 *
 * Each step is played like "Show me" plays it (same actions), and skipped
 * like the lesson skips it: when its result is already on screen.
 */

const TIMEOUT = 10000;

async function waitUntilDone(step) {
    const start = Date.now();
    while (!isStepDone(step, { target: await waitForTarget(step, 0), clicked: true, idleMs: Infinity })) {
        if (Date.now() - start > TIMEOUT) {
            throw new Error(`Lesson step never done: ${step.content}`);
        }
        await new Promise((resolve) => setTimeout(resolve, 100));
    }
}

function toTourStep(step) {
    return {
        content: String(step.content),
        trigger: "body",
        async run() {
            const alreadyDone =
                step.until && typeof step.until !== "function" && isStepDone(step, { clicked: false });
            if (alreadyDone) {
                return;
            }
            const target = await waitForTarget(step, TIMEOUT);
            if (!target) {
                throw new Error(`Lesson step target not found: ${step.content}`);
            }
            await performAction(step.run, target, { typingDelay: 0 });
            await waitUntilDone(step);
        },
    };
}

for (const lesson of getLessons()) {
    lesson.checkpoints.forEach((checkpoint, index) => {
        const remaining = lesson.checkpoints.slice(index);
        registry.category("web_tour.tours").add(`learning_lesson_${lesson.key}_${checkpoint.key}`, {
            steps: () =>
                remaining.flatMap((cp) => getSteps(cp, window.learningTourParams || {}).map(toTourStep)),
        });
    });
}
