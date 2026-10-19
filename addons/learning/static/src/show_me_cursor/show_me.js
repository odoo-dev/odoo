import { proxy } from "@odoo/owl";
import { performAction } from "../core/demo_actions";
import { isInViewport } from "../core/dom_target";

/** Where the animated "Show me" cursor is; rendered by ShowMeCursor. */
export const cursorState = proxy({
    visible: false,
    x: 0,
    y: 0,
    pressing: false,
    touch: false,
});

const TRAVEL_DURATION = 900;
const PRESS_DURATION = 250;
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

let lastPointer = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
window.addEventListener(
    "pointermove",
    (ev) => (lastPointer = { x: ev.clientX, y: ev.clientY }),
    { passive: true }
);

/**
 * Plays one step on the learner's own screen: a cursor (or a finger on touch
 * screens) travels from where their mouse is to the target, presses it, and
 * the step's action really happens.
 *
 * @param {HTMLElement} target
 * @param {import("../lessons/lesson_registry").LessonStep} step
 */
export async function playDemo(target, step) {
    // scrolling closes open dropdowns: only scroll when needed
    if (!isInViewport(target)) {
        target.scrollIntoView({ block: "center", behavior: "smooth" });
        await wait(400);
    }
    Object.assign(cursorState, {
        visible: true,
        x: lastPointer.x,
        y: lastPointer.y,
        pressing: false,
        touch: window.matchMedia("(pointer: coarse)").matches,
    });
    await wait(50); // let the cursor appear before it moves
    const rect = target.getBoundingClientRect();
    cursorState.x = rect.left + Math.min(rect.width / 2, 40);
    cursorState.y = rect.top + rect.height / 2;
    await wait(TRAVEL_DURATION + 150);
    cursorState.pressing = true;
    await wait(PRESS_DURATION);
    cursorState.pressing = false;
    await performAction(step.run, target);
    await wait(600);
    cursorState.visible = false;
    lastPointer = { x: cursorState.x, y: cursorState.y };
}
