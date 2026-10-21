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

/**
 * Learners look at the bubble first: when a step expects a value to type or
 * an item to pick, the bubble must say which one.
 */
function checkBubble(step) {
    const [action, ...words] = (step.run || "").split(" ");
    const expected = ["edit", "search"].includes(action) ? words.join(" ") : step.text;
    if (expected && !String(step.bubble).toLowerCase().includes(String(expected).toLowerCase())) {
        throw new Error(`The bubble "${step.bubble}" must show "${expected}" (step: ${step.content})`);
    }
}

function toTourStep(step) {
    checkBubble(step);
    return {
        content: String(step.content),
        trigger: "body",
        async run() {
            if (step.acknowledge) {
                // an explanation: what it explains must be on screen
                if (!(await waitForTarget(step, TIMEOUT))) {
                    throw new Error(`Explained element not found: ${step.content}`);
                }
                return;
            }
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
