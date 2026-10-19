/**
 * Performs a lesson step's `run` ("click", "edit <text>", or "search <text>"
 * which also presses Enter) on the real screen, slowly enough for a learner
 * to follow ("Show me").
 */

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function setNativeValue(input, value) {
    const { set } = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(input), "value");
    set.call(input, value);
}

function click(el) {
    const init = { bubbles: true, cancelable: true, view: window };
    el.dispatchEvent(new PointerEvent("pointerdown", init));
    el.dispatchEvent(new MouseEvent("mousedown", init));
    el.focus?.();
    el.dispatchEvent(new PointerEvent("pointerup", init));
    el.dispatchEvent(new MouseEvent("mouseup", init));
    el.click();
}

async function edit(input, text, { typingDelay }) {
    input.focus();
    setNativeValue(input, "");
    input.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "deleteContentBackward" }));
    for (const char of text) {
        await wait(typingDelay);
        setNativeValue(input, input.value + char);
        input.dispatchEvent(new InputEvent("input", { bubbles: true, data: char, inputType: "insertText" }));
    }
    // autocompletes commit by picking a suggestion, plain inputs on change
    if (!input.closest(".o-autocomplete")) {
        input.dispatchEvent(new Event("change", { bubbles: true }));
    }
}

async function search(input, text, options) {
    await edit(input, text, options);
    await wait(300);
    const init = { bubbles: true, cancelable: true, key: "Enter", code: "Enter" };
    input.dispatchEvent(new KeyboardEvent("keydown", init));
    input.dispatchEvent(new KeyboardEvent("keyup", init));
}

/**
 * @param {string} run
 * @param {HTMLElement} el
 * @param {{typingDelay?: number}} [options]
 */
export async function performAction(run = "click", el, { typingDelay = 90 } = {}) {
    const [action, ...args] = run.split(" ");
    if (action === "edit") {
        await edit(el, args.join(" "), { typingDelay });
    } else if (action === "search") {
        await search(el, args.join(" "), { typingDelay });
    } else {
        click(el);
    }
}
