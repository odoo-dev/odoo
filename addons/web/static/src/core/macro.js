/** @odoo-module **/

const ACTION_HELPERS = {
    click(el, _step) {
        el.dispatchEvent(new MouseEvent("mouseover"));
        el.dispatchEvent(new MouseEvent("mouseenter"));
        el.dispatchEvent(new MouseEvent("mousedown"));
        el.dispatchEvent(new MouseEvent("mouseup"));
        el.click();
        el.dispatchEvent(new MouseEvent("mouseout"));
        el.dispatchEvent(new MouseEvent("mouseleave"));
    },
    text(el, step) {
        // simulate an input (probably need to add keydown/keyup events)
        this.click(el, step);
        el.value = step.value;
        el.dispatchEvent(new InputEvent("input", { bubbles: true }));
        el.dispatchEvent(new InputEvent("change", { bubbles: true }));
    },
};

class TimeoutError extends Error {}

class Macro {
    constructor(descr) {
        this.name = descr.name || "anonymous";
        this.timeoutDuration = descr.timeout || 0;
        this.timeout = null;
        this.currentIndex = 0;
        this.interval = descr.interval ? Math.max(16, descr.interval) : 500;
        this.isComplete = false;
        this.steps = descr.steps;
        this.onStep = descr.onStep || (() => {});
        this.onError = descr.onError;
        this.onTimeout = descr.onTimeout;
        this.setTimer();
    }

    advance() {
        if (this.isComplete) {
            return;
        }
        const step = this.steps[this.currentIndex];
        let trigger = step.trigger;
        if (trigger) {
            let el = null;
            if (typeof trigger === "function") {
                trigger = this.safeCall(trigger);
                // so if it is some interesting value, it will be passed to
                // the action function
                el = trigger;
            }
            if (typeof trigger === "string") {
                const $el = $(trigger);
                el = $el.length && $el.eq(0).is(":visible:hasVisibility") ? $el[0] : null;
            }
            if (el) {
                // we have a match!
                this.advanceStep(el, step);
            }
        } else {
            // a step without a trigger is just an action
            this.advanceStep(null, step);
        }
    }

    advanceStep(el, step) {
        this.safeCall(this.onStep, el, step);
        const action = step.action;
        if (action in ACTION_HELPERS) {
            ACTION_HELPERS[action](el, step);
        } else if (typeof action === "function") {
            this.safeCall(action, el);
        }
        this.currentIndex++;
        if (this.currentIndex === this.steps.length) {
            this.isComplete = true;
            clearTimeout(this.timeout);
        } else {
            this.setTimer();
            this.advance();
        }
    }

    safeCall(fn, ...args) {
        if (this.isComplete) {
            return;
        }
        let result;
        try {
            result = fn(...args);
        } catch (e) {
            this.handleError(e);
        }
        return result;
    }

    setTimer() {
        if (this.timeoutDuration) {
            clearTimeout(this.timeout);
            this.timeout = setTimeout(() => {
                if (this.onTimeout) {
                    const index = this.currentIndex;
                    const step = this.steps[index];
                    this.safeCall(this.onTimeout, step, index);
                } else {
                    const error = new TimeoutError("Step timeout");
                    this.handleError(error);
                }
            }, this.timeoutDuration);
        }
    }

    handleError(error) {
        // mark the macro as complete, so it can be cleaned up from the
        // engine
        this.isComplete = true;
        clearTimeout(this.timeout);
        if (this.onError) {
            const index = this.currentIndex;
            const step = this.steps[index];
            this.onError(error, step, index);
        } else {
            console.error(error);
        }
    }
}

class MacroEngine {
    constructor() {
        this.isRunning = false;
        this.timeout = null;
        this.interval = Infinity; // nbr of ms before we check the dom to advance macros
        this.macros = new Set();
        this.observer = new MutationObserver(this.delayedCheck.bind(this));
    }

    async activate(descr) {
        // micro task tick to make sure we add the macro in a new call stack,
        // so we are guaranteed that we are not iterating on the current macros
        await Promise.resolve();
        const macro = new Macro(descr);
        this.interval = Math.min(this.interval, macro.interval);
        this.macros.add(macro);
        this.start();
    }

    start() {
        if (!this.isRunning) {
            this.isRunning = true;
            this.observer.observe(document.body, {
                attributes: true,
                childList: true,
                subtree: true,
                attributeOldValue: true,
                characterData: true,
            });
        }
        this.delayedCheck();
    }

    stop() {
        if (this.isRunning) {
            this.isRunning = false;
            clearTimeout(this.timeout);
            this.timeout = null;
            this.observer.disconnect();
        }
    }

    delayedCheck() {
        if (this.timeout) {
            clearTimeout(this.timeout);
        }
        this.timeout = setTimeout(this.advanceMacros.bind(this), this.interval);
    }

    advanceMacros() {
        let toDelete = [];
        for (let macro of this.macros) {
            macro.advance();
            if (macro.isComplete) {
                toDelete.push(macro);
            }
        }
        if (toDelete.length) {
            for (let macro of toDelete) {
                this.macros.delete(macro);
            }
            // recompute current interval, because it may need to be increased
            this.interval = Infinity;
            for (let macro of this.macros) {
                this.interval = Math.min(this.interval, macro.interval);
            }
        }
        if (this.macros.size === 0) {
            this.stop();
        }
    }
}

const engine = new MacroEngine();

export function activateMacro(macro) {
    engine.activate(macro);
}

// -----------------------------------------------------------------------------
// test code
// -----------------------------------------------------------------------------

// debug
window.macroengine = engine;

/**
 * how to use:
 * import { activateMacro } from "@web/core/macro";
 *
 * then
 *
 * activateMacro(someMacro); => see examples below
 */

const testMacro = {
    name: "test_macro",
    onStep: (el, step) => {
        console.log("macro step activated", el, step);
    },
    timeout: 5000,
    steps: [
        {
            trigger: '.dropdown-toggle[title="Home Menu"]',
            action: "click",
        },
        {
            trigger: ".wrong-selector",
            action: "click",
        },
    ],
};

const testMacro2 = {
    name: "test_macro2",
    interval: 1000,
    steps: [
        {
            // Open contact application
            trigger: '.dropdown-toggle[title="Home Menu"]',
            action: "click",
        },
        {
            trigger: '.dropdown-item:contains("Contacts")',
            action: "click",
        },
        {
            // click on create button
            trigger: () => 'button[title="Create record"]',
            action: "click",
        },
        {
            action: () => console.log("we are here..."),
        },
        {
            // input name
            trigger: 'div[name="name"] input',
            action: "text",
            value: "Aaron B.",
        },
        {
            // save
            trigger: 'button[title="Save record"]',
            action: "click",
        },
    ],
};

/**
 * Infinite macro! This also illustrates that macros can be used to do non
 * linear sequence of steps.
 */

const testMacro3 = {
    name: "test_macro3",
    steps: [
        {
            // Open contact application
            trigger: "button.o_form_button_cancel",
            action: "click",
        },
        {
            action: () => activateMacro(testMacro3),
        },
    ],
};

const testMacro4 = {
    name: "test_macro4",
    onError: (error, step, index) => {
        console.log(`an error occured at step ${index}`);
        console.log(step, error);
    },
    steps: [
        {
            // Open contact application
            trigger: '.dropdown-toggle[title="Home Menu"]',
            action: "click",
        },
        {
            action: () => {
                throw new Error("boom");
            },
        },
    ],
};

window.testMacro = () => {
    activateMacro(testMacro);
};
window.testMacro2 = () => {
    activateMacro(testMacro2);
};
window.testMacro3 = () => {
    activateMacro(testMacro3);
};
window.testMacro4 = () => {
    activateMacro(testMacro4);
};
